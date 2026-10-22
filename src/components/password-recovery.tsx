"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { NewPasswordFields } from "./password-field";
import "./password-fields.css";
function RecoveryForm({
  emailRecoveryEnabled,
}: {
  emailRecoveryEnabled: boolean;
}) {
  const token = useSearchParams().get("token") || "";
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  if (done)
    return (
      <main className="login">
        <section className="auth-card" aria-labelledby="password-saved">
          <CheckCircle2 size={36} color="#109b8c" aria-hidden="true" />
          <h1 id="password-saved">Senha atualizada</h1>
          <p role="status">
            Sua nova senha foi salva. Agora entre com o e-mail da sua conta e
            essa senha.
          </p>
          <a className="button primary" href="/login">
            Entrar no FiberMap
          </a>
        </section>
      </main>
    );
  if (!token && !emailRecoveryEnabled)
    return (
      <main className="login">
        <section className="auth-card">
          <h1>Recuperar acesso</h1>
          <p>
            A recuperação por e-mail ainda não está configurada neste ambiente.
          </p>
          <p>
            Solicite ao administrador um link seguro para redefinir sua senha.
            Não é necessário cadastrar um e-mail de recuperação depois de criar
            sua senha.
          </p>
          <a className="button primary" href="/login">
            Voltar ao login
          </a>
        </section>
      </main>
    );
  return (
    <main className="login">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          if (token && f.get("password") !== f.get("passwordConfirmation")) {
            setMessage("As senhas não coincidem.");
            return;
          }
          setBusy(true);
          setMessage("");
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
            if (token) {
              setDone(true);
              window.history.replaceState(null, "", "/recuperar");
            } else
              setMessage(
                "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.",
              );
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>{token ? "Nova senha" : "Recuperar acesso"}</h1>
        {token ? (
          <NewPasswordFields />
        ) : (
          <label>
            E-mail da conta
            <input name="email" type="email" required autoComplete="email" />
          </label>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Aguarde…" : token ? "Salvar senha" : "Solicitar recuperação"}
        </button>
        {message && <p role="alert">{message}</p>}
        <a href="/login">Voltar ao login</a>
      </form>
    </main>
  );
}
export default function PasswordRecovery(props: {
  emailRecoveryEnabled: boolean;
}) {
  return (
    <Suspense fallback={<main className="login">Carregando…</main>}>
      <RecoveryForm {...props} />
    </Suspense>
  );
}
