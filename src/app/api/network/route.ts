import { db } from '@/lib/db';
import { access, failure, sameOrigin } from '@/lib/access';
import { strands } from '@/lib/network';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const schema = z.object({ code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160), kind: z.enum(['POP','OLT','DIO','BACKBONE','DISTRIBUTION','DERIVATION','DROP','CLOSURE','CTO','SPLITTER','CUSTOMER','POLE','DUCT','RESERVE']), status: z.enum(['PLANNED','INSTALLED','MAINTENANCE','DISABLED']), geometry: z.discriminatedUnion('type', [z.object({ type: z.literal('Point'), coordinates: point }), z.object({ type: z.literal('LineString'), coordinates: z.array(point).min(2).max(10000) })]), fiberCount: z.number().int().min(1).max(2880).default(12), ports: z.number().int().min(1).max(128).default(8), inputs: z.number().int().min(1).max(2).default(1), insertionLossDb: z.number().min(0).max(40).default(10.5) });
export async function GET() {
  try {
    const { organizationId } = await access();
    return Response.json(await db.asset.findMany({ where: { organizationId }, include: { fibers: { include: { terminals: { include: { links: true } } } }, terminals: { include: { links: true } } }, orderBy: { createdAt: 'desc' } }));
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const member = await access(true); const data = schema.parse(await request.json());
    const cable = ['BACKBONE','DISTRIBUTION','DERIVATION','DROP'].includes(data.kind);
    if ((cable || data.kind === 'DUCT') !== (data.geometry.type === 'LineString')) return Response.json({ error: 'Use uma linha para cabos/dutos e um ponto para equipamentos.' }, { status: 400 });
    const asset = await db.$transaction(async tx => {
      const asset = await tx.asset.create({ data: { organizationId: member.organizationId, code: data.code, name: data.name, kind: data.kind, status: data.status, geometry: data.geometry, metadata: { insertionLossDb: data.insertionLossDb } } });
      await tx.$executeRaw`UPDATE "Asset" SET spatial = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(data.geometry)}),4326) WHERE id = ${asset.id}`;
      if (cable) {
        const fibers = strands(data.fiberCount).map(strand => ({ id: randomUUID(), assetId: asset.id, ...strand }));
        await tx.fiberStrand.createMany({ data: fibers });
        await tx.opticalTerminal.createMany({ data: fibers.flatMap(fiber => ['A','B'].map(end => ({ organizationId: member.organizationId, assetId: asset.id, fiberId: fiber.id, label: `${fiber.number}/${end}`, kind: end === 'A' ? 'FIBER_A' as const : 'FIBER_B' as const }))) });
      }
      const portKind = { OLT: 'PON', DIO: 'DIO', CTO: 'CTO', CUSTOMER: 'CUSTOMER' } as const;
      if (data.kind in portKind) await tx.opticalTerminal.createMany({ data: Array.from({ length: data.kind === 'CUSTOMER' ? 1 : data.ports }, (_, i) => ({ organizationId: member.organizationId, assetId: asset.id, label: `Porta ${i+1}`, kind: portKind[data.kind as keyof typeof portKind] })) });
      if (data.kind === 'DIO' || data.kind === 'CTO') {
        const fronts = await tx.opticalTerminal.findMany({ where: { assetId: asset.id } });
        for (const front of fronts) {
          const back = await tx.opticalTerminal.create({ data: { organizationId: member.organizationId, assetId: asset.id, label: `${front.label} · traseira`, kind: front.kind } });
          await tx.internalLink.create({ data: { organizationId: member.organizationId, assetId: asset.id, aId: front.id, bId: back.id } });
        }
      }
      if (data.kind === 'SPLITTER') await tx.opticalTerminal.createMany({ data: [...Array.from({ length: data.inputs }, (_, i) => ({ label: `Entrada ${i+1}`, kind: 'SPLITTER_IN' as const })), ...Array.from({ length: data.ports }, (_, i) => ({ label: `Saída ${i+1}`, kind: 'SPLITTER_OUT' as const }))].map(p => ({ ...p, organizationId: member.organizationId, assetId: asset.id })) });
      await tx.auditLog.create({ data: { organizationId: member.organizationId, actorId: member.actorId, action: 'CREATE_ASSET', entityId: asset.id, detail: data } });
      return asset;
    });
    return Response.json(asset, { status: 201 });
  } catch (e) { return failure(e); }
}
