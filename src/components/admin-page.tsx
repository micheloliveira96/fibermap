import { redirect } from "next/navigation";
import { access, platformAccess, requirePermission } from "@/lib/access";
import Administration from "./administration";
export default async function AdminPage({
  platform = false,
  resource = "dashboard",
}: {
  platform?: boolean;
  resource?: string;
}) {
  try {
    if (platform) await platformAccess();
    else {
      const m = await access();
      if (resource === "users") requirePermission(m, "users.view");
      else if (resource === "audits") requirePermission(m, "audit.view");
      else if (
        !m.permissions.some((p) =>
          ["license.view", "users.view", "company.edit", "audit.view"].includes(
            p,
          ),
        )
      )
        throw Error("Acesso não autorizado.");
    }
  } catch (e) {
    if ((e as { status?: number }).status === 401) redirect("/login");
    redirect("/conta");
  }
  return <Administration platform={platform} resource={resource} />;
}
