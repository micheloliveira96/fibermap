export type AccessEnd = "A" | "B" | "MID";
export type LocalStatus = "AVAILABLE" | "RESERVED" | "DAMAGED" | "BLOCKED";
export type DiagramAccess = {
  id: string;
  cableId: string;
  end: AccessEnd;
  fraction: number;
  fiberStates: Record<string, LocalStatus>;
  proposed?: boolean;
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
  accesses: DiagramAccess[];
  splitters: { id: string; name: string; code: string; ports: number }[];
  links: DiagramLink[];
  layout: DiagramLayout;
};
export type DiagramData = {
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
      (t) => !t.attachmentId && t.kind === `FIBER_${access.end}`,
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
};
export const statusLabel: Record<LocalStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservada",
  DAMAGED: "Interrompida",
  BLOCKED: "Bloqueada",
};
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
