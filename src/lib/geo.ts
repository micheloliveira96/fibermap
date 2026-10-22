import { z } from "zod";
import {
  area,
  length,
  lineString,
  lineSlice,
  nearestPointOnLine,
  point,
} from "@turf/turf";
export const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const line = z
  .array(coordinateSchema)
  .min(2)
  .max(10000)
  .refine(
    (p) => p.some((v) => v[0] !== p[0][0] || v[1] !== p[0][1]),
    "A rota precisa de dois pontos distintos.",
  );
const ring = z
  .array(coordinateSchema)
  .min(4)
  .max(10000)
  .refine(
    (p) => p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1],
    "O polígono deve ser fechado.",
  );
export const geometrySchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("Point"), coordinates: coordinateSchema }),
    z.object({ type: z.literal("LineString"), coordinates: line }),
    z.object({
      type: z.literal("Polygon"),
      coordinates: z.array(ring).min(1).max(100),
    }),
    z.object({
      type: z.literal("MultiPoint"),
      coordinates: z.array(coordinateSchema).min(1).max(10000),
    }),
    z.object({
      type: z.literal("MultiLineString"),
      coordinates: z.array(line).min(1).max(100),
    }),
    z.object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(z.array(ring).min(1).max(100)).min(1).max(100),
    }),
  ])
  .superRefine((g, ctx) => {
    let n = 0;
    const visit = (c: unknown) => {
      if (Array.isArray(c)) {
        if (typeof c[0] === "number") n++;
        else c.forEach(visit);
      }
    };
    visit(g.coordinates);
    if (n > 20000)
      ctx.addIssue({
        code: "custom",
        message: "Limite de 20 mil vértices por elemento.",
      });
  });
export type MapGeometry = z.infer<typeof geometrySchema>;
export type Coordinate = [number, number];
export function geographicLength(g: MapGeometry) {
  return g.type.includes("LineString")
    ? length(
        { type: "Feature", properties: {}, geometry: g },
        { units: "meters" },
      )
    : 0;
}
export function geographicArea(g: MapGeometry) {
  return g.type.includes("Polygon") ? area(g) : 0;
}
export function splitRoute(
  g: MapGeometry,
  at: Coordinate,
): [MapGeometry, MapGeometry] {
  if (g.type !== "LineString") throw new Error("Selecione uma rota simples.");
  const route = lineString(g.coordinates),
    snap = nearestPointOnLine(route, point(at)),
    a = lineSlice(point(g.coordinates[0]), snap, route),
    b = lineSlice(snap, point(g.coordinates.at(-1)!), route);
  if (
    length(a, { units: "meters" }) < 0.1 ||
    length(b, { units: "meters" }) < 0.1
  )
    throw new Error("Escolha um ponto no interior do segmento.");
  return [geometrySchema.parse(a.geometry), geometrySchema.parse(b.geometry)];
}
export function compatible(kind: string, g: MapGeometry) {
  if (kind === "IMPORTED") return true;
  if (["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP", "DUCT"].includes(kind))
    return g.type === "LineString";
  if (kind === "COVERAGE")
    return g.type === "Polygon" || g.type === "MultiPolygon";
  return g.type === "Point";
}
