import { administrativeDenial } from "@/lib/admin-audit";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  access,
  platformAccess,
  requirePermission,
  sameOrigin,
  failure,
  ApiError,
} from "@/lib/access";
import { allPermissions, effectivePermissions } from "@/lib/permissions";
import {
  audit,
  canManage,
  validateDelegation,
  profileSchema,
  planSchema,
  licenseSchema,
  permissionsSchema,
  lockCompany,
  invite,
  seats,
  usage,
  safe,
  deliverInvitation,
} from "@/lib/administration";
export const dynamic = "force-dynamic";
const userInput = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().transform((s) => s.toLowerCase()),
  role: z.enum(["ADMIN", "ENGINEER", "TECHNICIAN", "OPERATOR", "VIEWER"]),
  permissions: permissionsSchema,
  delegable: permissionsSchema,
});
export async function GET(r: Request) {
  try {
    const p = new URL(r.url).searchParams,
      platform = p.get("scope") === "platform",
      resource = p.get("resource") || "dashboard";
    const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1)),
      q = (p.get("q") || "").slice(0, 160),
      status = p.get("status") || "",
      skip = (page - 1) * 20;
    if (platform) {
      await platformAccess();
      if (resource === "plans")
        return Response.json(
          safe({
            items: await db.subscriptionPlan.findMany({
              orderBy: { createdAt: "desc" },
            }),
          }),
        );
      if (resource === "settings")
        return Response.json(
          (await db.platformSettings.findUnique({
            where: { id: "global" },
          })) || { name: "FiberMap", supportEmail: "" },
        );
      if (resource === "audits") {
        const where = {
          ...(q
            ? { action: { contains: q, mode: "insensitive" as const } }
            : {}),
        };
        const [items, total] = await Promise.all([
          db.administrativeAudit.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 20,
            skip,
          }),
          db.administrativeAudit.count({ where }),
        ]);
        return Response.json({ items, total, page });
      }
      if (resource === "companies") {
        const id = p.get("id");
        if (id) {
          const company = await db.organization.findUnique({
            where: { id },
            include: {
              license: { include: { plan: true } },
              memberships: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          });
          if (!company) throw new ApiError(404, "Empresa não encontrada.");
          return Response.json(
            safe({
              company,
              usage: await usage(id),
              audits: await db.administrativeAudit.findMany({
                where: { organizationId: id },
                orderBy: { createdAt: "desc" },
                take: 50,
              }),
            }),
          );
        }
        const where = {
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          ...(status ? { status } : {}),
        };
        const [items, total] = await Promise.all([
          db.organization.findMany({
            where,
            include: {
              license: { include: { plan: true } },
              _count: {
                select: { memberships: true, projects: true, assets: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            skip,
          }),
          db.organization.count({ where }),
        ]);
        return Response.json(safe({ items, total, page }));
      }
      const [
        companies,
        active,
        suspended,
        users,
        activeUsers,
        expired,
        expiring,
        trials,
        licenses,
        projects,
        assets,
      ] = await Promise.all([
        db.organization.count(),
        db.organization.count({ where: { status: "ACTIVE" } }),
        db.organization.count({ where: { status: "SUSPENDED" } }),
        db.membership.count(),
        db.membership.count({
          where: { active: true, organization: { status: "ACTIVE" } },
        }),
        db.license.count({
          where: {
            OR: [{ status: "EXPIRED" }, { expiresAt: { lt: new Date() } }],
          },
        }),
        db.license.count({
          where: {
            status: { in: ["ACTIVE", "TRIAL"] },
            expiresAt: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 86400000),
            },
          },
        }),
        db.license.count({ where: { status: "TRIAL" } }),
        db.license.findMany({
          include: { plan: true, organization: { select: { status: true } } },
        }),
        db.networkProject.count(),
        db.asset.count(),
      ]);
      const revenue: Record<string, number> = {};
      for (const l of licenses) {
        if (
          l.plan &&
          l.organization.status === "ACTIVE" &&
          l.status === "ACTIVE" &&
          (!l.expiresAt || l.expiresAt > new Date())
        )
          revenue[l.plan.currency] =
            (revenue[l.plan.currency] || 0) +
            l.plan.priceCents / (l.plan.period === "YEARLY" ? 12 : 1);
      }
      return Response.json(
        safe({
          companies,
          active,
          suspended,
          users,
          activeUsers,
          expired,
          expiring,
          trials,
          projects,
          assets,
          revenue,
          contracts: licenses
            .filter((x) => x.plan)
            .map((x) => ({ name: x.plan!.name, status: x.status })),
        }),
      );
    }
    const m = await access();
    if (resource === "users") {
      requirePermission(m, "users.view");
      const where = {
        organizationId: m.organizationId,
        ...(q
          ? {
              user: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
        ...(status ? { active: status === "ACTIVE" } : {}),
      };
      const [items, total, members, invitations] = await Promise.all([
        db.membership.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                lastLoginAt: true,
                sessions: {
                  select: { createdAt: true },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          take: 20,
          skip,
          orderBy: { id: "asc" },
        }),
        db.membership.count({ where }),
        db.membership.findMany({ where: { organizationId: m.organizationId } }),
        db.userInvitation.findMany({
          where: {
            organizationId: m.organizationId,
            acceptedAt: null,
            revokedAt: null,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            expiresAt: true,
            creatorId: true,
            purpose: true,
          },
        }),
      ]);
      return Response.json({
        items: items.map((i) => ({
          ...i,
          effectivePermissions: effectivePermissions(i, members),
        })),
        total,
        page,
        invitations,
        me: {
          id: m.id,
          role: m.role,
          permissions: m.permissions,
          delegable:
            m.role === "OWNER"
              ? m.permissions
              : m.delegable.filter((x) => m.permissions.includes(x)),
        },
      });
    }
    if (resource === "audits") {
      requirePermission(m, "audit.view");
      const where = {
        organizationId: m.organizationId,
        ...(q ? { action: { contains: q, mode: "insensitive" as const } } : {}),
      };
      const [items, total, network] = await Promise.all([
        db.administrativeAudit.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
          skip,
        }),
        db.administrativeAudit.count({ where }),
        db.auditLog.findMany({
          where: { organizationId: m.organizationId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);
      return Response.json({ items, total, page, network });
    }
    if (
      !m.permissions.some((x) =>
        ["users.view", "license.view", "company.edit", "audit.view"].includes(
          x,
        ),
      )
    )
      throw new ApiError(403, "Sem acesso à administração empresarial.");
    return Response.json(
      safe({
        company: m.organization,
        usage: await usage(m.organizationId),
        permissions: m.permissions,
        expired: m.expired,
        audits: m.permissions.includes("audit.view")
          ? await db.administrativeAudit.findMany({
              where: { organizationId: m.organizationId },
              take: 10,
              orderBy: { createdAt: "desc" },
            })
          : [],
      }),
    );
  } catch (e) {
    await administrativeDenial(e);
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    if (Number(r.headers.get("content-length") || 0) > 250000)
      throw new ApiError(413, "Formulário muito grande.");
    const raw = await r.json(),
      op = z.string().parse(raw.op),
      platform = new URL(r.url).searchParams.get("scope") === "platform";
    let generated: { token: string; email: string } | null = null;
    let out: unknown;
    if (platform) {
      const a = await platformAccess();
      out = await db.$transaction(
        async (tx) => {
          if (op === "plan") {
            const d = planSchema.parse(raw.data),
              id = z.string().optional().parse(raw.id);
            const plan = id
              ? await tx.subscriptionPlan.update({
                  where: { id },
                  data: { ...d, maxStorageBytes: BigInt(d.maxStorageBytes) },
                })
              : await tx.subscriptionPlan.create({
                  data: { ...d, maxStorageBytes: BigInt(d.maxStorageBytes) },
                });
            await audit(tx, a.actorId, null, "PLAN_SAVED", plan.id, d);
            return plan;
          }
          if (op === "company.create") {
            const d = z
              .object({
                name: z.string().trim().min(1).max(160),
                profile: profileSchema,
                ownerName: z.string().trim().min(1).max(160),
                ownerEmail: z.email(),
                license: licenseSchema,
              })
              .parse(raw.data);
            const plan = d.license.planId
              ? await tx.subscriptionPlan.findUnique({
                  where: { id: d.license.planId },
                })
              : null;
            if (!plan?.active)
              throw new ApiError(400, "Selecione um plano ativo.");
            const org = await tx.organization.create({
              data: { name: d.name, profile: d.profile },
            });
            await tx.license.update({
              where: { organizationId: org.id },
              data: {
                ...d.license,
                expiresAt: d.license.expiresAt
                  ? new Date(d.license.expiresAt)
                  : null,
                maxStorageBytes: BigInt(d.license.maxStorageBytes),
              },
            });
            const i = await invite(tx, {
              organizationId: org.id,
              email: d.ownerEmail,
              name: d.ownerName,
              role: "OWNER",
              permissions: allPermissions,
              delegable: allPermissions,
              creatorId: a.actorId,
            });
            generated = { token: i.token, email: d.ownerEmail };
            await audit(tx, a.actorId, org.id, "COMPANY_CREATED", org.id, {
              name: d.name,
              ownerEmail: d.ownerEmail,
              license: d.license,
            });
            return org;
          }
          const id = z.string().parse(raw.id);
          if (op === "settings") {
            const d = z
              .object({
                name: z.string().min(1).max(100),
                supportEmail: z.union([z.email(), z.literal("")]),
              })
              .parse(raw.data);
            await audit(tx, a.actorId, null, "PLATFORM_SETTINGS", "global", d);
            return tx.platformSettings.upsert({
              where: { id: "global" },
              create: { id: "global", ...d },
              update: d,
            });
          }
          await lockCompany(tx, id);
          const company = await tx.organization.findUnique({ where: { id } });
          if (!company) throw new ApiError(404, "Empresa não encontrada.");
          if (op === "company.save") {
            const d = z
              .object({
                name: z.string().trim().min(1).max(160),
                profile: profileSchema,
              })
              .parse(raw.data);
            await tx.organization.update({ where: { id }, data: d });
            await audit(tx, a.actorId, id, "COMPANY_UPDATED", id, {
              before: company.profile,
              after: d,
            });
            return { ok: true };
          }
          if (op === "company.status") {
            const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(raw.status);
            await tx.organization.update({ where: { id }, data: { status } });
            await tx.session.deleteMany({
              where: {
                user: { memberships: { some: { organizationId: id } } },
              },
            });
            await audit(tx, a.actorId, id, "COMPANY_" + status, id, { status });
            return { ok: true };
          }
          if (op === "license") {
            const d = licenseSchema.parse(raw.data);
            if (
              d.planId &&
              !(await tx.subscriptionPlan.findUnique({
                where: { id: d.planId, active: true },
              }))
            )
              throw new ApiError(400, "Plano inativo ou inexistente.");
            const users = await tx.membership.count({
                where: { organizationId: id },
              }),
              pending = await tx.userInvitation.count({
                where: {
                  organizationId: id,
                  acceptedAt: null,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                  purpose: "INVITE",
                },
              });
            if (users + pending > d.maxUsers)
              throw new ApiError(
                409,
                "O limite não pode ficar abaixo das vagas utilizadas e reservadas.",
              );
            const before = await tx.license.findUnique({
              where: { organizationId: id },
            });
            const license = await tx.license.update({
              where: { organizationId: id },
              data: {
                ...d,
                expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
                maxStorageBytes: BigInt(d.maxStorageBytes),
              },
            });
            await audit(tx, a.actorId, id, "LICENSE_UPDATED", id, {
              before: safe(before),
              after: d,
            } as PrismaJson);
            return license;
          }
          if (op === "owner") {
            const d = z
              .object({
                email: z.email(),
                name: z.string().trim().min(1).max(160),
              })
              .parse(raw.data);
            await tx.userInvitation.updateMany({
              where: {
                organizationId: id,
                role: "OWNER",
                acceptedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: new Date() },
            });
            if (
              !(await tx.membership.findFirst({
                where: { organizationId: id, user: { email: d.email } },
              }))
            )
              await seats(tx, id);
            const i = await invite(tx, {
              organizationId: id,
              ...d,
              role: "OWNER",
              permissions: allPermissions,
              delegable: allPermissions,
              creatorId: a.actorId,
              purpose: "OWNER",
            });
            generated = { token: i.token, email: d.email };
            await audit(tx, a.actorId, id, "OWNER_TRANSFER_INVITED", id, {
              email: d.email,
            });
            return { ok: true };
          }
          throw new ApiError(400, "Operação desconhecida.");
        },
        { timeout: 20000 },
      );
    } else {
      const m = await access(true);
      out = await db.$transaction(
        async (tx) => {
          await lockCompany(tx, m.organizationId);
          const members = await tx.membership.findMany({
              where: { organizationId: m.organizationId },
            }),
            actor = members.find((x) => x.id === m.id);
          if (!actor?.active) throw new ApiError(403, "Conta suspensa.");
          const current = {
            permissions: effectivePermissions(actor, members).filter((x) =>
              m.permissions.includes(x),
            ),
          };
          if (op === "company.save") {
            requirePermission(current, "company.edit");
            const d = profileSchema.parse(raw.data);
            await tx.organization.update({
              where: { id: m.organizationId },
              data: { profile: d },
            });
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              "COMPANY_PROFILE_UPDATED",
              m.organizationId,
              d,
            );
            return { ok: true };
          }
          if (op === "invite") {
            requirePermission(current, "users.create");
            const d = userInput.parse(raw.data);
            validateDelegation(
              actor,
              members,
              d.role,
              d.permissions,
              d.delegable,
            );
            if (d.permissions.some((p) => !current.permissions.includes(p)))
              throw new ApiError(
                403,
                "Recurso não contratado ou permissão revogada.",
              );
            if (
              await tx.membership.findFirst({
                where: {
                  organizationId: m.organizationId,
                  user: { email: d.email },
                },
              })
            )
              throw new ApiError(409, "Usuário já vinculado.");
            await seats(tx, m.organizationId);
            const i = await invite(tx, {
              ...d,
              organizationId: m.organizationId,
              creatorId: m.actorId,
            });
            generated = { token: i.token, email: d.email };
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              "USER_INVITED",
              i.id,
              d,
            );
            return { ok: true };
          }
          if (op === "invitation.revoke") {
            requirePermission(current, "users.create");
            const id = z.string().parse(raw.id),
              i = await tx.userInvitation.findFirst({
                where: {
                  id,
                  organizationId: m.organizationId,
                  acceptedAt: null,
                  revokedAt: null,
                },
              });
            if (!i) throw new ApiError(404, "Convite inexistente.");
            if (i.creatorId !== m.actorId && actor.role !== "OWNER")
              throw new ApiError(403, "Convite de outro administrador.");
            if (i.role === "OWNER")
              throw new ApiError(
                403,
                "Somente a plataforma gerencia o proprietário.",
              );
            await tx.userInvitation.update({
              where: { id },
              data: { revokedAt: new Date() },
            });
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              "INVITATION_REVOKED",
              id,
            );
            return { ok: true };
          }
          const id = z.string().parse(raw.id),
            target = members.find((x) => x.id === id);
          if (!target) throw new ApiError(404, "Usuário não encontrado.");
          canManage(actor, target, members);
          if (op === "user.save") {
            requirePermission(current, "users.edit");
            requirePermission(current, "users.permissions");
            const d = userInput.omit({ email: true }).parse(raw.data);
            validateDelegation(
              actor,
              members,
              d.role,
              d.permissions,
              d.delegable,
            );
            if (d.permissions.some((p) => !current.permissions.includes(p)))
              throw new ApiError(
                403,
                "Recurso não contratado ou permissão revogada.",
              );
            await tx.membership.update({
              where: { id },
              data: {
                role: d.role,
                permissions: d.permissions,
                delegable: d.delegable,
                customPermissions: true,
              },
            });
            await tx.user.update({
              where: { id: target.userId },
              data: { name: d.name },
            });
            await tx.session.deleteMany({ where: { userId: target.userId } });
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              "USER_PERMISSIONS_UPDATED",
              id,
              {
                before: {
                  role: target.role,
                  permissions: target.permissions,
                  delegable: target.delegable,
                },
                after: d,
              },
            );
            return { ok: true };
          }
          if (op === "user.status" || op === "user.sessions") {
            requirePermission(current, "users.suspend");
            if (op === "user.status")
              await tx.membership.update({
                where: { id },
                data: { active: z.boolean().parse(raw.active) },
              });
            await tx.session.deleteMany({ where: { userId: target.userId } });
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              op === "user.status" ? "USER_STATUS_UPDATED" : "SESSIONS_REVOKED",
              id,
              { active: op === "user.status" ? raw.active : target.active },
            );
            return { ok: true };
          }
          if (op === "user.reset") {
            requirePermission(current, "users.edit");
            const u = await tx.user.findUniqueOrThrow({
              where: { id: target.userId },
            });
            const i = await invite(tx, {
              organizationId: m.organizationId,
              email: u.email,
              name: u.name,
              role: target.role,
              permissions: target.permissions,
              delegable: target.delegable,
              creatorId: m.actorId,
              purpose: "RESET",
            });
            generated = { token: i.token, email: u.email };
            await audit(
              tx,
              m.actorId,
              m.organizationId,
              "PASSWORD_RESET_ISSUED",
              id,
            );
            return { ok: true };
          }
          throw new ApiError(400, "Operação desconhecida.");
        },
        { timeout: 20000 },
      );
    }
    const delivery = generated as { token: string; email: string } | null;
    if (delivery) {
      const base = process.env.BETTER_AUTH_URL || new URL(r.url).origin,
        url = base + "/convite?token=" + delivery.token;
      return Response.json(
        safe({
          result: out,
          inviteUrl: url,
          ...(await deliverInvitation(delivery.email, url)),
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(safe({ result: out }));
  } catch (e) {
    await administrativeDenial(e);
    return failure(e);
  }
}
type PrismaJson = import("@prisma/client").Prisma.InputJsonValue;
