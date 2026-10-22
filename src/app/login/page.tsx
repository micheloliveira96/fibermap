"use client";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { Network } from "lucide-react";
const client = createAuthClient();
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const result = await client.signIn.email({
              email: String(form.get("email")),
              password: String(form.get("password")),
            });
            if (result.error)
              setError("Não foi possível entrar. Confira suas credenciais.");
            else window.location.assign("/");
          } catch {
            setError("Serviço indisponível. Confira a configuração do banco.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">
          <span>
            <Network />
          </span>
          FiberMap
        </div>
        <h1>Entrar no FiberMap</h1>
        <p>Já tem cadastro? Entre com o e-mail e a senha da sua conta.</p>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar na plataforma"}
        </button>
        <small>Contas e permissões são provisionadas pelo administrador.</small>
      </form>
    </main>
  );
}
