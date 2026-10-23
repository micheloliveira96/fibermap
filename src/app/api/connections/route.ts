import { db } from "@/lib/db";
import { access, ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { z } from "zod";
const schema = z.object({
  a: z.string(),
  b: z.string(),
  locationId: z.string().nullable().optional(),
  kind: z.enum(["SPLICE", "PASS_THROUGH", "PATCH", "DOCUMENTARY"]),
  tray: z.string().max(80).optional(),
  lossDb: z.number().min(0).max(40).default(0),
});
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await access(true),
      data = schema.parse(await request.json());
    requirePermission(member,"connections.edit");
    if (data.a === data.b)
      throw new ApiError(400, "Selecione dois terminais diferentes.");
    const result = await db.$transaction(
      async (tx) => {
        const terminals = await tx.opticalTerminal.findMany({
          where: {
            id: { in: [data.a, data.b] },
            organizationId: member.organizationId,
          },
          include: { fiber: true, asset: true },
        });
        if (terminals.length !== 2)
          throw new ApiError(404, "Terminal não encontrado.");
        if (
          terminals.some(
            (t) =>
              (t.fiber && t.fiber.status !== "AVAILABLE") ||
              t.asset.status === "DISABLED",
          )
        )
          throw new ApiError(
            409,
            "Terminal bloqueado, reservado, danificado ou desativado.",
          );
        if (
          terminals[0].fiberId &&
          terminals[0].fiberId === terminals[1].fiberId
        )
          throw new ApiError(400, "Não conecte a fibra a ela mesma.");
        if (
          ["SPLICE", "PASS_THROUGH"].includes(data.kind) &&
          terminals.some((t) => !t.fiberId)
        )
          throw new ApiError(
            400,
            "Fusão/passagem exige duas extremidades de fibras.",
          );
        if (
          data.locationId &&
          !(await tx.asset.findFirst({
            where: {
              id: data.locationId,
              organizationId: member.organizationId,
              kind: { in: ["CLOSURE", "CTO", "POP", "DIO"] },
            },
          }))
        )
          throw new ApiError(400, "Local da conexão inválido.");
        for (const terminal of terminals) {
          const attachment = terminal.attachmentId
            ? await tx.cableAccess.findUnique({where:{id:terminal.attachmentId}})
            : terminal.fiberId ? await tx.cableAccess.findFirst({where:{cableId:terminal.assetId,end:terminal.kind==="FIBER_A"?"A":"B",organizationId:member.organizationId}}) : null;
          if (attachment && attachment.equipmentId !== data.locationId)
            throw new ApiError(409,"A extremidade pertence a outra caixa. Abra seu Diagrama Óptico.");
          const localStates=attachment?.fiberStates as Record<string,string>|undefined;
          if(terminal.fiberId && localStates?.[terminal.fiberId] && localStates[terminal.fiberId]!=="AVAILABLE")
            throw new ApiError(409,"Fibra indisponível neste acesso físico.");
        }
        const connection = await tx.networkConnection.create({
          data: {
            organizationId: member.organizationId,
            kind: data.kind,
            locationId: data.locationId,
            tray: data.tray,
            lossDb: data.lossDb,
            actorId: member.actorId,
          },
        });
        await tx.connectionTerminal.createMany({
          data: [data.a, data.b].map((terminalId) => ({
            terminalId,
            organizationId: member.organizationId,
            connectionId: connection.id,
          })),
        });
        await tx.auditLog.create({
          data: {
            organizationId: member.organizationId,
            actorId: member.actorId,
            action: "CONNECT",
            entityId: connection.id,
            detail: data,
          },
        });
        return connection;
      },
      { isolationLevel: "Serializable" },
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
