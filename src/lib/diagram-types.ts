export type AccessEnd = "A" | "B" | "MID";
export type LocalStatus = "AVAILABLE" | "RESERVED" | "DAMAGED" | "BLOCKED";
export type DiagramAccess = {
  id: string;
  cableId: string;
  end: AccessEnd;
  fraction: number;
  fiberStates: Record<string, LocalStatus>;
  proposed?: boolean;
  bothEnds?: boolean;
  remoteAssetId?: string | null;
};
export type DiagramPort = {
  id: string;
  label: string;
  kind: string;
  fiberId: string | null;
  attachmentId?: string | null;
  localSide?: string | null;
  routePosition?: number | null;
  occupied?: boolean;
  identificationColor?: string | null;
};
export type DiagramFiber = {
  id: string;
  number: number;
  tube: number;
  color: string;
  tubeColor: string;
  status: LocalStatus;
};
export type DiagramAsset = {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  fibers: DiagramFiber[];
  terminals: DiagramPort[];
  version?: number;
  parentId?: string | null;
  metadata?: unknown;
  internalLinks?: {
    id: string;
    aId: string;
    bId: string;
    name?: string | null;
    status: LocalStatus;
    version?: number;
  }[];
};
export type DiagramLink = {
  id: string;
  a: string;
  b: string;
  kind: "SPLICE" | "PASS_THROUGH" | "PATCH" | "DOCUMENTARY";
  tray: string;
  actorId?: string | null;
  createdAt?: string;
};
export type DiagramNodeLayout = {
  x: number;
  y: number;
  tube: number;
  collapsed: boolean;
};
export type DiagramLayout = {
  nodes: Record<string, DiagramNodeLayout>;
  viewport: { x: number; y: number; zoom: number };
  theme: "light" | "dark";
  names: boolean;
  legend: boolean;
};
export type DiagramDraft = {
  components?: string[];
  componentCreates?: ComponentCreate[];
  portColors?: Record<string, string | null>;
  accesses: DiagramAccess[];
  splitters: { id: string; name: string; code: string; ports: number }[];
  links: DiagramLink[];
  layout: DiagramLayout;
};
export type DiagramData = {
  components?: string[];
  permissions?: string[];
  equipment: DiagramAsset;
  assets: DiagramAsset[];
  accesses: DiagramAccess[];
  connections: DiagramLink[];
  version: number;
  revision: string;
  layout: DiagramLayout;
  editable: boolean;
  canCreateSplitter: boolean;
};
export const defaultLayout: DiagramLayout = {
  nodes: {},
  viewport: { x: 40, y: 60, zoom: 0.8 },
  theme: "dark",
  names: true,
  legend: true,
};
export const localPortId = (accessId: string, fiberId: string, side: string) =>
  `${accessId}:${fiberId}:${side}`;
