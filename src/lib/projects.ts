import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { ApiError, requirePermission } from "./access";
import { authorizeProject, type CompanyMember } from "./project-access";
import { inventoryInclude, spatial } from "./inventory";
import { geographicLength } from "./geo";
import { assetPermission } from "./permissions";
import { assetSchema } from "./asset-input";
const id = z.string().min(1).max(300);
const json = z.record(z.string(), z.unknown());
const status = z.enum(["AVAILABLE", "RESERVED", "DAMAGED", "BLOCKED"]);
export const projectViewSchema = z.object({
  camera: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-85.05112878).max(85.05112878),
      zoom: z.number().min(0).max(24),
    })
    .optional(),
  dark: z.boolean().optional(),
  cartography: z.enum(["streets", "light", "dark", "satellite"]).optional(),
});
export const projectInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(3000).default(""),
  region: z.string().trim().max(200).default(""),
  restricted: z.boolean().default(false),
  colorPattern: z.array(z.string().min(1).max(40)).min(1).max(48).optional(),
  view: projectViewSchema.default({}),
});
const fiber = z.object({
  id,
  number: z.number().int().positive(),
  tube: z.number().int().positive(),
  color: z.string().max(40),
  tubeColor: z.string().max(40),
  status,
});
const terminal = z.object({
  id,
  fiberId: id.nullable(),
  label: z.string().min(1).max(400),
  kind: z.enum([
    "FIBER_A",
    "FIBER_B",
    "PON",
    "DIO",
    "CTO",
    "SPLITTER_IN",
    "SPLITTER_OUT",
    "CUSTOMER",
  ]),
  attachmentId: id.nullable().optional(),
  routePosition: z.number().min(0).max(1).nullable().optional(),
  localSide: z.enum(["IN", "OUT"]).nullable().optional(),
  identificationColor: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .nullable()
    .optional(),
});
export const snapshotSchema = z.object({
  format: z.literal("FiberMapProject"),
  version: z.literal(1),
  project: projectInput.extend({
    colorPattern: z.array(z.string().min(1).max(40)).min(1).max(48),
  }),
  layers: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(160),
        color: z.string().regex(/^#[a-f0-9]{6}$/i),
        visible: z.boolean(),
      }),
    )
    .max(5000),
  imports: z.array(z.object({ id, filename: z.string().max(200) })).max(5000),
  assets: z
    .array(
      assetSchema.extend({
        id,
        metadata: json.default({}),
        fibers: z.array(fiber).max(2880),
        terminals: z.array(terminal).max(12000),
        internalLinks: z
          .array(
            z.object({
              id,
              aId: id,
              bId: id,
              name: z.string().max(160).nullable().optional(),
              status: status.default("AVAILABLE"),
            }),
          )
          .max(2880),
        segments: z
          .array(
            z.object({
              id,
              position: z.number().int().nonnegative(),
              geometry: json,
              lengthM: z.number().nonnegative(),
            }),
          )
          .max(10000),
        importBatchId: id.nullable().optional(),
      }),
    )
    .max(5000),
  accesses: z
    .array(
      z.object({
        id,
        equipmentId: id,
        cableId: id,
        end: z.enum(["A", "B", "MID"]),
        fraction: z.number().min(0).max(1),
        fiberStates: z.record(id, status),
        bothEnds: z.boolean().default(false),
        remoteAssetId: id.nullable().optional(),
      }),
    )
    .max(20000),
  components: z
    .array(z.object({ id, equipmentId: id, assetId: id }))
    .max(20000),
  connections: z
    .array(
      z.object({
        id,
        kind: z.enum(["SPLICE", "PASS_THROUGH", "PATCH", "DOCUMENTARY"]),
        locationId: id.nullable(),
        tray: z.string().max(80).nullable(),
        lossDb: z.number().min(0).max(40),
        terminals: z.array(z.object({ terminalId: id })).length(2),
      }),
    )
    .max(100000),
  diagrams: z.array(z.object({ equipmentId: id, layout: json })).max(10000),
});
export type ProjectSnapshot = z.infer<typeof snapshotSchema>;
export async function listProjects(m: CompanyMember, includeDeleted = false) {
  requirePermission(m, "projects.view");
  const projects = await db.networkProject.findMany({
    where: {
      organizationId: m.organizationId,
      ...(includeDeleted ? {} : { status: { not: "DELETED" } }),
      ...(!["OWNER", "ADMIN"].includes(m.role)
        ? {
            OR: [
              { restricted: false },
              {
                grants: {
                  some: {
                    membershipId: m.id,
                    permissions: { has: "projects.view" },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { assets: true } },
      grants: { where: { membershipId: m.id } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const creators = await db.user.findMany({
    where: {
      id: { in: projects.flatMap((p) => (p.creatorId ? [p.creatorId] : [])) },
    },
    select: { id: true, name: true },
  });
  const counts = await db.asset.groupBy({
    by: ["projectId", "kind"],
    where: {
      organizationId: m.organizationId,
      projectId: { in: projects.map((p) => p.id) },
    },
    _count: true,
  });
  return projects.map((p) => ({
    ...p,
    organizationName: m.organization.name,
    creatorName:
      creators.find((u) => u.id === p.creatorId)?.name ?? "Rede existente",
    equipmentCount: counts
      .filter(
        (c) =>
          c.projectId === p.id &&
          ![
            "BACKBONE",
            "DISTRIBUTION",
            "DERIVATION",
            "DROP",
            "PATCHCORD",
            "DUCT",
          ].includes(c.kind),
      )
      .reduce((n, c) => n + c._count, 0),
    cableCount: counts
      .filter(
        (c) =>
          c.projectId === p.id &&
          [
            "BACKBONE",
            "DISTRIBUTION",
            "DERIVATION",
            "DROP",
            "PATCHCORD",
            "DUCT",
          ].includes(c.kind),
      )
      .reduce((n, c) => n + c._count, 0),
  }));
}
export async function createProject(m: CompanyMember, raw: unknown) {
  requirePermission(m, "projects.create");
  const data = projectInput.parse(raw);
  return db.$transaction(async (tx) => {
    const project = await tx.networkProject.create({
      data: {
        ...data,
        view: data.view as Prisma.InputJsonObject,
        organizationId: m.organizationId,
        creatorId: m.actorId,
      },
    });
    if (project.restricted)
      await tx.projectGrant.create({
        data: {
          organizationId: m.organizationId,
          projectId: project.id,
          membershipId: m.id,
          permissions: m.permissions.filter((p) => p.startsWith("projects.")),
        },
      });
    await tx.auditLog.create({
      data: {
        organizationId: m.organizationId,
        projectId: project.id,
        actorId: m.actorId,
        action: "CREATE_PROJECT",
        entityId: project.id,
        detail: { name: project.name },
      },
    });
    return project;
  });
}
function technicalMetadata(value: unknown): Prisma.InputJsonObject {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) =>
      [
        "insertionLossDb",
        "colorPattern",
        "model",
        "chassis",
        "slotCount",
        "portsPerSlot",
        "opticalRole",
      ].includes(key),
    ),
  ) as Prisma.InputJsonObject;
}
export async function captureProject(
  m: CompanyMember,
  projectId: string,
): Promise<ProjectSnapshot> {
  const project = await authorizeProject(m, projectId);
  return db.$transaction(
    async (tx) => {
      const where = { organizationId: m.organizationId, projectId };
      const [
        assets,
        layers,
        imports,
        accesses,
        components,
        connections,
        diagrams,
      ] = await Promise.all([
        tx.asset.findMany({ where, include: inventoryInclude }),
        tx.mapLayer.findMany({ where }),
        tx.importBatch.findMany({
          where,
          select: { id: true, filename: true },
        }),
        tx.cableAccess.findMany({
          where: { organizationId: m.organizationId, equipment: { projectId } },
        }),
        tx.diagramComponent.findMany({
          where: { organizationId: m.organizationId, equipment: { projectId } },
        }),
        tx.networkConnection.findMany({ where, include: { terminals: true } }),
        tx.opticalDiagram.findMany({
          where: { organizationId: m.organizationId, equipment: { projectId } },
        }),
      ]);
      return snapshotSchema.parse(
        JSON.parse(
          JSON.stringify({
            format: "FiberMapProject",
            version: 1,
            project,
            assets: assets.map((a) => ({
              ...a,
              metadata: technicalMetadata(a.metadata),
            })),
            layers,
            imports,
            accesses,
            components,
            connections,
            diagrams,
          }),
        ),
      );
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export async function restoreProject(
  m: CompanyMember,
  raw: unknown,
  name: string,
  action = "IMPORT_PROJECT",
) {
  requirePermission(m, "projects.create");
  const s = snapshotSchema.parse(raw),
    proposed = projectInput.shape.name.parse(name);
  for (const asset of s.assets)
    requirePermission(m, assetPermission(asset.kind, "create"));
  if (s.connections.length) requirePermission(m, "connections.edit");
  const ids = new Map<string, string>();
  const add = (value: string) => {
    if (ids.has(value))
      throw new ApiError(400, "Identificador repetido no arquivo de projeto.");
    ids.set(value, randomUUID());
  };
  for (const x of [
    ...s.layers,
    ...s.imports,
    ...s.assets,
    ...s.accesses,
    ...s.components,
    ...s.connections,
  ])
    add(x.id);
  for (const a of s.assets)
    for (const x of [
      ...a.fibers,
      ...a.terminals,
      ...a.internalLinks,
      ...a.segments,
    ])
      add(x.id);
  const ref = (value: string | null | undefined) => {
    if (!value) return null;
    const next = ids.get(value);
    if (!next)
      throw new ApiError(
        400,
        "Arquivo com referência técnica inexistente: " + value,
      );
    return next;
  };
  // Validate all references and associations before the transaction creates anything.
  const assetIds = new Set(s.assets.map((a) => a.id)),
    fiberOwners = new Map(
      s.assets.flatMap((a) => a.fibers.map((f) => [f.id, a.id] as const)),
    ),
    portOwners = new Map(
      s.assets.flatMap((a) => a.terminals.map((p) => [p.id, a.id] as const)),
    );
  for (const a of s.assets) {
    if (a.parentId && !assetIds.has(a.parentId))
      throw new ApiError(400, "Contêiner inexistente.");
    for (const p of a.terminals)
      if (p.fiberId && fiberOwners.get(p.fiberId) !== a.id)
        throw new ApiError(400, "Fibra de outra entidade.");
    for (const l of a.internalLinks)
      if (portOwners.get(l.aId) !== a.id || portOwners.get(l.bId) !== a.id)
        throw new ApiError(400, "Acoplador inválido.");
  }
  const occupied = new Set<string>();
  for (const c of s.connections)
    for (const p of c.terminals) {
      if (!portOwners.has(p.terminalId) || occupied.has(p.terminalId))
        throw new ApiError(400, "Conexões duplicadas ou sem terminal.");
      occupied.add(p.terminalId);
    }
  for (const a of s.accesses)
    if (
      !assetIds.has(a.equipmentId) ||
      !assetIds.has(a.cableId) ||
      (a.remoteAssetId && !assetIds.has(a.remoteAssetId))
    )
      throw new ApiError(400, "Acesso de cabo inválido.");
  for (const c of s.components)
    if (!assetIds.has(c.equipmentId) || !assetIds.has(c.assetId))
      throw new ApiError(400, "Componente do diagrama inválido.");
  for (const d of s.diagrams)
    if (!assetIds.has(d.equipmentId))
      throw new ApiError(400, "Diagrama sem equipamento.");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${m.organizationId} FOR UPDATE`;
      const project = await tx.networkProject.create({
        data: {
          organizationId: m.organizationId,
          name: proposed,
          description: s.project.description,
          region: s.project.region,
          colorPattern: s.project.colorPattern,
          view: s.project.view as Prisma.InputJsonObject,
          creatorId: m.actorId,
          restricted: s.project.restricted,
        },
      });
      const organizationId = m.organizationId,
        projectId = project.id;
      if (project.restricted)
        await tx.projectGrant.create({
          data: {
            organizationId,
            projectId,
            membershipId: m.id,
            permissions: m.permissions.filter((p) => p.startsWith("projects.")),
          },
        });
      if (s.layers.length)
        await tx.mapLayer.createMany({
          data: s.layers.map((l) => ({
            ...l,
            id: ref(l.id)!,
            organizationId,
            projectId,
          })),
        });
      if (s.imports.length)
        await tx.importBatch.createMany({
          data: s.imports.map((i) => ({
            id: ref(i.id)!,
            filename: i.filename,
            organizationId,
            projectId,
            source: Buffer.alloc(0),
            digest: createHash("sha256")
              .update(`${projectId}:${i.id}`)
              .digest("hex"),
          })),
        });
      for (const a of s.assets) {
        const parsed = assetSchema.parse(a);
        const {
          fiberCount,
          ports,
          inputs,
          insertionLossDb,
          colorPattern,
          ...fields
        } = parsed;
        void fiberCount;
        void ports;
        void inputs;
        void insertionLossDb;
        void colorPattern;
        await tx.asset.create({
          data: {
            ...fields,
            id: ref(a.id)!,
            organizationId,
            projectId,
            parentId: null,
            layerId: ref(a.layerId),
            importBatchId: ref(a.importBatchId),
            installedAt: fields.installedAt
              ? new Date(fields.installedAt)
              : null,
            metadata: technicalMetadata(a.metadata),
            geographicLengthM: geographicLength(fields.geometry),
          },
        });
      }
      for (const a of s.assets)
        if (a.parentId)
          await tx.asset.update({
            where: { id: ref(a.id)! },
            data: { parentId: ref(a.parentId) },
          });
      for (const a of s.assets) {
        if (a.fibers.length)
          await tx.fiberStrand.createMany({
            data: a.fibers.map((f) => ({
              ...f,
              id: ref(f.id)!,
              assetId: ref(a.id)!,
            })),
          });
        if (a.segments.length)
          await tx.cableSegment.createMany({
            data: a.segments.map((g) => ({
              ...g,
              id: ref(g.id)!,
              assetId: ref(a.id)!,
              organizationId,
              geometry: g.geometry as Prisma.InputJsonObject,
            })),
          });
      }
      if (s.accesses.length)
        await tx.cableAccess.createMany({
          data: s.accesses.map((a) => ({
            ...a,
            id: ref(a.id)!,
            organizationId,
            equipmentId: ref(a.equipmentId)!,
            cableId: ref(a.cableId)!,
            remoteAssetId: ref(a.remoteAssetId),
            fiberStates: Object.fromEntries(
              Object.entries(a.fiberStates).map(([f, v]) => [ref(f)!, v]),
            ),
          })),
        });
      for (const a of s.assets) {
        if (a.terminals.length)
          await tx.opticalTerminal.createMany({
            data: a.terminals.map((p) => ({
              ...p,
              id: ref(p.id)!,
              assetId: ref(a.id)!,
              organizationId,
              fiberId: ref(p.fiberId),
              attachmentId: ref(p.attachmentId),
            })),
          });
        if (a.internalLinks.length)
          await tx.internalLink.createMany({
            data: a.internalLinks.map((l) => ({
              ...l,
              id: ref(l.id)!,
              assetId: ref(a.id)!,
              organizationId,
              aId: ref(l.aId)!,
              bId: ref(l.bId)!,
            })),
          });
      }
      for (const c of s.connections) {
        await tx.networkConnection.create({
          data: {
            id: ref(c.id)!,
            organizationId,
            projectId,
            kind: c.kind,
            locationId: ref(c.locationId),
            tray: c.tray,
            lossDb: c.lossDb,
            actorId: m.actorId,
          },
        });
        await tx.connectionTerminal.createMany({
          data: c.terminals.map((p) => ({
            terminalId: ref(p.terminalId)!,
            organizationId,
            connectionId: ref(c.id)!,
          })),
        });
      }
      if (s.components.length)
        await tx.diagramComponent.createMany({
          data: s.components.map((c) => ({
            ...c,
            id: ref(c.id)!,
            organizationId,
            equipmentId: ref(c.equipmentId)!,
            assetId: ref(c.assetId)!,
          })),
        });
      for (const d of s.diagrams) {
        const nodes =
          d.layout.nodes && typeof d.layout.nodes === "object"
            ? (d.layout.nodes as Record<string, unknown>)
            : {};
        const layout = {
          ...d.layout,
          nodes: Object.fromEntries(
            Object.entries(nodes).map(([key, val]) => [ref(key)!, val]),
          ),
        };
        await tx.opticalDiagram.create({
          data: {
            equipmentId: ref(d.equipmentId)!,
            organizationId,
            layout: layout as Prisma.InputJsonObject,
          },
        });
      }
      for (const asset of s.assets)
        await spatial(tx, ref(asset.id)!, asset.geometry);
      await tx.$executeRaw`UPDATE "CableSegment" s SET spatial=ST_SetSRID(ST_GeomFromGeoJSON(s.geometry::text),4326) FROM "Asset" a WHERE s."assetId"=a.id AND a."projectId"=${projectId}`;
      await tx.auditLog.create({
        data: {
          organizationId,
          projectId,
          actorId: m.actorId,
          action,
          entityId: projectId,
          detail: {
            name: proposed,
            assets: s.assets.length,
            connections: s.connections.length,
          },
        },
      });
      return project;
    },
    { isolationLevel: "Serializable", timeout: 60000 },
  );
}
