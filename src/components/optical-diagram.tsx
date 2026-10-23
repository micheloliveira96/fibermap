"use client";
import { useActiveProject, useProjectRequest } from "./project-context";
import { RenameDialog, type RenameTarget } from "./rename-dialog";
import { PortConfigDialog } from "./port-config-dialog";
import { DiagramEquipmentPanel } from "./diagram-equipment-panel";
import { assetPermission } from "@/lib/permissions";
import { useProjectFetch } from "./project-context";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ConnectionMode,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
  type Edge,
  type ReactFlowInstance,
  type Connection,
} from "@xyflow/react";
import {
  X,
  Save,
  Undo2,
  Redo2,
  Maximize2,
  Sun,
  Moon,
  Cable,
  GitFork,
  Focus,
  AlignStartVertical,
} from "lucide-react";
import {
  accessPorts,
  splitterPorts,
  defaultLayout,
  fiberColor,
  statusLabel,
  endpointColor,
  endpointLabel,
  pairError,
  componentAsset,
  portDisplayLabel,
  type DiagramData,
  type DiagramDraft,
  type DiagramAsset,
  type DiagramAccess,
  type DiagramPort,
  type DiagramLink,
  type DiagramNodeLayout,
  type LocalStatus,
} from "@/lib/diagram-types";
import "@xyflow/react/dist/style.css";
import "./optical-diagram.css";
import { OpticalBatch } from "./optical-batch";
import { OpticalEdge } from "./optical-edge";
import { HelpLink } from "./help-link";
type NodeData = {
  asset: DiagramAsset;
  access?: DiagramAccess;
  layout: DiagramNodeLayout;
  used: Set<string>;
  names: boolean;
  editable: boolean;
  picked: string | null;
  onLayout: (id: string, patch: Partial<DiagramNodeLayout>) => void;
  onPort: (id: string) => void;
  onRename: (asset: DiagramAsset) => void;
  dropCodes: string[];
};
type OpticalNode = Node<NodeData, "optical">;
const OpticalComponent = memo(function OpticalComponent({
  id,
  data,
  selected,
}: NodeProps<OpticalNode>) {
  const { asset, access, layout, used } = data,
    update = useUpdateNodeInternals();
  const rawPorts = access ? accessPorts(asset, access) : asset.terminals;
  const adapters = [...(asset.internalLinks ?? [])].sort((a, b) =>
    (asset.terminals.find((p) => p.id === a.aId)?.label ?? "").localeCompare(
      asset.terminals.find((p) => p.id === b.aId)?.label ?? "",
      undefined,
      { numeric: true },
    ),
  );
  const paired = new Set(adapters.flatMap((l) => [l.aId, l.bId]));
  const ports = adapters.length
    ? [
        ...adapters
          .flatMap((l) => [
            rawPorts.find((p) => p.id === l.aId)!,
            rawPorts.find((p) => p.id === l.bId)!,
          ])
          .filter(Boolean),
        ...rawPorts.filter((p) => !paired.has(p.id)),
      ]
    : rawPorts;
  const tubes = [...new Set(asset.fibers.map((f) => f.tube))];
  const tube = tubes.includes(layout.tube) ? layout.tube : (tubes[0] ?? 1);
  const visible = access
    ? ports.filter(
        (p) => asset.fibers.find((f) => f.id === p.fiberId)?.tube === tube,
      )
    : ports;
  const shown = layout.collapsed ? [] : visible;
  const shownIds = new Set(shown.map((p) => p.id));
  useEffect(() => {
    update(id);
  }, [id, update, tube, layout.collapsed, ports.length, used, asset]);
  return (
    <div
      className={`od-node ${selected ? "od-selected" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        data.onRename(asset);
      }}
    >
      <header>
        <span className="od-node-icon">
          {access ? <Cable size={18} /> : <GitFork size={18} />}
        </span>
        <div>
          <strong>{asset.code}</strong>
          {data.names && <small>{asset.name}</small>}
        </div>
        <button
          className="nodrag"
          aria-label={`${layout.collapsed ? "Expandir" : "Recolher"} ${asset.code}`}
          onClick={() => data.onLayout(id, { collapsed: !layout.collapsed })}
        >
          {layout.collapsed ? "+" : "−"}
        </button>
      </header>
      <div className="od-node-summary">
        {access
          ? `${asset.fibers.length} fibras · ${tubes.length} tubos · ${access.end === "MID" ? `Sangria ${Math.round(access.fraction * 100)}%` : "Ponta " + access.end}`
          : `${adapters.length ? `${asset.kind === "CTO" ? "Acopladores" : "Adaptadores"} · ${adapters.length} pares IN/OUT` : ports.filter((p) => p.kind === "SPLITTER_IN").length ? `Splitter · ${ports.length} portas` : asset.kind === "OLT" ? `OLT · ${ports.length} portas PON` : asset.kind === "POP" ? "Infraestrutura interna do POP" : `Terminações · ${ports.length} portas`}`}
      </div>
      {!layout.collapsed && access && (
        <div className="od-tube nodrag">
          <label>
            Tubo{" "}
            <select
              aria-label={`Tubo de ${asset.code}`}
              value={tube}
              onChange={(e) =>
                data.onLayout(id, { tube: Number(e.target.value) })
              }
            >
              {tubes.map((t) => (
                <option key={t} value={t}>
                  {t} · {asset.fibers.find((f) => f.tube === t)?.tubeColor}
                </option>
              ))}
            </select>
          </label>
          <span>{visible.length} faces</span>
        </div>
      )}
      {!layout.collapsed && (
        <div className="od-fiber-list">
          {shown.map((p) => {
            const adapter = adapters.find(
              (l) => l.aId === p.id || l.bId === p.id,
            );
            const fiber = asset.fibers.find((f) => f.id === p.fiberId),
              state = fiber
                ? fiber.status !== "AVAILABLE"
                  ? fiber.status
                  : (access?.fiberStates[fiber.id] ?? "AVAILABLE")
                : (adapter?.status ?? "AVAILABLE");
            const color = endpointColor({ port: p, asset, access });
            return (
              <div
                key={p.id}
                className={`od-port ${data.picked === p.id ? "od-picked" : ""}`}
              >
                {adapter?.aId === p.id && (
                  <div className="od-adapter-heading">
                    <b>{portDisplayLabel(asset, p).split(" · ")[0]}</b>
                    <small>
                      {adapter.status !== "AVAILABLE"
                        ? statusLabel[adapter.status]
                        : [adapter.aId, adapter.bId].filter(
                              (id) =>
                                used.has(id) ||
                                asset.terminals.find((p) => p.id === id)
                                  ?.occupied,
                            ).length === 2
                          ? "Conectado"
                          : [adapter.aId, adapter.bId].some(
                                (id) =>
                                  used.has(id) ||
                                  asset.terminals.find((p) => p.id === id)
                                    ?.occupied,
                              )
                            ? "Parcialmente conectado"
                            : "Disponível"}
                    </small>
                    <span>Continuidade interna IN ↔ OUT</span>
                  </div>
                )}
                <Handle
                  id={p.id}
                  type="source"
                  position={Position.Left}
                  style={{ background: color }}
                  isConnectable={data.editable && !p.occupied}
                />
                <button
                  className="nodrag"
                  onClick={() => data.onPort(p.id)}
                  title={`${portDisplayLabel(asset, p)}${fiber ? ` · ${fiber.color} · ${statusLabel[state]}` : ""}${p.occupied ? " · ocupada em outro local" : ""}`}
                >
                  <i style={{ background: color }} />
                  <b>
                    {fiber
                      ? `${String(fiber.number).padStart(3, "0")}${access?.bothEnds ? `/${p.kind === "FIBER_A" ? "A" : "B"}` : ""}`
                      : adapter
                        ? adapter.aId === p.id
                          ? "IN — Entrada"
                          : "OUT — Saída"
                        : portDisplayLabel(asset, p)}
                  </b>
                  <span>
                    {fiber
                      ? `${fiber.color}${p.localSide ? ` · ${p.localSide === "IN" ? "chegada" : "continuação"}` : ""}`
                      : adapter
                        ? ""
                        : p.kind === "SPLITTER_IN"
                          ? "Entrada"
                          : p.kind === "SPLITTER_OUT"
                            ? "Saída"
                            : p.kind === "PON"
                              ? "PON"
                              : p.kind === "CUSTOMER"
                                ? "Terminação do cliente"
                                : "Porta óptica"}
                  </span>
                  <em>
                    {p.occupied
                      ? "🔒"
                      : state !== "AVAILABLE"
                        ? statusLabel[state]
                        : used.has(p.id)
                          ? "●"
                          : "○"}
                  </em>
                </button>
                <Handle
                  id={`${p.id}:right`}
                  type="source"
                  position={Position.Right}
                  style={{ background: color }}
                  isConnectable={data.editable && !p.occupied}
                />
              </div>
            );
          })}
        </div>
      )}
      {ports
        .filter((p) => !shownIds.has(p.id) && used.has(p.id))
        .map((p) => (
          <span key={p.id}>
            <Handle
              id={p.id}
              type="source"
              position={Position.Left}
              style={{ top: 50, opacity: 0.45 }}
              isConnectable={false}
            />
            <Handle
              id={`${p.id}:right`}
              type="source"
              position={Position.Right}
              style={{ top: 50, opacity: 0.45 }}
              isConnectable={false}
            />
          </span>
        ))}
      {asset.kind === "CUSTOMER" && (
        <footer>
          Drop: {data.dropCodes.join(", ") || "aguardando vínculo"} ·{" "}
          {ports.some((p) => used.has(p.id) || p.occupied)
            ? "Conectado"
            : "Disponível"}
        </footer>
      )}
      {layout.collapsed && (
        <p className="od-collapsed">Grupo recolhido · conexões preservadas</p>
      )}
      {!layout.collapsed && access && tubes.length > 1 && (
        <footer>
          Mostrando tubo {tube} de {tubes.length}. As demais conexões permanecem
          salvas.
        </footer>
      )}
    </div>
  );
});
const nodeTypes = { optical: OpticalComponent };
const edgeTypes = { opticalLink: OpticalEdge };
const layoutFor = (
  draft: DiagramDraft,
  id: string,
  index: number,
): DiagramNodeLayout =>
  draft.layout.nodes[id] ?? {
    x: (index % 3) * 390,
    y: Math.floor(index / 3) * 650,
    tube: 1,
    collapsed: false,
  };
const initialDraft = (data: DiagramData): DiagramDraft => ({
  portColors: {},
  components: data.components ?? [],
  componentCreates: [],
  accesses: data.accesses,
  splitters: [],
  links: data.connections,
  layout: structuredClone(data.layout ?? defaultLayout),
});
const stripHandle = (id: string | null) =>
  id?.endsWith(":right") ? id.slice(0, -6) : id;
export default function OpticalDiagram({
  equipmentId,
  onClose,
  onSaved,
}: {
  equipmentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fetch = useProjectFetch(),
    request = useProjectRequest(),
    activeProject = useActiveProject();
  const [rename, setRename] = useState<RenameTarget | null>(null),
    [portConfig, setPortConfig] = useState<DiagramAsset | null>(null);
  const [recoverable, setRecoverable] = useState<{
    draft: DiagramDraft;
    revision: string;
  } | null>(null);
  const recoveryKey = `fibermap-optical-draft:${activeProject.actorId}:${activeProject.organizationId}:${activeProject.id}:${equipmentId}`;
  const [data, setData] = useState<DiagramData | null>(null),
    [history, setHistory] = useState<{
      past: DiagramDraft[];
      present: DiagramDraft;
      future: DiagramDraft[];
    } | null>(null);
  const [baseline, setBaseline] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [selectedNodes, setSelectedNodes] = useState<string[]>([]),
    [selectedLink, setSelectedLink] = useState<string | null>(null),
    [picked, setPicked] = useState<string | null>(null),
    [startPort, setStartPort] = useState<string | null>(null);
  const [pending, setPending] = useState<DiagramLink[] | null>(null),
    [batch, setBatch] = useState(false);
  const [candidate, setCandidate] = useState(""),
    [end, setEnd] = useState<"A" | "B" | "MID">("A"),
    [fraction, setFraction] = useState(50),
    [search, setSearch] = useState(""),
    [splitCount, setSplitCount] = useState(8),
    [splitName, setSplitName] = useState(""),
    [splitCode, setSplitCode] = useState("");
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [dragPositions, setDragPositions] = useState<
      Record<string, { x: number; y: number }>
    >({}),
    [mobile, setMobile] = useState(false);
  const flow = useRef<ReactFlowInstance<OpticalNode, Edge> | null>(null),
    root = useRef<HTMLDivElement>(null);
  const draft = history?.present,
    dirty = Boolean(draft && JSON.stringify(draft) !== baseline),
    editable = Boolean(data?.editable && !mobile && !saving);
  const commit = useCallback(
    (change: (draft: DiagramDraft) => DiagramDraft) => {
      setHistory((h) =>
        h
          ? {
              past: [...h.past, h.present].slice(-60),
              present: change(structuredClone(h.present)),
              future: [],
            }
          : h,
      );
      setNotice("");
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/diagrams/${equipmentId}`, { signal: controller.signal })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw Error(value.error);
        setData(value);
        try {
          const raw = sessionStorage.getItem(recoveryKey);
          if (raw) setRecoverable(JSON.parse(raw));
        } catch {}
        const d = initialDraft(value);
        setHistory({ past: [], present: d, future: [] });
        setBaseline(JSON.stringify(d));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [equipmentId, fetch, recoveryKey]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!dirty || !draft || !data) return;
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({ draft, revision: data.revision }),
      );
    } catch {
      /* The editor still reports pending state if local storage is unavailable. */
    }
  }, [dirty, draft, data, recoveryKey]);
  const close = () => {
    if (saving) return;
    if (
      !dirty ||
      window.confirm("Descartar as alterações não salvas do diagrama?")
    ) {
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
      onClose();
    }
  };
  const allAssets = useMemo<DiagramAsset[]>(
    () =>
      data && draft
        ? [
            data.equipment,
            ...data.assets,
            ...(draft.componentCreates ?? []).map(componentAsset),
            ...draft.splitters.map((s) => ({
              id: s.id,
              name: s.name,
              code: s.code,
              kind: "SPLITTER",
              status: "INSTALLED",
              fibers: [],
              terminals: splitterPorts(s.id, s.ports),
            })),
          ].map((asset) => ({
            ...asset,
            terminals: asset.terminals.map((port) => ({
              ...port,
              identificationColor: Object.hasOwn(
                draft.portColors ?? {},
                port.id,
              )
                ? draft.portColors![port.id]
                : port.identificationColor,
            })),
          }))
        : [],
    [data, draft],
  );
  const displayed = useMemo(
    () =>
      draft
        ? allAssets.filter(
            (a) =>
              a.id === equipmentId ||
              draft.splitters.some((s) => s.id === a.id) ||
              (draft.components ?? []).includes(a.id) ||
              (draft.componentCreates ?? []).some((c) => c.id === a.id) ||
              draft.accesses.some((s) => s.cableId === a.id),
          )
        : [],
    [allAssets, draft, equipmentId],
  );
  const ports = useMemo(
    () =>
      new Map(
        displayed.flatMap((asset) => {
          const access = draft?.accesses.find((a) => a.cableId === asset.id);
          return (access ? accessPorts(asset, access) : asset.terminals).map(
            (port) => [port.id, { port, asset, access }] as const,
          );
        }),
      ),
    [displayed, draft],
  );
  const portLabel = (id: string) => {
    const endpoint = ports.get(id);
    return endpoint ? endpointLabel(endpoint) : id;
  };
  const used = useMemo(
    () => new Set(draft?.links.flatMap((l) => [l.a, l.b]) ?? []),
    [draft?.links],
  );
  const changeLayout = useCallback(
    (id: string, patch: Partial<DiagramNodeLayout>) => {
      commit((d) => {
        d.layout.nodes[id] = {
          ...layoutFor(
            d,
            id,
            displayed.findIndex((a) => a.id === id),
          ),
          ...patch,
        };
        return d;
      });
    },
    [commit, displayed],
  );
  function preview(
    pairs: { a: string; b: string }[],
    kind: DiagramLink["kind"] = "SPLICE",
  ) {
    setError("");
    const nextUsed = new Set(used);
    try {
      const links = pairs.map((p) => {
        const a = ports.get(p.a),
          b = ports.get(p.b);
        const invalid = pairError(a, b, nextUsed);
        if (invalid) throw Error(invalid);
        if (!a || !b || p.a === p.b)
          throw Error("Selecione duas extremidades válidas.");
        if (
          nextUsed.has(p.a) ||
          nextUsed.has(p.b) ||
          a.port.occupied ||
          b.port.occupied
        )
          throw Error(
            "Há uma fibra ou porta ocupada. Remova a ligação existente explicitamente antes de conectar.",
          );
        const continuous =
          a.access?.end === "MID" &&
          a.access.id === b.access?.id &&
          a.port.fiberId === b.port.fiberId &&
          a.port.localSide !== b.port.localSide;
        if (kind === "PASS_THROUGH" && !continuous)
          throw Error(
            "Passagem direta une chegada e continuação da mesma fibra em uma sangria.",
          );
        for (const p of [a, b]) {
          const f = p.asset.fibers.find((f) => f.id === p.port.fiberId),
            state = f
              ? f.status !== "AVAILABLE"
                ? f.status
                : (p.access?.fiberStates[f.id] ?? "AVAILABLE")
              : "AVAILABLE";
          if (p.asset.status === "DISABLED" || state !== "AVAILABLE")
            throw Error("Fibra indisponível, reservada ou interrompida.");
        }
        if (a.port.fiberId && a.port.fiberId === b.port.fiberId && !continuous)
          throw Error("As pontas da mesma fibra não formam uma fusão válida.");
        if (
          a.port.kind === b.port.kind &&
          ["SPLITTER_IN", "SPLITTER_OUT"].includes(a.port.kind)
        )
          throw Error("Conecte uma saída a uma entrada compatível.");
        nextUsed.add(p.a);
        nextUsed.add(p.b);
        return {
          id: crypto.randomUUID(),
          ...p,
          kind:
            kind === "SPLICE" && (!a.port.fiberId || !b.port.fiberId)
              ? ("PATCH" as const)
              : kind,
          tray: "",
        };
      });
      setPending(links);
      setStartPort(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const openRename = (asset: DiagramAsset) => {
    if (
      !data?.permissions?.includes(assetPermission(asset.kind, "edit")) &&
      !draft?.componentCreates?.some((c) => c.id === asset.id) &&
      !draft?.splitters.some((c) => c.id === asset.id)
    ) {
      setError("Seu perfil não permite renomear este componente.");
      return;
    }
    setRename({ id: asset.id, name: asset.name, version: asset.version ?? 1 });
  };
  const onPort = (id: string) => {
    setPicked(id);
    setSelectedLink(null);
    if (!editable) return;
    if (startPort && startPort !== id) preview([{ a: startPort, b: id }]);
    else setStartPort(id);
  };
  const nodes: OpticalNode[] = displayed.map((asset, index) => ({
    id: asset.id,
    type: "optical",
    measured: measurements[asset.id],
    position:
      dragPositions[asset.id] ??
      (draft ? layoutFor(draft, asset.id, index) : { x: 0, y: 0 }),
    selected: selectedNodes.includes(asset.id),
    data: {
      asset,
      access: draft?.accesses.find((a) => a.cableId === asset.id),
      layout: draft
        ? layoutFor(draft, asset.id, index)
        : { x: 0, y: 0, tube: 1, collapsed: false },
      used,
      names: draft?.layout.names ?? true,
      editable,
      picked,
      onLayout: changeLayout,
      onPort,
      onRename: openRename,
      dropCodes: (draft?.accesses ?? [])
        .filter((a) => a.remoteAssetId === asset.id)
        .map(
          (a) => allAssets.find((x) => x.id === a.cableId)?.code ?? a.cableId,
        ),
    },
  }));
  const edges: Edge[] = (draft?.links ?? []).flatMap((l) => {
    const a = ports.get(l.a),
      b = ports.get(l.b);
    if (!a || !b) return [];
    const source = a.asset.id,
      target = b.asset.id;
    return [
      {
        id: l.id,
        source,
        target,
        sourceHandle: `${l.a}:right`,
        targetHandle: l.b,
        type: "opticalLink",
        selected: selectedLink === l.id,
        data: {
          sourceColor: endpointColor(a),
          targetColor: endpointColor(b),
          sourceLabel: portLabel(l.a),
          targetLabel: portLabel(l.b),
          kind: l.kind,
          title: `${l.kind === "SPLICE" ? "Fusão" : l.kind === "PASS_THROUGH" ? "Passagem direta" : l.kind === "PATCH" ? "Conector" : "Documental"}\nOrigem: ${portLabel(l.a)}\nDestino: ${portLabel(l.b)}`,
          onSelect: () => {
            setSelectedLink(l.id);
            setPicked(null);
            setStartPort(null);
          },
        },
        interactionWidth: 20,
      },
    ];
  });
  const selected = selectedLink
      ? draft?.links.find((l) => l.id === selectedLink)
      : null,
    chosen = picked ? ports.get(picked) : null,
    chosenFiber = chosen?.asset.fibers.find(
      (f) => f.id === chosen.port.fiberId,
    );
  async function save() {
    if (!data || !draft || !editable) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/diagrams/${equipmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          version: data.version,
          revision: data.revision,
        }),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error);
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
      setRecoverable(null);
      setData(value);
      const d = initialDraft(value);
      setHistory({ past: [], present: d, future: [] });
      setBaseline(JSON.stringify(d));
      setNotice("Montagem salva no banco de dados.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function addCable() {
    if (!draft || !candidate || !editable) return;
    const asset = allAssets.find((a) => a.id === candidate);
    if (!asset) return;
    const access: DiagramAccess = {
      id: crypto.randomUUID(),
      cableId: candidate,
      end,
      fraction: end === "A" ? 0 : end === "B" ? 1 : fraction / 100,
      fiberStates: {},
      bothEnds: asset.kind === "PATCHCORD",
    };
    if (
      end === "MID" &&
      (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 100)
    ) {
      setError(
        "Informe a posição da sangria entre 0 e 100%, sem incluir as pontas.",
      );
      return;
    }
    commit((d) => {
      d.accesses.push(access);
      if (end === "MID")
        for (const f of asset.fibers) {
          const ps = accessPorts(asset, access).filter(
            (p) => p.fiberId === f.id,
          );
          if (f.status !== "DAMAGED" && f.status !== "BLOCKED")
            d.links.push({
              id: crypto.randomUUID(),
              a: ps[0].id,
              b: ps[1].id,
              kind: "PASS_THROUGH",
              tray: "",
            });
        }
      return d;
    });
    setCandidate("");
    setNotice(
      end === "MID"
        ? "Sangria adicionada com as fibras contínuas. Selecione uma passagem e use Cortar antes de derivar para um splitter."
        : "Ponta de cabo associada. Salve para confirmar o vínculo físico.",
    );
  }
  function addSplitter() {
    if (!editable || !data?.canCreateSplitter) return;
    if (!splitName.trim() || !splitCode.trim()) {
      setError("Informe o nome e identificador do splitter.");
      return;
    }
    commit((d) => {
      d.splitters.push({
        id: crypto.randomUUID(),
        name: splitName.trim(),
        code: splitCode.trim(),
        ports: splitCount,
      });
      return d;
    });
    setSplitName("");
    setSplitCode("");
  }
  function changeState(state: LocalStatus) {
    if (!chosen?.access || !chosenFiber || !editable) return;
    if (used.has(chosen.port.id) && state !== "AVAILABLE") {
      setError(
        "Remova ou corte a conexão dessa fibra antes de mudar seu estado.",
      );
      return;
    }
    commit((d) => {
      const a = d.accesses.find((a) => a.id === chosen.access!.id)!;
      a.fiberStates[chosenFiber.id] = state;
      return d;
    });
  }
  function removeLink() {
    if (
      selected &&
      editable &&
      window.confirm(
        selected.kind === "PASS_THROUGH"
          ? "Cortar a continuidade física desta fibra neste acesso? As outras caixas serão preservadas."
          : "Remover esta conexão?",
      )
    ) {
      commit((d) => {
        d.links = d.links.filter((l) => l.id !== selected.id);
        return d;
      });
      setSelectedLink(null);
    }
  }
  const connector = (connection: Connection) => {
    const a = stripHandle(connection.sourceHandle),
      b = stripHandle(connection.targetHandle);
    if (a && b) preview([{ a, b }]);
  };
  return (
    <div
      ref={root}
      className={`od-workspace ${draft?.layout.theme ?? "dark"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Diagrama Óptico"
    >
      {recoverable && data && (
        <div className="od-recovery">
          <span>
            Há uma montagem pendente nesta aba.
            {recoverable.revision !== data.revision
              ? " A rede mudou; compare o rascunho antes de reaplicar."
              : ""}
          </span>
          <button
            disabled={recoverable.revision !== data.revision || !editable}
            onClick={() => {
              commit(() => recoverable.draft);
              setRecoverable(null);
            }}
          >
            Recuperar montagem
          </button>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(recoverable, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "fibermap-montagem-pendente.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Baixar rascunho
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem(recoveryKey);
              setRecoverable(null);
            }}
          >
            Descartar
          </button>
        </div>
      )}
      <header className="od-topbar">
        <div className="od-title">
          <span className="od-brand">
            <GitFork size={23} />
          </span>
          <div>
            <small>FIBERMAP / MONTAGEM ÓPTICA</small>
            <h1>
              {data?.equipment.code ?? "Carregando…"}{" "}
              <span>{data?.equipment.name}</span>
            </h1>
          </div>
        </div>
        <span className={`od-save-state ${dirty ? "od-dirty" : ""}`}>
          {saving
            ? "Salvando…"
            : dirty
              ? "Alterações não salvas"
              : data
                ? `Versão ${data.version} · salva`
                : "Conectando"}
        </span>
        <div className="od-top-actions">
          <HelpLink />
          <button
            aria-label="Desfazer"
            disabled={!editable || !history?.past.length}
            onClick={() =>
              setHistory((h) =>
                h && h.past.length
                  ? {
                      past: h.past.slice(0, -1),
                      present: h.past.at(-1)!,
                      future: [h.present, ...h.future],
                    }
                  : h,
              )
            }
          >
            <Undo2 size={18} />
          </button>
          <button
            aria-label="Refazer"
            disabled={!editable || !history?.future.length}
            onClick={() =>
              setHistory((h) =>
                h && h.future.length
                  ? {
                      past: [...h.past, h.present],
                      present: h.future[0],
                      future: h.future.slice(1),
                    }
                  : h,
              )
            }
          >
            <Redo2 size={18} />
          </button>
          <button
            aria-label="Alternar tema do diagrama"
            onClick={() =>
              commit((d) => {
                d.layout.theme = d.layout.theme === "dark" ? "light" : "dark";
                return d;
              })
            }
          >
            {draft?.layout.theme === "dark" ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}
          </button>
          <button
            aria-label="Tela cheia"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void root.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setNotice("O editor já ocupa toda a área disponível."),
                  );
            }}
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="od-primary"
            disabled={!editable || !dirty}
            onClick={() => void save()}
          >
            <Save size={16} /> Salvar
          </button>
          <button aria-label="Fechar diagrama" onClick={close}>
            <X size={20} />
          </button>
        </div>
      </header>
      {(error || notice) && (
        <div
          className={`od-message ${error ? "od-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <button
            aria-label="Fechar mensagem"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="od-body">
        <aside className="od-catalog">
          <h2>Componentes</h2>
          <p>Cabos reais da rede e equipamentos contidos nesta caixa.</p>
          <label>
            Buscar componente
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou identificador"
            />
          </label>
          <div className="od-component-list">
            {displayed
              .filter((a) =>
                `${a.code} ${a.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setSelectedNodes([a.id]);
                    void flow.current?.fitView({
                      nodes: [{ id: a.id }],
                      maxZoom: 1,
                      duration: 350,
                    });
                  }}
                >
                  <span>
                    {a.kind === "SPLITTER" ? (
                      <GitFork size={16} />
                    ) : (
                      <Cable size={16} />
                    )}
                  </span>
                  <div>
                    <b>{a.code}</b>
                    <small>
                      {a.fibers.length ? `${a.fibers.length} fibras` : a.name}
                    </small>
                  </div>
                  {draft?.accesses.find((s) => s.cableId === a.id)
                    ?.proposed && <em>vincular</em>}
                </button>
              ))}
          </div>
          {!draft?.accesses.length && data && (
            <div className="od-empty">
              Nenhum cabo associado. Selecione um cabo existente abaixo ou feche
              o diagrama e cadastre o cabo usando as ferramentas do mapa.
            </div>
          )}
          {editable && draft && data && (
            <DiagramEquipmentPanel
              equipment={data.equipment}
              assets={allAssets.filter((a) => a.id !== equipmentId)}
              draft={draft}
              commit={commit}
              onError={setError}
              canCreate={Boolean(
                data.permissions?.some(
                  (p) => p === "equipment.create" || p === "cable.create",
                ),
              )}
            />
          )}
          {editable && (
            <>
              <h3>Associar cabo existente</h3>
              <label>
                Cabo
                <select
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                >
                  <option value="">Selecionar cabo</option>
                  {allAssets
                    .filter(
                      (a) =>
                        a.fibers.length &&
                        !draft?.accesses.some((s) => s.cableId === a.id),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.fibers.length} fibras
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Acesso físico
                <select
                  value={end}
                  onChange={(e) => setEnd(e.target.value as typeof end)}
                >
                  <option value="A">Ponta A (início da rota)</option>
                  <option value="B">Ponta B (fim da rota)</option>
                  <option value="MID">Sangria / acesso intermediário</option>
                </select>
              </label>
              {end === "MID" && (
                <label>
                  Posição ao longo do cabo (%)
                  <input
                    type="number"
                    min="0.01"
                    max="99.99"
                    step="0.01"
                    value={fraction}
                    onChange={(e) => setFraction(Number(e.target.value))}
                  />
                  <small>
                    Informe a ordem física na rota. A rota geográfica não será
                    alterada.
                  </small>
                </label>
              )}
              <button
                className="od-wide"
                disabled={!candidate}
                onClick={addCable}
              >
                Associar cabo
              </button>
              <h3>Adicionar splitter</h3>
              <label>
                Modelo
                <select
                  value={splitCount}
                  onChange={(e) => setSplitCount(Number(e.target.value))}
                >
                  {[2, 4, 8, 16, 32, 64].map((n) => (
                    <option key={n} value={n}>
                      1:{n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Identificador
                <input
                  maxLength={80}
                  value={splitCode}
                  onChange={(e) => setSplitCode(e.target.value)}
                  placeholder="SPL-001"
                />
              </label>
              <label>
                Nome
                <input
                  maxLength={160}
                  value={splitName}
                  onChange={(e) => setSplitName(e.target.value)}
                  placeholder="Splitter da caixa"
                />
              </label>
              <button
                className="od-wide"
                disabled={!data?.canCreateSplitter}
                onClick={addSplitter}
              >
                Adicionar splitter 1:{splitCount}
              </button>
            </>
          )}
        </aside>
        <main className="od-canvas">
          <div className="od-toolbar">
            <button
              onClick={() =>
                void flow.current?.fitView({ padding: 0.18, duration: 350 })
              }
            >
              <Focus size={16} /> Centralizar
            </button>
            <button disabled={!editable} onClick={() => setBatch(!batch)}>
              Fusão em lote
            </button>
            <button
              disabled={!editable || selectedNodes.length < 2}
              onClick={() =>
                commit((d) => {
                  const x = Math.min(
                    ...nodes
                      .filter((n) => selectedNodes.includes(n.id))
                      .map((n) => n.position.x),
                  );
                  for (const id of selectedNodes) {
                    const index = displayed.findIndex((a) => a.id === id);
                    d.layout.nodes[id] = { ...layoutFor(d, id, index), x };
                  }
                  return d;
                })
              }
            >
              <AlignStartVertical size={16} /> Alinhar
            </button>
            <label>
              <input
                type="checkbox"
                checked={draft?.layout.names ?? true}
                onChange={(e) =>
                  commit((d) => {
                    d.layout.names = e.target.checked;
                    return d;
                  })
                }
              />{" "}
              Nomes
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft?.layout.legend ?? true}
                onChange={(e) =>
                  commit((d) => {
                    d.layout.legend = e.target.checked;
                    return d;
                  })
                }
              />{" "}
              Legenda
            </label>
          </div>
          {batch && editable && (
            <OpticalBatch
              ports={ports}
              used={used}
              onPreview={preview}
              onClose={() => setBatch(false)}
            />
          )}
          {data && draft ? (
            <ReactFlow<OpticalNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              onInit={(instance) => {
                flow.current = instance;
              }}
              defaultViewport={draft.layout.viewport}
              minZoom={0.1}
              maxZoom={3}
              colorMode={draft.layout.theme}
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable
              onConnect={connector}
              deleteKeyCode={null}
              onNodesChange={(changes) => {
                const dimensions = changes.filter(
                  (c) => c.type === "dimensions",
                );
                if (dimensions.length)
                  setMeasurements((prev) => {
                    const next = { ...prev };
                    for (const c of dimensions)
                      if (c.type === "dimensions" && c.dimensions)
                        next[c.id] = c.dimensions;
                    return next;
                  });
                const selections = changes.filter((c) => c.type === "select");
                if (selections.length)
                  setSelectedNodes((prev) => {
                    const next = new Set(prev);
                    for (const c of selections)
                      if (c.type === "select") {
                        if (c.selected) next.add(c.id);
                        else next.delete(c.id);
                      }
                    return [...next];
                  });
                if (changes.some((c) => c.type === "position" && c.position))
                  setDragPositions((prev) => {
                    const next = { ...prev };
                    for (const c of changes)
                      if (c.type === "position" && c.position)
                        next[c.id] = c.position;
                    return next;
                  });
              }}
              onNodeDragStop={(_e, _node, moved) => {
                commit((d) => {
                  for (const n of moved)
                    d.layout.nodes[n.id] = {
                      ...layoutFor(
                        d,
                        n.id,
                        displayed.findIndex((a) => a.id === n.id),
                      ),
                      ...n.position,
                    };
                  return d;
                });
                setDragPositions({});
              }}
              onEdgeClick={(_e, edge) => {
                setSelectedLink(edge.id);
                setPicked(null);
                setStartPort(null);
              }}
              onPaneClick={() => {
                setStartPort(null);
                setPicked(null);
                setSelectedLink(null);
              }}
              onMoveEnd={(_e, viewport) => {
                if (editable)
                  commit((d) => {
                    d.layout.viewport = viewport;
                    return d;
                  });
              }}
              selectionOnDrag
              multiSelectionKeyCode="Shift"
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#238b88" />
            </ReactFlow>
          ) : (
            <div className="od-loading">
              {error
                ? "Não foi possível abrir a montagem."
                : "Carregando cabos, fibras e conexões…"}
            </div>
          )}
          {draft?.layout.legend && (
            <div className="od-legend">
              <b>Fibras</b>
              {Object.entries(fiberColor).map(([name, color]) => (
                <span key={name}>
                  <i style={{ background: color }} />
                  {name}
                </span>
              ))}
              <small>
                ● conectada · ○ livre · linhas: cores das extremidades · porta
                sem cor: neutra
              </small>
            </div>
          )}
        </main>
        <aside className="od-properties">
          <h2>Propriedades</h2>
          {mobile && (
            <div className="od-empty">
              Modo de consulta em telas pequenas. Abra em um computador para
              editar.
            </div>
          )}
          {!data?.editable && data && (
            <div className="od-empty">
              Seu acesso permite consultar este diagrama.
            </div>
          )}
          {startPort && (
            <div className="od-empty">
              Origem: {portLabel(startPort)}. Arraste um ponto até outro ou
              clique na segunda extremidade.
            </div>
          )}
          {selectedNodes.length === 1 &&
            allAssets.find((a) => a.id === selectedNodes[0]) &&
            (() => {
              const asset = allAssets.find((a) => a.id === selectedNodes[0])!;
              return (
                <section className="od-component-properties">
                  <h3>{asset.code}</h3>
                  <p>{asset.name}</p>
                  <button
                    disabled={!editable}
                    onClick={() => openRename(asset)}
                  >
                    Renomear
                  </button>
                  {["OLT", "DIO", "CTO"].includes(asset.kind) &&
                    asset.version && (
                      <button
                        disabled={!editable}
                        onClick={() => setPortConfig(asset)}
                      >
                        Configurar portas
                      </button>
                    )}
                </section>
              );
            })()}
          {selected ? (
            <>
              <h3>
                {selected.kind === "PASS_THROUGH"
                  ? "Passagem direta"
                  : selected.kind === "SPLICE"
                    ? "Fusão"
                    : "Conexão"}
              </h3>
              <p>{portLabel(selected.a)}</p>
              <p>↔ {portLabel(selected.b)}</p>
              <small>ID: {selected.id}</small>
              {selected.createdAt && (
                <small>
                  Criada em{" "}
                  {new Date(selected.createdAt).toLocaleString("pt-BR")}
                </small>
              )}
              {selected.actorId && (
                <small>Responsável: {selected.actorId}</small>
              )}
              <label>
                Bandeja / identificação
                <input
                  disabled={!editable}
                  maxLength={80}
                  value={selected.tray}
                  onChange={(e) =>
                    commit((d) => {
                      d.links.find((l) => l.id === selected.id)!.tray =
                        e.target.value;
                      return d;
                    })
                  }
                />
              </label>
              <button
                className="od-danger"
                disabled={!editable}
                onClick={removeLink}
              >
                {selected.kind === "PASS_THROUGH"
                  ? "Cortar continuidade nesta caixa"
                  : "Remover conexão"}
              </button>
              <p className="od-help">
                A remoção só será aplicada ao salvar. Desfazer restaura a
                ligação.
              </p>
            </>
          ) : chosen && !chosen.port.fiberId ? (
            <>
              <h3>
                {chosen.asset.code} · {chosen.port.label}
              </h3>
              {chosen.asset.internalLinks
                ?.filter(
                  (l) => l.aId === chosen.port.id || l.bId === chosen.port.id,
                )
                .map((adapter) => (
                  <section className="od-adapter-properties" key={adapter.id}>
                    <p>{portDisplayLabel(chosen.asset, chosen.port)}</p>
                    <small>
                      Continuidade interna do acoplador; não é uma fusão.
                    </small>
                    <button
                      disabled={!editable}
                      onClick={() =>
                        setRename({
                          id: adapter.id,
                          name:
                            adapter.name ??
                            portDisplayLabel(chosen.asset, chosen.port).split(
                              " · ",
                            )[0],
                          version: adapter.version ?? 1,
                          adapter: true,
                        })
                      }
                    >
                      Renomear acoplador
                    </button>
                    <label>
                      Estado do acoplador
                      <select
                        disabled={!editable}
                        value={adapter.status}
                        onChange={(e) => {
                          const status = e.target.value;
                          if (
                            status !== "AVAILABLE" &&
                            (used.has(adapter.aId) || used.has(adapter.bId))
                          ) {
                            setError(
                              "Remova as conexões das duas portas antes de reservar.",
                            );
                            return;
                          }
                          void request(
                            `/api/adapters/${adapter.id}`,
                            {
                              status,
                              version: adapter.version,
                              diagramId: equipmentId,
                              revision: data?.revision,
                            },
                            "PATCH",
                          )
                            .then((value) => {
                              setData(value.diagram);
                              onSaved();
                            })
                            .catch((e) => setError(e.message));
                        }}
                      >
                        <option value="AVAILABLE">
                          Disponível para conexão
                        </option>
                        <option value="RESERVED">Reservado</option>
                        <option value="DAMAGED">Interrompido</option>
                        <option value="BLOCKED">Bloqueado</option>
                      </select>
                    </label>
                  </section>
                ))}
              <p>Cor de identificação da porta</p>
              <label>
                Cor
                <input
                  aria-label="Cor da porta"
                  type="color"
                  disabled={!editable}
                  value={endpointColor(chosen)}
                  onInput={(e) => {
                    const color = e.currentTarget.value;
                    commit((d) => {
                      (d.portColors ??= {})[chosen.port.id] = color;
                      return d;
                    });
                  }}
                />
              </label>
              <button
                disabled={!editable}
                onClick={() =>
                  commit((d) => {
                    (d.portColors ??= {})[chosen.port.id] = null;
                    return d;
                  })
                }
              >
                Usar cor neutra
              </button>
              <small>
                A identificação visual não altera o ID técnico nem define uma
                cor física de fibra. Use Salvar montagem para gravar.
              </small>
            </>
          ) : chosen && chosenFiber ? (
            <>
              <h3>
                {chosen.asset.code} · Fibra {chosenFiber.number}
              </h3>
              <p>
                Tubo {chosenFiber.tube} · {chosenFiber.tubeColor}
              </p>
              <p>Cor: {chosenFiber.color}</p>
              <label>
                Estado neste acesso
                <select
                  disabled={!editable || chosenFiber.status !== "AVAILABLE"}
                  value={
                    chosenFiber.status !== "AVAILABLE"
                      ? chosenFiber.status
                      : (chosen.access?.fiberStates[chosenFiber.id] ??
                        "AVAILABLE")
                  }
                  onChange={(e) => changeState(e.target.value as LocalStatus)}
                >
                  {Object.entries(statusLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Estado local da montagem. O bloqueio global do cabo continua
                sendo respeitado.
              </small>
              {chosen.access?.end === "MID" && (
                <button
                  disabled={!editable}
                  onClick={() => {
                    const other = accessPorts(
                      chosen.asset,
                      chosen.access!,
                    ).find(
                      (p) =>
                        p.fiberId === chosenFiber.id && p.id !== chosen.port.id,
                    );
                    if (other)
                      preview(
                        [{ a: chosen.port.id, b: other.id }],
                        "PASS_THROUGH",
                      );
                  }}
                >
                  Restaurar passagem direta
                </button>
              )}
            </>
          ) : (
            <>
              <p>Selecione uma fibra, componente ou ligação.</p>
              <div className="od-help">
                <b>Como montar</b>
                <ol>
                  <li>Associe os cabos reais da caixa.</li>
                  <li>Arraste um ponto de fibra até outra extremidade.</li>
                  <li>Confira a prévia e confirme.</li>
                  <li>Organize os componentes e salve.</li>
                </ol>
                <p>
                  Shift permite selecionar vários componentes. Arraste o fundo
                  para selecionar; use o botão do meio ou direito para mover a
                  tela.
                </p>
                <p>
                  Uma fusão une extremidades. A passagem direta mantém a mesma
                  fibra contínua. A derivação usa um splitter.
                </p>
              </div>
            </>
          )}
          <div className="od-summary">
            <span>{draft?.accesses.length ?? 0} cabos</span>
            <span>
              {draft?.links.filter((l) => l.kind === "SPLICE").length ?? 0}{" "}
              fusões
            </span>
            <span>
              {draft?.links.filter((l) => l.kind === "PASS_THROUGH").length ??
                0}{" "}
              passagens
            </span>
          </div>
          <button className="od-wide" onClick={close}>
            {dirty ? "Cancelar / fechar" : "Voltar ao mapa"}
          </button>
        </aside>
      </div>
      {rename && (
        <RenameDialog
          target={rename}
          diagramId={equipmentId}
          revision={data?.revision}
          onClose={() => setRename(null)}
          onSaved={(value) => {
            if (value.diagram) setData(value.diagram);
            onSaved();
          }}
          onSubmit={
            draft?.componentCreates?.some((c) => c.id === rename.id) ||
            draft?.splitters.some((c) => c.id === rename.id)
              ? async (name) => {
                  commit((d) => {
                    const component =
                      d.componentCreates?.find((c) => c.id === rename.id) ??
                      d.splitters.find((c) => c.id === rename.id);
                    if (component) component.name = name;
                    return d;
                  });
                }
              : undefined
          }
        />
      )}
      {portConfig && data && (
        <PortConfigDialog
          asset={portConfig}
          diagramId={equipmentId}
          revision={data.revision}
          onClose={() => setPortConfig(null)}
          onSaved={(value) => {
            if (value.diagram) setData(value.diagram);
            onSaved();
          }}
        />
      )}
      {pending && (
        <div className="od-confirm-backdrop">
          <section
            className="od-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar conexões"
          >
            <h2>
              Pré-visualização · {pending.length}{" "}
              {pending.length === 1 ? "conexão" : "conexões"}
            </h2>
            <p>
              Confira as extremidades. Cores diferentes podem ser fusionadas.
            </p>
            <div className="od-preview-list">
              {pending.map((l) => (
                <div key={l.id}>
                  <span>{portLabel(l.a)}</span>
                  <b
                    className="od-color-preview"
                    style={{
                      background: `linear-gradient(90deg, ${endpointColor(ports.get(l.a)!)} 50%, ${endpointColor(ports.get(l.b)!)} 50%)`,
                    }}
                    title={l.kind === "SPLICE" ? "Fusão" : "Conector"}
                  >
                    ↔
                  </b>
                  <span>{portLabel(l.b)}</span>
                </div>
              ))}
            </div>
            <p>
              Confirmar adiciona as ligações à montagem. Use Salvar para gravar
              tudo em uma única transação.
            </p>
            <div className="od-confirm-actions">
              <button onClick={() => setPending(null)}>Cancelar</button>
              <button
                className="od-primary"
                onClick={() => {
                  commit((d) => {
                    d.links.push(...pending);
                    return d;
                  });
                  setPending(null);
                  setBatch(false);
                }}
              >
                Confirmar {pending.length}{" "}
                {pending.length === 1 ? "conexão" : "conexões"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
