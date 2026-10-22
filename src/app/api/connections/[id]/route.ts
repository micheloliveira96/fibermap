import { db } from "@/lib/db";
import { access, ApiError, failure, sameOrigin } from "@/lib/access";
export async function DELETE(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params;
    await db.$transaction(
      async (tx) => {
        const connection = await tx.networkConnection.findFirst({
          where: { id, organizationId: m.organizationId },
          include: { terminals: true },
        });
        if (!connection) throw new ApiError(404, "Conexão não encontrada.");
        await tx.connectionTerminal.deleteMany({
          where: { connectionId: id, organizationId: m.organizationId },
        });
        await tx.networkConnection.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            organizationId: m.organizationId,
            actorId: m.actorId,
            action: "DISCONNECT",
            entityId: id,
            detail: connection,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
