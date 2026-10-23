import { z } from "zod";
import { geometrySchema } from "./geo";
export const assetSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  kind: z.enum([
    "POP",
    "OLT",
    "DIO",
    "BACKBONE",
    "DISTRIBUTION",
    "DERIVATION",
    "DROP",
    "PATCHCORD",
    "CLOSURE",
    "CTO",
    "SPLITTER",
    "CUSTOMER",
    "POLE",
    "DUCT",
    "RESERVE",
    "COVERAGE",
    "WAYPOINT",
    "IMPORTED",
  ]),
  status: z.enum(["PLANNED", "INSTALLED", "MAINTENANCE", "DISABLED"]),
  geometry: geometrySchema,
  fiberCount: z.number().int().min(1).max(2880).default(12),
  ports: z.number().int().min(1).max(2880).default(8),
  inputs: z.number().int().min(1).max(2).default(1),
  insertionLossDb: z.number().min(0).max(40).default(10.5),
  color: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .default("#18a99b"),
  physicalLengthM: z.number().min(0).max(1e8).nullable().optional(),
  reserveM: z.number().min(0).max(1e7).default(0),
  manufacturer: z.string().max(200).nullable().optional(),
  originLabel: z.string().max(200).nullable().optional(),
  destinationLabel: z.string().max(200).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  installedAt: z.string().datetime().nullable().optional(),
  parentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  layerId: z.string().nullable().optional(),
  colorPattern: z
    .array(z.string().trim().min(1).max(40))
    .min(1)
    .max(48)
    .optional(),
});
export type AssetInput = z.infer<typeof assetSchema>;
