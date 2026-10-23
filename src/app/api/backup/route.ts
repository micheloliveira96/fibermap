import { projectAccess as access, assetScope, terminalScope } from "@/lib/project-access";
import { db } from "@/lib/db";
import { failure, requirePermission } from "@/lib/access";
import { inventoryInclude } from "@/lib/inventory";
export async function GET() {
  try {
    const m = await access(); requirePermission(m,"network.export");
    const out = await db.$transaction(
      async (tx) => {
        const where = assetScope(m);
        return {
          format: "FiberMap",
          version: 1,
          exportedAt: new Date().toISOString(),
          organization: await tx.organization.findUnique({
            where: { id: m.organizationId },
            select: { id: true, name: true },
          }),
          projects: await tx.networkProject.findMany({ where: { id: m.projectId, organizationId: m.organizationId } }),
          layers: await tx.mapLayer.findMany({ where }),
          imports: (await tx.importBatch.findMany({ where })).map((i) => ({
            ...i,
            source: Buffer.from(i.source).toString("base64"),
          })),
          assets: await tx.asset.findMany({ where, include: inventoryInclude }),
          internalLinks: await tx.internalLink.findMany({ where: { organizationId: m.organizationId, asset: { projectId: m.projectId } } }),
          opticalDiagrams: await tx.opticalDiagram.findMany({ where: { organizationId: m.organizationId, equipment: { projectId: m.projectId } } }),
          cableAccesses: await tx.cableAccess.findMany({ where: { organizationId: m.organizationId, equipment: { projectId: m.projectId } } }),
          connections: await tx.networkConnection.findMany({
            where,
            include: { terminals: true },
          }),
          audit: m.permissions.includes('audit.view') ? await tx.auditLog.findMany({ where }) : [],
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 20000 },
    );
    return Response.json(out, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="fibermap-backup.json"',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
