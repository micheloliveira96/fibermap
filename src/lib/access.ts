import { headers } from 'next/headers';
import { auth } from './auth';
import { db } from './db';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function access(write = false) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiError(401, 'Entre para acessar a rede.');
  const organizationId = (await headers()).get('x-organization-id');
  const membership = await db.membership.findFirst({ where: { userId: session.user.id, ...(organizationId ? { organizationId } : {}) } });
  if (!membership) throw new ApiError(403, 'Sem acesso a uma organização.');
  if (write && !['ADMIN', 'ENGINEER'].includes(membership.role)) throw new ApiError(403, 'Seu perfil não permite alterar a infraestrutura.');
  return { ...membership, actorId: session.user.id };
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') return Response.json({ error: 'Dados inválidos. Verifique os campos e a geometria.' }, { status: 400 });
  if (error && typeof error === 'object' && 'code' in error && ['P2002', 'P2003', 'P2034'].includes(String(error.code))) return Response.json({ error: 'Conflito de integridade ou edição simultânea.' }, { status: 409 });
  console.error(error);
  return Response.json({ error: 'Operação indisponível. Verifique o banco de dados.' }, { status: 503 });
}
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'Origem não autorizada.');
}
