import { redirect } from "next/navigation";
import { access } from "./access";
import { authorizeProject } from "./project-access";
export async function pageProject(params: {
  project?: string;
  company?: string;
}) {
  if (!params.project) redirect("/projetos");
  try {
    const m = await access(false, params.company);
    const p = await authorizeProject(m, params.project);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      version: p.version,
      view: p.view as Record<string, unknown>,
      organizationId: m.organizationId,
      actorId: m.actorId,
    };
  } catch (e) {
    if (e instanceof Error && "digest" in e) throw e;
    redirect("/conta");
  }
}
