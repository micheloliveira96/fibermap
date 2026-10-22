import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AssetInput } from "./asset-input";
import { ApiError } from "./access";
import { strands, colors } from "./network";
import { compatible, geographicLength, type MapGeometry } from "./geo";
export const inventoryInclude = {
  segments: { orderBy: { position: "asc" as const } },
  fibers: {
    orderBy: { number: "asc" as const },
    include: { terminals: { include: { links: true } } },
  },
  terminals: { include: { links: true } },
};
export async function validatePlacement(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: {
    projectId?: string | null;
    layerId?: string | null;
    parentId?: string | null;
    kind?: string;
  },
) {
  if (data.parentId) {
    const parent = await tx.asset.findFirst({
      where: { id: data.parentId, organizationId },
    });
    if (
      !parent ||
      !["CTO", "CLOSURE", "POP"].includes(parent.kind) ||
      !["SPLITTER", "OLT", "DIO"].includes(data.kind ?? "")
    )
      throw new ApiError(
        400,
        "Selecione POP, CTO ou caixa como contêiner de OLT, DIO ou splitter.",
      );
  }
  if (
    data.projectId &&
    !(await tx.networkProject.findFirst({
      where: { id: data.projectId, organizationId },
    }))
  )
    throw new ApiError(404, "Projeto não encontrado.");
  if (data.layerId) {
    const layer = await tx.mapLayer.findFirst({
      where: { id: data.layerId, organizationId },
    });
    if (!layer) throw new ApiError(404, "Camada não encontrada.");
    if (layer.projectId && layer.projectId !== data.projectId)
      throw new ApiError(400, "A camada pertence a outro projeto.");
  }
}
export async function spatial(
  tx: Prisma.TransactionClient,
  id: string,
  g: MapGeometry,
) {
  const r = await tx.$queryRaw<
    { valid: boolean }[]
  >`SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}),4326)) AS valid`;
  if (!r[0]?.valid)
    throw new ApiError(
      400,
      "Geometria inválida: verifique cruzamentos e anéis.",
    );
  await tx.$executeRaw`UPDATE "Asset" SET spatial=ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}),4326) WHERE id=${id}`;
}
export async function createAsset(
  tx: Prisma.TransactionClient,
  member: { organizationId: string; actorId: string },
  data: AssetInput,
  extra: { importBatchId?: string; metadata?: Prisma.InputJsonObject } = {},
) {
  if (!compatible(data.kind, data.geometry))
    throw new ApiError(400, "Tipo incompatível com a geometria.");
  await validatePlacement(tx, member.organizationId, data);
  const {
      fiberCount,
      ports,
      inputs,
      insertionLossDb,
      colorPattern,
      ...fields
    } = data,
    project = data.projectId
      ? await tx.networkProject.findUnique({ where: { id: data.projectId } })
      : null,
    pattern =
      colorPattern ??
      (Array.isArray(project?.colorPattern)
        ? (project.colorPattern as string[])
        : colors);
  const asset = await tx.asset.create({
    data: {
      ...fields,
      installedAt: fields.installedAt ? new Date(fields.installedAt) : null,
      organizationId: member.organizationId,
      importBatchId: extra.importBatchId,
      geographicLengthM: geographicLength(data.geometry),
      metadata: { ...extra.metadata, insertionLossDb, colorPattern: pattern },
    },
  });
  await spatial(tx, asset.id, data.geometry);
  await populateTerminals(tx, member.organizationId, asset.id, data, pattern);
  await tx.auditLog.create({
    data: {
      organizationId: member.organizationId,
      actorId: member.actorId,
      action: "CREATE_ASSET",
      entityId: asset.id,
      detail: { ...data, importBatchId: extra.importBatchId ?? null },
    },
  });
  return asset;
}

export async function populateTerminals(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assetId: string,
  data: AssetInput,
  pattern: string[] = colors,
) {
  const { fiberCount, ports, inputs } = data;
  if (["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP"].includes(data.kind)) {
    const fibers = strands(fiberCount, pattern).map((s) => ({
      id: randomUUID(),
      assetId: assetId,
      ...s,
    }));
    await tx.fiberStrand.createMany({ data: fibers });
    await tx.opticalTerminal.createMany({
      data: fibers.flatMap((f) =>
        ["A", "B"].map((end) => ({
          organizationId: organizationId,
          assetId: assetId,
          fiberId: f.id,
          label: `${f.number}/${end}`,
          kind: end === "A" ? ("FIBER_A" as const) : ("FIBER_B" as const),
        })),
      ),
    });
  }
  const portKind = {
    OLT: "PON",
    DIO: "DIO",
    CTO: "CTO",
    CUSTOMER: "CUSTOMER",
  } as const;
  if (data.kind in portKind)
    await tx.opticalTerminal.createMany({
      data: Array.from(
        { length: data.kind === "CUSTOMER" ? 1 : ports },
        (_, i) => ({
          organizationId: organizationId,
          assetId: assetId,
          label: `Porta ${i + 1}`,
          kind: portKind[data.kind as keyof typeof portKind],
        }),
      ),
    });
  if (data.kind === "DIO" || data.kind === "CTO") {
    const fronts = await tx.opticalTerminal.findMany({
      where: { assetId: assetId },
    });
    for (const front of fronts) {
      const back = await tx.opticalTerminal.create({
        data: {
          organizationId: organizationId,
          assetId: assetId,
          label: `${front.label} · traseira`,
          kind: front.kind,
        },
      });
      await tx.internalLink.create({
        data: {
          organizationId: organizationId,
          assetId: assetId,
          aId: front.id,
          bId: back.id,
        },
      });
    }
  }
  if (data.kind === "SPLITTER")
    await tx.opticalTerminal.createMany({
      data: [
        ...Array.from({ length: inputs }, (_, i) => ({
          label: `Entrada ${i + 1}`,
          kind: "SPLITTER_IN" as const,
        })),
        ...Array.from({ length: ports }, (_, i) => ({
          label: `Saída ${i + 1}`,
          kind: "SPLITTER_OUT" as const,
        })),
      ].map((p) => ({
        ...p,
        organizationId: organizationId,
        assetId: assetId,
      })),
    });
}
