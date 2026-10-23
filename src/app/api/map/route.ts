import { projectAccess as access, assetScope, terminalScope } from "@/lib/project-access";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { validatePlacement } from "@/lib/inventory";
import { assetPermission } from "@/lib/permissions";
const input = z.object({
  type: z.enum(["project", "layer"]),
  id: z.string().optional(),
  version: z.number().int().optional(),
  name: z.string().trim().min(1).max(160),
  projectId: z.string().nullable().optional(),
  colorPattern: z
    .array(z.string().trim().min(1).max(40))
    .min(1)
    .max(48)
    .optional(),
  color: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .default("#18a99b"),
  visible: z.boolean().default(true),
});
export async function GET() {
  try {
    const m = await access(); requirePermission(m,"map.view");
    const where = assetScope(m);
    const [projects, layers, imports, audits, connections] = await Promise.all([
      db.networkProject.findMany({ where: { id: m.projectId, organizationId: m.organizationId }, orderBy: { name: "asc" } }),
      db.mapLayer.findMany({ where, orderBy: { name: "asc" } }),
      db.importBatch.findMany({
        where,
        select: { id: true, filename: true, projectId: true, createdAt: true },
      }),
      m.permissions.includes("audit.view") ? db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      }) : Promise.resolve([]),
      db.networkConnection.findMany({ where, include: { terminals: true } }),
    ]);
    return Response.json(
      { role: m.role, permissions:m.permissions, projects, layers, imports, audits, connections },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const m = await access(true),
      d = input.parse(await r.json());
    if (d.projectId && d.projectId !== m.projectId) throw new ApiError(400,"Camada de outro projeto.");
    d.projectId = m.projectId;
    if (d.type === "project" && d.id && d.id !== m.projectId) throw new ApiError(404,"Projeto não encontrado.");
    if (d.type === "project" && d.id && d.name !== m.project.name) requirePermission(m,"projects.rename");
    requirePermission(m,d.type==="project" ? d.id?"projects.edit":"projects.create" : "layers.edit");
    const result = await db.$transaction(async (tx) => {
      await validatePlacement(tx, m.organizationId, { projectId: d.projectId });
      if (d.type === "project") {
        if (d.id) {
          const changed = await tx.networkProject.updateMany({
            where: { id: d.id, organizationId: m.organizationId, version: d.version ?? m.project.version },
            data: {
              version: { increment: 1 },
              name: d.name,
              ...(d.colorPattern ? { colorPattern: d.colorPattern } : {}),
            },
          });
          if (!changed.count)
            throw new ApiError(404, "Projeto não encontrado.");
          return tx.networkProject.findUnique({ where: { id: d.id } });
        }
        return tx.networkProject.create({
          data: {
            organizationId: m.organizationId,
            name: d.name,
            ...(d.colorPattern ? { colorPattern: d.colorPattern } : {}),
          },
        });
      }
      if (d.id) {
        const before = await tx.mapLayer.findFirst({
          where: { id: d.id, ...assetScope(m) },
        });
        const changed = await tx.mapLayer.updateMany({
          where: {
            id: d.id,
            ...assetScope(m),
            version: d.version ?? -1,
          },
          data: {
            name: d.name,
            color: d.color,
            visible: d.visible,
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "Camada alterada por outra sessão. Recarregue.",
          );
        if (before && before.color !== d.color)
        {
          const affected=await tx.asset.findMany({where:{layerId:d.id,organizationId:m.organizationId},select:{kind:true},distinct:['kind']});
          for(const asset of affected)requirePermission(m,assetPermission(asset.kind,'edit'));
          await tx.asset.updateMany({
            where: { layerId: d.id, organizationId: m.organizationId },
            data: { color: d.color, version: { increment: 1 } },
          });
        }
        await tx.auditLog.create({
          data: {
            organizationId: m.organizationId,
            actorId: m.actorId,
            projectId: m.projectId,
            action: "UPDATE_LAYER",
            entityId: d.id,
            detail: {
              name: d.name,
              color: d.color,
              visible: d.visible,
              recolorAssets: before?.color !== d.color,
            },
          },
        });
        return tx.mapLayer.findUnique({ where: { id: d.id } });
      }
      return tx.mapLayer.create({
        data: {
          organizationId: m.organizationId,
          name: d.name,
          projectId: d.projectId,
          color: d.color,
          visible: d.visible,
        },
      });
    });
    return Response.json(result);
  } catch (e) {
    return failure(e);
  }
}
