import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { projectAccess, projectAsset } from "@/lib/project-access";
import { ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { assetPermission } from "@/lib/permissions";
import { readDiagram } from "@/lib/diagram-server";
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    const m = await projectAccess(true),
      { id } = await c.params,
      d = z
        .object({
          ports: z.number().int().min(1).max(2880),
          version: z.number().int().positive(),
          manufacturer: z.string().max(200).optional(),
          model: z.string().max(160).optional(),
          chassis: z.string().max(160).optional(),
          slotCount: z.number().int().min(1).max(128).optional(),
          portsPerSlot: z.number().int().min(1).max(128).optional(),
          diagramId: z.string().optional(),
          revision: z.string().length(64).optional(),
        })
        .parse(await r.json());
    return Response.json(
      await db.$transaction(
        async (tx) => {
          const a = await projectAsset(tx, m, id);
          if (!["OLT", "DIO", "CTO"].includes(a.kind))
            throw new ApiError(400, "Configure portas de uma OLT, DIO ou CTO.");
          requirePermission(m, assetPermission(a.kind, "edit"));
          if (
            d.diagramId &&
            (await readDiagram(tx, m, d.diagramId)).revision !== d.revision
          )
            throw new ApiError(409, "A montagem mudou em outra sessão.");
          const existing = await tx.opticalTerminal.findMany({
              where: { assetId: id },
              orderBy: { label: "asc" },
            }),
            pairs = await tx.internalLink.findMany({ where: { assetId: id } }),
            count = a.kind === "OLT" ? existing.length : pairs.length;
          if (d.ports < count)
            throw new ApiError(
              409,
              "A capacidade não pode ser reduzida removendo portas existentes. Seus IDs e conexões serão preservados.",
            );
          if (
            a.kind === "OLT" &&
            d.slotCount &&
            d.portsPerSlot &&
            d.slotCount * d.portsPerSlot !== d.ports
          )
            throw new ApiError(
              400,
              "A quantidade de portas deve corresponder aos slots e portas por slot.",
            );
          let oltLabels: string[] | undefined;
          if (a.kind === "OLT") {
            const slotted = existing.some((p) =>
              /^Slot \d+ · PON \d+$/.test(p.label),
            );
            if (
              (d.slotCount === undefined) !== (d.portsPerSlot === undefined) ||
              (slotted && !d.portsPerSlot)
            )
              throw new ApiError(
                400,
                "Informe slots e portas por slot para preservar a identificação física.",
              );
            if (d.slotCount && d.portsPerSlot) {
              const target = Array.from(
                { length: d.ports },
                (_, i) =>
                  `Slot ${Math.floor(i / d.portsPerSlot!) + 1} · PON ${(i % d.portsPerSlot!) + 1}`,
              );
              if (slotted) {
                if (existing.some((p) => !target.includes(p.label)))
                  throw new ApiError(
                    409,
                    "A nova configuração deve preservar todos os slots e portas existentes.",
                  );
                oltLabels = target.filter(
                  (label) => !existing.some((p) => p.label === label),
                );
              } else {
                // First explicit chassis configuration of a legacy OLT.
                existing.sort((x, y) =>
                  x.label.localeCompare(y.label, undefined, { numeric: true }),
                );
                for (const p of existing)
                  await tx.opticalTerminal.update({
                    where: { id: p.id },
                    data: { label: `temp:${p.id}` },
                  });
                for (let i = 0; i < existing.length; i++)
                  await tx.opticalTerminal.update({
                    where: { id: existing[i].id },
                    data: { label: target[i] },
                  });
                oltLabels = target.slice(count);
              }
            }
          }
          const metadata = {
            ...(a.metadata as Prisma.InputJsonObject),
            ...(d.model !== undefined ? { model: d.model } : {}),
            ...(d.chassis !== undefined ? { chassis: d.chassis } : {}),
            ...(d.slotCount ? { slotCount: d.slotCount } : {}),
            ...(d.portsPerSlot ? { portsPerSlot: d.portsPerSlot } : {}),
          };
          const changed = await tx.asset.updateMany({
            where: { id, version: d.version },
            data: {
              version: { increment: 1 },
              metadata,
              ...(d.manufacturer !== undefined
                ? { manufacturer: d.manufacturer }
                : {}),
            },
          });
          if (!changed.count)
            throw new ApiError(409, "Equipamento alterado por outra sessão.");
          for (let i = count; i < d.ports; i++) {
            const front = await tx.opticalTerminal.create({
              data: {
                id: randomUUID(),
                organizationId: m.organizationId,
                assetId: id,
                label:
                  a.kind === "OLT"
                    ? (oltLabels?.[i - count] ?? `PON ${i + 1}`)
                    : `Porta ${i + 1}`,
                kind:
                  a.kind === "OLT" ? "PON" : a.kind === "CTO" ? "CTO" : "DIO",
              },
            });
            if (a.kind !== "OLT") {
              const back = await tx.opticalTerminal.create({
                data: {
                  organizationId: m.organizationId,
                  assetId: id,
                  label: `Porta ${i + 1} · traseira`,
                  kind: a.kind === "CTO" ? "CTO" : "DIO",
                },
              });
              await tx.internalLink.create({
                data: {
                  organizationId: m.organizationId,
                  assetId: id,
                  aId: front.id,
                  bId: back.id,
                },
              });
            }
          }
          await tx.auditLog.create({
            data: {
              organizationId: m.organizationId,
              projectId: m.projectId,
              actorId: m.actorId,
              action: "CONFIGURE_PORTS",
              entityId: id,
              detail: {
                before: count,
                after: d.ports,
                preserveExistingPortIds: true,
              },
            },
          });
          return {
            asset: await tx.asset.findUnique({ where: { id } }),
            ...(d.diagramId
              ? { diagram: await readDiagram(tx, m, d.diagramId) }
              : {}),
          };
        },
        { isolationLevel: "Serializable", timeout: 60000 },
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
