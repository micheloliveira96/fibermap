import { z } from "zod";
import { db } from "@/lib/db";
import { access, ApiError, failure, sameOrigin } from "@/lib/access";
import {
  coordinateSchema,
  geometrySchema,
  geographicLength,
  splitRoute,
} from "@/lib/geo";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(r);
    const m = await access(true),
      { id } = await c.params,
      d = z
        .object({
          at: coordinateSchema,
          version: z.number().int(),
          confirmConnections: z.boolean().default(false),
        })
        .parse(await r.json());
    const result = await db.$transaction(async (tx) => {
      const a = await tx.asset.findFirst({
        where: { id, organizationId: m.organizationId, version: d.version },
        include: { segments: { orderBy: { position: "asc" } } },
      });
      if (!a) throw new ApiError(409, "Elemento alterado. Recarregue.");
      if (
        !["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP", "DUCT"].includes(
          a.kind,
        )
      )
        throw new ApiError(400, "Selecione um cabo ou duto.");
      if (
        (await tx.connectionTerminal.count({
          where: {
            organizationId: m.organizationId,
            terminal: { assetId: id },
          },
        })) &&
        !d.confirmConnections
      )
        throw new ApiError(
          409,
          "Confirme a divisão documental com conexões existentes. As fibras permanecerão no cabo original.",
        );
      if (a.segments.length)
        throw new ApiError(
          400,
          "Esta rota já está segmentada. Edite a geometria antes de dividir novamente.",
        );
      let parts;
      try {
        parts = splitRoute(geometrySchema.parse(a.geometry), d.at);
      } catch (e) {
        throw new ApiError(
          400,
          e instanceof Error ? e.message : "Ponto de divisão inválido.",
        );
      }
      const locked = await tx.asset.updateMany({
        where: { id, organizationId: m.organizationId, version: d.version },
        data: { version: { increment: 1 } },
      });
      if (!locked.count)
        throw new ApiError(409, "Elemento alterado. Recarregue.");
      for (const [position, g] of parts.entries()) {
        const segment = await tx.cableSegment.create({
          data: {
            assetId: id,
            organizationId: m.organizationId,
            position,
            geometry: g,
            lengthM: geographicLength(g),
          },
        });
        await tx.$executeRaw`UPDATE "CableSegment" SET spatial=ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}),4326) WHERE id=${segment.id}`;
      }
      await tx.auditLog.create({
        data: {
          organizationId: m.organizationId,
          actorId: m.actorId,
          action: "SPLIT_ROUTE",
          entityId: id,
          detail: { at: d.at, preserveOpticalIdentity: true },
        },
      });
      return tx.cableSegment.findMany({
        where: { assetId: id, organizationId: m.organizationId },
        orderBy: { position: "asc" },
      });
    });
    return Response.json(result);
  } catch (e) {
    return failure(e);
  }
}
