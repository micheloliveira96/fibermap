import { z } from "zod";
import { db } from "@/lib/db";
import { access, ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params,
      d = z
        .object({
          fiberId: z.string(),
          status: z.enum(["AVAILABLE", "RESERVED", "DAMAGED", "BLOCKED"]),
          version: z.number().int(),
        })
        .parse(await r.json());
    requirePermission(m,"connections.edit");
    await db.$transaction(async (tx) => {
      const a = await tx.asset.updateMany({
        where: { id, organizationId: m.organizationId, version: d.version },
        data: { version: { increment: 1 } },
      });
      if (!a.count) throw new ApiError(409, "Elemento alterado. Recarregue.");
      const f = await tx.fiberStrand.findFirst({
        where: { id: d.fiberId, assetId: id },
        include: { terminals: { include: { links: true } } },
      });
      if (!f) throw new ApiError(404, "Fibra não encontrada.");
      if (f.terminals.some((t) => t.links.length))
        throw new ApiError(
          409,
          "Desconecte a fibra antes de alterar sua disponibilidade.",
        );
      await tx.fiberStrand.update({
        where: { id: f.id },
        data: { status: d.status },
      });
      await tx.auditLog.create({
        data: {
          organizationId: m.organizationId,
          actorId: m.actorId,
          action: "FIBER_STATUS",
          entityId: id,
          detail: { fiberId: f.id, before: f.status, after: d.status },
        },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
