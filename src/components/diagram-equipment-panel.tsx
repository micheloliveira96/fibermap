"use client";
import { useState } from "react";
import {
  type ComponentCreate,
  type DiagramAsset,
  type DiagramDraft,
} from "@/lib/diagram-types";
export function DiagramEquipmentPanel({
  equipment,
  assets,
  draft,
  commit,
  onError,
  canCreate,
}: {
  equipment: DiagramAsset;
  assets: DiagramAsset[];
  draft: DiagramDraft;
  commit: (change: (d: DiagramDraft) => DiagramDraft) => void;
  onError: (message: string) => void;
  canCreate: boolean;
}) {
  const [existing, setExisting] = useState(""),
    [kind, setKind] = useState<ComponentCreate["kind"]>(
      equipment.kind === "POP" ? "OLT" : "PATCHCORD",
    ),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [ports, setPorts] = useState(12),
    [fibers, setFibers] = useState(1),
    [manufacturer, setManufacturer] = useState(""),
    [model, setModel] = useState(""),
    [chassis, setChassis] = useState(""),
    [slots, setSlots] = useState(1),
    [perSlot, setPerSlot] = useState(8),
    [drop, setDrop] = useState(""),
    [customer, setCustomer] = useState(""),
    [end, setEnd] = useState<"A" | "B">("A"),
    [color, setColor] = useState("Azul");
  const compatible = assets.filter(
    (a) =>
      !draft.components?.includes(a.id) &&
      !draft.componentCreates?.some((c) => c.id === a.id) &&
      (!a.parentId || a.parentId === equipment.id) &&
      [
        "SPLITTER",
        "PATCHCORD",
        ...(equipment.kind === "POP" ? ["OLT", "DIO"] : []),
        ...(equipment.kind === "CTO" ? ["CUSTOMER"] : []),
      ].includes(a.kind),
  );
  return (
    <>
      <h3>Equipamentos existentes</h3>
      <label>
        Componente
        <select value={existing} onChange={(e) => setExisting(e.target.value)}>
          <option value="">Selecionar equipamento do projeto</option>
          {compatible.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name} ({a.kind === "CUSTOMER" ? "Cliente" : a.kind})
            </option>
          ))}
        </select>
      </label>
      <button
        className="od-wide"
        disabled={!existing}
        onClick={() => {
          commit((d) => {
            (d.components ??= []).push(existing);
            return d;
          });
          setExisting("");
        }}
      >
        Adicionar ao diagrama
      </button>
      {equipment.kind === "CTO" && (
        <>
          <h3>Cliente e cabo drop</h3>
          <label>
            Cliente cadastrado
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">Selecionar cliente</option>
              {assets
                .filter((a) => a.kind === "CUSTOMER")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Cabo drop existente
            <select value={drop} onChange={(e) => setDrop(e.target.value)}>
              <option value="">Selecionar drop do projeto</option>
              {assets
                .filter((a) => a.kind === "DROP")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.fibers.length} fibras
                  </option>
                ))}
            </select>
          </label>
          <label>
            Ponta na CTO
            <select
              value={end}
              onChange={(e) => setEnd(e.target.value as "A" | "B")}
            >
              <option value="A">A · início do drop</option>
              <option value="B">B · fim do drop</option>
            </select>
          </label>
          <button
            className="od-wide"
            disabled={!drop || !customer}
            onClick={() => {
              const previous = draft.accesses.find((a) => a.cableId === drop);
              if (previous?.end === "MID") {
                onError(
                  "Um acesso de sangria não pode virar as duas pontas de um drop.",
                );
                return;
              }
              commit((d) => {
                if (!d.components?.includes(customer))
                  (d.components ??= []).push(customer);
                const a = d.accesses.find((a) => a.cableId === drop);
                if (a) {
                  a.bothEnds = true;
                  a.remoteAssetId = customer;
                } else
                  d.accesses.push({
                    id: crypto.randomUUID(),
                    cableId: drop,
                    end,
                    fraction: end === "A" ? 0 : 1,
                    fiberStates: {},
                    bothEnds: true,
                    remoteAssetId: customer,
                  });
                return d;
              });
            }}
          >
            Vincular drop ao cliente
          </button>
          <small>
            As duas pontas reais do drop ficam disponíveis. Conecte a ponta da
            CTO ao acoplador e a outra à terminação do cliente. Para cadastrar
            um novo drop ou cliente, use o mapa deste projeto.
          </small>
        </>
      )}
      <h3>
        {equipment.kind === "POP" ? "Instalar no POP" : "Cordão / pigtail"}
      </h3>
      <label>
        Componente
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ComponentCreate["kind"])}
        >
          {equipment.kind === "POP" && (
            <>
              <option value="OLT">OLT</option>
              <option value="DIO">DIO</option>
            </>
          )}
          <option value="PATCHCORD">Cordão óptico / pigtail</option>
        </select>
      </label>
      <label>
        Código
        <input
          maxLength={80}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={
            kind === "OLT" ? "OLT-01" : kind === "DIO" ? "DIO-01" : "CORD-01"
          }
        />
      </label>
      <label>
        Nome do componente
        <input
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {kind === "OLT" ? (
        <>
          <label>
            Slots
            <input
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
              type="number"
              min={1}
              max={128}
              value={perSlot}
              onChange={(e) => setPerSlot(Number(e.target.value))}
            />
          </label>
          <label>
            Chassi / estrutura
            <input
              maxLength={160}
              value={chassis}
              onChange={(e) => setChassis(e.target.value)}
            />
          </label>
          <small>
            {slots * perSlot} portas PON de documentação física, sem comunicação
            com a OLT.
          </small>
        </>
      ) : kind === "DIO" ? (
        <label>
          Adaptadores (frente e traseira)
          <input
            type="number"
            list="od-dio-capacities"
            min={1}
            max={2880}
            value={ports}
            onChange={(e) => setPorts(Number(e.target.value))}
          />
          <datalist id="od-dio-capacities">
            {[12, 24, 48, 72, 96].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
      ) : (
        <>
          <label>
            Fibras do cordão / pigtail
            <input
              type="number"
              min={1}
              max={2880}
              value={fibers}
              onChange={(e) => setFibers(Number(e.target.value))}
            />
          </label>
          <label>
            Primeira cor / padrão de fibras
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Azul,Laranja,Verde"
            />
          </label>
          <small>
            O cordão é um cabo real interno, com fibras e duas pontas. Use a cor
            efetiva do componente instalado.
          </small>
        </>
      )}
      {kind !== "PATCHCORD" && (
        <>
          <label>
            Fabricante (opcional)
            <input
              maxLength={200}
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
          </label>
          <label>
            Modelo (opcional)
            <input
              maxLength={160}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        </>
      )}
      <button
        className="od-wide"
        disabled={!canCreate || !name.trim() || !code.trim()}
        onClick={() => {
          const count = kind === "OLT" ? slots * perSlot : ports;
          if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 2880 ||
            !Number.isInteger(fibers) ||
            fibers < 1 ||
            fibers > 2880
          ) {
            onError("Informe uma capacidade válida, de 1 a 2880.");
            return;
          }
          const component: ComponentCreate = {
            id: crypto.randomUUID(),
            name: name.trim(),
            code: code.trim(),
            kind,
            ports: count,
            fiberCount: fibers,
            manufacturer,
            model,
            chassis,
            ...(kind === "OLT"
              ? { slotCount: slots, portsPerSlot: perSlot }
              : {}),
            colorPattern: color
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          };
          commit((d) => {
            (d.componentCreates ??= []).push(component);
            (d.components ??= []).push(component.id);
            if (kind === "PATCHCORD")
              d.accesses.push({
                id: crypto.randomUUID(),
                cableId: component.id,
                end: "A",
                fraction: 0,
                fiberStates: {},
                bothEnds: true,
              });
            return d;
          });
          setName("");
          setCode("");
        }}
      >
        Adicionar {kind === "PATCHCORD" ? "cordão / pigtail" : kind}
      </button>
    </>
  );
}
