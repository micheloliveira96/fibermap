import { describe, it, expect } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import { readKml, writeKml } from "../src/lib/kml";
import { geometrySchema, geographicLength, splitRoute } from "../src/lib/geo";
import { vertices, moveVertex, insertVertex } from "../src/lib/vertices";
const parse = (xml: string) => new DOMParser().parseFromString(xml, "text/xml");
const encode = (xml: string) => new TextEncoder().encode(xml);
const source = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="red"><LineStyle><color>ff0000ff</color></LineStyle></Style><Folder><name>Setor A</name><Placemark><name>CTO &amp; teste</name><description>&lt;b&gt;Descrição&lt;/b&gt;</description><Point><coordinates>-46.63,-23.55,10</coordinates></Point></Placemark><Placemark><name>Rota</name><styleUrl>#red</styleUrl><LineString><coordinates>-46.63,-23.55 -46.64,-23.56 -46.65,-23.55</coordinates></LineString></Placemark><Placemark><name>Área</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark><Placemark><name>Múltiplos</name><MultiGeometry><Point><coordinates>1,2</coordinates></Point><Point><coordinates>3,4</coordinates></Point></MultiGeometry></Placemark></Folder></Document></kml>`;
describe("Importação e exportação geográfica", () => {
  it("preserva nomes, pasta, estilo, polígonos, múltiplos e remove altitude", async () => {
    const features = await readKml(encode(source), "rede.kml", parse);
    expect(features).toHaveLength(4);
    expect(features[0]).toMatchObject({
      name: "CTO & teste",
      folder: "Setor A",
      description: "Descrição",
      geometry: { type: "Point", coordinates: [-46.63, -23.55] },
    });
    expect(features[1].color).toBe("#ff0000");
    expect(features[2].geometry.type).toBe("Polygon");
    expect(features[3].geometry.type).toBe("MultiPoint");
  });
  it("abre KMZ e exporta de volta sem perder geometrias ou caracteres", async () => {
    const zip = new JSZip();
    zip.file("doc.kml", source);
    const input = await zip.generateAsync({ type: "uint8array" });
    const features = await readKml(input, "rede.kmz", parse);
    const exported = writeKml(features.map((f) => ({ ...f, code: 'a<&"' })));
    const round = await readKml(encode(exported), "saida.kml", parse);
    expect(round.map((f) => f.geometry)).toEqual(
      features.map((f) => f.geometry),
    );
    expect(round[0].name).toBe("CTO & teste");
    expect(round[1].color).toBe("#ff0000");
  });
  it("rejeita entidades, caminhos suspeitos e expansão excessiva", async () => {
    await expect(
      readKml(
        encode('<!DOCTYPE x [<!ENTITY y "x">]>' + source),
        "x.kml",
        parse,
      ),
    ).rejects.toThrow("Entidades");
    const bad = new JSZip();
    bad.file("../doc.kml", source);
    await expect(
      readKml(await bad.generateAsync({ type: "uint8array" }), "x.kmz", parse),
    ).rejects.toThrow("caminho");
    const bomb = new JSZip();
    bomb.file("doc.kml", " ".repeat(4100000));
    await expect(
      readKml(
        await bomb.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
        }),
        "x.kmz",
        parse,
      ),
    ).rejects.toThrow("4 MB");
  });
  it("rejeita documentos sem geometria e coordenadas inválidas", async () => {
    await expect(readKml(encode("<kml/>"), "x.kml", parse)).rejects.toThrow(
      "Nenhuma",
    );
    await expect(
      readKml(
        encode(source.replace("-46.63,-23.55,10", "999,999")),
        "x.kml",
        parse,
      ),
    ).rejects.toThrow("Geometria inválida");
  });
});
describe("Edição de geometria", () => {
  it("divide mantendo soma dos comprimentos", () => {
    const g = geometrySchema.parse({
      type: "LineString",
      coordinates: [
        [-46.63, -23.55],
        [-46.64, -23.56],
        [-46.65, -23.55],
      ],
    });
    const parts = splitRoute(g, [-46.635, -23.555]);
    expect(parts).toHaveLength(2);
    expect(geographicLength(parts[0]) + geographicLength(parts[1])).toBeCloseTo(
      geographicLength(g),
      1,
    );
    expect(() => splitRoute(g, [-46.63, -23.55])).toThrow("interior");
  });
  it("move, insere e remove vértices sem mutar a origem, mantendo fechamento", () => {
    const g = geometrySchema.parse({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
    const moved = moveVertex(g, [0, 0], [0, 0.1]);
    expect(vertices(moved).at(-1)?.coordinate).toEqual([0, 0.1]);
    expect(vertices(g)[0].coordinate).toEqual([0, 0]);
    const extra = insertVertex(moved, [0, 0]);
    expect(vertices(extra)).toHaveLength(5);
    expect(vertices(moveVertex(extra, [0, 1], [0, 0], true))).toHaveLength(4);
    expect(() => moveVertex(g, [0, 1], [0, 0], true)).toThrow("mínima");
  });
});
export { source };
