import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { access, failure } from "@/lib/access";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s)
      return Response.json({ error: "Entre para continuar." }, { status: 401 });
    if (
      await db.platformAdministrator.findUnique({
        where: { userId: s.user.id },
      })
    )
      return Response.json(
        { name: s.user.name, platform: true, destination: "/admin/plataforma" },
        { headers: { "Cache-Control": "no-store" } },
      );
    try {
      const m = await access();
      return Response.json(
        {
          name: s.user.name,
          platform: false,
          role: m.role,
          permissions: m.permissions,
          destination: m.role === "OWNER" ? "/empresa/administracao" : "/",
          organization: m.organization.name,
          expired: m.expired,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      return Response.json({
        name: s.user.name,
        blocked: true,
        error: e instanceof Error ? e.message : "Acesso indisponível.",
      });
    }
  } catch (e) {
    return failure(e);
  }
}
