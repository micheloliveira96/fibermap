"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Plus,
  Search,
  MoreHorizontal,
  ArrowUpRight,
  Network,
  Sun,
  Moon,
  Upload,
  Download,
} from "lucide-react";
import { HelpLink } from "./help-link";
import { permissionLabels } from "@/lib/permissions";
import styles from "./projects.module.css";
type Project = {
  id: string;
  name: string;
  description: string;
  region: string;
  organizationName: string;
  updatedAt: string;
  createdAt: string;
  creatorName: string;
  equipmentCount: number;
  cableCount: number;
  status: string;
  version: number;
  restricted: boolean;
};
type AccessData = {
  project: Project;
  members: { id: string; name: string; role: string }[];
  grants: { membershipId: string; permissions: string[] }[];
};
const projectPermissions = [
  "projects.view",
  "projects.edit",
  "projects.rename",
  "projects.duplicate",
  "projects.archive",
  "projects.delete",
  "projects.export",
  "projects.access",
];
export default function Projects({ companyId }: { companyId?: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]),
    [permissions, setPermissions] = useState<string[]>([]),
    [company, setCompany] = useState(companyId ?? ""),
    [companyName, setCompanyName] = useState(""),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [trash, setTrash] = useState(false),
    [dark, setDark] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState<string | null>(null),
    [form, setForm] = useState<{
      kind: string;
      project?: Project;
      name: string;
      description: string;
      region: string;
      confirmation: string;
      latitude?: string;
      longitude?: string;
    } | null>(null),
    [access, setAccess] = useState<AccessData | null>(null),
    [loading, setLoading] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const request = useCallback(
    async (url: string, body?: unknown, method = body ? "POST" : "GET") => {
      const r = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(company ? { "x-organization-id": company } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "Operação indisponível.");
      return data;
    },
    [company],
  );
  const load = useCallback(async () => {
    try {
      const d = await request(`/api/projects${trash ? "?trash=1" : ""}`);
      setProjects(d.projects);
      setPermissions(d.permissions);
      setCompany(d.organizationId);
      setCompanyName(d.organizationName);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [request, trash]);
  useEffect(() => {
    let active = true;
    void request(`/api/projects${trash ? "?trash=1" : ""}`)
      .then((d) => {
        if (!active) return;
        setProjects(d.projects);
        setPermissions(d.permissions);
        setCompany(d.organizationId);
        setCompanyName(d.organizationName);
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, trash]);
  const can = (p: string) => permissions.includes(p);
  const open = (p: Project) =>
    router.push(
      `/?project=${encodeURIComponent(p.id)}&company=${encodeURIComponent(company)}`,
    );
  const action = (kind: string, p: Project) => {
    setMenu(null);
    setForm({
      kind,
      project: p,
      name: kind === "duplicate" ? `${p.name} - Cópia` : p.name,
      description: p.description,
      region: p.region,
      confirmation: "",
    });
  };
  async function exportProject(p: Project) {
    setBusy(true);
    try {
      const data = await request(`/api/projects/${p.id}?export=1`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `fibermap-${p.name.replace(/[^\p{L}\p{N}-]/gu, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = projects
    .filter(
      (p) =>
        (trash ? p.status === "DELETED" : p.status !== "DELETED") &&
        `${p.name} ${p.description} ${p.region}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <header>
        <a className={styles.brand} href="/projetos">
          <Network />
          FiberMap
        </a>
        <span>{companyName || "Seu espaço de rede"}</span>
        <div>
          <HelpLink />
          <button
            aria-label="Alternar tema dos projetos"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a href="/conta">Minha conta</a>
        </div>
      </header>
      <section className={styles.hero}>
        <div>
          <small>ESPAÇO DE TRABALHO</small>
          <h1>Meus Projetos</h1>
          <p>
            Organize suas redes em projetos independentes. Abra um projeto para
            trabalhar no mapa e nos diagramas.
          </p>
        </div>
        <div className={styles.actions}>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              setBusy(true);
              try {
                if (selected.size > 20000000)
                  throw Error("Limite de 20 MB por projeto.");
                const snapshot = JSON.parse(await selected.text());
                const name = window.prompt(
                  "Nome do novo projeto importado",
                  `${snapshot.project?.name ?? "Projeto"} - Importado`,
                );
                if (!name) return;
                const p = await request("/api/projects", {
                  action: "import",
                  snapshot,
                  name,
                });
                open(p);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
                if (file.current) file.current.value = "";
              }
            }}
          />
          <button
            disabled={busy || !can("network.import") || !can("projects.create")}
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Importar projeto JSON
          </button>
          <button
            className={styles.primary}
            disabled={busy || !can("projects.create")}
            onClick={() =>
              setForm({
                kind: "create",
                name: "",
                description: "",
                region: "",
                confirmation: "",
              })
            }
          >
            <Plus size={17} />
            Novo Projeto
          </button>
        </div>
      </section>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.filters}>
        <label>
          <Search size={17} />
          <input
            aria-label="Pesquisar projetos"
            placeholder="Pesquisar por nome, descrição ou região"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Ordenar projetos"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Última alteração</option>
          <option value="name">Nome</option>
          <option value="oldest">Mais antigos</option>
        </select>
        <button
          onClick={() => {
            setTrash(!trash);
            setMenu(null);
          }}
        >
          {trash ? "Voltar aos projetos" : "Lixeira"}
        </button>
      </div>
      <section className={styles.grid}>
        {filtered.map((p) => (
          <article className={styles.card} key={p.id}>
            <div className={styles.cardTop}>
              <FolderOpen size={26} />
              <span>
                {p.status === "ACTIVE"
                  ? "Ativo"
                  : p.status === "ARCHIVED"
                    ? "Arquivado"
                    : "Na lixeira"}
                {p.restricted ? " · Restrito" : ""}
              </span>
              <div className={styles.menuHost}>
                <button
                  aria-label={`Ações de ${p.name}`}
                  onClick={() => setMenu(menu === p.id ? null : p.id)}
                >
                  <MoreHorizontal />
                </button>
                {menu === p.id && (
                  <div className={styles.menu}>
                    {p.status !== "DELETED" && (
                      <>
                        <button
                          disabled={!can("projects.rename")}
                          onClick={() => action("rename", p)}
                        >
                          Renomear
                        </button>
                        <button
                          disabled={
                            !can("projects.duplicate") ||
                            !can("projects.create")
                          }
                          onClick={() => action("duplicate", p)}
                        >
                          Duplicar
                        </button>
                        <button
                          disabled={!can("projects.export")}
                          onClick={() => void exportProject(p)}
                        >
                          <Download size={13} />
                          Exportar JSON
                        </button>
                        <button
                          disabled={!can("projects.access")}
                          onClick={async () => {
                            setMenu(null);
                            try {
                              setAccess(
                                await request(`/api/projects/${p.id}/access`),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Gerenciar acesso
                        </button>
                      </>
                    )}
                    <button
                      disabled={!can("projects.archive")}
                      onClick={() =>
                        action(p.status === "ACTIVE" ? "archive" : "restore", p)
                      }
                    >
                      {p.status === "ACTIVE" ? "Arquivar" : "Restaurar"}
                    </button>
                    {p.status !== "DELETED" && (
                      <button
                        disabled={!can("projects.delete")}
                        onClick={() => action("delete", p)}
                      >
                        Excluir para a lixeira
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <h2>{p.name}</h2>
            <p>{p.description || "Sem descrição."}</p>
            <small>
              {p.organizationName}
              {p.region ? ` · ${p.region}` : ""}
            </small>
            <div className={styles.counts}>
              <span>
                <b>{p.equipmentCount}</b> equipamentos
              </span>
              <span>
                <b>{p.cableCount}</b> cabos
              </span>
            </div>
            <dl>
              <div>
                <dt>Responsável</dt>
                <dd>{p.creatorName}</dd>
              </div>
              <div>
                <dt>Criado</dt>
                <dd>{new Date(p.createdAt).toLocaleDateString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Última alteração</dt>
                <dd>{new Date(p.updatedAt).toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
            {p.status !== "DELETED" && (
              <button
                className={styles.open}
                disabled={busy}
                onClick={() => open(p)}
              >
                {p.status === "ARCHIVED"
                  ? "Consultar Projeto"
                  : "Abrir Projeto"}
                <ArrowUpRight size={17} />
              </button>
            )}
          </article>
        ))}
      </section>
      {!filtered.length && (
        <div className={styles.empty}>
          <FolderOpen size={42} />
          <h2>
            {loading
              ? "Carregando projetos…"
              : trash
                ? "A lixeira está vazia"
                : "Nenhum projeto encontrado"}
          </h2>
          <p>
            {loading
              ? "Verificando sua empresa e permissões."
              : "Crie um projeto vazio ou ajuste a pesquisa para começar."}
          </p>
        </div>
      )}
      {form && (
        <div className={styles.backdrop}>
          <form
            className={styles.dialog}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (form.kind === "create") {
                  const p = await request("/api/projects", {
                    name: form.name,
                    description: form.description,
                    region: form.region,
                    ...(form.latitude && form.longitude
                      ? {
                          view: {
                            camera: {
                              lat: Number(form.latitude),
                              lng: Number(form.longitude),
                              zoom: 14,
                            },
                          },
                        }
                      : {}),
                  });
                  open(p);
                  return;
                }
                const p = await request(
                  `/api/projects/${form.project!.id}`,
                  {
                    action: form.kind,
                    version: form.project!.version,
                    name: form.name,
                    confirm: form.confirmation,
                  },
                  "PATCH",
                );
                setForm(null);
                setNotice("Operação confirmada pelo servidor.");
                await load();
                if (form.kind === "duplicate") open(p);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>
              {
                {
                  create: "Novo Projeto",
                  rename: "Renomear projeto",
                  duplicate: "Duplicar projeto",
                  archive: "Arquivar projeto",
                  delete: "Excluir projeto",
                  restore: "Restaurar projeto",
                }[form.kind]
              }
            </h2>
            {["create", "rename", "duplicate"].includes(form.kind) ? (
              <label>
                Nome do projeto
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            ) : (
              <p>{form.project?.name}</p>
            )}
            {form.kind === "create" && (
              <>
                <label>
                  Descrição
                  <textarea
                    maxLength={3000}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Região / localidade
                  <input
                    maxLength={200}
                    value={form.region}
                    onChange={(e) =>
                      setForm({ ...form, region: e.target.value })
                    }
                  />
                </label>
                <p>
                  O projeto começa vazio e pertence à empresa {companyName}.
                  Você pode posicionar e salvar a vista inicial no mapa.
                </p>
                <details>
                  <summary>Posição inicial do mapa (opcional)</summary>
                  <label>
                    Latitude
                    <input
                      type="number"
                      step="any"
                      min={-85.05112878}
                      max={85.05112878}
                      required={!!form.longitude}
                      value={form.latitude ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, latitude: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      required={!!form.latitude}
                      value={form.longitude ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, longitude: e.target.value })
                      }
                    />
                  </label>
                </details>
              </>
            )}
            {form.kind === "delete" && (
              <>
                <p>
                  Os dados serão preservados na lixeira e poderão ser
                  restaurados. Digite o nome exato para confirmar.
                </p>
                <input
                  aria-label="Confirmar nome do projeto"
                  required
                  value={form.confirmation}
                  onChange={(e) =>
                    setForm({ ...form, confirmation: e.target.value })
                  }
                />
              </>
            )}
            {form.kind === "archive" && (
              <p>
                A rede será preservada e ficará disponível apenas para consulta
                até a restauração.
              </p>
            )}
            {form.kind === "duplicate" && (
              <p>
                A cópia receberá novos IDs para equipamentos, fibras, portas,
                conexões e diagramas. Não haverá vínculos com o original.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button className={styles.primary} disabled={busy}>
                {busy ? "Salvando…" : "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {access && (
        <div className={styles.backdrop}>
          <form
            className={`${styles.dialog} ${styles.wide}`}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await request(
                  `/api/projects/${access.project.id}`,
                  {
                    action: "access",
                    version: access.project.version,
                    restricted: access.project.restricted,
                    grants: access.grants.map((g) => ({
                      membershipId: g.membershipId,
                      permissions: g.permissions,
                    })),
                  },
                  "PATCH",
                );
                setAccess(null);
                await load();
                setNotice("Acessos atualizados.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Acesso a {access.project.name}</h2>
            {error && <p role="alert">{error}</p>}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={access.project.restricted}
                onChange={(e) =>
                  setAccess({
                    ...access,
                    project: {
                      ...access.project,
                      restricted: e.target.checked,
                    },
                  })
                }
              />
              Restringir a membros autorizados
            </label>
            <p>
              Proprietários e administradores da empresa mantêm acesso de
              gestão. As permissões abaixo limitam o projeto e não ampliam
              permissões do cargo.
            </p>
            {access.members.map((member) => (
              <fieldset key={member.id}>
                <legend>
                  {member.name} · {member.role}
                </legend>
                <div className={styles.grantGrid}>
                  {projectPermissions.filter(can).map((permission) => (
                    <label className={styles.check} key={permission}>
                      <input
                        type="checkbox"
                        checked={
                          access.grants
                            .find((g) => g.membershipId === member.id)
                            ?.permissions.includes(permission) ?? false
                        }
                        onChange={(e) => {
                          const old =
                            access.grants.find(
                              (g) => g.membershipId === member.id,
                            )?.permissions ?? [];
                          setAccess({
                            ...access,
                            grants: [
                              ...access.grants.filter(
                                (g) => g.membershipId !== member.id,
                              ),
                              {
                                membershipId: member.id,
                                permissions: e.target.checked
                                  ? [...old, permission]
                                  : old.filter((p) => p !== permission),
                              },
                            ],
                          });
                        }}
                      />
                      {permissionLabels[permission]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <footer>
              <button type="button" onClick={() => setAccess(null)}>
                Cancelar
              </button>
              <button disabled={busy} className={styles.primary}>
                Salvar acessos
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
