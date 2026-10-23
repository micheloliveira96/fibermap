import {
  projectAccess as access,
  assetScope,
  terminalScope,
} from "@/lib/project-access";
import { assetPermission } from "@/lib/permissions";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { assetSchema } from "@/lib/asset-input";
import { populateTerminals, validatePlacement } from "@/lib/inventory";
import { compatible } from "@/lib/geo";
import type { Prisma } from "@prisma/client";
import { colors } from "@/lib/network";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params;
    const input = assetSchema
      .pick({
        kind: true,
        fiberCount: true,
        ports: true,
        inputs: true,
        insertionLossDb: true,
      })
      .extend({ version: z.number().int(), confirm: z.literal(true) })
      .parse(await r.json());
    requirePermission(m, "equipment.edit");
    requirePermission(m, assetPermission(input.kind, "create"));
    await db.$transaction(
      async (tx) => {
        const a = await tx.asset.findFirst({
          where: { id, ...assetScope(m) },
        });
        if (!a) throw new ApiError(404, "Elemento não encontrado.");
        if (a.kind !== "IMPORTED" || input.kind === "IMPORTED")
          throw new ApiError(
            400,
            "A conversão exige um elemento importado genérico.",
          );
        const data = assetSchema.parse({
          ...a,
          ...input,
          installedAt: a.installedAt?.toISOString() ?? null,
        });
        if (!compatible(data.kind, data.geometry))
          throw new ApiError(
            400,
            "Separe as geometrias múltiplas no arquivo antes de converter em um único cabo ou equipamento.",
          );
        await validatePlacement(tx, m.organizationId, data);
        const project = a.projectId
          ? await tx.networkProject.findUnique({ where: { id: a.projectId } })
          : null;
        const pattern = Array.isArray(project?.colorPattern)
          ? (project.colorPattern as string[])
          : colors;
        const update = await tx.asset.updateMany({
          where: {
            id,
            organizationId: m.organizationId,
            version: input.version,
            kind: "IMPORTED",
          },
          data: {
            kind: input.kind,
            version: { increment: 1 },
            metadata: {
              ...(a.metadata as Prisma.InputJsonObject),
              insertionLossDb: input.insertionLossDb,
              colorPattern: pattern,
            },
          },
        });
        if (!update.count)
          throw new ApiError(409, "Elemento alterado. Recarregue.");
        await populateTerminals(tx, m.organizationId, id, data, pattern);
        await tx.auditLog.create({
          data: {
            organizationId: m.organizationId,
            actorId: m.actorId,
            projectId: m.projectId,
            action: "CONVERT_IMPORTED",
            entityId: id,
            detail: input,
          },
        });
      },
      { timeout: 20000 },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
