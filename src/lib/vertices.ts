import type { Coordinate, MapGeometry } from "./geo";
export type Vertex = {
  path: number[];
  coordinate: Coordinate;
  closing: boolean;
};
// Web Mercator cannot display the polar caps. Keep the original WGS84 geometry
// intact and avoid moving the camera beyond the projection's latitude limit.
export function cameraCoordinates(g: MapGeometry) {
  return vertices(g)
    .map((v) => v.coordinate)
    .filter((c) => Math.abs(c[1]) <= 85.05112878);
}
export function vertices(g: MapGeometry): Vertex[] {
  const out: Vertex[] = [];
  function visit(c: unknown, path: number[]) {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const parent = path
        .slice(0, -1)
        .reduce<unknown>(
          (o, k) => (o as unknown[])[k],
          g.coordinates,
        ) as Coordinate[];
      const index = path.at(-1)!;
      out.push({
        path,
        coordinate: c as Coordinate,
        closing: g.type.includes("Polygon") && index === parent.length - 1,
      });
    } else c.forEach((v, i) => visit(v, [...path, i]));
  }
  if (g.type === "Point")
    return [{ path: [], coordinate: g.coordinates, closing: false }];
  visit(g.coordinates, []);
  return out;
}
export function moveVertex(
  g: MapGeometry,
  path: number[],
  at: Coordinate,
  remove = false,
): MapGeometry {
  const copy = structuredClone(g);
  if (copy.type === "Point") {
    if (remove) throw new Error("Um ponto não pode ficar sem coordenadas.");
    copy.coordinates = at;
    return copy;
  }
  const parent = path
      .slice(0, -1)
      .reduce<unknown>(
        (o, k) => (o as unknown[])[k],
        copy.coordinates,
      ) as Coordinate[],
    i = path.at(-1)!;
  const ring = g.type.includes("Polygon");
  if (remove) {
    if (parent.length <= (ring ? 4 : 2))
      throw new Error("Quantidade mínima de vértices atingida.");
    parent.splice(i, 1);
  } else parent[i] = at;
  if (ring) parent[parent.length - 1] = [...parent[0]];
  return copy;
}
export function insertVertex(g: MapGeometry, path: number[]): MapGeometry {
  if (g.type === "Point" || g.type === "MultiPoint")
    throw new Error("Selecione uma linha ou polígono.");
  const copy = structuredClone(g);
  const parent = path
      .slice(0, -1)
      .reduce<unknown>(
        (o, k) => (o as unknown[])[k],
        copy.coordinates,
      ) as Coordinate[],
    i = path.at(-1)!,
    next = parent[i + 1];
  if (!next) throw new Error("Selecione um vértice anterior ao fim da rota.");
  parent.splice(i + 1, 0, [
    (parent[i][0] + next[0]) / 2,
    (parent[i][1] + next[1]) / 2,
  ]);
  return copy;
}
