"use client";
import { useState } from "react";
import type { DiagramAsset } from "@/lib/diagram-types";
import { useProjectRequest } from "./project-context";
import styles from "./rename-dialog.module.css";
export function PortConfigDialog({
  asset,
  diagramId,
  revision,
  onSaved,
  onClose,
}: {
  asset: DiagramAsset;
  diagramId: string;
  revision: string;
  onSaved: (value: any) => void;
  onClose: () => void;
}) {
  const metadata =
    asset.metadata && typeof asset.metadata === "object"
      ? (asset.metadata as Record<string, unknown>)
      : {};
  const count =
    asset.kind === "OLT"
      ? asset.terminals.length
      : (asset.internalLinks?.length ?? asset.terminals.length / 2);
  const [ports, setPorts] = useState(count),
    [slots, setSlots] = useState(Number(metadata.slotCount ?? 1)),
    [perSlot, setPerSlot] = useState(Number(metadata.portsPerSlot ?? count)),
    [model, setModel] = useState(String(metadata.model ?? "")),
    [chassis, setChassis] = useState(String(metadata.chassis ?? "")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useProjectRequest();
  return (
    <div className={styles.backdrop}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Configurar portas"
        className={styles.dialog}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onSaved(
              await request(
                `/api/assets/${asset.id}/ports`,
                {
                  ports: asset.kind === "OLT" ? slots * perSlot : ports,
                  slotCount: slots,
                  portsPerSlot: perSlot,
                  model,
                  chassis,
                  version: asset.version,
                  diagramId,
                  revision,
                },
                "PATCH",
              ),
            );
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Configurar {asset.code}</h2>
        <p>
          As portas existentes mantêm os mesmos identificadores e conexões. A
          redução de capacidade é bloqueada.
        </p>
        {asset.kind === "OLT" ? (
          <>
            <label>
              Slots
              <input
                required
                type="number"
                min={1}
                max={128}
                value={slots}
                onChange={(e) => setSlots(Number(e.target.value))}
              />
            </label>
            <label>
              Portas PON por slot
              <input
                required
                type="number"
                min={1}
                max={128}
                value={perSlot}
                onChange={(e) => setPerSlot(Number(e.target.value))}
              />
            </label>
            <label>
              Chassi
              <input
                maxLength={160}
                value={chassis}
                onChange={(e) => setChassis(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            {asset.kind === "CTO"
              ? "Quantidade de acopladores"
              : "Quantidade de adaptadores"}
            <input
              required
              type="number"
              min={count}
              max={2880}
              value={ports}
              onChange={(e) => setPorts(Number(e.target.value))}
            />
          </label>
        )}
        <label>
          Modelo
          <input
            maxLength={160}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar portas"}
          </button>
        </footer>
      </form>
    </div>
  );
}
