import {
  access,
  failure,
  sameOrigin,
  requirePermission,
  ApiError,
} from "@/lib/access";
import { createProject, listProjects, restoreProject } from "@/lib/projects";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const m = await access();
    return Response.json(
      {
        projects: await listProjects(
          m,
          new URL(request.url).searchParams.get("trash") === "1",
        ),
        permissions: m.permissions,
        organizationId: m.organizationId,
        organizationName: m.organization.name,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const m = await access(true);
    if (Number(request.headers.get("content-length") ?? 0) > 20000000)
      throw new ApiError(413, "Arquivo de projeto acima de 20 MB.");
    const text = await request.text();
    if (text.length > 20000000)
      throw new ApiError(413, "Arquivo de projeto acima de 20 MB.");
    const data = JSON.parse(text);
    if (data.action === "import") {
      requirePermission(m, "network.import");
      return Response.json(await restoreProject(m, data.snapshot, data.name), {
        status: 201,
      });
    }
    return Response.json(await createProject(m, data), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
