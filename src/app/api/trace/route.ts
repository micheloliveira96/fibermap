import { db } from '@/lib/db';
import { access, failure, ApiError, requirePermission } from '@/lib/access';
import { graph, trace } from '@/lib/network';
export async function GET(request: Request) {
  try {
    const m = await access(); requirePermission(m,"network.view"); const { organizationId } = m;
    const start = new URL(request.url).searchParams.get('terminal') ?? '';
    const [assets, nodes, connections, internal] = await Promise.all([db.asset.findMany({ where: { organizationId } }), db.opticalTerminal.findMany({ where: { organizationId } }), db.networkConnection.findMany({ where: { organizationId }, include: { terminals: true } }), db.internalLink.findMany({ where: { organizationId } })]);
    if (!nodes.some(n => n.id === start)) throw new ApiError(404, 'Terminal não encontrado.');
    return Response.json(trace(start, nodes, graph(assets, nodes, connections, internal)));
  } catch (e) { return failure(e); }
}
