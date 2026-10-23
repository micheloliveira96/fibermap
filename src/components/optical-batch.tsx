"use client";
import { useMemo, useState } from "react";
import {
  endpointColor,
  endpointLabel,
  pairError,
  sequencePairs,
  type DiagramEndpoint,
} from "@/lib/diagram-types";
type Pair = { a: string; b: string };
function EndpointPicker({
  title,
  ports,
  used,
  selected,
  onChange,
}: {
  title: string;
  ports: Map<string, DiagramEndpoint>;
  used: Set<string>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState("fiber"),
    [cable, setCable] = useState(""),
    [tube, setTube] = useState(""),
    [side, setSide] = useState("IN"),
    [endFace,setEndFace]=useState("A"),
    [role, setRole] = useState("SPLITTER_IN"),
    [from, setFrom] = useState(1),
    [to, setTo] = useState(12);
  const assets = [
    ...new Map([...ports.values()].map((p) => [p.asset.id, p.asset])).values(),
  ];
  const cableId = cable || assets.find((a) => a.fibers.length)?.id || "";
  const visible = [...ports.values()].filter((p) =>
    mode === "fiber"
      ? p.asset.id === cableId &&
        Boolean(p.port.fiberId) &&
        (!p.access?.bothEnds || p.port.kind===`FIBER_${endFace}`) &&
        (!tube ||
          p.asset.fibers.find((f) => f.id === p.port.fiberId)?.tube ===
            Number(tube)) &&
        (!p.port.localSide || p.port.localSide === side)
      : !p.port.fiberId && (!role || p.port.kind === role),
  );
  const available = (p: DiagramEndpoint) =>
    !p.port.occupied &&
    !used.has(p.port.id) &&
    p.asset.status !== "DISABLED" &&
    (!p.port.fiberId ||
      p.asset.fibers.some(
        (f) =>
          f.id === p.port.fiberId &&
          f.status === "AVAILABLE" &&
          (p.access?.fiberStates[f.id] ?? "AVAILABLE") === "AVAILABLE",
      ));
  const toggle = (ids: string[], checked: boolean) =>
    onChange(
      checked
        ? [...new Set([...selected, ...ids])]
        : selected.filter((id) => !ids.includes(id)),
    );
  const groups = [...new Set(visible.map((p) => p.asset.id))];
  return (
    <section className="od-batch-picker">
      <h3>
        {title} <small>{selected.length} selecionadas</small>
      </h3>
      <label>
        Tipo de extremidade
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="fiber">Fibras de cabos</option>
          <option value="port">Portas de componentes</option>
        </select>
      </label>
      {mode === "fiber" ? (
        <>
          <label>
            Cabo
            <select
              value={cableId}
              onChange={(e) => {
                setCable(e.target.value);
                setTube("");
              }}
            >
              {assets
                .filter((a) => a.fibers.length)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.fibers.length} fibras
                  </option>
                ))}
            </select>
          </label>
          {visible.some(p=>p.access?.bothEnds)&&<label>Ponta do cabo<select value={endFace} onChange={e=>setEndFace(e.target.value)}><option value="A">A</option><option value="B">B</option></select></label>}
          <div className="od-batch-fields">
            <label>
              Tubo
              <select value={tube} onChange={(e) => setTube(e.target.value)}>
                <option value="">Todos</option>
                {[
                  ...new Set(
                    assets
                      .find((a) => a.id === cableId)
                      ?.fibers.map((f) => f.tube) ?? [],
                  ),
                ].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Face da sangria
              <select value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="IN">Chegada</option>
                <option value="OUT">Continuação</option>
              </select>
            </label>
          </div>
          <div className="od-batch-fields">
            <label>
              Da fibra
              <input
                type="number"
                min={1}
                value={from}
                onChange={(e) => setFrom(Number(e.target.value))}
              />
            </label>
            <label>
              Até a fibra
              <input
                type="number"
                min={1}
                value={to}
                onChange={(e) => setTo(Number(e.target.value))}
              />
            </label>
          </div>
          <button
            onClick={() =>
              toggle(
                visible
                  .filter((p) => {
                    const n = p.asset.fibers.find(
                      (f) => f.id === p.port.fiberId,
                    )!.number;
                    return n >= from && n <= to && available(p);
                  })
                  .map((p) => p.port.id),
                true,
              )
            }
          >
            Selecionar intervalo disponível
          </button>
        </>
      ) : (
        <label>
          Portas
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="SPLITTER_IN">Entradas de splitters</option>
            <option value="SPLITTER_OUT">Saídas de splitters</option>
            <option value="">Todas as portas</option>
          </select>
        </label>
      )}
      <div className="od-batch-scroll">
        {groups.map((id) => {
          const list = visible.filter((p) => p.asset.id === id),
            free = list.filter(available).map((p) => p.port.id);
          return (
            <fieldset key={id}>
              <legend>{list[0].asset.code}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={
                    free.length > 0 && free.every((id) => selected.includes(id))
                  }
                  disabled={!free.length}
                  onChange={(e) => toggle(free, e.target.checked)}
                />
                Selecionar disponíveis
              </label>
              {list.map((p) => (
                <label
                  key={p.port.id}
                  className={available(p) ? "" : "od-unavailable"}
                >
                  <input
                    type="checkbox"
                    disabled={!available(p)}
                    checked={selected.includes(p.port.id)}
                    onChange={(e) => toggle([p.port.id], e.target.checked)}
                  />
                  <i style={{ background: endpointColor(p) }} />
                  <span>
                    {endpointLabel(p)}
                    <small>
                      {available(p)
                        ? "Disponível"
                        : p.port.occupied || used.has(p.port.id)
                          ? "Ocupada"
                          : "Indisponível"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
        {!visible.length && (
          <p>
            Nenhuma extremidade neste filtro. Associe cabos ou adicione
            splitters no painel do diagrama.
          </p>
        )}
      </div>
      <button onClick={() => onChange([])}>
        Limpar seleção de {title.toLowerCase()}
      </button>
    </section>
  );
}
export function OpticalBatch({
  ports,
  used,
  onPreview,
  onClose,
}: {
  ports: Map<string, DiagramEndpoint>;
  used: Set<string>;
  onPreview: (pairs: Pair[]) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState<string[]>([]),
    [b, setB] = useState<string[]>([]),
    [reverse, setReverse] = useState(false),
    [manual, setManual] = useState(false),
    [rows, setRows] = useState<Pair[]>([]),
    [preview, setPreview] = useState(false),
    [error, setError] = useState("");
  const automatic = useMemo(() => {
    try {
      return sequencePairs(a, b, reverse);
    } catch {
      return [];
    }
  }, [a, b, reverse]);
  const pairs = manual ? rows : automatic;
  const validation = (() => {
    const occupied = new Set(used);
    return pairs.map((pair) => {
      const error = pairError(ports.get(pair.a), ports.get(pair.b), occupied);
      occupied.add(pair.a);
      occupied.add(pair.b);
      return error;
    });
  })();
  const change = (setter: (ids: string[]) => void) => (ids: string[]) => {
    setter(ids);
    setRows([]);
    setPreview(false);
    setError("");
  };
  return (
    <div className="od-overlay od-batch-overlay">
      <section
        className="od-batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Fusão em lote"
      >
        <header>
          <div>
            <h2>Fusão em lote</h2>
            <p>
              Cabos, fibras e portas de vários splitters. As conexões existentes
              serão preservadas.
            </p>
          </div>
          <button aria-label="Fechar lote" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="od-batch-columns">
          <EndpointPicker
            title="Origem"
            ports={ports}
            used={used}
            selected={a}
            onChange={change(setA)}
          />
          <EndpointPicker
            title="Destino"
            ports={ports}
            used={used}
            selected={b}
            onChange={change(setB)}
          />
        </div>
        <div className="od-batch-options">
          <label>
            <input
              type="checkbox"
              checked={reverse}
              disabled={manual}
              onChange={(e) => {
                setReverse(e.target.checked);
                setPreview(false);
              }}
            />
            Inverter ordem do destino
          </label>
          <label>
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => {
                setManual(e.target.checked);
                setRows(
                  automatic.length
                    ? automatic
                    : [{ a: a[0] ?? "", b: b[0] ?? "" }],
                );
                setPreview(false);
              }}
            />
            Associação manual
          </label>
          <strong>{pairs.length} conexões</strong>
        </div>
        {manual && (
          <div className="od-batch-manual">
            {rows.map((row, i) => (
              <div key={i}>
                {(["a", "b"] as const).map((side) => (
                  <label key={side}>
                    {side === "a" ? "Origem" : "Destino"} {i + 1}
                    <select
                      value={row[side]}
                      onChange={(e) => {
                        setRows((prev) =>
                          prev.map((r, j) =>
                            i === j ? { ...r, [side]: e.target.value } : r,
                          ),
                        );
                        setPreview(false);
                      }}
                    >
                      <option value="">Selecionar</option>
                      {(side === "a" ? a : b).map((id) => (
                        <option key={id} value={id}>
                          {endpointLabel(ports.get(id)!)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  aria-label={`Remover associação ${i + 1}`}
                  onClick={() => {
                    setRows(rows.filter((_, j) => i !== j));
                    setPreview(false);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setRows([...rows, { a: "", b: "" }]);
                setPreview(false);
              }}
            >
              Adicionar associação
            </button>
          </div>
        )}
        {preview && (
          <div className="od-batch-table">
            <table>
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Situação / tipo</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => {
                  const source = ports.get(p.a),
                    target = ports.get(p.b);
                  return (
                    <tr key={i}>
                      <td>
                        {source && (
                          <>
                            <i style={{ background: endpointColor(source) }} />
                            {endpointLabel(source)}
                          </>
                        )}
                      </td>
                      <td>
                        {target && (
                          <>
                            <i style={{ background: endpointColor(target) }} />
                            {endpointLabel(target)}
                          </>
                        )}
                      </td>
                      <td>
                        {source && target && (
                          <span
                            className="od-color-preview"
                            style={{
                              background: `linear-gradient(90deg, ${endpointColor(source)} 50%, ${endpointColor(target)} 50%)`,
                            }}
                          />
                        )}
                        {validation[i] ||
                          `Disponível · ${source?.port.fiberId && target?.port.fiberId ? "Fusão" : "Conector"}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p role="alert" className="od-batch-error">
            {error}
          </p>
        )}
        <footer>
          <p>
            Confirme o lote e use Salvar montagem para gravar tudo em uma única
            transação.
          </p>
          <button onClick={onClose}>Cancelar</button>
          <button
            onClick={() => {
              setError("");
              if (!pairs.length) {
                setError(
                  manual
                    ? "Adicione associações válidas."
                    : "Selecione a mesma quantidade de extremidades na origem e no destino.",
                );
                return;
              }
              setPreview(true);
            }}
          >
            Pré-visualizar
          </button>
          <button
            className="od-primary"
            disabled={!preview || !pairs.length || validation.some(Boolean)}
            onClick={() => onPreview(pairs)}
          >
            Confirmar conexões
          </button>
        </footer>
      </section>
    </div>
  );
}
