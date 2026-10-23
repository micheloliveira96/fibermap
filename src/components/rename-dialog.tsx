"use client";
import { useState } from "react";
import { useProjectRequest } from "./project-context";
import styles from "./rename-dialog.module.css";
export type RenameTarget = {
  id: string;
  name: string;
  version: number;
  adapter?: boolean;
};
export function RenameDialog({
  target,
  diagramId,
  revision,
  onClose,
  onSaved,
  onSubmit,
}: {
  target: RenameTarget;
  diagramId?: string;
  revision?: string;
  onClose: () => void;
  onSaved?: (result: any) => void;
  onSubmit?: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(target.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useProjectRequest();
  return (
    <div className={styles.backdrop}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Renomear componente"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const next = name.trim();
            if (!next) throw Error("Informe um nome.");
            if (onSubmit) await onSubmit(next);
            else
              onSaved?.(
                await request(
                  target.adapter
                    ? `/api/adapters/${target.id}`
                    : `/api/assets/${target.id}/rename`,
                  { name: next, version: target.version, diagramId, revision },
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
        <h2>Renomear</h2>
        <p>
          Atualize o nome mantendo os identificadores, as coordenadas e as
          conexões.
        </p>
        <label>
          Novo nome
          <input
            autoFocus
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <button disabled={busy}>{busy ? "Salvando…" : "Salvar nome"}</button>
        </footer>
      </form>
    </div>
  );
}
