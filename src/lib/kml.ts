import JSZip from "jszip";
import { kml } from "@tmcw/togeojson";
import { geometrySchema, type MapGeometry } from "./geo";
import type { Geometry } from "geojson";
export const MAX_FILE = 1500000,
  MAX_XML = 4000000;
export type ImportFeature = {
  id: number;
  name: string;
  description: string;
  folder: string;
  color: string;
  geometry: MapGeometry;
  sourceProperties: Record<string, unknown>;
};
function inspectZip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("KMZ inválido.");
  const count = v.getUint16(end + 10, true),
    size = v.getUint32(end + 12, true);
  let offset = v.getUint32(end + 16, true),
    total = 0;
  if (!count || count > 100 || offset + size > end)
    throw new Error("KMZ excede os limites de entradas.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || v.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Diretório KMZ inválido.");
    const flags = v.getUint16(offset + 8, true),
      expanded = v.getUint32(offset + 24, true),
      n = v.getUint16(offset + 28, true),
      extra = v.getUint16(offset + 30, true),
      comment = v.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + n),
    );
    if (
      flags & 1 ||
      expanded === 0xffffffff ||
      /^[/\\]|^[a-z]:/i.test(name) ||
      name.split(/[/\\]/).includes("..") ||
      name.includes("\u0000")
    )
      throw new Error(
        "KMZ com caminho, criptografia ou formato não permitido.",
      );
    total += expanded;
    if (total > MAX_XML) throw new Error("KMZ descompactado excede 4 MB.");
    offset += 46 + n + extra + comment;
  }
}
async function bounded(entry: JSZip.JSZipObject) {
  return new Promise<Uint8Array>((resolve, reject) => {
    let length = 0;
    const chunks: Uint8Array[] = [];
    const stream = (
      entry as unknown as {
        internalStream: (type: string) => {
          on: (name: string, cb: (chunk: Uint8Array) => void) => void;
          pause: () => void;
          resume: () => void;
        };
      }
    ).internalStream("uint8array");
    stream.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_XML) {
        stream.pause();
        reject(new Error("KML excede 4 MB."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const out = new Uint8Array(length);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      resolve(out);
    });
    stream.resume();
  });
}
export async function readKml(
  bytes: Uint8Array,
  filename: string,
  parse: (xml: string) => Parameters<typeof kml>[0],
): Promise<ImportFeature[]> {
  if (!bytes.length || bytes.length > MAX_FILE)
    throw new Error("Selecione KML/KMZ de até 1,5 MB.");
  let source = bytes;
  if (/\.kmz$/i.test(filename)) {
    inspectZip(bytes);
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.values(zip.files).filter(
      (f) => !f.dir && /\.kml$/i.test(f.name),
    );
    const preferred = files.find((f) => /^doc\.kml$/i.test(f.name));
    if (!preferred && files.length !== 1)
      throw new Error("KMZ deve conter doc.kml ou um único arquivo KML.");
    source = await bounded(preferred ?? files[0]);
  } else if (!/\.kml$/i.test(filename))
    throw new Error("Formato permitido: KML ou KMZ.");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(source);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Entidades e DTD não são permitidos.");
  const doc = parse(xml);
  if (
    doc.getElementsByTagName("parsererror").length ||
    doc.documentElement?.localName !== "kml"
  )
    throw new Error("Documento KML inválido.");
  const placemarks = Array.from(
    doc.getElementsByTagName("Placemark") as unknown as ArrayLike<Element>,
  );
  if (placemarks.length > 500)
    throw new Error("Limite de 500 elementos por arquivo.");
  const features = kml(doc).features;
  const result: ImportFeature[] = [];
  const add = (
    g: Geometry | null,
    p: Record<string, unknown>,
    folder: string,
  ) => {
    if (!g) return;
    if (g.type === "GeometryCollection") {
      const first = g.geometries[0];
      if (
        first &&
        ["Point", "LineString", "Polygon"].includes(first.type) &&
        g.geometries.every((x) => x.type === first.type)
      ) {
        add(
          {
            type: `Multi${first.type}`,
            coordinates: g.geometries.map((x) =>
              "coordinates" in x ? x.coordinates : [],
            ),
          } as Geometry,
          p,
          folder,
        );
      } else g.geometries.forEach((x) => add(x, p, folder));
      return;
    }
    const coordinates = JSON.parse(JSON.stringify(g.coordinates)) as unknown;
    const strip = (c: unknown): unknown =>
      Array.isArray(c)
        ? typeof c[0] === "number"
          ? c.slice(0, 2)
          : c.map(strip)
        : c;
    const valid = geometrySchema.safeParse({
      type: g.type,
      coordinates: strip(coordinates),
    });
    if (!valid.success)
      throw new Error(`Geometria inválida em ${String(p.name ?? "elemento")}.`);
    if (result.length >= 500) throw new Error("Limite de 500 geometrias.");
    result.push({
      id: result.length,
      name: String(p.name ?? `Elemento ${result.length + 1}`).slice(0, 160),
      description: String(p.description ?? "")
        .replace(/<[^>]*>/g, "")
        .slice(0, 10000),
      folder: folder.slice(0, 160) || "Importados",
      color: /^#[0-9a-f]{6}$/i.test(String(p.stroke ?? p.fill))
        ? String(p.stroke ?? p.fill)
        : "#18a99b",
      geometry: valid.data,
      sourceProperties: JSON.parse(JSON.stringify(p)),
    });
  };
  features.forEach((f, i) => {
    const parts: string[] = [];
    let parent = placemarks[i]?.parentNode;
    while (parent) {
      if (parent.nodeType === 1 && (parent as Element).localName === "Folder") {
        const name = Array.from(parent.childNodes).find(
          (n) => n.nodeType === 1 && (n as Element).localName === "name",
        )?.textContent;
        if (name) parts.unshift(name);
      }
      parent = parent.parentNode;
    }
    add(f.geometry, f.properties ?? {}, parts.join(" / "));
  });
  if (!result.length) throw new Error("Nenhuma geometria encontrada.");
  return result;
}
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function geometryXml(g: MapGeometry): string {
  const coords = (p: number[][]) => p.map((c) => `${c[0]},${c[1]},0`).join(" ");
  switch (g.type) {
    case "Point":
      return `<Point><coordinates>${g.coordinates.join(",")},0</coordinates></Point>`;
    case "LineString":
      return `<LineString><tessellate>1</tessellate><coordinates>${coords(g.coordinates)}</coordinates></LineString>`;
    case "Polygon":
      return `<Polygon>${g.coordinates.map((r, i) => `<${i ? "inner" : "outer"}BoundaryIs><LinearRing><coordinates>${coords(r)}</coordinates></LinearRing></${i ? "inner" : "outer"}BoundaryIs>`).join("")}</Polygon>`;
    default: {
      const type = {
        MultiPoint: "Point",
        MultiLineString: "LineString",
        MultiPolygon: "Polygon",
      }[g.type];
      return `<MultiGeometry>${g.coordinates.map((c) => geometryXml(geometrySchema.parse({ type, coordinates: c }))).join("")}</MultiGeometry>`;
    }
  }
}
export function writeKml(
  assets: {
    name: string;
    code: string;
    geometry: MapGeometry;
    color?: string;
    notes?: string | null;
    layerId?: string | null;
  }[],
  layers: { id: string; name: string }[] = [],
) {
  const groups = new Map<string, typeof assets>();
  for (const a of assets) {
    const name = layers.find((l) => l.id === a.layerId)?.name ?? "Rede";
    groups.set(name, [...(groups.get(name) ?? []), a]);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>FiberMap</name>${[
    ...groups,
  ]
    .map(
      ([name, list]) =>
        `<Folder><name>${esc(name)}</name>${list
          .map((a) => {
            const color = (a.color ?? "#18a99b").slice(1);
            const abgr =
              color.slice(4, 6) + color.slice(2, 4) + color.slice(0, 2);
            return `<Placemark><name>${esc(a.name)}</name><description>${esc(a.notes)}</description><ExtendedData><Data name="code"><value>${esc(a.code)}</value></Data></ExtendedData><Style><LineStyle><color>ff${abgr}</color><width>4</width></LineStyle><PolyStyle><color>44${abgr}</color></PolyStyle><IconStyle><color>ff${abgr}</color></IconStyle></Style>${geometryXml(a.geometry)}</Placemark>`;
          })
          .join("")}</Folder>`,
    )
    .join("")}</Document></kml>`;
}
