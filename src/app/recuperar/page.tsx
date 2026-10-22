"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
function RecoveryForm() {
  const params = useSearchParams(),
    router = useRouter(),
    token = params.get("token") || "";
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          const f = new FormData(e.currentTarget);
          try {
            const r = await fetch(
              token
                ? "/api/auth/reset-password"
                : "/api/auth/request-password-reset",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  token
                    ? { token, newPassword: String(f.get("password")) }
                    : {
                        email: String(f.get("email")),
                        redirectTo: location.origin + "/recuperar",
                      },
                ),
              },
            );
            const d = await r.json();
            if (!r.ok) throw Error(d.message || "Operação indisponível.");
            setMessage(
              token
                ? "Senha redefinida. Entre com sua nova senha."
                : "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.",
            );
            if (token) {
              router.replace("/recuperar");
            }
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>{token ? "Nova senha" : "Recuperar acesso"}</h1>
        {token ? (
          <label>
            Senha
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
        ) : (
          <label>
            E-mail
            <input name="email" type="email" required autoComplete="email" />
          </label>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Aguarde…" : token ? "Salvar senha" : "Solicitar recuperação"}
        </button>
        {message && <p role="status">{message}</p>}
        <p>
          <a href="/login">Voltar ao login</a>
        </p>
        <small>
          Se o envio de e-mails não estiver configurado, solicite um link seguro
          ao administrador.
        </small>
      </form>
    </main>
  );
}

export default function Recovery() {
  return (
    <Suspense fallback={<main className="login">Carregando…</main>}>
      <RecoveryForm />
    </Suspense>
  );
}
