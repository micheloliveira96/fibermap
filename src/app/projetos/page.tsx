import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Projects from "@/components/projects";
export const metadata = { title: "Meus Projetos | FiberMap" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  if (!(await auth.api.getSession({ headers: await headers() })))
    redirect("/login");
  return <Projects companyId={(await searchParams).company} />;
}
