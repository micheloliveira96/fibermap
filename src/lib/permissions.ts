import type { Membership, Role } from "@prisma/client";
export const permissionGroups = {
  Mapeamento: [
    "map.view",
    "network.view",
    "cable.create",
    "cable.edit",
    "cable.delete",
    "cto.create",
    "cto.edit",
    "cto.delete",
    "closure.create",
    "closure.edit",
    "closure.delete",
    "equipment.create",
    "equipment.edit",
    "equipment.delete",
    "connections.edit",
    "network.import",
    "network.export",
    "layers.edit",
  ],
  Projetos: [
    "projects.view",
    "projects.create",
    "projects.edit",
    "projects.rename",
    "projects.duplicate",
    "projects.archive",
    "projects.delete",
    "projects.export",
    "projects.access",
  ],
  Administração: [
    "users.view",
    "users.create",
    "users.edit",
    "users.suspend",
    "users.permissions",
    "audit.view",
    "company.edit",
    "license.view",
  ],
} as const;
export const allPermissions = Object.values(
  permissionGroups,
).flat() as string[];
export const permissionLabels: Record<string, string> = {
  "map.view": "Visualizar mapa",
  "network.view": "Consultar rede",
  "cable.create": "Criar cabos",
  "cable.edit": "Editar cabos",
  "cable.delete": "Excluir cabos",
  "cto.create": "Criar CTOs",
  "cto.edit": "Editar CTOs",
  "cto.delete": "Excluir CTOs",
  "closure.create": "Criar caixas de emenda",
  "closure.edit": "Editar caixas de emenda",
  "closure.delete": "Excluir caixas de emenda",
  "equipment.create": "Criar equipamentos e POPs",
  "equipment.edit": "Editar equipamentos e POPs",
  "equipment.delete": "Excluir equipamentos e POPs",
  "connections.edit": "Gerenciar conexões e fibras",
  "network.import": "Importar rede",
  "network.export": "Exportar rede",
  "layers.edit": "Gerenciar camadas",
  "projects.view": "Consultar projetos",
  "projects.create": "Criar projetos",
  "projects.edit": "Editar projetos",
  "projects.rename": "Renomear projetos",
  "projects.duplicate": "Duplicar projetos",
  "projects.archive": "Arquivar e restaurar projetos",
  "projects.delete": "Mover projetos para a lixeira",
  "projects.export": "Exportar projetos",
  "projects.access": "Gerenciar acesso aos projetos",
  "users.view": "Consultar usuários",
  "users.create": "Criar subordinados",
  "users.edit": "Editar subordinados",
  "users.suspend": "Suspender e revogar sessões",
  "users.permissions": "Delegar permissões",
  "audit.view": "Consultar auditoria",
  "company.edit": "Editar cadastro da empresa",
  "license.view": "Consultar licença",
};
export const levels: Record<Role, number> = {
  OWNER: 0,
  ADMIN: 1,
  ENGINEER: 1,
  OPERATOR: 2,
  TECHNICIAN: 2,
  VIEWER: 3,
};
export const roleLabels: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  ENGINEER: "Engenheiro",
  OPERATOR: "Operador",
  TECHNICIAN: "Técnico",
  VIEWER: "Visualizador",
};
export function basePermissions(m: Membership): string[] {
  if (!m.active) return [];
  if (m.role === "OWNER") return allPermissions;
  const p = m.customPermissions
    ? m.permissions
    : m.role === "ADMIN"
      ? allPermissions
      : m.role === "ENGINEER"
        ? allPermissions.filter(
            (x) =>
              !x.startsWith("users.") &&
              !["company.edit", "license.view"].includes(x),
          )
        : ["map.view", "network.view", "projects.view"];
  return p.filter(
    (x) =>
      allPermissions.includes(x) &&
      (m.role !== "VIEWER" || x.endsWith(".view")),
  );
}
export function effectivePermissions(
  member: Membership,
  members: Membership[],
): string[] {
  let p = basePermissions(member),
    current = member;
  const seen = new Set([member.id]);
  while (current.parentId) {
    const parent = members.find((x) => x.id === current.parentId);
    if (
      !parent ||
      seen.has(parent.id) ||
      levels[parent.role] >= levels[current.role]
    )
      return [];
    seen.add(parent.id);
    const allowed = basePermissions(parent);
    p = p.filter(
      (x) =>
        allowed.includes(x) &&
        (parent.role === "OWNER" || parent.delegable.includes(x)),
    );
    current = parent;
  }
  return p;
}
export function assetPermission(
  kind: string,
  action: "create" | "edit" | "delete",
) {
  return `${["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP", "PATCHCORD", "DUCT"].includes(kind) ? "cable" : kind === "CTO" ? "cto" : kind === "CLOSURE" ? "closure" : "equipment"}.${action}`;
}
