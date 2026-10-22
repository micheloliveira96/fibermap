"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import {
  allPermissions,
  permissionGroups,
  permissionLabels,
  roleLabels,
  levels,
} from "@/lib/permissions";
import type { Role } from "@prisma/client";
import "./administration.css";
type Row = Record<string, any>;
const emptyProfile = {
  legalName: "",
  taxId: "",
  country: "Brasil",
  email: "",
  phone: "",
  address: "",
  city: "",
  region: "",
  postalCode: "",
  logo: "",
};
const profileLabels: Record<string, string> = {
  legalName: "Razão social",
  taxId: "CNPJ / NIF",
  country: "País",
  email: "E-mail",
  phone: "Telefone",
  address: "Endereço",
  city: "Cidade",
  region: "Estado / região",
  postalCode: "Código postal",
};
const licenseDefault = {
  planId: null,
  status: "TRIAL",
  expiresAt: "",
  maxUsers: 3,
  maxProjects: 10,
  maxStorageBytes: 1073741824,
  features: allPermissions,
  expiryPolicy: "READ_ONLY",
  billingStatus: "MANUAL",
};
const planDefault = {
  name: "",
  description: "",
  priceCents: 0,
  currency: "BRL",
  period: "MONTHLY",
  maxUsers: 3,
  maxProjects: 10,
  maxStorageBytes: 1073741824,
  features: allPermissions,
  active: true,
};
const statusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Em teste",
  EXPIRED: "Vencida",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  MANUAL: "Controle manual",
  PAID: "Pago",
  PENDING: "Pendente",
  OVERDUE: "Em atraso",
};
const date = (s: any) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "Sem vencimento";
const money = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    cents / 100,
  );
