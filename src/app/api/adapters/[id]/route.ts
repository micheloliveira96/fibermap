import { z } from "zod";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/project-access";
import { ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { assetPermission } from "@/lib/permissions";
import { readDiagram } from "@/lib/diagram-server";
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    const m = await projectAccess(true),
      { id } = await c.params,
      d = z
        .object({
          name: z.string().trim().min(1).max(160).optional(),
          status: z
            .enum(["AVAILABLE", "RESERVED", "DAMAGED", "BLOCKED"])
            .optional(),
          version: z.number().int().positive(),
          diagramId: z.string().optional(),
          revision: z.string().length(64).optional(),
        })
        .parse(await r.json());
    return Response.json(
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${m.organizationId} FOR UPDATE`;
          const before = await tx.internalLink.findFirst({
            where: {
              id,
              organizationId: m.organizationId,
              asset: { projectId: m.projectId },
            },
            include: { asset: true },
          });
          if (!before)
            throw new ApiError(404, "Acoplador não encontrado neste projeto.");
          requirePermission(m, assetPermission(before.asset.kind, "edit"));
          if (d.status) requirePermission(m, "connections.edit");
          if (
            d.diagramId &&
            (await readDiagram(tx, m, d.diagramId)).revision !== d.revision
          )
            throw new ApiError(409, "A montagem mudou em outra sessão.");
          if (
            d.status &&
            d.status !== "AVAILABLE" &&
            (await tx.connectionTerminal.count({
              where: { terminalId: { in: [before.aId, before.bId] } },
            }))
          )
            throw new ApiError(
              409,
              "Desconecte as duas portas antes de reservar ou bloquear o acoplador.",
            );
          const updated = await tx.internalLink.updateMany({
            where: { id, version: d.version },
            data: {
              ...(d.name ? { name: d.name } : {}),
              ...(d.status ? { status: d.status } : {}),
              version: { increment: 1 },
            },
          });
          if (!updated.count)
            throw new ApiError(409, "Acoplador alterado por outra sessão.");
          await tx.asset.update({
            where: { id: before.assetId },
            data: { version: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              organizationId: m.organizationId,
              projectId: m.projectId,
              actorId: m.actorId,
              action: "UPDATE_ADAPTER",
              entityId: before.assetId,
              detail: {
                adapterId: id,
                name: d.name,
                status: d.status,
                preservePortIds: true,
              },
            },
          });
          return {
            adapter: await tx.internalLink.findUnique({ where: { id } }),
            ...(d.diagramId
              ? { diagram: await readDiagram(tx, m, d.diagramId) }
              : {}),
          };
        },
        { isolationLevel: "Serializable", timeout: 30000 },
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
