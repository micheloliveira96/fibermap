"use client";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./password-fields.css";
type Props = {
  label?: string;
  name?: string;
  autoComplete?: "current-password" | "new-password";
  minLength?: number;
  onInput?: (event: React.FormEvent<HTMLInputElement>) => void;
  invalid?: boolean;
  describedBy?: string;
};
export function PasswordField({
  label = "Senha",
  name = "password",
  autoComplete = "current-password",
  minLength,
  onInput,
  invalid,
  describedBy,
}: Props) {
  const id = useId(),
    [visible, setVisible] = useState(false);
  return (
    <div className="auth-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-input">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          onInput={onInput}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          aria-label={`${visible ? "Ocultar" : "Mostrar"} ${name === "passwordConfirmation" ? "confirmação de senha" : label.toLocaleLowerCase("pt-BR")}`}
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
export function NewPasswordFields() {
  const [mismatch, setMismatch] = useState(false),
    description = useId();
  function validate(event: React.FormEvent<HTMLInputElement>) {
    const form = event.currentTarget.form;
    const password = form?.elements.namedItem(
        "password",
      ) as HTMLInputElement | null,
      confirmation = form?.elements.namedItem(
        "passwordConfirmation",
      ) as HTMLInputElement | null;
    if (!password || !confirmation) return;
    const different = Boolean(
      confirmation.value && password.value !== confirmation.value,
    );
    confirmation.setCustomValidity(
      different
        ? "As senhas não coincidem. Digite a mesma senha nos dois campos."
        : "",
    );
    setMismatch(different);
  }
  return (
    <>
      <PasswordField
        label="Nova senha"
        autoComplete="new-password"
        minLength={12}
        onInput={validate}
      />
      <PasswordField
        label="Confirmar senha"
        name="passwordConfirmation"
        autoComplete="new-password"
        minLength={12}
        onInput={validate}
        invalid={mismatch}
        describedBy={description}
      />
      <p
        id={description}
        className={mismatch ? "auth-password-error" : undefined}
        role={mismatch ? "alert" : undefined}
      >
        {mismatch
          ? "As senhas não coincidem. Digite a mesma senha nos dois campos."
          : "Use pelo menos 12 caracteres e repita a senha para confirmar."}
      </p>
    </>
  );
}
