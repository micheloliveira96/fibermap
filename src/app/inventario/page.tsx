import Workspace from "@/components/workspace";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await auth.api.getSession({ headers: await headers() })))
    redirect("/login");
  return <Workspace />;
}
