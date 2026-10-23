import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  access,
  ApiError,
  failure,
  sameOrigin,
  requirePermission,
} from "@/lib/access";
import { authorizeProject } from "@/lib/project-access";
import {
  captureProject,
  restoreProject,
  projectViewSchema,
} from "@/lib/projects";
import { db } from "@/lib/db";
import { levels } from "@/lib/permissions";
type Context = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export async function GET(request: Request, c: Context) {
  try {
    const m = await access(),
      { id } = await c.params,
      p = await authorizeProject(m, id);
    const mode = new URL(request.url).searchParams.get("export");
    if (mode) {
      requirePermission(m, "projects.export");
      await authorizeProject(m, id, false, "projects.export");
      return Response.json(await captureProject(m, id), {
        headers: {
          "Content-Disposition": 'attachment; filename="fibermap-projeto.json"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    return Response.json(p, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
const mutation = z.object({
  action: z.enum([
    "save",
    "rename",
    "duplicate",
    "archive",
    "delete",
    "restore",
    "access",
  ]),
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(3000).optional(),
  region: z.string().max(200).optional(),
  view: projectViewSchema.optional(),
  colorPattern: z.array(z.string().min(1).max(40)).min(1).max(48).optional(),
  confirm: z.string().optional(),
  restricted: z.boolean().optional(),
  grants: z
    .array(
      z.object({
        membershipId: z.string(),
        permissions: z.array(z.string()).max(30),
      }),
    )
    .max(500)
    .optional(),
});
export async function PATCH(request: Request, c: Context) {
  try {
    sameOrigin(request);
    const m = await access(true),
      { id } = await c.params,
      d = mutation.parse(await request.json());
    const permission = {
      save: "projects.edit",
      rename: "projects.rename",
      duplicate: "projects.duplicate",
      archive: "projects.archive",
      delete: "projects.delete",
      restore: "projects.archive",
      access: "projects.access",
    }[d.action];
    requirePermission(m, permission);
    const p =
      d.action === "restore"
        ? await db.networkProject.findFirst({
            where: { id, organizationId: m.organizationId },
          })
        : await authorizeProject(m, id, false, permission);
    if (!p) throw new ApiError(404, "Projeto não encontrado.");
    if (
      d.action === "restore" &&
      !["OWNER", "ADMIN"].includes(m.role) &&
      p.creatorId !== m.actorId
    )
      throw new ApiError(403, "A restauração exige acesso do responsável.");
    if (p.version !== d.version)
      throw new ApiError(
        409,
        "O projeto mudou em outra aba. Atualize a lista antes de continuar.",
      );
    if (d.action === "duplicate") {
      requirePermission(m, "projects.create");
      return Response.json(
        await restoreProject(
          m,
          await captureProject(m, id),
          d.name ?? `${p.name} - Cópia`,
          "DUPLICATE_PROJECT",
        ),
        { status: 201 },
      );
    }
    if (d.action === "delete" && d.confirm !== p.name)
      throw new ApiError(
        400,
        "Digite o nome exato do projeto para confirmar a exclusão.",
      );
    if (d.action === "save" && p.status !== "ACTIVE")
      throw new ApiError(409, "Projeto arquivado: restaure antes de salvar.");
    const result = await db.$transaction(
      async (tx) => {
        const data: Prisma.NetworkProjectUpdateManyMutationInput = {
          version: { increment: 1 },
        };
        if (d.action === "save") {
          if (d.view) data.view = d.view as Prisma.InputJsonObject;
          if (d.colorPattern) data.colorPattern = d.colorPattern;
          if (d.description !== undefined) data.description = d.description;
          if (d.region !== undefined) data.region = d.region;
        }
        if (d.action === "rename") {
          if (!d.name) throw new ApiError(400, "Informe o nome do projeto.");
          data.name = d.name;
        }
        if (d.action === "archive") data.status = "ARCHIVED";
        if (d.action === "delete") data.status = "DELETED";
        if (d.action === "restore") data.status = "ACTIVE";
        if (d.action === "access") {
          if (d.restricted !== undefined) data.restricted = d.restricted;
          for (const grant of d.grants ?? []) {
            const target = await tx.membership.findFirst({
              where: {
                id: grant.membershipId,
                organizationId: m.organizationId,
                active: true,
              },
            });
            if (!target || levels[target.role] < levels[m.role])
              throw new ApiError(403, "Membro fora da hierarquia autorizada.");
            if (
              grant.permissions.some(
                (v) => !v.startsWith("projects.") || !m.permissions.includes(v),
              )
            )
              throw new ApiError(
                403,
                "Não delegue permissões que você não possui.",
              );
          }
          await tx.projectGrant.deleteMany({
            where: {
              projectId: id,
              organizationId: m.organizationId,
              membership: {
                role: {
                  in: (Object.keys(levels) as (keyof typeof levels)[]).filter(
                    (role) => levels[role] >= levels[m.role],
                  ),
                },
              },
            },
          });
          for (const grant of d.grants ?? [])
            if (grant.permissions.length)
              await tx.projectGrant.create({
                data: {
                  ...grant,
                  organizationId: m.organizationId,
                  projectId: id,
                },
              });
        }
        const updated = await tx.networkProject.updateMany({
          where: { id, organizationId: m.organizationId, version: d.version },
          data,
        });
        if (!updated.count)
          throw new ApiError(409, "Projeto alterado por outra sessão.");
        await tx.auditLog.create({
          data: {
            organizationId: m.organizationId,
            projectId: id,
            actorId: m.actorId,
            action: `PROJECT_${d.action.toUpperCase()}`,
            entityId: id,
            detail: { name: d.name ?? p.name, status: data.status ?? p.status },
          },
        });
        return tx.networkProject.findUniqueOrThrow({ where: { id } });
      },
      { isolationLevel: "Serializable" },
    );
    return Response.json(result);
  } catch (e) {
    return failure(e);
  }
}
