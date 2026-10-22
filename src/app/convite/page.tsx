"use client";
import { useState, useEffect } from "react";
import { NewPasswordFields } from "@/components/password-field";
export default function Invitation() {
  const [info, setInfo] = useState<{
      name: string;
      email: string;
      purpose: string;
      existing: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    fetch("/api/convites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, inspect: true }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setInfo(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          if (
            f.get("password") &&
            f.get("password") !== f.get("passwordConfirmation")
          ) {
            setError("As senhas não coincidem.");
            setBusy(false);
            return;
          }
          const token = new URLSearchParams(location.search).get("token");
          try {
            const r = await fetch("/api/convites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token,
                ...(f.get("password")
                  ? { password: String(f.get("password")) }
                  : {}),
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            history.replaceState(null, "", "/convite");
            setDone(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>
          {done
            ? "Acesso configurado"
            : info?.purpose === "RESET"
              ? "Redefinir senha"
              : "Seu acesso ao FiberMap"}
        </h1>
        {done ? (
          <>
            <p>Você já pode entrar com seu e-mail e senha.</p>
            <a href="/login">Ir para o login</a>
          </>
        ) : (
          <>
            {info && (
              <>
                <p>
                  {info.name} · {info.email}
                </p>
                {info.existing && info.purpose !== "RESET" ? (
                  <p>
                    Você já possui conta.{" "}
                    <a href="/login" target="_blank">
                      Entre com sua senha atual
                    </a>{" "}
                    e depois confirme este convite.
                  </p>
                ) : (
                  <NewPasswordFields />
                )}
                <button className="primary" disabled={busy}>
                  {busy ? "Salvando…" : "Confirmar acesso"}
                </button>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        )}
      </form>
    </main>
  );
}
