import { access, failure, requirePermission } from "@/lib/access";
import { authorizeProject } from "@/lib/project-access";
import { db } from "@/lib/db";
import { levels } from "@/lib/permissions";
export async function GET(_r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const m = await access(),
      { id } = await c.params;
    requirePermission(m, "projects.access");
    const project = await authorizeProject(m, id, false, "projects.access");
    const [members, grants] = await Promise.all([
      db.membership.findMany({
        where: { organizationId: m.organizationId, active: true },
        include: { user: { select: { name: true } } },
      }),
      db.projectGrant.findMany({
        where: { projectId: id, organizationId: m.organizationId },
      }),
    ]);
    return Response.json({
      project,
      members: members
        .filter((x) => levels[x.role] >= levels[m.role])
        .map((x) => ({
          id: x.id,
          name: x.user.name,
          role: x.role,
        })),
      grants: grants.filter((g) =>
        members.some(
          (x) => x.id === g.membershipId && levels[x.role] >= levels[m.role],
        ),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
