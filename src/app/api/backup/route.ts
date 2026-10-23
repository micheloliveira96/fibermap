import { db } from "@/lib/db";
import { access, failure, requirePermission } from "@/lib/access";
import { inventoryInclude } from "@/lib/inventory";
export async function GET() {
  try {
    const m = await access(); requirePermission(m,"network.export");
    const out = await db.$transaction(
      async (tx) => {
        const where = { organizationId: m.organizationId };
        return {
          format: "FiberMap",
          version: 1,
          exportedAt: new Date().toISOString(),
          organization: await tx.organization.findUnique({
            where: { id: m.organizationId },
            select: { id: true, name: true },
          }),
          projects: await tx.networkProject.findMany({ where }),
          layers: await tx.mapLayer.findMany({ where }),
          imports: (await tx.importBatch.findMany({ where })).map((i) => ({
            ...i,
            source: Buffer.from(i.source).toString("base64"),
          })),
          assets: await tx.asset.findMany({ where, include: inventoryInclude }),
          internalLinks: await tx.internalLink.findMany({ where }),
          opticalDiagrams: await tx.opticalDiagram.findMany({ where }),
          cableAccesses: await tx.cableAccess.findMany({ where }),
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
