"use client";
import { useRouter } from "next/navigation";
import { useActiveProject, useProjectRequest } from "./project-context";
import { RenameDialog, type RenameTarget } from "./rename-dialog";
import { assetPermission } from "@/lib/permissions";
import { HelpLink } from "./help-link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  Network,
  MousePointer2,
  Cable,
  MapPin,
  Pentagon,
  Ruler,
  Undo2,
  Redo2,
  Save,
  X,
  Layers,
  Upload,
  Download,
  Search,
  Moon,
  Sun,
  Scissors,
  Copy,
  Trash2,
  Pencil,
  Plus,
  Minus,
  Menu,
  PanelRightClose,
  Check,
  Activity,
} from "lucide-react";
import type { EditorAsset, MapData, Layer } from "@/lib/editor-types";
import {
  type Coordinate,
  type MapGeometry,
  compatible,
  geographicArea,
  geographicLength,
} from "@/lib/geo";
import { type ImportFeature, readKml, writeKml } from "@/lib/kml";
import { vertices, insertVertex, moveVertex } from "@/lib/vertices";
import { kinds, statuses } from "@/lib/types";
import "./optical-editor.css";
const Map = dynamic(() => import("./editor-map"), {
  ssr: false,
  loading: () => <div className="editor-loading">Carregando cartografia…</div>,
});
const OpticalDiagram = dynamic(() => import("./optical-diagram"), {
  ssr: false,
});
const initial: MapData = {
  role: "VIEWER",
  projects: [],
  layers: [],
  connections: [],
  imports: [],
  audits: [],
};
const cables = ["BACKBONE", "DISTRIBUTION", "DERIVATION", "DROP", "DUCT"];
type Form = {
  code: string;
  name: string;
  kind: EditorAsset["kind"];
  status: EditorAsset["status"];
  fiberCount: number;
  ports: number;
  inputs: number;
  insertionLossDb: number;
  color: string;
  parentId: string;
  projectId: string;
  layerId: string;
  manufacturer: string;
  originLabel: string;
  destinationLabel: string;
  physicalLengthM: string;
  reserveM: number;
  notes: string;
  installedAt: string;
  colorPattern: string;
};
const defaultForm = (): Form => ({
  code: "",
  name: "",
  kind: "BACKBONE",
  status: "PLANNED",
  fiberCount: 24,
  ports: 8,
  inputs: 1,
  insertionLossDb: 10.5,
  color: "#18a99b",
  parentId: "",
  projectId: "",
  layerId: "",
  manufacturer: "",
  originLabel: "",
  destinationLabel: "",
  physicalLengthM: "",
  reserveM: 0,
  notes: "",
  installedAt: "",
  colorPattern:
    "Azul,Laranja,Verde,Marrom,Cinza,Branco,Vermelho,Preto,Amarelo,Violeta,Rosa,Aqua",
});
function download(
  data: Blob | BlobPart,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    data instanceof Blob ? data : new Blob([data], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function OpticalEditor() {
  const router = useRouter();
  const activeProject = useActiveProject(),
    request = useProjectRequest();
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null),
    [contextMenu, setContextMenu] = useState<{
      asset: EditorAsset;
      x: number;
      y: number;
    } | null>(null);
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [assetSaveBlocked, setAssetSaveBlocked] = useState(false);
  const [assets, setAssets] = useState<EditorAsset[]>([]),
    [meta, setMeta] = useState(initial),
    [project] = useState(activeProject.id),
    [mode, setMode] = useState("select"),
    [selected, setSelected] = useState<EditorAsset | null>(null),
    [draft, setDraft] = useState<MapGeometry | null>(null),
    [drawing, setDrawing] = useState<Coordinate[]>([]),
    [form, setForm] = useState(defaultForm),
    [formDirty, setFormDirty] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [dark, setDark] = useState(Boolean(activeProject.view.dark)),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(false),
    [query, setQuery] = useState(""),
    [addresses, setAddresses] = useState<
      { label: string; coordinates: Coordinate }[]
    >([]),
    [focus, setFocus] = useState<MapGeometry | null>(null),
    [coordinate, setCoordinate] = useState<Coordinate>([0, 0]),
    [vertex, setVertex] = useState<number[] | null>(null),
    [tab, setTab] = useState("properties"),
    [style, setStyle] = useState(
      (
        {
          light: "https://tiles.openfreemap.org/styles/positron",
          dark: "https://tiles.openfreemap.org/styles/dark",
          streets:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
            "https://tiles.openfreemap.org/styles/liberty",
          satellite:
            process.env.NEXT_PUBLIC_SATELLITE_STYLE_URL ||
            "/maps/satellite.json",
        } as Record<string, string>
      )[String(activeProject.view.cartography)] ||
        process.env.NEXT_PUBLIC_SATELLITE_STYLE_URL ||
        process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
        "https://tiles.openfreemap.org/styles/liberty",
    ),
    [hiddenKinds, setHiddenKinds] = useState<string[]>([]),
    [history, setHistory] = useState<{
      past: MapGeometry[];
      future: MapGeometry[];
    }>({ past: [], future: [] }),
    [drawRedo, setDrawRedo] = useState<Coordinate[]>([]),
    [preview, setPreview] = useState<ImportFeature[]>([]),
    [chosen, setChosen] = useState<
      Record<number, { kind: EditorAsset["kind"]; fiberCount: number }>
    >({}),
    [upload, setUpload] = useState<{ file: File; bytes: Uint8Array } | null>(
      null,
    ),
    [importOpen, setImportOpen] = useState(false),
    [importName, setImportName] = useState(""),
    [trace, setTrace] = useState<
      {
        nodes: { id: string; label: string; assetId: string; kind: string }[];
        outcome: string;
        lossDb: number;
      }[]
    >([]);
  const fileInput = useRef<HTMLInputElement>(null),
    initializedFocus = useRef(false),
    abort = useRef(false),
    lastCoordinate = useRef(0);
  const writable =
    ready &&
    Boolean(
      meta.permissions?.some(
        (p) => p.endsWith(".create") || p.endsWith(".edit"),
      ),
    );
  const load = useCallback(async () => {
    const [data, map] = await Promise.all([
      request("/api/network"),
      request("/api/map"),
    ]);
    setAssets(data);
    setMeta(map);
    setReady(true);
    if (
      !initializedFocus.current &&
      !activeProject.view.camera &&
      data.length
    ) {
      initializedFocus.current = true;
      if (
        (data as EditorAsset[]).some((a) =>
          vertices(a.geometry).some(
            (v) => Math.abs(v.coordinate[1]) > 85.05112878,
          ),
        )
      )
        setNotice(
          "Há coordenadas próximas aos polos, fora da área desta cartografia. Confira latitude e longitude em Propriedades ou pesquise sua cidade.",
        );
      setFocus({
        type: "MultiPoint",
        coordinates: (data as EditorAsset[]).flatMap((a) =>
          vertices(a.geometry).map((v) => v.coordinate),
        ),
      });
    }
    return data as EditorAsset[];
  }, [request, activeProject.view.camera]);
  useEffect(() => {
    abort.current = false;
    void load().catch((e) => {
      if (!abort.current) setNotice(e.message);
    });
    return () => {
      abort.current = true;
    };
  }, [load]);
  const visible = useMemo(
    () =>
      assets.filter(
        (a) =>
          (!project || a.projectId === project) &&
          !hiddenKinds.includes(a.kind) &&
          (!a.layerId ||
            meta.layers.find((l) => l.id === a.layerId)?.visible !== false),
      ),
    [assets, project, hiddenKinds, meta.layers],
  );
  const visiblePreview = useMemo(
    () => preview.filter((f) => chosen[f.id]),
    [preview, chosen],
  );
  const matches = query.trim()
    ? assets
        .filter((a) =>
          `${a.code} ${a.name} ${a.id}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
        .slice(0, 12)
    : [];
  const highlighted = useMemo(
    () => [...new Set(trace.flatMap((p) => p.nodes.map((n) => n.assetId)))],
    [trace],
  );
  const changed = !!draft || drawing.length > 0 || formDirty;
  const [projectSaving, setProjectSaving] = useState(false),
    [projectNotice, setProjectNotice] = useState("Todas as alterações salvas"),
    [viewDirty, setViewDirty] = useState(false),
    [online, setOnline] = useState(true),
    [viewConflict, setViewConflict] = useState(false),
    [camera, setCamera] = useState(
      activeProject.view.camera as
        { lng: number; lat: number; zoom: number } | undefined,
    ),
    [recovery, setRecovery] = useState<{
      selectedId: string | null;
      version?: number;
      form: Form;
      draft: MapGeometry | null;
      drawing: Coordinate[];
      mode: string;
    } | null>(null);
  const projectVersion = useRef(activeProject.version),
    editEpoch = useRef(0),
    viewEpoch = useRef(0),
    recoveryRead = useRef(false);
  const recoveryKey = `fibermap-draft:${activeProject.actorId}:${activeProject.organizationId}:${project}`;
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    if (!ready || recoveryRead.current) return;
    recoveryRead.current = true;
    let active = true;
    void Promise.resolve()
      .then(() => sessionStorage.getItem(recoveryKey))
      .then((saved) => {
        if (saved && active) setRecovery(JSON.parse(saved));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready, recoveryKey]);
  useEffect(() => {
    if (!ready || !changed) return;
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({
          selectedId: selected?.id ?? null,
          version: selected?.version,
          form,
          draft,
          drawing,
          mode,
        }),
      );
    } catch {
      queueMicrotask(() =>
        setProjectNotice(
          "Rascunho pendente; armazenamento local indisponível.",
        ),
      );
    }
  }, [ready, changed, selected, form, draft, drawing, mode, recoveryKey]);
  useEffect(() => {
    if (!changed) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [changed]);
  async function persistProjectView() {
    if (!online) {
      setProjectNotice(
        "Sem conexão. Alterações pendentes serão mantidas nesta aba.",
      );
      return false;
    }
    setProjectSaving(true);
    const epoch = viewEpoch.current;
    try {
      const value = await request(
        `/api/projects/${project}`,
        {
          action: "save",
          version: projectVersion.current,
          view: {
            ...(camera ? { camera } : {}),
            dark,
            cartography:
              style === "https://tiles.openfreemap.org/styles/positron"
                ? "light"
                : style === "https://tiles.openfreemap.org/styles/dark"
                  ? "dark"
                  : style ===
                      (process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
                        "https://tiles.openfreemap.org/styles/liberty")
                    ? "streets"
                    : "satellite",
          },
        },
        "PATCH",
      );
      projectVersion.current = value.version;
      if (epoch === viewEpoch.current) setViewDirty(false);
      setProjectNotice("Todas as alterações salvas");
      return true;
    } catch (e) {
      setViewConflict(true);
      setProjectNotice(`Erro ao salvar: ${(e as Error).message}`);
      return false;
    } finally {
      setProjectSaving(false);
    }
  }
  const autoView = useEffectEvent(() => {
    void persistProjectView();
  });
  useEffect(() => {
    if (
      !viewDirty ||
      projectSaving ||
      busy ||
      !ready ||
      !writable ||
      !online ||
      viewConflict
    )
      return;
    const timer = window.setTimeout(() => autoView(), 1200);
    return () => window.clearTimeout(timer);
  }, [
    viewDirty,
    projectSaving,
    busy,
    ready,
    writable,
    online,
    viewConflict,
    camera,
    dark,
  ]);
  async function switchProject() {
    if (!ensureDiscard()) return;
    if (viewDirty && writable && !(await persistProjectView())) return;
    router.push(`/projetos?company=${activeProject.organizationId}`);
  }
  async function saveProject() {
    if (drawing.length) {
      setProjectNotice(
        "Conclua o desenho e confira seus dados antes de salvar.",
      );
      return;
    }
    if (changed && !(await save())) return;
    await persistProjectView();
  }

  function ensureDiscard() {
    return (
      !changed || window.confirm("Descartar as alterações ainda não salvas?")
    );
  }
  function clear() {
    setAssetSaveBlocked(false);
    try {
      sessionStorage.removeItem(recoveryKey);
    } catch {}
    setRecovery(null);
    setFormDirty(false);
    setDraft(null);
    setDrawing([]);
    setDrawRedo([]);
    setHistory({ past: [], future: [] });
    setVertex(null);
    setMode("select");
  }
  function select(a: EditorAsset, force = false) {
    if (!force && !ensureDiscard()) return;
    clear();
    setSelected(a);
    setRight(true);
    setTab("properties");
    setForm({
      ...defaultForm(),
      ...a,
      parentId: a.parentId ?? "",
      projectId: a.projectId ?? "",
      layerId: a.layerId ?? "",
      fiberCount: a.fibers.length || 24,
      ports:
        a.kind === "SPLITTER"
          ? a.terminals.filter((t) => t.kind === "SPLITTER_OUT").length
          : a.kind === "CTO" || a.kind === "DIO"
            ? a.terminals.length / 2
            : a.terminals.length || 8,
      inputs: a.terminals.filter((t) => t.kind === "SPLITTER_IN").length || 1,
      manufacturer: a.manufacturer ?? "",
      originLabel: a.originLabel ?? "",
      destinationLabel: a.destinationLabel ?? "",
      physicalLengthM:
        a.physicalLengthM === null ? "" : String(a.physicalLengthM),
      notes: a.notes ?? "",
      installedAt: a.installedAt?.slice(0, 10) ?? "",
      insertionLossDb: a.metadata?.insertionLossDb ?? 10.5,
      colorPattern:
        a.metadata?.colorPattern?.join(",") ?? defaultForm().colorPattern,
    });
  }
  function begin(next: string) {
    if (!ensureDiscard()) return;
    clear();
    setSelected(null);
    setRight(false);
    setTrace([]);
    setMode(next);
    setForm((f) => ({
      ...defaultForm(),
      kind:
        next === "polygon"
          ? "COVERAGE"
          : next === "point"
            ? "CTO"
            : cables.includes(f.kind)
              ? f.kind
              : "BACKBONE",
      fiberCount: f.fiberCount,
      projectId: project,
      colorPattern:
        meta.projects.find((p) => p.id === project)?.colorPattern?.join(",") ??
        defaultForm().colorPattern,
    }));
  }
  function geometry(g: MapGeometry) {
    editEpoch.current++;
    const previous = draft ?? selected?.geometry;
    if (previous && JSON.stringify(g) !== JSON.stringify(previous))
      setHistory((h) => ({
        past: [...h.past.slice(-49), previous],
        future: [],
      }));
    setDraft(g);
  }
  function finish() {
    if (mode === "measure") {
      setNotice(
        `Distância medida: ${drawing.length > 1 ? geographicLength({ type: "LineString", coordinates: drawing }).toFixed(2) : 0} m. Use Cancelar para encerrar.`,
      );
      return;
    }
    const minimum = mode === "polygon" ? 3 : 2;
    if (drawing.length < minimum) {
      setNotice(`Marque pelo menos ${minimum} vértices.`);
      return;
    }
    const g: MapGeometry =
      mode === "polygon"
        ? { type: "Polygon", coordinates: [[...drawing, drawing[0]]] }
        : { type: "LineString", coordinates: drawing };
    setDraft(g);
    setDrawing([]);
    setMode("edit");
    setRight(true);
    setForm((f) => ({
      ...f,
      code: `${f.kind}-${crypto.randomUUID().slice(0, 8)}`,
      name: kinds[f.kind],
    }));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setProjectNotice("Erro ao salvar. Alterações não confirmadas.");
      setNotice(e instanceof Error ? e.message : "Operação indisponível.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function undo() {
    if (draft) {
      const past = [...history.past],
        g = past.pop();
      if (g) {
        setHistory({ past, future: [draft, ...history.future] });
        setDraft(g);
      }
    } else
      setDrawing((p) => {
        if (p.length) setDrawRedo((r) => [p[p.length - 1], ...r]);
        return p.slice(0, -1);
      });
  }
  function redo() {
    if (draft) {
      const [next, ...future] = history.future;
      if (next) {
        setHistory({ past: [...history.past, draft], future });
        setDraft(next);
      }
    } else {
      const [next, ...rest] = drawRedo;
      if (next) {
        setDrawing((p) => [...p, next]);
        setDrawRedo(rest);
      }
    }
  }
  async function save(override?: MapGeometry) {
    const g = override ?? draft ?? selected?.geometry;
    if (!g) return false;
    const epoch = editEpoch.current;
    const saved = await run(async () => {
      const body = {
        ...form,
        geometry: g,
        parentId: form.parentId || null,
        projectId: form.projectId || null,
        layerId: form.layerId || null,
        physicalLengthM:
          form.physicalLengthM === "" ? null : Number(form.physicalLengthM),
        installedAt: form.installedAt
          ? new Date(form.installedAt + "T12:00:00Z").toISOString()
          : null,
        colorPattern: form.colorPattern
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        version: selected?.version,
      };
      const result = await request(
        selected ? `/api/assets/${selected.id}` : "/api/network",
        body,
        selected ? "PATCH" : "POST",
      );
      const latest = await load();
      if (epoch !== editEpoch.current) {
        const fresh = latest.find((a) => a.id === result.id);
        if (fresh) setSelected(fresh);
        return;
      }
      clear();
      setSelected(null);
      const a = latest.find((a) => a.id === result.id);
      if (a) select(a, true);
      setNotice("Elemento salvo e auditado.");
    });
    setAssetSaveBlocked(!saved);
    return saved;
  }
  const autoSave = useEffectEvent(() => {
    void save();
  });
  useEffect(() => {
    if (
      !ready ||
      !online ||
      busy ||
      !writable ||
      !selected ||
      assetSaveBlocked ||
      (!formDirty && !draft) ||
      !form.name.trim() ||
      !form.code.trim() ||
      !compatible(form.kind, draft ?? selected.geometry)
    )
      return;
    const timer = window.setTimeout(() => autoSave(), 1800);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    online,
    busy,
    writable,
    selected,
    formDirty,
    form,
    draft,
    assetSaveBlocked,
  ]);
  async function updateLayer(l: Layer, patch: Partial<Layer>) {
    await run(async () => {
      await request("/api/map", { type: "layer", ...l, ...patch });
      await load();
    });
  }
  async function readFile(file: File) {
    if (!ensureDiscard()) return;
    clear();
    setSelected(null);
    setRight(false);
    await run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const data = await readKml(bytes, file.name, (xml) =>
        new DOMParser().parseFromString(xml, "text/xml"),
      );
      setPreview(data);
      setUpload({ file, bytes });
      setImportName(file.name.replace(/\.(kml|kmz)$/i, ""));
      setChosen(
        Object.fromEntries(
          data
            .slice(0, 100)
            .map((f) => [f.id, { kind: "IMPORTED", fiberCount: 24 }]),
        ),
      );
      setImportOpen(true);
      setFocus({
        type: "MultiPoint",
        coordinates: data.flatMap((f) =>
          vertices(f.geometry).map((v) => v.coordinate),
        ),
      });
      setNotice(
        "Prévia temporária. Escolha os elementos e confirme para gravar.",
      );
    });
  }
  async function importFile() {
    if (!upload) return;
    await run(async () => {
      let binary = "";
      upload.bytes.forEach((b) => (binary += String.fromCharCode(b)));
      const result = await request("/api/imports", {
        filename: upload.file.name,
        source: btoa(binary),
        projectName: importName,
        projectId: project || undefined,
        selected: Object.entries(chosen).map(([id, v]) => ({
          id: Number(id),
          ...v,
        })),
      });
      setPreview([]);
      setUpload(null);
      setImportOpen(false);
      if (result.projectId !== project)
        router.push(
          `/?project=${result.projectId}&company=${activeProject.organizationId}`,
        );
      await load();
      setNotice(
        `${result.count} elementos importados. O arquivo original foi preservado no backup.`,
      );
    });
  }
  async function searchAddress() {
    const coords = query
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
    if (coords) {
      const lat = Number(coords[1]),
        lng = Number(coords[2]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        setNotice("Coordenadas inválidas. Use latitude, longitude.");
        return;
      }
      setFocus({ type: "Point", coordinates: [lng, lat] });
      setAddresses([]);
      setQuery("");
      return;
    }
    await run(async () => {
      const results = await request(
        "/api/geocode?q=" + encodeURIComponent(query),
      );
      setAddresses(results);
      if (!results.length)
        setNotice("Endereço não encontrado. Tente cidade, rua e número.");
    });
  }
  async function exportData(type: string) {
    await run(async () => {
      if (!meta.permissions?.includes("network.export"))
        throw new Error("Seu perfil não permite exportar informações.");
      if (type === "backup") {
        download(
          JSON.stringify(await request("/api/backup"), null, 2),
          "fibermap-backup.json",
        );
        return;
      }
      if (type === "geojson") {
        download(
          JSON.stringify(
            {
              type: "FeatureCollection",
              features: visible.map(({ geometry, ...a }) => ({
                type: "Feature",
                geometry,
                properties: a,
              })),
            },
            null,
            2,
          ),
          "fibermap-rede.geojson",
          "application/geo+json",
        );
        return;
      }
      const kml = writeKml(visible, meta.layers);
      if (type === "kml")
        download(
          kml,
          "fibermap-rede.kml",
          "application/vnd.google-earth.kml+xml",
        );
      else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        zip.file("doc.kml", kml);
        download(
          await zip.generateAsync({ type: "blob" }),
          "fibermap-rede.kmz",
        );
      }
    });
  }
  async function traceTerminal(id: string) {
    await run(async () => {
      const data = await request(
        "/api/trace?terminal=" + encodeURIComponent(id),
      );
      setTrace(data);
      const ids = new Set<string>(
        data.flatMap((p: { nodes: { assetId: string }[] }) =>
          p.nodes.map((n) => n.assetId),
        ),
      );
      const coordinates = assets
        .filter((a) => ids.has(a.id))
        .flatMap((a) => vertices(a.geometry).map((v) => v.coordinate));
      if (coordinates.length) setFocus({ type: "MultiPoint", coordinates });
      setNotice(
        "Rastreio documental: caminhos e perdas calculados a partir das conexões salvas.",
      );
    });
  }
  function field<K extends keyof Form>(key: K, value: Form[K]) {
    editEpoch.current++;
    if (key === "color") setTrace([]);
    setFormDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  }
  const current = draft ?? selected?.geometry,
    editing = !!draft,
    measured =
      drawing.length > 1
        ? geographicLength({ type: "LineString", coordinates: drawing })
        : current
          ? geographicLength(current)
          : 0;
  const tools = [
    ["select", "Selecionar", MousePointer2],
    ["line", "Desenhar cabo", Cable],
    ["point", "Inserir equipamento", MapPin],
    ["polygon", "Área de cobertura", Pentagon],
    ["measure", "Medir distância", Ruler],
  ] as const;
  return (
    <main
      className={`optical-editor ${dark ? "editor-dark" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (writable && e.dataTransfer.files[0])
          void readFile(e.dataTransfer.files[0]);
      }}
    >
      <header className="editor-header">
        <button
          className="editor-icon"
          title="Ferramentas e camadas"
          aria-label="Ferramentas e camadas"
          onClick={() => setLeft(!left)}
        >
          <Menu size={20} />
        </button>
        <a className="editor-brand" href="/">
          <span>
            <Network size={20} />
          </span>
          FiberMap<small>MAPA</small>
        </a>
        <div className="editor-search">
          <Search size={17} />
          <input
            aria-label="Pesquisar nome, código, ID, endereço ou latitude, longitude"
            placeholder="Nome, código, endereço ou latitude, longitude"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAddresses([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void searchAddress();
            }}
          />
          <button
            disabled={busy || query.trim().length < 3}
            onClick={() => void searchAddress()}
          >
            Localizar
          </button>
          {query && (matches.length > 0 || addresses.length > 0) && (
            <div className="editor-search-results">
              {matches.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    select(a);

                    setFocus(structuredClone(a.geometry));
                    setQuery("");
                  }}
                >
                  <strong>{a.code}</strong>
                  <span>{a.name}</span>
                </button>
              ))}
              {addresses.map((a, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setFocus({ type: "Point", coordinates: a.coordinates });
                    setQuery("");
                    setAddresses([]);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="editor-active-project" title={activeProject.name}>
          Projeto ativo: <strong>{activeProject.name}</strong>
        </span>
        <button
          className="editor-action"
          onClick={() => {
            void switchProject();
          }}
        >
          Trocar Projeto
        </button>
        <button
          className="editor-action"
          disabled={!writable || busy}
          onClick={() => void saveProject()}
        >
          <Save size={15} />
          <span>Salvar Projeto</span>
        </button>
        <span className="editor-project-state" role="status">
          {!online
            ? "Sem conexão · alterações pendentes"
            : busy || projectSaving
              ? "Salvando…"
              : projectNotice.startsWith("Erro")
                ? projectNotice
                : changed || viewDirty
                  ? "Alterações não salvas"
                  : projectNotice}
        </span>
        <button
          className="editor-action"
          aria-label="Importar"
          disabled={!writable || busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} />
          <span>Importar</span>
        </button>
        <select
          className="editor-export"
          aria-label="Exportar rede"
          defaultValue=""
          disabled={busy || !meta.permissions?.includes("network.export")}
          onChange={(e) => {
            const value = e.target.value;
            e.target.value = "";
            if (value) void exportData(value);
          }}
        >
          <option value="" disabled>
            Exportar
          </option>
          <option value="kml">KML · mapa visível</option>
          <option value="kmz">KMZ · mapa visível</option>
          <option value="geojson">GeoJSON · mapa visível</option>
          <option value="backup">Backup completo</option>
        </select>
        <button
          className="editor-icon"
          aria-label="Alternar tema"
          onClick={() => {
            setDark(!dark);
            viewEpoch.current++;
            setViewDirty(true);
          }}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <HelpLink />
        <a
          className="editor-inventory"
          href={`/inventario?project=${project}&company=${activeProject.organizationId}`}
        >
          Inventário técnico ↗
        </a>
        <a href="/conta" title="Conta e administração">
          Minha conta
        </a>
      </header>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".kml,.kmz"
        onChange={(e) => {
          if (e.target.files?.[0]) void readFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {!online && (
        <div className="editor-project-banner" role="alert">
          Sem conexão. As edições pendentes ficam nesta aba; nenhuma gravação
          será anunciada antes da confirmação do servidor.
        </div>
      )}
      {recovery && (
        <div className="editor-project-banner">
          <span>Há um rascunho não salvo deste projeto nesta aba.</span>
          <button
            onClick={() => {
              const a = assets.find((a) => a.id === recovery.selectedId);
              if (
                recovery.selectedId &&
                (!a || a.version !== recovery.version)
              ) {
                setNotice(
                  "O elemento mudou no servidor. Baixe o rascunho e compare antes de reaplicar.",
                );
                return;
              }
              editEpoch.current++;
              setSelected(a ?? null);
              setForm(recovery.form);
              setDraft(recovery.draft);
              setDrawing(recovery.drawing);
              setMode(recovery.mode);
              setFormDirty(true);
              setRight(true);
              setRecovery(null);
            }}
          >
            Recuperar rascunho
          </button>
          <button
            onClick={() =>
              download(
                JSON.stringify(recovery, null, 2),
                "fibermap-rascunho.json",
              )
            }
          >
            Baixar rascunho
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem(recoveryKey);
              setRecovery(null);
            }}
          >
            Descartar rascunho
          </button>
        </div>
      )}
      <section className="editor-body">
        <Map
          initialCamera={
            activeProject.view.camera as
              { lng: number; lat: number; zoom: number } | undefined
          }
          onViewport={(value) => {
            setCamera(value);
            viewEpoch.current++;
            if (writable) setViewDirty(true);
          }}
          onContextMenu={(asset, at) => {
            if (!ensureDiscard()) return;
            select(asset, true);
            setContextMenu({ asset, ...at });
          }}
          assets={visible}
          preview={visiblePreview}
          mode={mode}
          draft={draft}
          drawing={drawing}
          selectedId={selected?.id ?? null}
          styleUrl={style}
          focus={focus}
          highlighted={highlighted}
          draftColor={form.color}
          onSelect={select}
          onFinish={finish}
          onGeometry={geometry}
          onVertex={setVertex}
          onCoordinate={(c) => {
            if (Date.now() - lastCoordinate.current > 250) {
              lastCoordinate.current = Date.now();
              setCoordinate(c);
            }
          }}
          onClick={(at) => {
            if (mode === "split" && selected) {
              void run(async () => {
                if (
                  !window.confirm(
                    "Dividir a rota em dois segmentos documentais? As fibras e conexões continuam pertencendo ao cabo original.",
                  )
                )
                  return;
                await request(`/api/assets/${selected.id}/split`, {
                  at,
                  version: selected.version,
                  confirmConnections: true,
                });
                const latest = await load();
                const next = latest.find((a) => a.id === selected.id);
                if (next) select(next, true);
                setNotice(
                  "Rota dividida. Identificadores de fibras e conexões preservados.",
                );
              });
            } else if (mode === "point") {
              setDraft({ type: "Point", coordinates: at });
              setMode("edit");
              setRight(true);
              setForm((f) => ({
                ...f,
                code: `${f.kind}-${crypto.randomUUID().slice(0, 8)}`,
                name: kinds[f.kind],
              }));
            } else if (["line", "polygon", "measure"].includes(mode)) {
              setDrawing((p) => [...p, at]);
              setDrawRedo([]);
            }
          }}
        />
        {left && (
          <aside className="editor-left">
            <div className="editor-panel-title">
              <strong>ESPAÇO DE REDE</strong>
              <button
                aria-label="Fechar ferramentas"
                onClick={() => setLeft(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="editor-tools">
              {tools.map(([key, label, Icon]) => (
                <button
                  key={key}
                  title={label}
                  aria-label={label}
                  className={mode === key ? "active" : ""}
                  disabled={
                    busy || (!writable && !["select", "measure"].includes(key))
                  }
                  onClick={() => begin(key)}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {["line", "point", "polygon"].includes(mode) && (
              <div className="editor-tool-options">
                <label>
                  Tipo
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      field("kind", e.target.value as Form["kind"])
                    }
                  >
                    {Object.entries(kinds)
                      .filter(([k]) =>
                        mode === "line"
                          ? cables.includes(k)
                          : mode === "polygon"
                            ? k === "COVERAGE"
                            : !cables.includes(k) &&
                              !["COVERAGE", "IMPORTED"].includes(k),
                      )
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                </label>
                {mode === "line" && form.kind !== "DUCT" && (
                  <label>
                    Fibras antes de desenhar
                    <input
                      type="number"
                      min={1}
                      max={2880}
                      list="fiber-counts"
                      value={form.fiberCount}
                      onChange={(e) =>
                        field("fiberCount", Number(e.target.value))
                      }
                    />
                    <datalist id="fiber-counts">
                      {[2, 4, 6, 12, 24, 36, 48, 72, 96, 144, 288, 432].map(
                        (n) => (
                          <option key={n} value={n} />
                        ),
                      )}
                    </datalist>
                  </label>
                )}
                <p>Clique para marcar vértices. Arraste o mapa para navegar.</p>
              </div>
            )}
            <div className="editor-layer-heading">
              <Layers size={16} />
              <strong>Camadas</strong>
              <button
                aria-label="Criar camada"
                disabled={!writable || busy}
                onClick={() => {
                  const name = window.prompt("Nome da nova camada");
                  if (name)
                    void run(async () => {
                      await request("/api/map", {
                        type: "layer",
                        name,
                        projectId: project || null,
                      });
                      await load();
                    });
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="editor-layer-list">
              {meta.layers
                .filter((l) => !project || l.projectId === project)
                .map((l) => (
                  <div className="editor-layer" key={l.id}>
                    <input
                      aria-label={`Mostrar camada ${l.name}`}
                      type="checkbox"
                      checked={l.visible}
                      disabled={!writable || busy}
                      onChange={(e) =>
                        void updateLayer(l, { visible: e.target.checked })
                      }
                    />
                    <input
                      aria-label={`Cor da camada ${l.name}`}
                      type="color"
                      value={l.color}
                      disabled={!writable || busy}
                      onChange={(e) =>
                        void updateLayer(l, { color: e.target.value })
                      }
                    />
                    <button
                      title="Renomear camada"
                      disabled={!writable || busy}
                      onClick={() => {
                        const name = window.prompt("Nome da camada", l.name);
                        if (name) void updateLayer(l, { name });
                      }}
                    >
                      {l.name}
                    </button>
                    <small>
                      {assets.filter((a) => a.layerId === l.id).length}
                    </small>
                  </div>
                ))}
              <details open>
                <summary>Tipos de infraestrutura</summary>
                {Object.entries(kinds).map(([key, label]) => (
                  <label className="editor-kind" key={key}>
                    <input
                      type="checkbox"
                      checked={!hiddenKinds.includes(key)}
                      onChange={() =>
                        setHiddenKinds((h) =>
                          h.includes(key)
                            ? h.filter((k) => k !== key)
                            : [...h, key],
                        )
                      }
                    />
                    <span>{label}</span>
                    <small>
                      {
                        assets.filter(
                          (a) =>
                            a.kind === key &&
                            (!project || a.projectId === project),
                        ).length
                      }
                    </small>
                  </label>
                ))}
              </details>
            </div>
            <button
              className="editor-new-project"
              onClick={() => {
                void switchProject();
              }}
            >
              <Plus size={15} />
              Meus Projetos
            </button>
            {project && (
              <button
                className="editor-new-project"
                disabled={!writable || busy}
                onClick={() => {
                  const p = meta.projects.find((p) => p.id === project);
                  if (!p) return;
                  const pattern = window.prompt(
                    "Padrão de cores para novos cabos deste projeto (separadas por vírgula)",
                    p.colorPattern.join(","),
                  );
                  if (pattern)
                    void run(async () => {
                      const updatedProject = await request("/api/map", {
                        type: "project",
                        id: p.id,
                        name: p.name,
                        colorPattern: pattern
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean),
                      });
                      projectVersion.current = updatedProject.version;
                      await load();
                      setNotice(
                        "Padrão salvo para os próximos cabos do projeto.",
                      );
                    });
                }}
              >
                Configurar cores de fibras
              </button>
            )}
            <label className="editor-style">
              Cartografia
              <select
                aria-label="Cartografia"
                value={style}
                onChange={(e) => {
                  setStyle(e.target.value);
                  viewEpoch.current++;
                  if (writable) setViewDirty(true);
                }}
              >
                <option
                  value={
                    process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
                    "https://tiles.openfreemap.org/styles/liberty"
                  }
                >
                  Ruas
                </option>
                <option value="https://tiles.openfreemap.org/styles/positron">
                  Claro
                </option>
                <option value="https://tiles.openfreemap.org/styles/dark">
                  Escuro
                </option>
                <option
                  value={
                    process.env.NEXT_PUBLIC_SATELLITE_STYLE_URL ||
                    "/maps/satellite.json"
                  }
                >
                  Satélite
                  {process.env.NEXT_PUBLIC_SATELLITE_STYLE_URL ===
                  "/api/maps/satellite"
                    ? " · Mapbox"
                    : process.env.NEXT_PUBLIC_SATELLITE_STYLE_URL
                      ? ""
                      : " · EOX 2016"}
                </option>
              </select>
              {style === "/api/maps/satellite" && (
                <small>
                  Imagens Mapbox. A definição e a data variam conforme o local.
                </small>
              )}
              {style === "/maps/satellite.json" && (
                <small>
                  Imagens de 2016 · cerca de 10 m de resolução. Não mostram
                  mudanças recentes nem detalhes de postes.
                </small>
              )}
            </label>
          </aside>
        )}
        {!ready && <div className="editor-floating">Carregando rede…</div>}
        {notice && (
          <div className="editor-notice" role="status">
            <span>{notice}</span>
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {mode !== "select" && (
          <div className="editor-drawbar">
            <span>
              {mode === "edit"
                ? "Arraste os vértices para editar. Selecione um vértice para inserir ou remover."
                : mode === "split"
                  ? "Clique no ponto da rota onde deseja dividir."
                  : mode === "point"
                    ? "Clique no local do equipamento."
                    : `${drawing.length} vértices · ${measured.toFixed(1)} m`}
            </span>
            <button
              aria-label="Desfazer geometria"
              disabled={draft ? !history.past.length : !drawing.length}
              onClick={undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="Refazer geometria"
              disabled={draft ? !history.future.length : !drawRedo.length}
              onClick={redo}
            >
              <Redo2 size={17} />
            </button>
            {editing && vertex && (
              <>
                <button
                  aria-label="Adicionar vértice depois do selecionado"
                  onClick={() => {
                    try {
                      geometry(insertVertex(draft, vertex));
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  <Plus size={17} />
                </button>
                <button
                  aria-label="Remover vértice selecionado"
                  onClick={() => {
                    try {
                      geometry(moveVertex(draft, vertex, [0, 0], true));
                      setVertex(null);
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  <Minus size={17} />
                </button>
              </>
            )}
            {["line", "polygon"].includes(mode) && (
              <button className="editor-primary" onClick={finish}>
                <Check size={16} />
                Finalizar
              </button>
            )}
            <button
              onClick={() => {
                if (ensureDiscard()) {
                  if (selected) select(selected, true);
                  else {
                    clear();
                    setRight(false);
                  }
                }
              }}
            >
              Cancelar
            </button>
          </div>
        )}
        {selected && !right && (
          <button
            className="editor-open-properties"
            onClick={() => setRight(true)}
          >
            Abrir propriedades
          </button>
        )}
        {right && (selected || draft) && (
          <aside className="editor-right">
            <div className="editor-panel-title">
              <div>
                <small>{selected ? "ELEMENTO SALVO" : "NOVO ELEMENTO"}</small>
                <h2>{selected?.code || "Propriedades"}</h2>
              </div>
              <button
                aria-label="Fechar propriedades"
                onClick={() => setRight(false)}
              >
                <PanelRightClose size={20} />
              </button>
            </div>
            {selected && (
              <button
                disabled={
                  !meta.permissions?.includes(
                    assetPermission(selected.kind, "edit"),
                  ) || busy
                }
                onClick={() => {
                  if (ensureDiscard()) {
                    select(selected, true);
                    setRenameTarget({
                      id: selected.id,
                      name: selected.name,
                      version: selected.version,
                    });
                  }
                }}
              >
                Renomear
              </button>
            )}
            {selected?.kind === "CUSTOMER" && (
              <button
                onClick={() =>
                  void run(async () => {
                    if (!ensureDiscard()) return;
                    const boxes: { id: string; code: string; name: string }[] =
                      await request(
                        `/api/assets/${selected.id}/optical-location`,
                      );
                    if (!boxes.length) {
                      setNotice(
                        "Este cliente ainda não está associado a uma CTO. Abra o diagrama da CTO para vincular o cliente e seu drop.",
                      );
                      return;
                    }
                    let location = boxes[0];
                    if (boxes.length > 1) {
                      const code = window.prompt(
                        "Código da CTO / caixa: " +
                          boxes.map((b) => b.code).join(", "),
                      );
                      const chosen = boxes.find((b) => b.code === code);
                      if (!chosen) return;
                      location = chosen;
                    }
                    setDiagramId(location.id);
                  })
                }
              >
                Consultar ligação óptica
              </button>
            )}
            {selected &&
              ["CTO", "CLOSURE", "DIO", "POP"].includes(selected.kind) && (
                <button
                  className="editor-primary"
                  style={{ margin: "8px 16px", width: "calc(100% - 32px)" }}
                  onClick={() => {
                    if (ensureDiscard()) setDiagramId(selected.id);
                  }}
                >
                  <Network size={17} /> Diagrama Óptico
                </button>
              )}
            <div className="editor-tabs">
              {[
                ["properties", "Propriedades"],
                ["optical", "Óptica"],
                ["history", "Histórico"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "properties" && (
              <form
                className="editor-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (current?.type === "Point") {
                    const values = new FormData(e.currentTarget);
                    void save({
                      type: "Point",
                      coordinates: [
                        Number(values.get("longitude")),
                        Number(values.get("latitude")),
                      ],
                    });
                  } else void save();
                }}
              >
                <fieldset disabled={!writable || busy}>
                  {current?.type === "Point" && (
                    <>
                      <div className="editor-two">
                        {(["latitude", "longitude"] as const).map((name, i) => {
                          const index = i === 0 ? 1 : 0;
                          return (
                            <label key={name + current.coordinates[index]}>
                              {i === 0 ? "Latitude" : "Longitude"}
                              <input
                                name={name}
                                type="number"
                                step="any"
                                min={i === 0 ? -90 : -180}
                                max={i === 0 ? 90 : 180}
                                required
                                defaultValue={current.coordinates[index]}
                                onChange={() => setFormDirty(true)}
                                onBlur={(e) => {
                                  const value = e.currentTarget.valueAsNumber;
                                  if (
                                    Number.isFinite(value) &&
                                    Math.abs(value) <= (i === 0 ? 90 : 180)
                                  ) {
                                    const coordinates = [
                                      ...current.coordinates,
                                    ] as Coordinate;
                                    coordinates[index] = value;
                                    geometry({ type: "Point", coordinates });
                                    setMode("edit");
                                  }
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                      {Math.abs(current.coordinates[1]) > 85.05112878 && (
                        <p>
                          Coordenada válida em WGS 84, além da região exibida
                          por este mapa. Confirme a localização antes de salvar.
                        </p>
                      )}
                    </>
                  )}
                  <label>
                    Nome
                    <input
                      required
                      maxLength={160}
                      value={form.name}
                      onChange={(e) => field("name", e.target.value)}
                    />
                  </label>
                  <div className="editor-two">
                    <label>
                      Código
                      <input
                        required
                        maxLength={80}
                        value={form.code}
                        onChange={(e) => field("code", e.target.value)}
                      />
                    </label>
                    <label>
                      {cables.includes(form.kind)
                        ? "Cor deste cabo"
                        : "Cor no mapa"}
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => field("color", e.target.value)}
                      />
                    </label>
                  </div>
                  {cables.includes(form.kind) && (
                    <div className="editor-cable-palette">
                      <div>
                        {[
                          "#18a99b",
                          "#ef4444",
                          "#2563eb",
                          "#16a34a",
                          "#f59e0b",
                          "#9333ea",
                          "#ec4899",
                          "#1e293b",
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`Usar cor ${color}`}
                            aria-pressed={form.color.toLowerCase() === color}
                            title={color}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              field("color", color);
                              setTrace([]);
                            }}
                          />
                        ))}
                      </div>
                      <small>
                        {form.color.toUpperCase()} · Prévia no mapa. Clique em
                        Salvar elemento para gravar somente este cabo.
                      </small>
                    </div>
                  )}
                  <label>
                    Tipo
                    <select
                      value={form.kind}
                      disabled={!!selected}
                      onChange={(e) =>
                        field("kind", e.target.value as Form["kind"])
                      }
                    >
                      {Object.entries(kinds)
                        .filter(([k]) => !!current && compatible(k, current))
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Situação
                    <select
                      value={form.status}
                      onChange={(e) =>
                        field("status", e.target.value as Form["status"])
                      }
                    >
                      {Object.entries(statuses).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Projeto
                    <select value={form.projectId} disabled>
                      {meta.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Camada
                    <select
                      value={form.layerId}
                      onChange={(e) => field("layerId", e.target.value)}
                    >
                      <option value="">Sem camada</option>
                      {meta.layers
                        .filter(
                          (l) => !l.projectId || l.projectId === form.projectId,
                        )
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {cables.includes(form.kind) && (
                    <>
                      <div className="editor-measure">
                        <Ruler size={18} />
                        <div>
                          <strong>{measured.toFixed(2)} m</strong>
                          <small>Comprimento geográfico · WGS 84</small>
                        </div>
                      </div>
                      {form.kind !== "DUCT" && (
                        <label>
                          Fibras
                          <input
                            type="number"
                            min={1}
                            max={2880}
                            disabled={!!selected}
                            value={form.fiberCount}
                            onChange={(e) =>
                              field("fiberCount", Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                      <div className="editor-two">
                        <label>
                          Comprimento físico (m)
                          <input
                            type="number"
                            min={0}
                            max={1e8}
                            step="any"
                            placeholder="Não informado"
                            value={form.physicalLengthM}
                            onChange={(e) =>
                              field("physicalLengthM", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Reserva técnica (m)
                          <input
                            type="number"
                            min={0}
                            max={1e7}
                            step="any"
                            value={form.reserveM}
                            onChange={(e) =>
                              field("reserveM", Number(e.target.value))
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Padrão de cores das fibras
                        <input
                          disabled={!!selected}
                          value={form.colorPattern}
                          onChange={(e) =>
                            field("colorPattern", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Origem
                        <input
                          maxLength={200}
                          value={form.originLabel}
                          onChange={(e) => field("originLabel", e.target.value)}
                        />
                      </label>
                      <label>
                        Destino
                        <input
                          maxLength={200}
                          value={form.destinationLabel}
                          onChange={(e) =>
                            field("destinationLabel", e.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                  {["OLT", "DIO", "CTO", "SPLITTER"].includes(form.kind) && (
                    <label>
                      {form.kind === "SPLITTER"
                        ? "Saídas do splitter"
                        : form.kind === "CTO"
                          ? "Acopladores (entrada e saída)"
                          : "Portas"}
                      <input
                        type="number"
                        list="splitter-ports"
                        min={1}
                        max={128}
                        disabled={!!selected}
                        value={form.ports}
                        onChange={(e) => field("ports", Number(e.target.value))}
                      />
                      <datalist id="splitter-ports">
                        {[2, 4, 8, 16, 32, 64].map((n) => (
                          <option key={n} value={n} />
                        ))}
                      </datalist>
                    </label>
                  )}
                  {form.kind === "SPLITTER" && (
                    <>
                      <label>
                        Entradas
                        <input
                          type="number"
                          min={1}
                          max={2}
                          disabled={!!selected}
                          value={form.inputs}
                          onChange={(e) =>
                            field("inputs", Number(e.target.value))
                          }
                        />
                      </label>
                      <label>
                        Perda nominal (dB)
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step="0.01"
                          disabled={!!selected}
                          value={form.insertionLossDb}
                          onChange={(e) =>
                            field("insertionLossDb", Number(e.target.value))
                          }
                        />
                      </label>
                    </>
                  )}
                  {["SPLITTER", "OLT", "DIO"].includes(form.kind) && (
                    <label>
                      Instalado em caixa / CTO / POP
                      <select
                        value={form.parentId}
                        onChange={(e) => field("parentId", e.target.value)}
                      >
                        <option value="">Sem contêiner</option>
                        {assets
                          .filter((a) =>
                            ["CTO", "CLOSURE", "POP"].includes(a.kind),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} · {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Fabricante
                    <input
                      maxLength={200}
                      value={form.manufacturer}
                      onChange={(e) => field("manufacturer", e.target.value)}
                    />
                  </label>
                  <label>
                    Data de instalação
                    <input
                      type="date"
                      value={form.installedAt}
                      onChange={(e) => field("installedAt", e.target.value)}
                    />
                  </label>
                  <label>
                    Observações
                    <textarea
                      maxLength={10000}
                      rows={4}
                      value={form.notes}
                      onChange={(e) => field("notes", e.target.value)}
                    />
                  </label>
                  <button className="editor-primary editor-save" type="submit">
                    <Save size={17} />
                    {busy ? "Salvando…" : "Salvar elemento"}
                  </button>
                </fieldset>
                {current?.type.includes("Polygon") && (
                  <p>
                    Área geográfica:{" "}
                    {geographicArea(current).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    m²
                  </p>
                )}
                {selected && (
                  <>
                    <div className="editor-asset-actions">
                      {selected.kind === "IMPORTED" && (
                        <button
                          type="button"
                          disabled={!writable || busy}
                          onClick={() => {
                            const options = Object.keys(kinds).filter(
                              (k) =>
                                k !== "IMPORTED" &&
                                compatible(k, selected.geometry),
                            );
                            const kind = window.prompt(
                              `Converter para: ${options.join(", ")}`,
                              options[0],
                            );
                            if (!kind || !options.includes(kind)) return;
                            const count = Number(
                              window.prompt(
                                cables.includes(kind)
                                  ? "Quantidade de fibras"
                                  : "Portas / saídas (splitter)",
                                "8",
                              ),
                            );
                            if (
                              !count ||
                              !window.confirm(
                                "Criar a estrutura técnica neste elemento? O ID e a origem importada serão preservados.",
                              )
                            )
                              return;
                            void run(async () => {
                              await request(
                                `/api/assets/${selected.id}/convert`,
                                {
                                  kind,
                                  fiberCount: count,
                                  ports: Math.min(count, 128),
                                  inputs: 1,
                                  insertionLossDb: 10.5,
                                  version: selected.version,
                                  confirm: true,
                                },
                              );
                              const latest = await load();
                              const a = latest.find(
                                (a) => a.id === selected.id,
                              );
                              if (a) select(a, true);
                              setNotice(
                                "Elemento convertido. Fibras e portas criadas sem conexões automáticas.",
                              );
                            });
                          }}
                        >
                          <Network size={16} />
                          Converter tipo
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!writable || busy}
                        onClick={() => {
                          if (!ensureDiscard()) return;
                          setDraft(structuredClone(selected.geometry));
                          setMode("edit");
                          setHistory({ past: [], future: [] });
                        }}
                      >
                        <Pencil size={16} />
                        Editar vértices
                      </button>
                      {cables.includes(selected.kind) && (
                        <button
                          type="button"
                          disabled={
                            !writable || busy || !!selected.segments?.length
                          }
                          onClick={() => {
                            if (!ensureDiscard()) return;
                            clear();
                            setMode("split");
                          }}
                        >
                          <Scissors size={16} />
                          Dividir rota
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!writable || busy}
                        onClick={() => {
                          const code = window.prompt(
                            "Código único para a cópia",
                          );
                          if (code)
                            void run(async () => {
                              const result = await request(
                                `/api/assets/${selected.id}`,
                                { code, name: `${selected.name} (cópia)` },
                              );
                              const latest = await load();
                              const copy = latest.find(
                                (a) => a.id === result.id,
                              );
                              if (copy) select(copy, true);
                              setNotice(
                                "Cópia criada com novas fibras e portas, sem copiar conexões.",
                              );
                            });
                        }}
                      >
                        <Copy size={16} />
                        Duplicar
                      </button>
                      <button
                        type="button"
                        className="editor-danger"
                        disabled={!writable || busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir ${selected.name}? Esta operação remove o elemento e suas portas sem conexões.`,
                            )
                          )
                            void run(async () => {
                              await request(
                                `/api/assets/${selected.id}`,
                                { version: selected.version },
                                "DELETE",
                              );
                              clear();
                              setSelected(null);
                              setRight(false);
                              await load();
                              setNotice("Elemento excluído e auditado.");
                            });
                        }}
                      >
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    </div>
                    {selected.segments?.length > 0 && (
                      <div className="editor-segments">
                        <h3>Segmentos documentais</h3>
                        {selected.segments.map((s, i) => (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() =>
                              setFocus(structuredClone(s.geometry))
                            }
                          >
                            Segmento {i + 1} · {s.lengthM.toFixed(2)} m
                          </button>
                        ))}
                        <small>
                          As fibras mantêm a identidade do cabo original.
                        </small>
                      </div>
                    )}
                    <small>
                      ID {selected.id} · versão {selected.version}
                    </small>
                  </>
                )}
              </form>
            )}
            {tab === "optical" && selected && (
              <div className="editor-optical">
                <p>
                  Conectividade documental. Livre significa sem conexão
                  registrada.
                </p>
                {selected.fibers.length > 0 && (
                  <>
                    <h3>{selected.fibers.length} fibras</h3>
                    <div className="editor-fibers">
                      {selected.fibers.map((f) => (
                        <div key={f.id}>
                          <strong>
                            {f.number} · {f.color}
                            <small>
                              {meta.connections.some(
                                (c) =>
                                  c.kind === "SPLICE" &&
                                  c.terminals.some((t) =>
                                    f.terminals.some(
                                      (ft) => ft.id === t.terminalId,
                                    ),
                                  ),
                              )
                                ? " · Fusionada"
                                : meta.connections.some(
                                      (c) =>
                                        c.kind === "PASS_THROUGH" &&
                                        c.terminals.some((t) =>
                                          f.terminals.some(
                                            (ft) => ft.id === t.terminalId,
                                          ),
                                        ),
                                    )
                                  ? " · Passante"
                                  : f.terminals.some((t) => t.links.length)
                                    ? " · Ocupada"
                                    : ""}
                            </small>
                          </strong>
                          <select
                            aria-label={`Estado da fibra ${f.number}`}
                            disabled={
                              !writable ||
                              busy ||
                              f.terminals.some((t) => t.links.length > 0)
                            }
                            value={f.status}
                            onChange={(e) =>
                              void run(async () => {
                                await request(
                                  `/api/assets/${selected.id}/fibers`,
                                  {
                                    fiberId: f.id,
                                    status: e.target.value,
                                    version: selected.version,
                                  },
                                  "PATCH",
                                );
                                const latest = await load();
                                const a = latest.find(
                                  (a) => a.id === selected.id,
                                );
                                if (a) select(a, true);
                                setTab("optical");
                              })
                            }
                          >
                            <option value="AVAILABLE">Disponível</option>
                            <option value="RESERVED">Reservada</option>
                            <option value="DAMAGED">Danificada</option>
                            <option value="BLOCKED">Bloqueada</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {assets.some((a) => a.parentId === selected.id) && (
                  <>
                    <h3>Equipamentos internos</h3>
                    {assets
                      .filter((a) => a.parentId === selected.id)
                      .map((a) => (
                        <button key={a.id} onClick={() => select(a)}>
                          {a.code} · {a.name}
                        </button>
                      ))}
                  </>
                )}
                {["CLOSURE", "CTO"].includes(selected.kind) && (
                  <>
                    <h3>Cabos com conexões neste local</h3>
                    {assets
                      .filter(
                        (a) =>
                          a.fibers.length &&
                          meta.connections.some(
                            (c) =>
                              c.locationId === selected.id &&
                              c.terminals.some((t) =>
                                a.terminals.some(
                                  (at) => at.id === t.terminalId,
                                ),
                              ),
                          ),
                      )
                      .map((a) => (
                        <button
                          className="editor-cable-summary"
                          key={a.id}
                          onClick={() => select(a)}
                        >
                          {a.code} · {a.fibers.length} fibras ·{" "}
                          {
                            a.fibers.filter(
                              (f) =>
                                f.status === "AVAILABLE" &&
                                f.terminals.every((t) => !t.links.length),
                            ).length
                          }{" "}
                          livres
                        </button>
                      ))}
                  </>
                )}
                <h3>Terminais</h3>
                <div className="editor-terminals">
                  {selected.terminals.map((t) => (
                    <div key={t.id}>
                      <span className={t.links.length ? "connected" : ""} />
                      <div>
                        <strong>{t.label}</strong>
                        <small>{t.links.length ? "Conectado" : "Livre"}</small>
                      </div>
                      <button
                        title={`Rastrear ${t.label}`}
                        aria-label={`Rastrear ${t.label}`}
                        disabled={busy}
                        onClick={() => void traceTerminal(t.id)}
                      >
                        <Activity size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <h3>Conexões documentadas</h3>
                {meta.connections
                  .filter(
                    (c) =>
                      c.locationId === selected.id ||
                      c.terminals.some((t) =>
                        selected.terminals.some((s) => s.id === t.terminalId),
                      ),
                  )
                  .map((c) => (
                    <div className="editor-connection" key={c.id}>
                      <strong>
                        {c.kind} · {c.tray}
                      </strong>
                      <small>
                        {c.terminals
                          .map((t) => {
                            const a = assets.find((a) =>
                              a.terminals.some((s) => s.id === t.terminalId),
                            );
                            return (
                              a?.code +
                              " / " +
                              a?.terminals.find((s) => s.id === t.terminalId)
                                ?.label
                            );
                          })
                          .join(" ↔ ")}
                      </small>
                      <button
                        disabled={!writable || busy}
                        onClick={() => {
                          if (window.confirm("Remover esta conexão?"))
                            void run(async () => {
                              await request(
                                "/api/connections/" + c.id,
                                {},
                                "DELETE",
                              );
                              const latest = await load();
                              const a = latest.find(
                                (a) => a.id === selected.id,
                              );
                              if (a) select(a, true);
                              setTab("optical");
                            });
                        }}
                      >
                        Desconectar
                      </button>
                    </div>
                  ))}
                <h3>Registrar conexão</h3>
                <form
                  className="editor-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await request("/api/connections", {
                        a: f.get("a"),
                        b: f.get("b"),
                        kind: f.get("kind"),
                        locationId: ["CLOSURE", "CTO", "POP"].includes(
                          selected.kind,
                        )
                          ? selected.id
                          : selected.parentId,
                        tray: f.get("tray"),
                        lossDb: Number(f.get("lossDb")),
                      });
                      const latest = await load();
                      const a = latest.find((a) => a.id === selected.id);
                      if (a) select(a, true);
                      setTab("optical");
                      setNotice("Conexão gravada.");
                    });
                  }}
                >
                  <fieldset disabled={!writable || busy}>
                    <label>
                      Terminal A
                      <select name="a" required>
                        <option value="">Selecione</option>
                        {assets
                          .filter(
                            (a) =>
                              a.id === selected.id ||
                              selected.kind === "CLOSURE",
                          )
                          .flatMap((a) =>
                            a.terminals
                              .filter((t) => !t.links.length)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {a.code} · {t.label}
                                </option>
                              )),
                          )}
                      </select>
                    </label>
                    <label>
                      Terminal B
                      <select name="b" required>
                        <option value="">Selecione</option>
                        {assets.flatMap((a) =>
                          a.terminals
                            .filter((t) => !t.links.length)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {a.code} · {t.label}
                              </option>
                            )),
                        )}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select name="kind">
                        <option value="PATCH">Patch / conector</option>
                        <option value="SPLICE">Fusão</option>
                        <option value="PASS_THROUGH">Passante sem corte</option>
                        <option value="DOCUMENTARY">Documental</option>
                      </select>
                    </label>
                    <label>
                      Caixa / bandeja
                      <input
                        name="tray"
                        maxLength={80}
                        defaultValue={
                          selected.kind === "CLOSURE"
                            ? selected.code + " / "
                            : ""
                        }
                      />
                    </label>
                    <label>
                      Perda documentada (dB)
                      <input
                        name="lossDb"
                        type="number"
                        min={0}
                        max={40}
                        step="0.01"
                        defaultValue="0"
                      />
                    </label>
                    <button className="editor-primary">Salvar conexão</button>
                  </fieldset>
                </form>
                {trace.length > 0 && (
                  <div className="editor-traces">
                    <h3>Caminhos encontrados</h3>
                    {trace.map((p, i) => (
                      <div key={i}>
                        <strong>
                          {p.outcome} · {p.lossDb.toFixed(2)} dB
                        </strong>
                        {p.nodes.map((n, j) => (
                          <button
                            key={j}
                            onClick={() => {
                              const a = assets.find((a) => a.id === n.assetId);
                              if (a) setFocus(structuredClone(a.geometry));
                            }}
                          >
                            {assets.find((a) => a.id === n.assetId)?.code} ·{" "}
                            {n.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === "history" && (
              <div className="editor-history">
                {meta.audits
                  .filter((a) => a.entityId === selected?.id)
                  .map((a) => (
                    <div key={a.id}>
                      <strong>{a.action}</strong>
                      <small>
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </small>
                    </div>
                  ))}
                <small>
                  Exibindo eventos entre os 100 mais recentes da organização. O
                  backup contém a auditoria completa.
                </small>
              </div>
            )}
          </aside>
        )}
      </section>
      <footer className="editor-footer">
        <span>
          <i />{" "}
          {busy
            ? "Processando…"
            : !ready
              ? "Conectando…"
              : changed
                ? "Alterações não salvas"
                : "Rede carregada"}
          {!writable && ready ? " · somente leitura" : ""}
        </span>
        <span>
          {coordinate[1].toFixed(6)}, {coordinate[0].toFixed(6)} · WGS 84
        </span>
        <span>
          {visible.length} elementos · {measured.toFixed(1)} m
        </span>
      </footer>
      {importOpen && (
        <div className="editor-modal-backdrop">
          <section
            className="editor-import"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="editor-panel-title">
              <div>
                <small>KML / KMZ</small>
                <h2 id="import-title">Revisar importação</h2>
              </div>
              <button
                aria-label="Fechar revisão e manter prévia"
                onClick={() => setImportOpen(false)}
              >
                <X />
              </button>
            </div>
            <p>
              {upload?.file.name} · {preview.length} geometrias. Selecione até
              100 por importação. A conversão técnica cria fibras e portas
              novas, sem conexões automáticas.
            </p>
            <label>
              {project ? "Projeto selecionado no mapa" : "Nome do novo projeto"}
              <input
                required
                maxLength={160}
                disabled={!!project}
                value={
                  project
                    ? (meta.projects.find((p) => p.id === project)?.name ?? "")
                    : importName
                }
                onChange={(e) => setImportName(e.target.value)}
              />
            </label>
            <div className="editor-import-table">
              <table>
                <thead>
                  <tr>
                    <th>Salvar</th>
                    <th>Elemento / camada</th>
                    <th>Tipo técnico</th>
                    <th>Fibras</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Importar ${f.name}`}
                          checked={!!chosen[f.id]}
                          onChange={(e) =>
                            setChosen((c) => {
                              const n = { ...c };
                              if (e.target.checked)
                                n[f.id] = { kind: "IMPORTED", fiberCount: 24 };
                              else delete n[f.id];
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => setFocus(structuredClone(f.geometry))}
                        >
                          {f.name}
                        </button>
                        <small>
                          {f.folder} · {f.geometry.type}
                        </small>
                      </td>
                      <td>
                        <select
                          aria-label={`Tipo de ${f.name}`}
                          disabled={!chosen[f.id]}
                          value={chosen[f.id]?.kind ?? "IMPORTED"}
                          onChange={(e) =>
                            setChosen((c) => ({
                              ...c,
                              [f.id]: {
                                ...c[f.id],
                                kind: e.target.value as Form["kind"],
                              },
                            }))
                          }
                        >
                          {Object.entries(kinds)
                            .filter(([k]) => compatible(k, f.geometry))
                            .map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        {cables.includes(chosen[f.id]?.kind) && (
                          <input
                            aria-label={`Fibras de ${f.name}`}
                            type="number"
                            min={1}
                            max={2880}
                            value={chosen[f.id].fiberCount}
                            onChange={(e) =>
                              setChosen((c) => ({
                                ...c,
                                [f.id]: {
                                  ...c[f.id],
                                  fiberCount: Number(e.target.value),
                                },
                              }))
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="editor-import-actions">
              <button
                onClick={() => {
                  setPreview([]);
                  setChosen({});
                  setUpload(null);
                  setImportOpen(false);
                }}
              >
                Descartar prévia
              </button>
              <button
                className="editor-primary"
                disabled={
                  busy ||
                  !Object.keys(chosen).length ||
                  Object.keys(chosen).length > 100 ||
                  !importName.trim()
                }
                onClick={() => void importFile()}
              >
                <Upload size={17} />
                Salvar {Object.keys(chosen).length} elementos
              </button>
            </div>
          </section>
        </div>
      )}
      {contextMenu && (
        <div
          className="editor-context-menu"
          role="menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 190),
            top: Math.min(contextMenu.y, window.innerHeight - 90),
          }}
        >
          <button
            role="menuitem"
            disabled={
              !meta.permissions?.includes(
                assetPermission(contextMenu.asset.kind, "edit"),
              )
            }
            onClick={() => {
              setRenameTarget({
                id: contextMenu.asset.id,
                name: contextMenu.asset.name,
                version: contextMenu.asset.version,
              });
              setContextMenu(null);
            }}
          >
            Renomear
          </button>
          <button role="menuitem" onClick={() => setContextMenu(null)}>
            Fechar
          </button>
        </div>
      )}
      {renameTarget && (
        <RenameDialog
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            void load()
              .then((list) => {
                const a = list.find((a) => a.id === renameTarget.id);
                if (a) select(a, true);
              })
              .catch((e) => setNotice(e.message));
          }}
        />
      )}
      {diagramId && (
        <OpticalDiagram
          equipmentId={diagramId}
          onClose={() => setDiagramId(null)}
          onSaved={() => {
            const epoch = editEpoch.current;
            void load()
              .then((list) => {
                if (!changed && selected && epoch === editEpoch.current) {
                  const fresh = list.find((a) => a.id === selected.id);
                  if (fresh) select(fresh, true);
                }
              })
              .catch((e) => setNotice(e.message));
          }}
        />
      )}
      {!!preview.length && !importOpen && (
        <button
          className="editor-review-import"
          onClick={() => setImportOpen(true)}
        >
          Revisar importação · {preview.length} elementos
        </button>
      )}
    </main>
  );
}
