import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, failure, sameOrigin } from '@/lib/access';
const schema = z.object({ name: z.string().trim().min(2).max(100), organization: z.string().trim().min(2).max(140), email: z.email().max(254), password: z.string().min(12).max(128) });
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const expected = process.env.FIBERMAP_SETUP_TOKEN_HASH;
    const expires = Number(process.env.FIBERMAP_SETUP_EXPIRES_AT ?? 0);
    const provided = request.headers.get('x-setup-token') ?? '';
    const actual = createHash('sha256').update(provided).digest();
    if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !Number.isFinite(expires) || expires <= Date.now() || !provided || provided.length > 256 || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new ApiError(403, 'Link de configuração inválido ou expirado.');
    const data = schema.parse(await request.json());
    const password = await hashPassword(data.password);
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1879048190)`;
      if (await tx.user.count() > 0) throw new ApiError(409, 'A configuração inicial já foi concluída.');
      const userId = randomUUID();
      await tx.user.create({ data: { id: userId, name: data.name, email: data.email } });
      await tx.account.create({ data: { id: randomUUID(), userId, accountId: userId, providerId: 'credential', password } });
      const organization = await tx.organization.create({ data: { name: data.organization } });
      await tx.membership.create({ data: { userId, organizationId: organization.id, role: 'ADMIN' } });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorId: userId, action: 'INITIAL_SETUP', entityId: organization.id, detail: { method: 'single-use-setup' } } });
    }, { isolationLevel: 'Serializable', timeout: 10000 });
    return Response.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
