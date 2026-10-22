import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
export async function administrativeDenial(error: unknown) {
  if ((error as { status?: number })?.status !== 403) return;
  try {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) return;
    const member = await db.membership.findFirst({
      where: { userId: s.user.id },
      select: { organizationId: true },
    });
    await db.administrativeAudit.create({
      data: {
        actorId: s.user.id,
        organizationId: member?.organizationId,
        action: "ADMINISTRATION_DENIED",
        entityId: s.user.id,
        detail: { reason: (error as Error).message },
        result: "DENIED",
      },
    });
  } catch {
    console.error("Falha ao registrar negativa administrativa.");
  }
}
