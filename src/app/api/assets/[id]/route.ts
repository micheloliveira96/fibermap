import { z } from "zod";
import { db } from "@/lib/db";
import { access, ApiError, failure, sameOrigin } from "@/lib/access";
import { assetSchema } from "@/lib/asset-input";
import {
  createAsset,
  inventoryInclude,
  spatial,
  validatePlacement,
} from "@/lib/inventory";
import { compatible, geographicLength } from "@/lib/geo";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(r: Request, c: Context) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params;
    const d = assetSchema
      .extend({ version: z.number().int().positive() })
      .parse(await r.json());
    const out = await db.$transaction(async (tx) => {
      const a = await tx.asset.findFirst({
        where: { id, organizationId: m.organizationId },
      });
      if (!a) throw new ApiError(404, "Elemento não encontrado.");
      if (a.kind !== d.kind)
        throw new ApiError(
          400,
          "O tipo técnico é definido na criação. Duplique para outro tipo.",
        );
      if (!compatible(d.kind, d.geometry))
        throw new ApiError(400, "Geometria incompatível.");
      await validatePlacement(tx, m.organizationId, d);
      const {
        fiberCount,
        ports,
        inputs,
        insertionLossDb,
        colorPattern,
        version,
        ...fields
      } = d;
      void fiberCount;
      void ports;
      void inputs;
      void insertionLossDb;
      void colorPattern;
      const changed = await tx.asset.updateMany({
        where: { id, organizationId: m.organizationId, version },
        data: {
          ...fields,
          installedAt: fields.installedAt ? new Date(fields.installedAt) : null,
          geographicLengthM: geographicLength(d.geometry),
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ApiError(
          409,
          "Outra sessão alterou este elemento. Recarregue antes de salvar.",
        );
      await spatial(tx, id, d.geometry);
      if (JSON.stringify(a.geometry) !== JSON.stringify(d.geometry))
        await tx.cableSegment.deleteMany({
          where: { assetId: id, organizationId: m.organizationId },
        });
      await tx.auditLog.create({
        data: {
          organizationId: m.organizationId,
          actorId: m.actorId,
          action: "UPDATE_ASSET",
          entityId: id,
          detail: { before: a, after: d },
        },
      });
      return tx.asset.findUnique({ where: { id }, include: inventoryInclude });
    });
    return Response.json(out);
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(r: Request, c: Context) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params,
      { version } = z
        .object({ version: z.number().int() })
        .parse(await r.json());
    await db.$transaction(async (tx) => {
      const a = await tx.asset.findFirst({
        where: { id, organizationId: m.organizationId, version },
      });
      if (!a)
        throw new ApiError(
          409,
          "Elemento inexistente ou alterado. Recarregue.",
        );
      const locked = await tx.asset.updateMany({
        where: { id, organizationId: m.organizationId, version },
        data: { version: { increment: 1 } },
      });
      if (!locked.count)
        throw new ApiError(409, "Elemento alterado. Recarregue.");
      const occupied = await tx.connectionTerminal.count({
        where: { organizationId: m.organizationId, terminal: { assetId: id } },
      });
      if (occupied)
        throw new ApiError(
          409,
          "Remova as conexões ópticas antes de excluir este elemento.",
        );
      await tx.internalLink.deleteMany({
        where: { assetId: id, organizationId: m.organizationId },
      });
      await tx.opticalTerminal.deleteMany({
        where: { assetId: id, organizationId: m.organizationId },
      });
      await tx.fiberStrand.deleteMany({ where: { assetId: id } });
      await tx.cableSegment.deleteMany({
        where: { assetId: id, organizationId: m.organizationId },
      });
      await tx.asset.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: m.organizationId,
          actorId: m.actorId,
          action: "DELETE_ASSET",
          entityId: id,
          detail: { before: a },
        },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request, c: Context) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params;
    const d = z
      .object({
        code: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(160),
      })
      .parse(await r.json());
    const a = await db.asset.findFirst({
      where: { id, organizationId: m.organizationId },
      include: inventoryInclude,
    });
    if (!a) throw new ApiError(404, "Elemento não encontrado.");
    const parsed = assetSchema.parse({
      ...a,
      ...d,
      installedAt: a.installedAt?.toISOString(),
      fiberCount: a.fibers.length || 12,
      ports:
        a.kind === "SPLITTER"
          ? a.terminals.filter((t) => t.kind === "SPLITTER_OUT").length
          : a.kind === "CTO" || a.kind === "DIO"
            ? a.terminals.length / 2
            : a.terminals.length || 8,
      inputs: a.terminals.filter((t) => t.kind === "SPLITTER_IN").length || 1,
      ...(a.metadata as object),
    });
    return Response.json(
      await db.$transaction((tx) => createAsset(tx, m, parsed), {
        timeout: 20000,
      }),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