export function accessPorts(
  asset: DiagramAsset,
  access: DiagramAccess,
): DiagramPort[] {
  if (access.end !== "MID")
    return asset.terminals.filter(
      (t) =>
        !t.attachmentId &&
        (t.kind === `FIBER_${access.end}` ||
          Boolean(access.bothEnds && ["FIBER_A", "FIBER_B"].includes(t.kind))),
    );
  return asset.fibers.flatMap((f) =>
    ["IN", "OUT"].map(
      (side) =>
        asset.terminals.find(
          (t) =>
            t.attachmentId === access.id &&
            t.fiberId === f.id &&
            t.localSide === side,
        ) ?? {
          id: localPortId(access.id, f.id, side),
          label: `${f.number}/${side}`,
          kind: side === "IN" ? "FIBER_B" : "FIBER_A",
          fiberId: f.id,
          attachmentId: access.id,
          localSide: side,
          routePosition: access.fraction,
        },
    ),
  );
}
export function splitterPorts(id: string, count: number): DiagramPort[] {
  return [
    { id: `${id}:in`, label: "Entrada 1", kind: "SPLITTER_IN", fiberId: null },
    ...Array.from({ length: count }, (_, i) => ({
      id: `${id}:out:${i + 1}`,
      label: `Saída ${i + 1}`,
      kind: "SPLITTER_OUT",
      fiberId: null,
    })),
  ];
}
export const fiberColor: Record<string, string> = {
  Azul: "#2782ec",
  Laranja: "#ff8c25",
  Verde: "#25b76a",
  Marrom: "#a56b47",
  Cinza: "#9ba4b0",
  Branco: "#f4f6fa",
  Vermelho: "#f04e58",
  Preto: "#1a1e25",
  Amarelo: "#f4d444",
  Violeta: "#a276ed",
  Rosa: "#f48fbc",
  Turquesa: "#29cfce",
  Aqua: "#29cfce",
};
export const statusLabel: Record<LocalStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservada",
  DAMAGED: "Interrompida",
  BLOCKED: "Bloqueada",
};
export type DiagramEndpoint = {
  port: DiagramPort;
  asset: DiagramAsset;
  access?: DiagramAccess;
};
export const neutralPortColor = "#94a3b8";
export function endpointColor(endpoint: DiagramEndpoint) {
  const fiber = endpoint.asset.fibers.find(
    (f) => f.id === endpoint.port.fiberId,
  );
  const color = fiber?.color ?? endpoint.port.identificationColor;
  return color
    ? (fiberColor[color] ??
        (/^#[a-f0-9]{6}$/i.test(color) ? color : neutralPortColor))
    : neutralPortColor;
}
export function endpointLabel(endpoint: DiagramEndpoint) {
  const { asset, port } = endpoint;
  const fiber = asset.fibers.find((f) => f.id === port.fiberId);
  return `${asset.code} · ${fiber ? `T${fiber.tube} F${fiber.number} ${fiber.color}${endpoint.access?.bothEnds ? ` · ${port.kind === "FIBER_A" ? "A" : "B"}` : ""}` : `${portDisplayLabel(asset, port)} · ${port.identificationColor ?? "cor neutra"}`}${port.localSide ? ` · ${port.localSide === "IN" ? "chegada" : "continuação"}` : ""}`;
}
export function pairError(
  a: DiagramEndpoint | undefined,
  b: DiagramEndpoint | undefined,
  used: Set<string>,
) {
  if (!a || !b) return "Selecione duas extremidades.";
  if (a.port.id === b.port.id)
    return "A extremidade não pode se conectar a si mesma.";
  if ([a, b].some((p) => p.port.occupied || used.has(p.port.id)))
    return "Extremidade ocupada.";
  for (const p of [a, b]) {
    const f = p.asset.fibers.find((f) => f.id === p.port.fiberId);
    if (
      p.asset.status === "DISABLED" ||
      (f &&
        (f.status !== "AVAILABLE" ||
          (p.access?.fiberStates[f.id] ?? "AVAILABLE") !== "AVAILABLE"))
    )
      return "Fibra ou componente indisponível.";
    if (
      p.asset.internalLinks?.some(
        (link) =>
          (link.aId === p.port.id || link.bId === p.port.id) &&
          link.status !== "AVAILABLE",
      )
    )
      return "Acoplador reservado ou indisponível.";
  }
  if (!a.port.fiberId && !b.port.fiberId && a.asset.id === b.asset.id)
    return "Portas do mesmo componente são incompatíveis.";
  if (
    a.port.kind === b.port.kind &&
    ["SPLITTER_IN", "SPLITTER_OUT"].includes(a.port.kind)
  )
    return "Conecte uma saída a uma entrada compatível.";
  const continuous =
    a.port.attachmentId &&
    a.port.attachmentId === b.port.attachmentId &&
    a.port.localSide !== b.port.localSide;
  if (a.port.fiberId && a.port.fiberId === b.port.fiberId && !continuous)
    return "As pontas da mesma fibra não formam uma fusão válida.";
  return "";
}
export function portDisplayLabel(asset: DiagramAsset, port: DiagramPort) {
  const adapter = asset.internalLinks?.find(
    (l) => l.aId === port.id || l.bId === port.id,
  );
  if (!adapter) return port.label;
  const index = Number(
    asset.terminals
      .find((p) => p.id === adapter.aId)
      ?.label.match(/\d+/)?.[0] ??
      (asset.internalLinks?.indexOf(adapter) ?? 0) + 1,
  );
  return `${adapter.name ?? `${asset.kind === "CTO" ? "Acoplador" : "Adaptador"} ${index}`} · ${asset.kind === "CTO" ? (adapter.aId === port.id ? "IN — Entrada" : "OUT — Saída") : adapter.aId === port.id ? "Frontal" : "Traseira"}`;
}
export type ComponentCreate = {
  id: string;
  name: string;
  code: string;
  kind: "OLT" | "DIO" | "PATCHCORD";
  ports: number;
  fiberCount: number;
  manufacturer?: string;
  model?: string;
  chassis?: string;
  slotCount?: number;
  portsPerSlot?: number;
  colorPattern?: string[];
};
export function componentAsset(input: ComponentCreate): DiagramAsset {
  const asset: DiagramAsset = {
    ...input,
    status: "INSTALLED",
    fibers: [],
    terminals: [],
    internalLinks: [],
  };
  if (input.kind === "PATCHCORD")
    for (let i = 0; i < input.fiberCount; i++) {
      const pattern = input.colorPattern?.length
        ? input.colorPattern
        : Object.keys(fiberColor).filter((c) => c !== "Aqua");
      const fiber = {
        id: `${input.id}:fiber:${i + 1}`,
        number: i + 1,
        tube: Math.floor(i / pattern.length) + 1,
        color: pattern[i % pattern.length],
        tubeColor: pattern[Math.floor(i / pattern.length) % pattern.length],
        status: "AVAILABLE" as const,
      };
      asset.fibers.push(fiber);
      for (const end of ["A", "B"])
        asset.terminals.push({
          id: `${fiber.id}:${end}`,
          label: `${i + 1}/${end}`,
          kind: `FIBER_${end}`,
          fiberId: fiber.id,
        });
    }
  else
    for (let i = 0; i < input.ports; i++) {
      if (input.kind === "OLT")
        asset.terminals.push({
          id: `${input.id}:pon:${i + 1}`,
          label: input.portsPerSlot
            ? `Slot ${Math.floor(i / input.portsPerSlot) + 1} · PON ${(i % input.portsPerSlot) + 1}`
            : `PON ${i + 1}`,
          kind: "PON",
          fiberId: null,
        });
      else {
        const aId = `${input.id}:front:${i + 1}`,
          bId = `${input.id}:rear:${i + 1}`;
        asset.terminals.push(
          { id: aId, label: `Porta ${i + 1}`, kind: "DIO", fiberId: null },
          {
            id: bId,
            label: `Porta ${i + 1} · traseira`,
            kind: "DIO",
            fiberId: null,
          },
        );
        asset.internalLinks!.push({
          id: `${input.id}:adapter:${i + 1}`,
          aId,
          bId,
          status: "AVAILABLE",
        });
      }
    }
  return asset;
}
export function sequencePairs(a: string[], b: string[], reverse = false) {
  if (!a.length || a.length !== b.length)
    throw new Error("Selecione intervalos com a mesma quantidade de fibras.");
  const target = reverse ? [...b].reverse() : b;
  const used = new Set<string>();
  return a.map((id, i) => {
    if (id === target[i] || used.has(id) || used.has(target[i]))
      throw new Error("Uma extremidade não pode ser usada duas vezes.");
    used.add(id);
    used.add(target[i]);
    return { a: id, b: target[i] };
  });
}
