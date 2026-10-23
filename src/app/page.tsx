import OpticalEditor from "@/components/optical-editor";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageProject } from "@/lib/project-page";
import { ProjectProvider } from "@/components/project-context";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; company?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const project = await pageProject(await searchParams);
  return (
    <ProjectProvider key={project.id} project={project}>
      <OpticalEditor />
    </ProjectProvider>
  );
}
