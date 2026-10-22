import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) apenas nesta sessão.');
const hashed = await hashPassword(password);
await db.$transaction(async tx => {
  if (await tx.user.findUnique({ where: { email } })) throw new Error('Usuário já existe; nenhuma alteração realizada.');
  const userId = randomUUID();
  await tx.user.create({ data: { id: userId, email, name: 'Administrador', accounts: { create: { id: randomUUID(), providerId: 'credential', accountId: userId, password: hashed } } } });
  await tx.organization.create({ data: { name: process.env.ORGANIZATION_NAME || 'Minha organização', memberships: { create: { userId, role: 'ADMIN' } } } });
});
console.log('Organização e administrador criados. Nenhuma infraestrutura de exemplo foi inserida.');
await db.$disconnect();
