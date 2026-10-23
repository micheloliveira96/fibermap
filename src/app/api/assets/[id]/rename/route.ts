import { z } from "zod";
import { db } from "@/lib/db";
import { projectAccess, projectAsset } from "@/lib/project-access";
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
          name: z.string().trim().min(1).max(160),
          version: z.number().int().positive(),
          diagramId: z.string().optional(),
          revision: z.string().length(64).optional(),
        })
        .parse(await r.json());
    return Response.json(
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${m.organizationId} FOR UPDATE`;
          const before = await projectAsset(tx, m, id);
          requirePermission(m, assetPermission(before.kind, "edit"));
          if (d.diagramId) {
            const diagram = await readDiagram(tx, m, d.diagramId);
            if (diagram.revision !== d.revision)
              throw new ApiError(
                409,
                "A montagem mudou em outra sessão. Reabra antes de renomear.",
              );
          }
          const changed = await tx.asset.updateMany({
            where: {
              id,
              version: d.version,
              organizationId: m.organizationId,
              projectId: m.projectId,
            },
            data: { name: d.name, version: { increment: 1 } },
          });
          if (!changed.count)
            throw new ApiError(
              409,
              "O equipamento mudou em outra sessão. Recarregue.",
            );
          await tx.auditLog.create({
            data: {
              organizationId: m.organizationId,
              projectId: m.projectId,
              actorId: m.actorId,
              action: "RENAME_ASSET",
              entityId: id,
              detail: {
                before: before.name,
                after: d.name,
                preserveTechnicalIdentity: true,
              },
            },
          });
          return {
            asset: await tx.asset.findUnique({ where: { id } }),
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
