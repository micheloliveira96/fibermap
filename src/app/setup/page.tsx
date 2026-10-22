import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import SetupForm from "@/components/setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  // The one-time provisioning screen is never the entry point for an existing account.
  if (await db.user.findFirst({ select: { id: true } })) redirect("/login");
  return <SetupForm />;
}
