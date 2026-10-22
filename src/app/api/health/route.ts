import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await db.user.findFirst({ select: { id: true } });
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