function LicenseSummary({ license }: { license: Row }) {
  const expired = license.expiresAt && new Date(license.expiresAt) < new Date();
  return (
    <div className="saas-callout">
      <strong>
        {expired
          ? "Licença vencida"
          : statusLabels[license.status] || license.status}
      </strong>{" "}
      · {license.plan?.name || "Licença legada sem contrato comercial"}
      <p>
        Vencimento: {date(license.expiresAt)} · {license.maxUsers} usuários ·{" "}
        {license.maxProjects} projetos ·{" "}
        {(license.maxStorageBytes / 1048576).toFixed(0)} MB de arquivos
      </p>
      <small>
        Cobrança: {statusLabels[license.billingStatus] || license.billingStatus}
        . Não há cobrança automática por cartão.
      </small>
    </div>
  );
}
function PermissionFields({
  value,
  onChange,
  allowed = allPermissions,
  delegable = false,
}: {
  value: string[];
  onChange: (p: string[]) => void;
  allowed?: string[];
  delegable?: boolean;
}) {
  return (
    <div className="saas-permissions">
      {Object.entries(permissionGroups).map(([group, perms]) => (
        <fieldset key={group}>
          <legend>
            {delegable ? "Pode delegar · " : ""}
            {group}
          </legend>
          {perms.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={value.includes(p)}
                disabled={!allowed.includes(p)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, p]
                      : value.filter((x) => x !== p),
                  )
                }
              />
              {permissionLabels[p]}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
function ProfileFields({
  value,
  onChange,
}: {
  value: Row;
  onChange: (p: Row) => void;
}) {
  return (
    <>
      <div className="saas-grid">
        {Object.entries(profileLabels).map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              value={value[k] || ""}
              maxLength={k === "address" ? 250 : 200}
              type={k === "email" ? "email" : "text"}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Logotipo (PNG, JPEG ou WebP até 100 KB)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 100 * 1024) {
              alert("Use uma imagem de até 100 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              onChange({ ...value, logo: String(reader.result) });
            reader.readAsDataURL(f);
          }}
        />
      </label>
      {value.logo && (
        <div>
          <img
            className="saas-logo"
            src={value.logo}
            alt="Logotipo da empresa"
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, logo: "" })}
          >
            Remover logotipo
          </button>
        </div>
      )}
    </>
  );
}
function LimitFields({
  value,
  onChange,
}: {
  value: Row;
  onChange: (p: Row) => void;
}) {
  return (
    <div className="saas-grid">
      {[
        ["maxUsers", "Limite de usuários"],
        ["maxProjects", "Limite de projetos"],
      ].map(([k, label]) => (
        <label key={k}>
          {label}
          <input
            type="number"
            min={k === "maxUsers" ? 1 : 0}
            max={100000}
            required
            value={value[k]}
            onChange={(e) =>
              onChange({ ...value, [k]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <label>
        Armazenamento de arquivos (MB)
        <input
          type="number"
          min="0"
          max="9500000"
          value={value.maxStorageBytes / 1048576}
          step="any"
          required
          onChange={(e) =>
            onChange({
              ...value,
              maxStorageBytes: Math.round(Number(e.target.value) * 1048576),
            })
          }
        />
      </label>
    </div>
  );
}
function LicenseFields({
  value,
  onChange,
  plans,
}: {
  value: Row;
  onChange: (p: Row) => void;
  plans: Row[];
}) {
  return (
    <>
      <div className="saas-grid">
        <label>
          Plano contratado
          <select
            required
            value={value.planId || ""}
            onChange={(e) => {
              const p = plans.find((p) => p.id === e.target.value);
              if (p)
                onChange({
                  ...value,
                  planId: p.id,
                  maxUsers: p.maxUsers,
                  maxProjects: p.maxProjects,
                  maxStorageBytes: p.maxStorageBytes,
                  features: p.features,
                });
            }}
          >
            <option value="">Selecione um plano</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
          >
            {["ACTIVE", "TRIAL", "EXPIRED", "SUSPENDED", "CANCELED"].map(
              (s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Vencimento
          <input
            type="datetime-local"
            value={
              value.expiresAt
                ? new Date(
                    new Date(value.expiresAt).getTime() -
                      new Date(value.expiresAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(e) =>
              onChange({
                ...value,
                expiresAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
          />
        </label>
        <label>
          Após o vencimento
          <select
            value={value.expiryPolicy}
            onChange={(e) =>
              onChange({ ...value, expiryPolicy: e.target.value })
            }
          >
            <option value="READ_ONLY">Permitir somente consulta</option>
            <option value="BLOCK">Bloquear acesso</option>
          </select>
        </label>
        <label>
          Situação da cobrança
          <select
            value={value.billingStatus}
            onChange={(e) =>
              onChange({ ...value, billingStatus: e.target.value })
            }
          >
            {["MANUAL", "PAID", "PENDING", "OVERDUE", "CANCELED"].map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LimitFields value={value} onChange={onChange} />
      <details>
        <summary>Recursos contratados</summary>
        <PermissionFields
          value={value.features}
          onChange={(features) => onChange({ ...value, features })}
        />
        <small>
          Sem restrições selecionadas: todos os recursos disponíveis. Permissões
          do usuário continuam obrigatórias.
        </small>
      </details>
    </>
  );
}
function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <div className="saas-table">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Ação</th>
            <th>Autor / empresa</th>
            <th>Recurso e detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.createdAt).toLocaleString("pt-BR")}</td>
              <td>
                {a.action}
                <small>{a.result || "SUCCESS"}</small>
              </td>
              <td>
                {a.actorId}
                <small>{a.organizationId || "Plataforma"}</small>
              </td>
              <td>
                <details>
                  <summary>{a.entityId}</summary>
                  <pre>{JSON.stringify(a.detail, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="saas-empty">Nenhuma atividade encontrada.</p>
      )}
    </div>
  );
}
function subscribeTheme(fn: () => void) {
  window.addEventListener("storage", fn);
  return () => window.removeEventListener("storage", fn);
}
export default function Administration({
  platform = false,
  resource = "dashboard",
}: {
  platform?: boolean;
  resource?: string;
}) {
  const router=useRouter();
  const [data, setData] = useState<Row | null>(null),
    [plans, setPlans] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [form, setForm] = useState<Row>({}),
    [detail, setDetail] = useState<Row | null>(null),
    [inviteUrl, setInviteUrl] = useState("");
  const base = platform ? "/admin/plataforma" : "/empresa/administracao";
  const api = useCallback(
    (res = resource, params = "") =>
      `/api/administracao?scope=${platform ? "platform" : "company"}&resource=${res}${params}`,
    [platform, resource],
  );
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => localStorage.getItem("fibermap-admin-theme") === "dark",
    () => false,
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError("");
      void fetch(
        api(
          resource,
          `&q=${encodeURIComponent(q)}&status=${status}&page=${page}`,
        ),
      )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, resource, q, status, page, refresh]);
  useEffect(() => {
    if (platform && ["companies", "plans"].includes(resource))
      fetch(api("plans"))
        .then((r) => r.json())
        .then((d) => setPlans(d.items || []));
  }, [platform, resource, api, refresh]);
  async function submit(op: string, values: Row = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(api(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op, ...values }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setNotice(d.message || "Alteração salva.");
      if (d.inviteUrl) setInviteUrl(d.inviteUrl);
      setModal("");
      setRefresh((x) => x + 1);
      if (detail?.company?.id) await openCompany(detail.company.id);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openCompany(id: string) {
    setBusy(true);
    try {
      const r = await fetch(api("companies", `&id=${id}`)),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(type: string, row?: Row) {
    setModal(type);
    setSelected(row || null);
    setError("");
    if (type === "plan") setForm(row ? { ...row } : { ...planDefault });
    if (type === "company.create")
      setForm({
        name: "",
        profile: { ...emptyProfile },
        ownerName: "",
        ownerEmail: "",
        license: { ...licenseDefault },
      });
    if (type === "company.save")
      setForm({
        name: row?.name,
        profile: { ...emptyProfile, ...row?.profile },
      });
    if (type === "license") setForm({ ...licenseDefault, ...row });
    if (type === "owner") setForm({ name: "", email: "" });
    if (type === "invite" || type === "user.save")
      setForm(
        row
          ? {
              name: row.user.name,
              email: row.user.email,
              role: row.role,
              permissions: row.effectivePermissions,
              delegable: row.delegable,
            }
          : {
              name: "",
              email: "",
              role: "VIEWER",
              permissions: ["map.view", "network.view", "projects.view"],
              delegable: [],
            },
      );
  }
  const me = data?.me,
    allowed = me?.delegable || [],
    can = (p: string) =>
      Boolean((data?.permissions || me?.permissions || []).includes(p));
  const titles: Record<string, string> = {
    dashboard: platform ? "Visão da plataforma" : "Minha empresa",
    companies: "Empresas",
    plans: "Planos comerciais",
    users: "Usuários e permissões",
    audits: "Auditoria",
    settings: "Configurações",
  };
  const links = platform
    ? [
        ["dashboard", "Visão geral", ""],
        ["companies", "Empresas", "/empresas"],
        ["plans", "Planos e licenças", "/planos"],
        ["audits", "Auditoria", "/auditoria"],
        ["settings", "Configurações", "/configuracoes"],
      ]
    : [
        ["dashboard", "Minha empresa", ""],
        ["users", "Usuários", "/usuarios"],
        ["audits", "Auditoria", "/auditoria"],
      ];

  return (
    <main className={`saas ${dark ? "saas-dark" : ""}`}>
      <aside className="saas-sidebar">
        <a className="saas-brand" href={base}>
          ◈ FiberMap
        </a>
        <small>
          {platform
            ? "ADMINISTRAÇÃO DA PLATAFORMA"
            : "ADMINISTRAÇÃO DA EMPRESA"}
        </small>
        <nav>
          {links.map(([key, label, path]) => (
            <a
              key={key}
              aria-current={resource === key ? "page" : undefined}
              href={base + path}
            >
              {label}
            </a>
          ))}
        </nav>
        <a href="/">Abrir mapa óptico ↗</a>
        <button
          onClick={() => {
            localStorage.setItem(
              "fibermap-admin-theme",
              dark ? "light" : "dark",
            );
            window.dispatchEvent(new Event("storage"));
          }}
        >
          Modo {dark ? "claro" : "escuro"}
        </button>
        <button
          onClick={async () => {
            await createAuthClient().signOut();
            router.replace("/login");
          }}
        >
          Sair da conta
        </button>
      </aside>
      <section className="saas-main">
        <header>
          <div>
            <small>
              {platform ? "CONTROLE COMERCIAL" : "AMBIENTE PRIVADO"}
            </small>
            <h1>{titles[resource]}</h1>
          </div>
          <div className="saas-actions">
            <button onClick={() => history.back()}>Voltar</button>
            <a href={base}>Painel inicial</a>
          </div>
        </header>
        {error && (
          <div className="saas-alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="saas-success" role="status">
            {notice}
          </div>
        )}
        {inviteUrl && (
          <div className="saas-callout">
            <strong>Link de acesso de uso único · válido por 48 horas</strong>
            <p>
              Entregue somente ao destinatário. O link não será exibido
              novamente.
            </p>
            <textarea readOnly value={inviteUrl} />
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(inviteUrl)
                  .then(() => setNotice("Link copiado."))
              }
            >
              Copiar link
            </button>
            <button onClick={() => setInviteUrl("")}>Ocultar</button>
          </div>
        )}
        {!data && !error && <p role="status">Carregando informações…</p>}
        {data &&
          resource === "dashboard" &&
          (platform ? (
            <>
              <div className="saas-cards">
                {[
                  ["companies", "Empresas cadastradas"],
                  ["active", "Empresas ativas"],
                  ["suspended", "Empresas suspensas"],
                  ["expired", "Licenças vencidas"],
                  ["expiring", "Vencem em 30 dias"],
                  ["trials", "Em período de teste"],
                  ["users", "Vínculos de usuários"],
                  ["activeUsers", "Vínculos ativos"],
                  ["projects", "Projetos"],
                  ["assets", "Elementos da rede"],
                ].map(([key, label]) => (
                  <article key={key}>
                    <span>{label}</span>
                    <strong>{data[key] ?? 0}</strong>
                  </article>
                ))}
              </div>
              <div className="saas-grid">
                <article className="saas-panel">
                  <h2>Situação das empresas</h2>
                  {[
                    ["Ativas", data.active],
                    ["Suspensas", data.suspended],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <p>
                        {label}: {n}
                      </p>
                      <div className="saas-bar">
                        <span
                          style={{
                            width: `${data.companies ? (Number(n) / data.companies) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </article>
                <article className="saas-panel">
                  <h2>Receita mensal cadastrada</h2>
                  {Object.entries(data.revenue || {}).map(([c, v]) => (
                    <p key={c}>{money(v as number, c)}</p>
                  ))}
                  {!Object.keys(data.revenue || {}).length && (
                    <p>Sem contratos ativos com preço cadastrado.</p>
                  )}
                  <small>
                    Valor contratual equivalente mensal, separado por moeda. Não
                    representa pagamentos recebidos.
                  </small>
                  <h3>Planos contratados</h3>
                  {(data.contracts || []).map((c: Row, i: number) => (
                    <p key={i}>
                      {c.name} · {statusLabels[c.status]}
                    </p>
                  ))}
                </article>
              </div>
            </>
          ) : (
            <>
              <section className="saas-panel">
                <h2>{data.company.name}</h2>
                {data.company.profile?.logo && (
                  <img
                    className="saas-logo"
                    src={data.company.profile.logo}
                    alt="Logo da empresa"
                  />
                )}
                <LicenseSummary license={data.company.license} />
                <div className="saas-cards">
                  {[
                    ["users", "Usuários cadastrados"],
                    ["activeUsers", "Usuários ativos"],
                    ["projects", "Projetos"],
                  ].map(([k, l]) => (
                    <article key={k}>
                      <span>{l}</span>
                      <strong>{data.usage[k]}</strong>
                    </article>
                  ))}
                  <article>
                    <span>Arquivos importados</span>
                    <strong>
                      {(data.usage.storageBytes / 1048576).toFixed(2)} MB
                    </strong>
                  </article>
                </div>
                <h3>Recursos de rede</h3>
                {data.usage.assets.map((a: Row) => (
                  <span className="saas-badge" key={a.kind}>
                    {a.kind}: {a._count}
                  </span>
                ))}
                {!data.usage.assets.length && (
                  <p>Nenhum elemento cadastrado.</p>
                )}
                {can("company.edit") && (
                  <button onClick={() => open("company.save", data.company)}>
                    Editar dados da empresa
                  </button>
                )}
              </section>
              {can("audit.view") && (
                <>
                  <h2>Atividades recentes</h2>
                  <AuditTable rows={data.audits || []} />
                </>
              )}
            </>
          ))}
        {data && ["companies", "users", "audits"].includes(resource) && (
          <div className="saas-toolbar">
            <label>
              Pesquisar
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  resource === "audits" ? "Ação registrada" : "Nome ou e-mail"
                }
              />
            </label>
            {resource !== "audits" && (
              <label>
                Situação
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="SUSPENDED">Suspensos</option>
                </select>
              </label>
            )}
            {resource === "companies" && (
              <button
                className="saas-primary"
                onClick={() => open("company.create")}
              >
                Cadastrar empresa
              </button>
            )}
            {resource === "users" && can("users.create") && (
              <button className="saas-primary" onClick={() => open("invite")}>
                Convidar usuário
              </button>
            )}
          </div>
        )}
        {data && resource === "companies" && (
          <>
            <div className="saas-table">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Situação</th>
                    <th>Plano / validade</th>
                    <th>Utilização</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((c: Row) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <small>{c.profile?.taxId}</small>
                      </td>
                      <td>{statusLabels[c.status]}</td>
                      <td>
                        {c.license?.plan?.name || "Licença legada"}
                        <small>{date(c.license?.expiresAt)}</small>
                      </td>
                      <td>
                        {c._count.memberships} usuários · {c._count.projects}{" "}
                        projetos
                      </td>
                      <td>
                        <button onClick={() => openCompany(c.id)}>
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items?.length && (
                <p className="saas-empty">Nenhuma empresa encontrada.</p>
              )}
            </div>
            {detail && (
              <section className="saas-panel">
                <div className="saas-actions">
                  <h2>{detail.company.name}</h2>
                  <button onClick={() => setDetail(null)}>
                    Fechar detalhes
                  </button>
                </div>
                <p>
                  ID: {detail.company.id} · Cadastro:{" "}
                  {date(detail.company.createdAt)}
                </p>
                <p>
                  {detail.company.profile?.legalName} ·{" "}
                  {detail.company.profile?.taxId} ·{" "}
                  {detail.company.profile?.email}
                </p>
                <LicenseSummary license={detail.company.license} />
                <p>
                  {detail.usage.users} usuários · {detail.usage.projects}{" "}
                  projetos · {(detail.usage.storageBytes / 1048576).toFixed(2)}{" "}
                  MB em arquivos
                </p>
                <div className="saas-actions">
                  <button onClick={() => open("company.save", detail.company)}>
                    Editar cadastro
                  </button>
                  <button
                    onClick={() =>
                      open("license", {
                        ...detail.company.license,
                        id: detail.company.id,
                      })
                    }
                  >
                    Gerenciar / renovar licença
                  </button>
                  <button
                    onClick={() => open("owner", { id: detail.company.id })}
                  >
                    Redefinir proprietário
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const active = detail.company.status === "ACTIVE";
                      if (
                        confirm(
                          `${active ? "Suspender" : "Reativar"} o acesso da empresa ${detail.company.name}? Os dados serão preservados.`,
                        )
                      )
                        void submit("company.status", {
                          id: detail.company.id,
                          status: active ? "SUSPENDED" : "ACTIVE",
                        });
                    }}
                  >
                    {detail.company.status === "ACTIVE"
                      ? "Suspender empresa"
                      : "Reativar empresa"}
                  </button>
                </div>
                <h3>Usuários vinculados</h3>
                {detail.company.memberships.map((m: Row) => (
                  <p key={m.id}>
                    {m.user.name} · {m.user.email} ·{" "}
                    {roleLabels[m.role as Role]} ·{" "}
                    {m.active ? "Ativo" : "Suspenso"}
                  </p>
                ))}
                <h3>Histórico administrativo</h3>
                <AuditTable rows={detail.audits} />
              </section>
            )}
          </>
        )}
        {data && resource === "plans" && (
          <>
            <button className="saas-primary" onClick={() => open("plan")}>
              Novo plano
            </button>
            <div className="saas-grid">
              {(data.items || []).map((p: Row) => (
                <article className="saas-panel" key={p.id}>
                  <h2>{p.name}</h2>
                  <p>{p.description}</p>
                  <strong>
                    {money(p.priceCents, p.currency)} /{" "}
                    {p.period === "YEARLY" ? "ano" : "mês"}
                  </strong>
                  <p>
                    {p.maxUsers} usuários · {p.maxProjects} projetos ·{" "}
                    {(p.maxStorageBytes / 1048576).toFixed(0)} MB
                  </p>
                  <p>{p.active ? "Ativo" : "Inativo"}</p>
                  <button onClick={() => open("plan", p)}>Editar plano</button>
                </article>
              ))}
            </div>
            {!data.items?.length && (
              <p className="saas-empty">
                Nenhum plano cadastrado. Crie seu primeiro plano comercial.
              </p>
            )}
          </>
        )}
        {data && resource === "users" && (
          <>
            <div className="saas-table">
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Cargo / situação</th>
                    <th>Último login</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((u: Row) => {
                    const lower =
                      me &&
                      me.id !== u.id &&
                      levels[me.role as Role] < levels[u.role as Role];
                    return (
                      <tr key={u.id}>
                        <td>
                          {u.user.name}
                          <small>{u.user.email}</small>
                        </td>
                        <td>
                          {roleLabels[u.role as Role]} ·{" "}
                          {u.active ? "Ativo" : "Suspenso"}
                          <small>
                            {u.effectivePermissions.length} permissões efetivas
                          </small>
                        </td>
                        <td>
                          {u.user.lastLoginAt
                            ? new Date(u.user.lastLoginAt).toLocaleString(
                                "pt-BR",
                              )
                            : "Sem login registrado"}
                        </td>
                        <td>
                          {lower && (
                            <div className="saas-actions">
                              {can("users.edit") &&
                                can("users.permissions") && (
                                  <button onClick={() => open("user.save", u)}>
                                    Editar permissões
                                  </button>
                                )}
                              {can("users.suspend") && (
                                <>
                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `${u.active ? "Suspender" : "Reativar"} ${u.user.name}?`,
                                        )
                                      )
                                        void submit("user.status", {
                                          id: u.id,
                                          active: !u.active,
                                        });
                                    }}
                                  >
                                    {u.active ? "Suspender" : "Reativar"}
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `Encerrar as sessões de ${u.user.name}?`,
                                        )
                                      )
                                        void submit("user.sessions", {
                                          id: u.id,
                                        });
                                    }}
                                  >
                                    Revogar sessões
                                  </button>
                                </>
                              )}
                              {can("users.edit") && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Gerar link de redefinição para ${u.user.email}?`,
                                      )
                                    )
                                      void submit("user.reset", { id: u.id });
                                  }}
                                >
                                  Redefinir senha
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!data.items?.length && (
                <p className="saas-empty">Nenhum usuário encontrado.</p>
              )}
            </div>
            <h2>Convites pendentes</h2>
            <p>
              Convites novos reservam vagas por 48 horas. Contas suspensas
              continuam ocupando vagas.
            </p>
            {data.invitations.map((i: Row) => (
              <div className="saas-callout" key={i.id}>
                {i.name} · {i.email} · {roleLabels[i.role as Role]} · Validade:{" "}
                {date(i.expiresAt)}
                {can("users.create") && i.role !== "OWNER" && (
                  <button
                    onClick={() => {
                      if (confirm("Revogar este convite?"))
                        void submit("invitation.revoke", { id: i.id });
                    }}
                  >
                    Revogar convite
                  </button>
                )}
              </div>
            ))}
          </>
        )}
        {data && resource === "audits" && (
          <>
            <AuditTable rows={data.items || []} />
            {data.network && (
              <>
                <h2>Alterações da rede (20 mais recentes)</h2>
                <AuditTable rows={data.network} />
              </>
            )}
          </>
        )}
        {data && resource === "settings" && (
          <form
            className="saas-panel"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit("settings", {
                id: "global",
                data: {
                  name: String(f.get("name")),
                  supportEmail: String(f.get("email")),
                },
              });
            }}
          >
            <h2>Identidade e suporte</h2>
            <label>
              Nome da plataforma
              <input name="name" required defaultValue={data.name} />
            </label>
            <label>
              E-mail de suporte
              <input
                name="email"
                type="email"
                defaultValue={data.supportEmail}
              />
            </label>
            <button className="saas-primary" disabled={busy}>
              Salvar configurações
            </button>
          </form>
        )}
        {data && ["companies", "users", "audits"].includes(resource) && (
          <div className="saas-actions">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              Página {page} · {data.total || 0} registros
            </span>
            <button
              disabled={page * 20 >= (data.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        )}
        {modal && (
          <div className="saas-overlay">
            <section
              className="saas-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Cadastro administrativo"
            >
              <button className="saas-close" onClick={() => setModal("")}>
                Fechar
              </button>
              <h2>
                {
                  {
                    plan: "Plano comercial",
                    "company.create": "Cadastrar empresa",
                    "company.save": "Dados da empresa",
                    license: "Gerenciar licença",
                    owner: "Redefinir proprietário",
                    invite: "Convidar usuário",
                    "user.save": "Permissões do usuário",
                  }[modal]
                }
              </h2>
              {error && (
                <p className="saas-alert" role="alert">
                  {error}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    ["license", "owner", "user.save"].includes(modal) &&
                    !confirm("Confirmar esta alteração administrativa?")
                  )
                    return;
                  let values: Row = {
                    data: form,
                    ...(selected?.id ? { id: selected.id } : {}),
                  };
                  if (modal === "license")
                    values = {
                      id: detail?.company.id,
                      data: { ...form, expiresAt: form.expiresAt || null },
                    };
                  if (modal === "company.create")
                    values = {
                      data: {
                        ...form,
                        license: {
                          ...form.license,
                          expiresAt: form.license.expiresAt || null,
                        },
                      },
                    };
                  if (modal === "owner")
                    values = { id: detail?.company.id, data: form };
                  if (modal === "company.save" && !platform)
                    values = { data: form.profile };
                  void submit(modal, values);
                }}
              >
                {modal === "plan" && (
                  <>
                    <label>
                      Nome
                      <input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                      />
                    </label>
                    <div className="saas-grid">
                      <label>
                        Preço
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={form.priceCents / 100}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              priceCents: Math.round(
                                Number(e.target.value) * 100,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Moeda
                        <select
                          value={form.currency}
                          onChange={(e) =>
                            setForm({ ...form, currency: e.target.value })
                          }
                        >
                          {["BRL", "EUR", "USD"].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Periodicidade
                        <select
                          value={form.period}
                          onChange={(e) =>
                            setForm({ ...form, period: e.target.value })
                          }
                        >
                          <option value="MONTHLY">Mensal</option>
                          <option value="YEARLY">Anual</option>
                        </select>
                      </label>
                    </div>
                    <LimitFields value={form} onChange={setForm} />
                    <label>
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) =>
                          setForm({ ...form, active: e.target.checked })
                        }
                      />{" "}
                      Plano ativo
                    </label>
                    <h3>Recursos habilitados</h3>
                    <PermissionFields
                      value={form.features}
                      onChange={(features) => setForm({ ...form, features })}
                    />
                    <small>
                      Contratos existentes mantêm seus limites até uma alteração
                      explícita da licença.
                    </small>
                  </>
                )}
                {["company.create", "company.save"].includes(modal) && (
                  <>
                    {platform && (
                      <label>
                        Nome fantasia
                        <input
                          required
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <ProfileFields
                      value={form.profile}
                      onChange={(profile) => setForm({ ...form, profile })}
                    />
                  </>
                )}
                {modal === "company.create" && (
                  <>
                    <h3>Proprietário e licença</h3>
                    <label>
                      Nome do proprietário
                      <input
                        required
                        value={form.ownerName}
                        onChange={(e) =>
                          setForm({ ...form, ownerName: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      E-mail do proprietário
                      <input
                        type="email"
                        required
                        value={form.ownerEmail}
                        onChange={(e) =>
                          setForm({ ...form, ownerEmail: e.target.value })
                        }
                      />
                    </label>
                    <LicenseFields
                      value={form.license}
                      onChange={(license) => setForm({ ...form, license })}
                      plans={plans.filter((p) => p.active)}
                    />
                  </>
                )}
                {modal === "license" && (
                  <LicenseFields
                    value={form}
                    onChange={setForm}
                    plans={plans}
                  />
                )}
                {modal === "owner" && (
                  <>
                    <p>
                      O proprietário atual permanece responsável até a aceitação
                      do novo convite. Ao aceitar, ele perde os poderes de
                      proprietário e suas sessões são encerradas.
                    </p>
                    <label>
                      Nome
                      <input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      E-mail
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                {["invite", "user.save"].includes(modal) && (
                  <>
                    <label>
                      Nome
                      <input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </label>
                    {modal === "invite" && (
                      <label>
                        E-mail
                        <input
                          required
                          type="email"
                          value={form.email}
                          onChange={(e) =>
                            setForm({ ...form, email: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Cargo
                      <select
                        value={form.role}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            role: e.target.value,
                            permissions: form.permissions.filter(
                              (p: string) =>
                                e.target.value !== "VIEWER" ||
                                p.endsWith(".view"),
                            ),
                            delegable: [],
                          })
                        }
                      >
                        {Object.entries(roleLabels)
                          .filter(
                            ([r]) =>
                              r !== "OWNER" &&
                              levels[r as Role] > levels[me.role as Role],
                          )
                          .map(([r, l]) => (
                            <option key={r} value={r}>
                              {l}
                            </option>
                          ))}
                      </select>
                    </label>
                    <h3>Permissões individuais</h3>
                    <PermissionFields
                      value={form.permissions}
                      allowed={allowed.filter(
                        (p: string) =>
                          form.role !== "VIEWER" || p.endsWith(".view"),
                      )}
                      onChange={(permissions) =>
                        setForm({
                          ...form,
                          permissions,
                          delegable: form.delegable.filter((p: string) =>
                            permissions.includes(p),
                          ),
                        })
                      }
                    />
                    <details>
                      <summary>
                        Permissões que este usuário poderá delegar
                      </summary>
                      <PermissionFields
                        delegable
                        value={form.delegable}
                        allowed={form.permissions.filter((p: string) =>
                          allowed.includes(p),
                        )}
                        onChange={(delegable) =>
                          setForm({ ...form, delegable })
                        }
                      />
                    </details>
                  </>
                )}
                <button className="saas-primary" disabled={busy}>
                  {busy
                    ? "Salvando…"
                    : modal === "invite" || modal === "owner"
                      ? "Gerar convite seguro"
                      : "Salvar"}
                </button>
              </form>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
