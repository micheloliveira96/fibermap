"use client";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";
export default function Account() {
  const router = useRouter();
  const [data, setData] = useState<{
    name?: string;
    platform?: boolean;
    permissions?: string[];
    blocked?: boolean;
    error?: string;
  } | null>(null);
  useEffect(() => {
    fetch("/api/conta")
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return;
        }
        setData(await r.json());
      })
      .catch(() => setData({ error: "Serviço indisponível." }));
  }, [router]);
  return (
    <main className="login">
      <section>
        <h1>Minha conta FiberMap</h1>
        {!data ? (
          <p>Carregando…</p>
        ) : (
          <>
            <p>{data.name}</p>
            {data.error && <p role="alert">{data.error}</p>}
            {data.platform && (
              <p>
                <a href="/admin/plataforma">Administração da plataforma</a>
              </p>
            )}
            {!data.blocked && (
              <>
                <p>
                  <a href="/">Abrir mapa óptico</a>
                </p>
                {data.permissions?.some((p) =>
                  [
                    "users.view",
                    "company.edit",
                    "license.view",
                    "audit.view",
                  ].includes(p),
                ) && (
                  <p>
                    <a href="/empresa/administracao">
                      Administração da empresa
                    </a>
                  </p>
                )}
              </>
            )}
            <button
              onClick={async () => {
                await createAuthClient().signOut();
                router.replace("/login");
              }}
            >
              Sair
            </button>
          </>
        )}
      </section>
    </main>
  );
}
