import "dotenv/config";
import { db } from "../src/lib/db";
import { randomUUID, randomBytes } from "node:crypto";
const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
if (!email)
  throw Error(
    "Defina PLATFORM_ADMIN_EMAIL com o e-mail de uma conta já existente. A senha atual será preservada.",
  );
let firstAccess = "";
await db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(473829102)`;
  if (await tx.platformAdministrator.count())
    throw Error("Bootstrap já executado. Nenhum administrador foi alterado.");
  let user = await tx.user.findUnique({ where: { email } });
  if (!user) {
    user = await tx.user.create({
      data: {
        id: randomUUID(),
        email,
        name: process.env.PLATFORM_ADMIN_NAME || "Administrador da plataforma",
      },
    });
    const token = randomBytes(32).toString("base64url");
    await tx.verification.create({
      data: {
        id: randomUUID(),
        identifier: "reset-password:" + token,
        value: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    firstAccess =
      (process.env.BETTER_AUTH_URL || "http://localhost:3190") +
      "/recuperar?token=" +
      token;
  }
  await tx.platformAdministrator.create({ data: { userId: user.id } });
  await tx.administrativeAudit.create({
    data: {
      actorId: user.id,
      action: "PLATFORM_BOOTSTRAP",
      entityId: user.id,
      detail: { method: "server-command-existing-account" },
    },
  });
});
console.log(
  "Superadministrador inicial criado. Acesse /login e /admin/plataforma.",
);
if (firstAccess)
  console.log("Primeiro acesso privado (1 hora, uso único): " + firstAccess);
await db.$disconnect();
