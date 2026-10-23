import { projectAccess, projectAsset } from "@/lib/project-access";
import { failure, requirePermission } from "@/lib/access";
import { db } from "@/lib/db";
export async function GET(_r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const m = await projectAccess(),
      { id } = await c.params;
    requirePermission(m, "network.view");
    await projectAsset(db, m, id);
    const [represented, connected] = await Promise.all([
      db.diagramComponent.findMany({
        where: {
          assetId: id,
          organizationId: m.organizationId,
          equipment: { projectId: m.projectId },
        },
        include: {
          equipment: { select: { id: true, code: true, name: true } },
        },
      }),
      db.networkConnection.findMany({
        where: {
          organizationId: m.organizationId,
          projectId: m.projectId,
          terminals: { some: { terminal: { assetId: id } } },
          locationId: { not: null },
        },
        include: { location: { select: { id: true, code: true, name: true } } },
      }),
    ]);
    return Response.json([
      ...new Map(
        [
          ...represented.map((x) => x.equipment),
          ...connected.flatMap((x) => (x.location ? [x.location] : [])),
        ].map((x) => [x.id, x]),
      ).values(),
    ]);
  } catch (e) {
    return failure(e);
  }
}
