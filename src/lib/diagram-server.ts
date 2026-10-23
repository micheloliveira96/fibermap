import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, requirePermission } from "./access";
import { db } from "./db";
import { inventoryInclude, createAsset } from "./inventory";
import { assetPermission } from "./permissions";
import { assetSchema } from "./asset-input";
import {
  accessPorts,
  defaultLayout,
  splitterPorts,
  componentAsset,
  type DiagramAsset,
  type DiagramData,
  type DiagramLayout,
} from "./diagram-types";
const id = z.string().min(1).max(300);
const position = z.number().finite().min(-100000).max(100000);
const states = z.record(
  id,
  z.enum(["AVAILABLE", "RESERVED", "DAMAGED", "BLOCKED"]),
);
export const diagramSchema = z.object({
  components: z.array(id).max(500).default([]),
  componentCreates: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(160),
        code: z.string().trim().min(1).max(80),
        kind: z.enum(["OLT", "DIO", "PATCHCORD"]),
        ports: z.number().int().min(1).max(2880),
        fiberCount: z.number().int().min(1).max(2880),
        manufacturer: z.string().max(200).optional(),
        model: z.string().max(160).optional(),
        chassis: z.string().max(160).optional(),
        slotCount: z.number().int().min(1).max(128).optional(),
        portsPerSlot: z.number().int().min(1).max(128).optional(),
        colorPattern: z
          .array(z.string().min(1).max(40))
          .min(1)
          .max(48)
          .optional(),
      }),
    )
    .max(64)
    .default([]),
  portColors: z
    .record(
      id,
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable(),
    )
    .default({}),
  version: z.number().int().min(0),
  revision: z.string().length(64),
  accesses: z
    .array(
      z.object({
        id,
        cableId: id,
        end: z.enum(["A", "B", "MID"]),
        fraction: z.number().min(0).max(1),
        fiberStates: states,
        bothEnds: z.boolean().default(false),
        remoteAssetId: id.nullable().default(null),
      }),
    )
    .max(100),
  splitters: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(160),
        code: z.string().trim().min(1).max(80),
        ports: z.union([
          z.literal(2),
          z.literal(4),
          z.literal(8),
          z.literal(16),
          z.literal(32),
          z.literal(64),
        ]),
      }),
    )
    .max(64),
  links: z
    .array(
      z.object({
        id,
        a: id,
        b: id,
        kind: z.enum(["SPLICE", "PASS_THROUGH", "PATCH", "DOCUMENTARY"]),
        tray: z.string().max(80).default(""),
      }),
    )
    .max(12000),
  layout: z.object({
    nodes: z.record(
      id,
      z.object({
        x: position,
        y: position,
        tube: z.number().int().min(1).max(2880),
        collapsed: z.boolean(),
      }),
    ),
    viewport: z.object({
      x: position,
      y: position,
      zoom: z.number().min(0.1).max(3),
    }),
    theme: z.enum(["light", "dark"]),
    names: z.boolean(),
    legend: z.boolean(),
  }),
});
type Member = {
  projectId: string;
  organizationId: string;
  actorId: string;
  permissions: string[];
  expired?: boolean;
};
const cableKinds = [
  "BACKBONE",
  "DISTRIBUTION",
  "DERIVATION",
  "DROP",
  "PATCHCORD",
];
export async function readDiagram(
  tx: Prisma.TransactionClient,
  member: Member,
  equipmentId: string,
): Promise<DiagramData> {
  const organizationId = member.organizationId;
  const equipment = await tx.asset.findFirst({
    where: {
      id: equipmentId,
      organizationId,
      projectId: member.projectId,
      kind: { in: ["CTO", "CLOSURE", "DIO", "POP"] },
    },
    include: inventoryInclude,
  });
  if (!equipment)
    throw new ApiError(
      404,
      "Equipamento compatível não encontrado nesta empresa.",
    );
  const [all, saved, diagram, connections, associations, represented] =
    await Promise.all([
      tx.asset.findMany({
        where: {
          organizationId,
          projectId: member.projectId,
          kind: {
            in: [
              "BACKBONE",
              "DISTRIBUTION",
              "DERIVATION",
              "DROP",
              "PATCHCORD",
              "SPLITTER",
              "CUSTOMER",
              "OLT",
              "DIO",
            ],
          },
          id: { not: equipmentId },
        },
        include: inventoryInclude,
        orderBy: { code: "asc" },
      }),
      tx.cableAccess.findMany({
        where: { organizationId, equipmentId },
        orderBy: { id: "asc" },
      }),
      tx.opticalDiagram.findUnique({ where: { equipmentId } }),
      tx.networkConnection.findMany({
        where: {
          organizationId,
          projectId: member.projectId,
          locationId: equipmentId,
        },
        include: { terminals: true },
        orderBy: { id: "asc" },
      }),
      tx.cableAccess.findMany({
        where: { organizationId, equipment: { projectId: member.projectId } },
        orderBy: { id: "asc" },
      }),
      tx.diagramComponent.findMany({
        where: { organizationId, equipmentId },
        orderBy: { id: "asc" },
      }),
    ]);
  const components = [
    ...new Set([
      ...represented.map((r) => r.assetId),
      ...all.filter((a) => a.parentId === equipmentId).map((a) => a.id),
    ]),
  ];
  const accesses = saved.map((a) => ({
    ...a,
    end: a.end as "A" | "B" | "MID",
    fiberStates: a.fiberStates as Record<
      string,
      "AVAILABLE" | "RESERVED" | "DAMAGED" | "BLOCKED"
    >,
  }));
  const located = new Set(
    connections.flatMap((c) => c.terminals.map((t) => t.terminalId)),
  );
  const point = equipment.geometry as { type: string; coordinates: number[] };
  for (const cable of all.filter((a) => cableKinds.includes(a.kind))) {
    if (accesses.some((a) => a.cableId === cable.id)) continue;
    const linked = cable.terminals.find(
      (t) => located.has(t.id) && !t.attachmentId,
    );
    const geometry = cable.geometry as {
      type: string;
      coordinates: number[][];
    };
    let end: "A" | "B" | null =
      cable.kind === "PATCHCORD" && cable.parentId === equipmentId
        ? "A"
        : linked?.kind === "FIBER_A"
          ? "A"
          : linked?.kind === "FIBER_B"
            ? "B"
            : null;
    if (!end && geometry.type === "LineString" && point.type === "Point") {
      const distance = (p: number[]) =>
        Math.hypot(
          (p[0] - point.coordinates[0]) *
            Math.cos((point.coordinates[1] * Math.PI) / 180) *
            111320,
          (p[1] - point.coordinates[1]) * 111320,
        );
      const first = distance(geometry.coordinates[0]),
        last = distance(geometry.coordinates.at(-1)!);
      // Only actual endpoints within 5 m are proposed. Never infer a midspan cut from proximity.
      if (Math.min(first, last) <= 5) end = first <= last ? "A" : "B";
    }
    if (
      end &&
      !associations.some(
        (a) => a.cableId === cable.id && (a.end === end || a.bothEnds),
      )
    )
      accesses.push({
        id: `access:${equipmentId}:${cable.id}`,
        organizationId,
        equipmentId,
        cableId: cable.id,
        end,
        fraction: end === "A" ? 0 : 1,
        fiberStates: {},
        bothEnds: cable.kind === "PATCHCORD",
        remoteAssetId: null,
        ...{ proposed: true },
      });
  }
  const links = connections
    .filter((c) => c.terminals.length === 2)
    .map((c) => ({
      id: c.id,
      a: c.terminals[0].terminalId,
      b: c.terminals[1].terminalId,
      kind: c.kind,
      tray: c.tray ?? "",
      actorId: c.actorId,
      createdAt: c.createdAt.toISOString(),
    }));
  // Revision includes external occupancy, fiber status and asset versions: legacy API edits are detected too.
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        equipmentVersion: equipment.version,
        diagram,
        saved,
        connections,
        all: all.map((a) => ({
          id: a.id,
          version: a.version,
          status: a.status,
          fibers: a.fibers.map((f) => ({
            id: f.id,
            status: f.status,
            color: f.color,
          })),
          terminals: a.terminals.map((t) => ({
            id: t.id,
            links: t.links,
            identificationColor: t.identificationColor,
          })),
        })),
        equipmentPorts: equipment.terminals.map((t) => ({
          id: t.id,
          links: t.links,
          identificationColor: t.identificationColor,
        })),
        associations,
        represented,
        adapterData: [equipment, ...all].map((a) => ({
          id: a.id,
          internalLinks: a.internalLinks,
        })),
      }),
    )
    .digest("hex");
  const convert = (a: typeof equipment): DiagramAsset => ({
    ...a,
    terminals: a.terminals.map((t) => ({
      ...t,
      occupied: t.links.some(
        (l) => !connections.some((c) => c.id === l.connectionId),
      ),
    })),
  });
  return {
    components,
    permissions: member.permissions,
    equipment: convert(equipment),
    assets: all.map(convert),
    accesses,
    connections: links,
    version: diagram?.version ?? 0,
    revision,
    layout: diagram
      ? { ...defaultLayout, ...(diagram.layout as Partial<DiagramLayout>) }
      : defaultLayout,
    editable:
      member.permissions.includes("connections.edit") && !member.expired,
    canCreateSplitter: member.permissions.includes("equipment.create"),
  };
}
export async function saveDiagram(
  member: Member,
  equipmentId: string,
  input: z.infer<typeof diagramSchema>,
) {
  requirePermission(member, "connections.edit");
  return db.$transaction(
    async (tx) => {
      // All diagram writers in this company use the same lock order; shared cable endpoints cannot race.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${member.organizationId} FOR UPDATE`;
      const before = await readDiagram(tx, member, equipmentId);
      if (
        before.version !== input.version ||
        before.revision !== input.revision
      )
        throw new ApiError(
          409,
          "A rede foi alterada por outra edição. Feche e reabra o diagrama antes de salvar.",
        );
      if (before.equipment.status === "DISABLED")
        throw new ApiError(409, "Equipamento desativado.");
      const org = member.organizationId,
        assets = new Map(before.assets.map((a) => [a.id, a]));
      for (const c of input.componentCreates) {
        requirePermission(member, assetPermission(c.kind, "create"));
        if (c.kind !== "PATCHCORD" && before.equipment.kind !== "POP")
          throw new ApiError(400, "OLTs e DIOs devem ser instalados no POP.");
        if (
          assets.has(c.id) ||
          (await tx.asset.findUnique({ where: { id: c.id } }))
        )
          throw new ApiError(409, "Identificador de componente já utilizado.");
        if (
          c.kind === "OLT" &&
          c.slotCount &&
          c.portsPerSlot &&
          c.slotCount * c.portsPerSlot !== c.ports
        )
          throw new ApiError(
            400,
            "Quantidade de portas diferente da estrutura de slots.",
          );
        const parent = await tx.asset.findUniqueOrThrow({
          where: { id: equipmentId },
        });
        const created = await createAsset(
          tx,
          member,
          assetSchema.parse({
            ...c,
            status: "INSTALLED",
            projectId: member.projectId,
            parentId: equipmentId,
            geometry: parent.geometry,
            layerId: parent.layerId,
            insertionLossDb: 0,
          }),
          {
            id: c.id,
            skipTerminals: true,
            metadata: {
              model: c.model ?? "",
              chassis: c.chassis ?? "",
              slotCount: c.slotCount ?? 1,
              portsPerSlot: c.portsPerSlot ?? c.ports,
            },
          },
        );
        const diagramAsset = componentAsset(c);
        if (diagramAsset.fibers.length)
          await tx.fiberStrand.createMany({
            data: diagramAsset.fibers.map((f) => ({ ...f, assetId: c.id })),
          });
        if (diagramAsset.terminals.length)
          await tx.opticalTerminal.createMany({
            data: diagramAsset.terminals.map((p) => ({
              ...p,
              kind: p.kind as "PON" | "DIO" | "FIBER_A" | "FIBER_B",
              assetId: c.id,
              organizationId: org,
            })),
          });
        if (diagramAsset.internalLinks?.length)
          await tx.internalLink.createMany({
            data: diagramAsset.internalLinks.map((l) => ({
              ...l,
              assetId: c.id,
              organizationId: org,
            })),
          });
        assets.set(c.id, { ...created, ...diagramAsset });
      }
      const componentIds = new Set([
        ...(before.components ?? []),
        ...input.components,
        ...input.componentCreates.map((c) => c.id),
      ]);
      for (const componentId of componentIds) {
        const component = assets.get(componentId);
        if (
          !component ||
          !["CUSTOMER", "OLT", "DIO", "SPLITTER", "PATCHCORD"].includes(
            component.kind,
          )
        )
          throw new ApiError(400, "Componente não pertence a este projeto.");
        if (
          ["OLT", "DIO", "SPLITTER", "PATCHCORD"].includes(component.kind) &&
          component.parentId &&
          component.parentId !== equipmentId
        )
          throw new ApiError(400, "Componente instalado em outro equipamento.");
        if (component.kind === "CUSTOMER" && before.equipment.kind !== "CTO")
          throw new ApiError(400, "Associe o cliente à CTO de atendimento.");
        await tx.diagramComponent.upsert({
          where: { equipmentId_assetId: { equipmentId, assetId: componentId } },
          create: { organizationId: org, equipmentId, assetId: componentId },
          update: {},
        });
      }
      const previousAccess = await tx.cableAccess.findMany({
        where: { equipmentId, organizationId: org },
      });
      if (
        previousAccess.some((a) => !input.accesses.some((b) => b.id === a.id))
      )
        throw new ApiError(
          400,
          "Um acesso físico salvo não pode ser removido implicitamente.",
        );
      const seenCables = new Set<string>(),
        ports = new Map<
          string,
          {
            port: DiagramAsset["terminals"][number];
            asset: DiagramAsset;
            state: string;
          }
        >();
      for (const a of input.accesses) {
        const cable = assets.get(a.cableId);
        if (
          !cable ||
          !cableKinds.includes(cable.kind) ||
          seenCables.has(a.cableId)
        )
          throw new ApiError(400, "Cabo inválido ou repetido.");
        seenCables.add(a.cableId);
        if (
          a.bothEnds &&
          !(
            cable.kind === "PATCHCORD" ||
            (cable.kind === "DROP" &&
              a.remoteAssetId &&
              componentIds.has(a.remoteAssetId) &&
              assets.get(a.remoteAssetId)?.kind === "CUSTOMER")
          )
        )
          throw new ApiError(
            400,
            "As duas pontas exigem cordão local ou drop vinculado a cliente existente.",
          );
        if (
          a.remoteAssetId &&
          (!a.bothEnds || assets.get(a.remoteAssetId)?.kind !== "CUSTOMER")
        )
          throw new ApiError(400, "Cliente remoto inválido.");
        if (
          (a.end === "A" && a.fraction !== 0) ||
          (a.end === "B" && a.fraction !== 1) ||
          (a.end === "MID" && (a.fraction <= 0 || a.fraction >= 1))
        )
          throw new ApiError(400, "Posição física do acesso inválida.");
        const old = previousAccess.find((p) => p.id === a.id);
        if (
          old &&
          (old.cableId !== a.cableId ||
            old.end !== a.end ||
            old.fraction !== a.fraction)
        )
          throw new ApiError(
            409,
            "O acesso físico já salvo não pode trocar de posição ou cabo.",
          );
        if (
          Object.keys(a.fiberStates).some(
            (f) => !cable.fibers.some((x) => x.id === f),
          )
        )
          throw new ApiError(400, "Estado de fibra não pertence ao cabo.");
        const previousStates = (old?.fiberStates ?? {}) as Record<
          string,
          string
        >;
        const localTerminals = accessPorts(cable, a);
        for (const [fiberId, state] of Object.entries(a.fiberStates)) {
          if (
            state !== "AVAILABLE" &&
            state !== (previousStates[fiberId] ?? "AVAILABLE")
          ) {
            const ends = new Set(
              localTerminals
                .filter((p) => p.fiberId === fiberId)
                .map((p) => p.id),
            );
            if (input.links.some((l) => ends.has(l.a) || ends.has(l.b)))
              throw new ApiError(
                409,
                "Remova as conexões da fibra neste acesso antes de reservar ou interromper.",
              );
          }
        }
        if (!old && (await tx.cableAccess.findUnique({ where: { id: a.id } })))
          throw new ApiError(409, "Identificador de acesso já utilizado.");
        await tx.cableAccess.upsert({
          where: { id: a.id },
          create: { ...a, organizationId: org, equipmentId },
          update: {
            fiberStates: a.fiberStates,
            bothEnds: a.bothEnds,
            remoteAssetId: a.remoteAssetId,
          },
        });
        const local = accessPorts(cable, a);
        if (a.end === "MID")
          await tx.opticalTerminal.createMany({
            data: local.map((t) => ({
              id: t.id,
              organizationId: org,
              assetId: cable.id,
              fiberId: t.fiberId,
              label: `${t.label} · ${a.id}`,
              kind: t.localSide === "IN" ? "FIBER_B" : "FIBER_A",
              attachmentId: a.id,
              routePosition: a.fraction,
              localSide: t.localSide,
            })),
            skipDuplicates: true,
          });
        for (const p of local) {
          const fiber = cable.fibers.find((f) => f.id === p.fiberId)!;
          ports.set(p.id, {
            port: p,
            asset: cable,
            state:
              fiber.status !== "AVAILABLE"
                ? fiber.status
                : (a.fiberStates[fiber.id] ?? "AVAILABLE"),
          });
        }
      }
      for (const a of [
        before.equipment,
        ...[...assets.values()].filter(
          (a) => componentIds.has(a.id) && !cableKinds.includes(a.kind),
        ),
      ])
        for (const p of a.terminals)
          ports.set(p.id, {
            port: p,
            asset: a,
            state:
              a.internalLinks?.find((l) => l.aId === p.id || l.bId === p.id)
                ?.status ?? "AVAILABLE",
          });
      for (const s of input.splitters) {
        requirePermission(member, "equipment.create");
        if (
          assets.has(s.id) ||
          s.id === equipmentId ||
          (await tx.asset.findUnique({ where: { id: s.id } }))
        )
          throw new ApiError(409, "Identificador de splitter já utilizado.");
        const parent = await tx.asset.findUniqueOrThrow({
          where: { id: equipmentId },
        });
        const created = await createAsset(
          tx,
          member,
          assetSchema.parse({
            code: s.code,
            name: s.name,
            kind: "SPLITTER",
            status: "INSTALLED",
            geometry: parent.geometry,
            parentId: equipmentId,
            projectId: parent.projectId,
            layerId: parent.layerId,
            ports: s.ports,
            inputs: 1,
            insertionLossDb: 0,
          }),
          { id: s.id },
        );
        // Use deterministic port IDs for a staged splitter so draft links remain stable across save.
        await tx.opticalTerminal.deleteMany({
          where: { assetId: s.id, organizationId: org },
        });
        const ps = splitterPorts(s.id, s.ports);
        await tx.opticalTerminal.createMany({
          data: ps.map((p) => ({
            ...p,
            kind: p.kind as "SPLITTER_IN" | "SPLITTER_OUT",
            organizationId: org,
            assetId: s.id,
          })),
        });
        const asset: DiagramAsset = { ...created, fibers: [], terminals: ps };
        for (const p of ps)
          ports.set(p.id, { port: p, asset, state: "AVAILABLE" });
      }
      for (const [terminalId, identificationColor] of Object.entries(
        input.portColors,
      )) {
        const endpoint = ports.get(terminalId);
        if (!endpoint || endpoint.port.fiberId)
          throw new ApiError(
            400,
            "A cor de identificação deve pertencer a uma porta de componente desta caixa.",
          );
        await tx.opticalTerminal.updateMany({
          where: {
            id: terminalId,
            organizationId: org,
            assetId: endpoint.asset.id,
          },
          data: { identificationColor },
        });
      }
      const occupied = new Set<string>(),
        ids = new Set<string>();
      for (const link of input.links) {
        const a = ports.get(link.a),
          b = ports.get(link.b),
          existing = before.connections.find((c) => c.id === link.id);
        if (!a || !b || a.port.id === b.port.id || ids.has(link.id))
          throw new ApiError(
            400,
            "Conexão inválida, fora da caixa ou duplicada.",
          );
        ids.add(link.id);
        if (
          occupied.has(link.a) ||
          occupied.has(link.b) ||
          a.port.occupied ||
          b.port.occupied
        )
          throw new ApiError(
            409,
            "Uma das extremidades já está ocupada. Nenhuma ligação foi substituída.",
          );
        occupied.add(link.a);
        occupied.add(link.b);
        const unchanged =
          existing &&
          existing.a === link.a &&
          existing.b === link.b &&
          existing.kind === link.kind;
        const continuous =
          a.port.attachmentId &&
          a.port.attachmentId === b.port.attachmentId &&
          a.port.fiberId === b.port.fiberId &&
          a.port.localSide !== b.port.localSide;
          for (const endpoint of [a, b]) {
            const access = input.accesses.find(
              (x) => x.cableId === endpoint.asset.id,
            );
            if (
              access?.remoteAssetId &&
              endpoint.port.kind === `FIBER_${access.end === "A" ? "B" : "A"}`
            ) {
              const other = endpoint === a ? b : a;
              if (other.asset.id !== access.remoteAssetId)
                throw new ApiError(
                  400,
                  "A ponta remota do drop deve terminar no cliente vinculado.",
                );
            }
          }
        if (!unchanged) {
          if (
            [a, b].some(
              (t) => t.asset.status === "DISABLED" || t.state !== "AVAILABLE",
            ) &&
            !(
              link.kind === "PASS_THROUGH" &&
              continuous &&
              [a, b].every((t) => !["DAMAGED", "BLOCKED"].includes(t.state))
            )
          )
            throw new ApiError(
              409,
              "Fibra reservada, interrompida, bloqueada ou equipamento desativado.",
            );
          if (link.kind === "PASS_THROUGH" && !continuous)
            throw new ApiError(
              400,
              "Passagem direta exige as duas faces da mesma fibra em uma sangria; entre cabos use fusão.",
            );
          if (link.kind === "SPLICE" && (!a.port.fiberId || !b.port.fiberId))
            throw new ApiError(400, "Fusão exige duas extremidades de fibra.");
          if (
            a.port.fiberId &&
            a.port.fiberId === b.port.fiberId &&
            !continuous
          )
            throw new ApiError(400, "Não conecte uma fibra a ela mesma.");
          if (!a.port.fiberId && !b.port.fiberId && a.asset.id === b.asset.id)
            throw new ApiError(
              400,
              "Não ligue portas do mesmo componente entre si.",
            );
          if (a.port.kind === "SPLITTER_IN" && b.port.kind === "SPLITTER_IN")
            throw new ApiError(
              400,
              "Duas entradas de splitter não são compatíveis.",
            );
          if (a.port.kind === "SPLITTER_OUT" && b.port.kind === "SPLITTER_OUT")
            throw new ApiError(
              400,
              "Duas saídas de splitter não são compatíveis.",
            );
        }
      }
      // Replace only this enclosure's links. Preserve IDs/creator/timestamps of unchanged links.
      const deleted = before.connections.filter(
        (c) =>
          !input.links.some(
            (l) =>
              l.id === c.id && l.a === c.a && l.b === c.b && l.kind === c.kind,
          ),
      );
      const deletedIds = deleted.map((c) => c.id);
      await tx.connectionTerminal.deleteMany({
        where: { organizationId: org, connectionId: { in: deletedIds } },
      });
      await tx.networkConnection.deleteMany({
        where: {
          organizationId: org,
          locationId: equipmentId,
          id: { in: deletedIds },
        },
      });
      for (const link of input.links) {
        if (
          before.connections.some((c) => c.id === link.id) &&
          !deletedIds.includes(link.id)
        ) {
          await tx.networkConnection.update({
            where: { id: link.id },
            data: { tray: link.tray },
          });
          continue;
        }
        if (await tx.networkConnection.findUnique({ where: { id: link.id } }))
          throw new ApiError(409, "Identificador de conexão já utilizado.");
        await tx.networkConnection.create({
          data: {
            id: link.id,
            organizationId: org,
            projectId: member.projectId,
            locationId: equipmentId,
            kind: link.kind,
            tray: link.tray,
            actorId: member.actorId,
          },
        });
        await tx.connectionTerminal.createMany({
          data: [link.a, link.b].map((terminalId) => ({
            terminalId,
            organizationId: org,
            connectionId: link.id,
          })),
        });
      }
      const diagram = await tx.opticalDiagram.upsert({
        where: { equipmentId },
        create: {
          equipmentId,
          organizationId: org,
          version: 1,
          layout: input.layout,
        },
        update: { version: { increment: 1 }, layout: input.layout },
      });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: org,
          actorId: member.actorId,
          projectId: member.projectId,
          action: "SAVE_OPTICAL_DIAGRAM",
          entityId: equipmentId,
          detail: {
            version: diagram.version,
            accesses: input.accesses,
            connections: input.links,
            addedSplitters: input.splitters,
            portColors: input.portColors,
            components: input.components,
            componentCreates: input.componentCreates,
          },
        },
      });
      await tx.networkProject.updateMany({
        where: { id: member.projectId, organizationId: org },
        data: { updatedAt: new Date() },
      });
      return readDiagram(tx, member, equipmentId);
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );
}
