import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { access, ApiError, requirePermission } from "./access";
import { db } from "./db";
export type CompanyMember = Awaited<ReturnType<typeof access>>;
export async function authorizeProject(
  member: CompanyMember,
  id: string,
  write = false,
  permission?: string,
) {
  requirePermission(member, write ? "projects.edit" : "projects.view");
  if (permission) requirePermission(member, permission);
  const project = await db.networkProject.findFirst({
    where: { id, organizationId: member.organizationId },
    include: { grants: { where: { membershipId: member.id } } },
  });
  if (!project || project.status === "DELETED")
    throw new ApiError(404, "Projeto não encontrado ou sem acesso.");
  if (project.restricted && !["OWNER", "ADMIN"].includes(member.role)) {
    const grant = project.grants[0];
    if (
      !grant?.permissions.includes("projects.view") ||
      (write && !grant.permissions.includes("projects.edit")) ||
      (permission && !grant.permissions.includes(permission))
    )
      throw new ApiError(
        403,
        "Seu acesso a este projeto não permite a operação.",
      );
  }
  if (write && project.status !== "ACTIVE")
    throw new ApiError(409, "Projeto arquivado: restaure-o antes de editar.");
  return project;
}
export async function projectAccess(write = false) {
  const member = await access(write);
  const projectId = (await headers()).get("x-project-id");
  if (!projectId)
    throw new ApiError(400, "Abra um projeto antes de acessar a rede.");
  const project = await authorizeProject(member, projectId, write);
  const grant = project.grants[0];
  const restricted =
    project.restricted && !["OWNER", "ADMIN"].includes(member.role);
  const editable =
    project.status === "ACTIVE" &&
    !member.expired &&
    member.permissions.includes("projects.edit") &&
    (!restricted || grant?.permissions.includes("projects.edit"));
  const permissions = member.permissions.filter(
    (p) =>
      (editable || p.endsWith(".view") || p.endsWith(".export")) &&
      (!p.endsWith(".export") ||
        (member.permissions.includes("projects.export") &&
          (!restricted || grant?.permissions.includes("projects.export")))),
  );
  return { ...member, permissions, projectId, project };
}
export type ProjectMember = Awaited<ReturnType<typeof projectAccess>>;
export const assetScope = (m: {
  organizationId: string;
  projectId: string;
}) => ({ organizationId: m.organizationId, projectId: m.projectId });
export const terminalScope = (m: {
  organizationId: string;
  projectId: string;
}) => ({ organizationId: m.organizationId, asset: { projectId: m.projectId } });
export async function projectAsset(
  tx: Prisma.TransactionClient,
  m: { organizationId: string; projectId: string },
  id: string,
) {
  const asset = await tx.asset.findFirst({ where: { id, ...assetScope(m) } });
  if (!asset) throw new ApiError(404, "Elemento não encontrado neste projeto.");
  return asset;
}
