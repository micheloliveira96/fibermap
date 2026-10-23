import { projectAccess as access, assetScope, terminalScope } from "@/lib/project-access";
import { db } from '@/lib/db';
import { failure, ApiError, requirePermission } from '@/lib/access';
import { graph, trace } from '@/lib/network';
export async function GET(request: Request) {
  try {
    const m = await access(); requirePermission(m,"network.view"); const { organizationId } = m;
    const start = new URL(request.url).searchParams.get('terminal') ?? '';
    const [assets, nodes, connections, internal] = await Promise.all([db.asset.findMany({ where: assetScope(m) }), db.opticalTerminal.findMany({ where: terminalScope(m) }), db.networkConnection.findMany({ where: assetScope(m), include: { terminals: true } }), db.internalLink.findMany({ where: { organizationId, asset: { projectId: m.projectId } } })]);
    if (!nodes.some(n => n.id === start)) throw new ApiError(404, 'Terminal não encontrado.');
    return Response.json(trace(start, nodes, graph(assets, nodes, connections, internal)));
  } catch (e) { return failure(e); }
}
