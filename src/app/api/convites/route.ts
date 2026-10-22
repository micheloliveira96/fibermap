import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sameOrigin, failure, ApiError } from "@/lib/access";
import {
  tokenHash,
  audit,
  lockCompany,
  validateDelegation,
  canManage,
} from "@/lib/administration";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const d = z
      .object({
        token: z.string().min(40).max(100),
        password: z.string().min(12).max(128).optional(),
        inspect: z.boolean().optional(),
      })
      .parse(await r.json());
    const i = await db.userInvitation.findUnique({
      where: { tokenHash: tokenHash(d.token) },
    });
    if (!i || i.revokedAt || i.acceptedAt || i.expiresAt < new Date())
      throw new ApiError(
        410,
        "Convite inválido, utilizado ou expirado. Solicite um novo link.",
      );
    if (d.inspect) {
      const existing = Boolean(
        await db.user.findUnique({ where: { email: i.email } }),
      );
      return Response.json(
        {
          name: i.name,
          email: i.email,
          purpose: i.purpose,
          existing,
          expiresAt: i.expiresAt,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const session = await auth.api.getSession({ headers: await headers() });
    const passwordHash = d.password ? await hashPassword(d.password) : null;
    await db.$transaction(
      async (tx) => {
        await lockCompany(tx, i.organizationId);
        const current = await tx.userInvitation.findUniqueOrThrow({
          where: { id: i.id },
        });
        if (
          current.acceptedAt ||
          current.revokedAt ||
          current.expiresAt < new Date()
        )
          throw new ApiError(410, "Convite já utilizado ou expirado.");
        const org = await tx.organization.findUniqueOrThrow({
            where: { id: i.organizationId },
            include: { license: true },
          }),
          l = org.license;
        if (
          org.status !== "ACTIVE" ||
          !l ||
          !["ACTIVE", "TRIAL"].includes(l.status) ||
          (l.expiresAt && l.expiresAt < new Date())
        )
          throw new ApiError(403, "Empresa ou licença indisponível.");
        const platform = await tx.platformAdministrator.findUnique({
            where: { userId: i.creatorId },
          }),
          members = await tx.membership.findMany({
            where: { organizationId: i.organizationId },
          }),
          actor = members.find((x) => x.userId === i.creatorId);
        if (!platform) {
          if (!actor?.active)
            throw new ApiError(403, "O emissor não está mais autorizado.");
          if (i.purpose === "OWNER" || i.role === "OWNER")
            throw new ApiError(403, "Transferência exige a plataforma.");
          validateDelegation(
            actor,
            members,
            i.role,
            i.permissions,
            i.delegable,
          );
          const allowed = (
            await import("@/lib/permissions")
          ).effectivePermissions(actor, members);
          if (
            !allowed.includes(
              i.purpose === "RESET" ? "users.edit" : "users.create",
            )
          )
            throw new ApiError(403, "Permissão do emissor revogada.");
        }
        let user = await tx.user.findUnique({ where: { email: i.email } });
        if (user && i.purpose !== "RESET" && session?.user.id !== user.id)
          throw new ApiError(
            403,
            "Este e-mail já tem conta. Entre com a senha atual e abra o convite novamente.",
          );
        if (i.purpose === "RESET") {
          if (!user || !passwordHash)
            throw new ApiError(
              400,
              "Defina uma senha de pelo menos 12 caracteres.",
            );
          const target = members.find((x) => x.userId === user!.id);
          if (!target) throw new ApiError(403, "Vínculo removido.");
          if (!platform) canManage(actor!, target, members);
          await tx.account.updateMany({
            where: { userId: user.id, providerId: "credential" },
            data: { password: passwordHash },
          });
          await tx.session.deleteMany({ where: { userId: user.id } });
        } else {
          if (!user) {
            if (!passwordHash)
              throw new ApiError(
                400,
                "Defina uma senha de pelo menos 12 caracteres.",
              );
            const id = randomUUID();
            user = await tx.user.create({
              data: {
                id,
                email: i.email,
                name: i.name,
                emailVerified: true,
                accounts: {
                  create: {
                    id: randomUUID(),
                    accountId: id,
                    providerId: "credential",
                    password: passwordHash,
                  },
                },
              },
            });
          }
          // Consume the reservation before creating the membership, in the same transaction.
          await tx.userInvitation.update({
            where: { id: i.id },
            data: { acceptedAt: new Date() },
          });
          if (i.role === "OWNER") {
            if (!platform)
              throw new ApiError(
                403,
                "Somente a plataforma atribui proprietários.",
              );
            const owners = members.filter((x) => x.role === "OWNER");
            for (const owner of owners) {
              await tx.membership.update({
                where: { id: owner.id },
                data: {
                  role: "ADMIN",
                  parentId: null,
                  customPermissions: true,
                  permissions: [],
                  delegable: [],
                },
              });
              await tx.session.deleteMany({ where: { userId: owner.userId } });
            }
            for (const owner of owners)
              await tx.membership.updateMany({
                where: { organizationId: i.organizationId, parentId: owner.id },
                data: { parentId: null },
              });
          }
          const existing = members.find((x) => x.userId === user!.id);
          if (existing && i.role !== "OWNER")
            throw new ApiError(409, "Usuário já vinculado.");
          const values = {
            role: i.role,
            permissions: i.permissions,
            delegable: i.delegable,
            customPermissions: true,
            active: true,
            parentId: platform ? null : actor!.id,
          };
          const saved = existing
            ? await tx.membership.update({
                where: { id: existing.id },
                data: values,
              })
            : await tx.membership.create({
                data: {
                  userId: user.id,
                  organizationId: i.organizationId,
                  ...values,
                },
              });
          if (i.role === "OWNER") {
            // Legacy independent administrators become children of the authorized owner.
            await tx.membership.updateMany({
              where: {
                organizationId: i.organizationId,
                id: { not: saved.id },
                parentId: null,
              },
              data: { parentId: saved.id },
            });
          }
        }
        await tx.userInvitation.updateMany({
          where: {
            organizationId: i.organizationId,
            email: i.email,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        await tx.userInvitation.update({
          where: { id: i.id },
          data: { acceptedAt: new Date() },
        });
        await audit(
          tx,
          user!.id,
          i.organizationId,
          i.purpose === "RESET"
            ? "PASSWORD_RESET_COMPLETED"
            : "INVITATION_ACCEPTED",
          i.id,
          { role: i.role },
        );
      },
      { timeout: 20000 },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
