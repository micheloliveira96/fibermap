import { randomBytes, createHash } from "node:crypto";
import type { Membership, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { ApiError } from "./access";
import { allPermissions, effectivePermissions, levels } from "./permissions";
export const statusSchema = z.enum([
  "ACTIVE",
  "TRIAL",
  "EXPIRED",
  "SUSPENDED",
  "CANCELED",
]);
export const permissionsSchema = z
  .array(z.string().refine((x) => allPermissions.includes(x)))
  .max(allPermissions.length)
  .transform((x) => [...new Set(x)]);
export const profileSchema = z.object({
  legalName: z.string().max(200).default(""),
  taxId: z.string().max(40).default(""),
  country: z.string().max(80).default("Brasil"),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().max(40).default(""),
  address: z.string().max(250).default(""),
  city: z.string().max(100).default(""),
  region: z.string().max(100).default(""),
  postalCode: z.string().max(20).default(""),
  logo: z
    .string()
    .max(140000)
    .refine(
      (x) => !x || /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(x),
      "Use imagem PNG, JPEG ou WebP até 100 KB.",
    )
    .default(""),
});
export const planSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(""),
  priceCents: z.number().int().min(0).max(100000000),
  currency: z.enum(["BRL", "EUR", "USD"]),
  period: z.enum(["MONTHLY", "YEARLY"]),
  maxUsers: z.number().int().min(1).max(100000),
  maxProjects: z.number().int().min(0).max(100000),
  maxStorageBytes: z.number().int().min(0).max(10000000000000),
  features: permissionsSchema,
  active: z.boolean().default(true),
});
export const licenseSchema = z.object({
  planId: z.string().nullable(),
  status: statusSchema,
  expiresAt: z.string().datetime().nullable(),
  maxUsers: z.number().int().min(1).max(100000),
  maxProjects: z.number().int().min(0).max(100000),
  maxStorageBytes: z.number().int().min(0).max(10000000000000),
  features: permissionsSchema,
  expiryPolicy: z.enum(["READ_ONLY", "BLOCK"]),
  billingStatus: z
    .enum(["MANUAL", "PAID", "PENDING", "OVERDUE", "CANCELED"])
    .default("MANUAL"),
});
export type Tx = Prisma.TransactionClient;
export function json(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
    ...{},
  });
}
export function safe(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}
export async function audit(
  tx: Tx,
  actorId: string,
  organizationId: string | null,
  action: string,
  entityId: string,
  detail: Prisma.InputJsonValue = {},
) {
  await tx.administrativeAudit.create({
    data: { actorId, organizationId, action, entityId, detail },
  });
}
export async function lockCompany(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${id} FOR UPDATE`;
}
export function canManage(
  actor: Membership,
  target: Membership,
  members: Membership[],
) {
  if (
    actor.userId === target.userId ||
    levels[actor.role] >= levels[target.role]
  )
    throw new ApiError(
      403,
      "Você só pode gerenciar subordinados de nível inferior.",
    );
  if (actor.role === "OWNER") return;
  let current = target;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentId === actor.id) return;
    const p = members.find((x) => x.id === current.parentId);
    if (!p) break;
    current = p;
  }
  throw new ApiError(
    403,
    "Este usuário não pertence à sua cadeia de delegação.",
  );
}
export function validateDelegation(
  actor: Membership,
  members: Membership[],
  role: Role,
  permissions: string[],
  delegable: string[],
) {
  const effective = effectivePermissions(actor, members);
  if (role === "OWNER" || levels[role] <= levels[actor.role])
    throw new ApiError(403, "Cargo igual ou superior não permitido.");
  if (role === "VIEWER" && permissions.some((x) => !x.endsWith(".view")))
    throw new ApiError(403, "Visualizadores possuem somente leitura.");
  const allowed =
    actor.role === "OWNER"
      ? effective
      : effective.filter((x) => actor.delegable.includes(x));
  if (
    permissions.some((x) => !allowed.includes(x)) ||
    delegable.some((x) => !permissions.includes(x))
  )
    throw new ApiError(
      403,
      "Não é permitido delegar uma permissão que você não possui ou não pode delegar.",
    );
  if (actor.role !== "OWNER" && permissions.length >= effective.length)
    throw new ApiError(
      403,
      "O subordinado deve possuir poderes inferiores aos seus.",
    );
}
export async function seats(tx: Tx, id: string) {
  await tx.userInvitation.updateMany({
    where: {
      organizationId: id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { lte: new Date() },
    },
    data: { revokedAt: new Date() },
  });
  const license = await tx.license.findUnique({
    where: { organizationId: id },
  });
  if (!license) throw new ApiError(403, "Empresa sem licença.");
  const used = await tx.membership.count({ where: { organizationId: id } });
  const pending = await tx.userInvitation.count({
    where: {
      organizationId: id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      purpose: "INVITE",
    },
  });
  if (used + pending >= license.maxUsers)
    throw new ApiError(
      409,
      "Limite de usuários atingido, incluindo convites pendentes. Revogue um convite ou solicite novo limite.",
    );
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function invite(
  tx: Tx,
  input: {
    organizationId: string;
    email: string;
    name: string;
    role: Role;
    permissions: string[];
    delegable: string[];
    creatorId: string;
    purpose?: string;
  },
) {
  const token = randomBytes(32).toString("base64url");
  const invitation = await tx.userInvitation.create({
    data: {
      ...input,
      email: input.email.toLowerCase(),
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 48 * 3600000),
    },
  });
  return { id: invitation.id, token, expiresAt: invitation.expiresAt };
}
export async function usage(id: string) {
  const [users, activeUsers, projects, assets, files] = await Promise.all([
    db.membership.count({ where: { organizationId: id } }),
    db.membership.count({ where: { organizationId: id, active: true } }),
    db.networkProject.count({ where: { organizationId: id } }),
    db.asset.groupBy({
      by: ["kind"],
      where: { organizationId: id },
      _count: true,
    }),
    db.$queryRaw<
      { bytes: bigint }[]
    >`SELECT coalesce(sum(octet_length(source)),0)::bigint bytes FROM "ImportBatch" WHERE "organizationId"=${id}`,
  ]);
  return {
    users,
    activeUsers,
    projects,
    assets,
    storageBytes: Number(files[0]?.bytes ?? 0),
  };
}
export async function deliverInvitation(email: string, url: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    return {
      sent: false,
      message:
        "E-mail não configurado. Copie o link de uso único e entregue ao destinatário por um canal seguro.",
    };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Seu acesso ao FiberMap",
        text: `Seu convite para o FiberMap é válido por 48 horas. Defina sua senha: ${url}\nSe não esperava este convite, ignore esta mensagem.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return {
      sent: r.ok,
      message: r.ok
        ? "Convite enviado por e-mail."
        : "Não foi possível enviar. Entregue o link por um canal seguro.",
    };
  } catch {
    return {
      sent: false,
      message:
        "Serviço de e-mail indisponível. Entregue o link por um canal seguro.",
    };
  }
}
