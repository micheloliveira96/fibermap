import { projectAccess as access, assetScope, terminalScope } from "@/lib/project-access";
import { assetPermission } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { db } from "@/lib/db";
import { ApiError, failure, sameOrigin, requirePermission } from "@/lib/access";
import { readKml, MAX_FILE } from "@/lib/kml";
import { assetSchema } from "@/lib/asset-input";
import { createAsset } from "@/lib/inventory";
export const maxDuration = 60;
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const m = await access(true); requirePermission(m,"network.import");
    if (Number(r.headers.get("content-length") ?? 0) > 2500000)
      throw new ApiError(413, "Arquivo muito grande.");
    const raw = await r.text();
    if (raw.length > 2500000) throw new ApiError(413, "Arquivo muito grande.");
    const d = z
      .object({
        filename: z.string().max(200),
        source: z.string().max(2000000),
        projectName: z.string().trim().min(1).max(160),
        projectId: z.string().optional(),
        selected: z
          .array(
            z.object({
              id: z.number().int().min(0),
              kind: assetSchema.shape.kind,
              fiberCount: z.number().int().min(1).max(2880).default(12),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(JSON.parse(raw));
    for(const item of d.selected) requirePermission(m,assetPermission(item.kind,"create"));
    if (d.projectId && d.projectId !== m.projectId) throw new ApiError(400,"Importação pertence a outro projeto.");
    d.projectId=m.projectId;
    const bytes = Buffer.from(d.source, "base64");
    if (bytes.length > MAX_FILE) throw new ApiError(413, "Limite de 1,5 MB.");
    if (new Set(d.selected.map((s) => s.id)).size !== d.selected.length)
      throw new ApiError(400, "Seleção duplicada.");
    if (
      d.selected.reduce(
        (sum, s) =>
          sum +
          (["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP"].includes(s.kind)
            ? s.fiberCount
            : 0),
        0,
      ) > 5000
    )
      throw new ApiError(400, "Importe até 5 mil fibras por operação.");
    let features;
    try {
      features = await readKml(bytes, d.filename, (xml) =>
        new DOMParser({
          onError: () => {
            throw new Error("XML inválido.");
          },
        }).parseFromString(xml, "text/xml"),
      );
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "KML inválido.");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (
      await db.importBatch.findUnique({
        where: {
          organizationId_projectId_digest: { organizationId: m.organizationId, projectId: m.projectId, digest },
        },
      })
    )
      throw new ApiError(
        409,
        "Este arquivo já foi importado neste projeto.",
      );
    const out = await db.$transaction(
      async (tx) => {
        const project = d.projectId
          ? await tx.networkProject.findFirst({
              where: { id: d.projectId, organizationId: m.organizationId },
            })
          : await tx.networkProject.create({
              data: { name: d.projectName, organizationId: m.organizationId },
            });
        if (!project) throw new ApiError(404, "Projeto não encontrado.");
        const batch = await tx.importBatch.create({
          data: {
            projectId: project.id,
            organizationId: m.organizationId,
            filename: d.filename,
            digest,
            source: bytes,
          },
        });
        const layers = new Map<string, string>();
        for (const s of d.selected) {
          const f = features[s.id];
          if (!f)
            throw new ApiError(400, "Elemento não encontrado no arquivo.");
          let layerId = layers.get(f.folder);
          if (!layerId) {
            const layer = await tx.mapLayer.create({
              data: {
                name: f.folder,
                color: f.color,
                projectId: project.id,
                organizationId: m.organizationId,
              },
            });
            layerId = layer.id;
            layers.set(f.folder, layerId);
          }
          await createAsset(
            tx,
            m,
            assetSchema.parse({
              code: `IMP-${randomUUID().slice(0, 12)}`,
              name: f.name,
              kind: s.kind,
              status: "PLANNED",
              geometry: f.geometry,
              color: f.color,
              notes: f.description,
              projectId: project.id,
              layerId,
              fiberCount: s.fiberCount,
            }),
            {
              importBatchId: batch.id,
              metadata: {
                sourceProperties: f.sourceProperties as Prisma.InputJsonObject,
                sourceFolder: f.folder,
              },
            },
          );
        }
        return {
          projectId: project.id,
          importId: batch.id,
          count: d.selected.length,
        };
      },
      { timeout: 45000 },
    );
    return Response.json(out, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
