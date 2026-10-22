'use client';
import { useEffect, useState } from 'react';
import { Network, ShieldCheck } from 'lucide-react';
export default function SetupPage() {
  const [token, setToken] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  useEffect(() => { const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''; setToken(value); window.history.replaceState(null, '', '/setup'); }, []);
  return <main className="login"><form onSubmit={async e => {
    e.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('confirm')) { setError('As senhas precisam ser iguais.'); setBusy(false); return; }
    try {
      const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-setup-token': token }, body: JSON.stringify({ name: form.get('name'), organization: form.get('organization'), email: form.get('email'), password: form.get('password') }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setDone(true); setToken('');
    } catch (error) { setError((error as Error).message || 'Não foi possível concluir a configuração.'); } finally { setBusy(false); }
  }}><div className="brand"><span><Network /></span>FiberMap</div>{done ? <><ShieldCheck size={30} color="#109b8c" /><h1>Ambiente configurado</h1><p>Seu administrador e sua organização foram criados. Entre com o e-mail e a senha que você definiu.</p><a className="button primary" href="/login">Acessar FiberMap</a></> : <><h1>Configure seu ambiente</h1><p>Crie o primeiro administrador. Este link é privado, expira e funciona uma única vez.</p>{!token && <p role="alert">Abra o link completo de configuração fornecido pelo responsável pelo ambiente.</p>}<label>Seu nome<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label><label>Organização<input name="organization" autoComplete="organization" minLength={2} maxLength={140} required /></label><label>E-mail<input name="email" type="email" autoComplete="username" required /></label><label>Senha (mínimo 12 caracteres)<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label>Confirme a senha<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>{error && <p role="alert">{error}</p>}<button className="primary" disabled={busy || !token}>{busy ? 'Configurando…' : 'Criar administrador'}</button></>}</form></main>;
}
