import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { effectivePermissions } from "./permissions";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function access(write = false, organizationOverride?: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiError(401, "Entre para acessar a rede.");
  const organizationId = organizationOverride ?? (await headers()).get("x-organization-id");
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { organization: { include: { license: true } } },
  });
  if (!membership) throw new ApiError(403, "Sem acesso a uma organização.");
  if (!membership.active || membership.organization.status !== "ACTIVE")
    throw new ApiError(
      403,
      "Conta ou empresa suspensa. Entre em contato com o administrador.",
    );
  const license = membership.organization.license;
  if (!license || ["SUSPENDED", "CANCELED"].includes(license.status))
    throw new ApiError(
      403,
      "Licença indisponível. Entre em contato com o proprietário.",
    );
  const expired =
    license.status === "EXPIRED" ||
    Boolean(license.expiresAt && license.expiresAt < new Date());
  if (expired && (write || license.expiryPolicy === "BLOCK"))
    throw new ApiError(
      403,
      "Licença vencida. Solicite renovação; seus dados foram preservados.",
    );
  let permissions = effectivePermissions(
    membership,
    await db.membership.findMany({
      where: { organizationId: membership.organizationId },
    }),
  );
  if (license.features.length)
    permissions = permissions.filter(
      (x) =>
        license.features.includes(x) ||
        ["license.view", "users.view"].includes(x),
    );
  if (
    write &&
    !permissions.some((x) => !x.endsWith(".view") && !x.endsWith(".export"))
  )
    throw new ApiError(403, "Seu perfil não permite esta operação.");
  return { ...membership, permissions, expired, actorId: session.user.id };
}
export function requirePermission(
  m: { permissions: string[] },
  permission: string,
) {
  if (!m.permissions.includes(permission))
    throw new ApiError(403, "Permissão não concedida: " + permission);
}
export async function platformAccess() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiError(401, "Entre para acessar a administração.");
  if (
    !(await db.platformAdministrator.findUnique({
      where: { userId: session.user.id },
    }))
  )
    throw new ApiError(403, "Acesso exclusivo da administração da plataforma.");
  return { actorId: session.user.id };
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (
    error instanceof Error &&
    /Limite de (usuários|projetos|armazenamento)/i.test(error.message)
  )
    return Response.json(
      {
        error:
          "Limite da licença atingido. Solicite ajuste ao administrador da plataforma.",
      },
      { status: 409 },
    );
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ZodError"
  )
    return Response.json(
      { error: "Dados inválidos. Verifique os campos e a geometria." },
      { status: 400 },
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["P2002", "P2003", "P2034"].includes(String(error.code))
  )
    return Response.json(
      { error: "Conflito de integridade ou edição simultânea." },
      { status: 409 },
    );
  console.error(error);
  return Response.json(
    { error: "Operação indisponível. Verifique o banco de dados." },
    { status: 503 },
  );
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new ApiError(403, "Origem não autorizada.");
}
