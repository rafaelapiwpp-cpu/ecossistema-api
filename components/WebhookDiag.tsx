"use client";
import { useEffect, useState } from "react";
import { Pill } from "./Pill";
import type { Diagnosis } from "@/lib/webhook-diag";

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default function WebhookDiag({ demo, master = true }: { demo: boolean; master?: boolean }) {
  const [d, setD] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    setBusy("check"); setMsg(null);
    try {
      const r = await fetch("/api/webhook/diag", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falhou");
      setD(j);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(null);
  }
  async function act(action: "configure_app" | "subscribe_wabas") {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch("/api/webhook/diag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falhou");
      if (j.diagnosis) setD(j.diagnosis);
      const fails = (j.results || []).filter((x: any) => !x.ok);
      setMsg(fails.length ? { ok: false, text: `${fails.length} conta(s) não puderam ser inscritas: ${fails.map((f: any) => `${f.name || f.id} (${f.error})`).join("; ")}` }
        : { ok: true, text: action === "configure_app" ? "Webhook configurado no app da Meta." : "Todas as contas inscritas." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(null);
  }
  useEffect(() => { if (!demo) check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (demo) return <p className="sub">Disponível depois de conectar o banco.</p>;

  const app = d?.app; const ev = d?.events; const tk = d?.token;
  const appTone = !app ? "neutral" : app.error ? "critical" : !app.configured ? "critical" : !app.matches ? "serious" : app.missing_fields.length ? "warning" : app.active === false ? "warning" : "good";
  const appText = !app ? "…" : app.error ? "Não foi possível consultar" : !app.configured ? "Sem webhook configurado no app" : !app.matches ? "Configurado para outro endereço" : app.missing_fields.length ? `Faltam campos: ${app.missing_fields.join(", ")}` : app.active === false ? "Configurado, mas inativo" : "Configurado para este sistema";
  const wabasOk = d ? d.wabas.filter((w) => w.subscribed).length : 0;
  const wabasTone = !d ? "neutral" : !d.wabas.length ? "warning" : wabasOk === d.wabas.length ? "good" : wabasOk ? "warning" : "critical";
  const tokenTone = !tk ? "neutral" : tk.error || tk.valid === false ? "critical" : tk.missing_scopes.length ? "serious" : "good";
  const sigProblem = Boolean(ev && ev.last24h.invalid_signature > 0 && ev.last24h.messages === 0 && ev.last24h.other === 0);
  const eventsTone = !ev ? "neutral" : sigProblem ? "critical" : ev.last24h.invalid_signature ? "warning" : ev.last_at ? "good" : "warning";

  return (
    <div className="diag">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <button className="btn" onClick={check} disabled={busy !== null}>{busy === "check" ? "Verificando…" : "Verificar agora"}</button>
        {d && <span className="muted" style={{ fontSize: 12 }}>Conferido às {fmt(d.checked_at)}</span>}
        {msg && <span className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
      </div>

      <div className="diag-row">
        <div className="diag-head"><Pill tone={appTone}>{appText}</Pill><b>1. Webhook do app da Meta</b></div>
        {app && (
          <div className="diag-body">
            {app.callback_url && <div className="sub" style={{ margin: "4px 0" }}>URL atual: <span className="code" style={{ padding: "1px 6px" }}>{app.callback_url}</span>{app.fields.length > 0 && <> · campos: {app.fields.join(", ")}</>}</div>}
            {app.error && <div className="err">{app.error}</div>}
            {app.available && (!app.configured || !app.matches || app.missing_fields.length > 0 || app.active === false) && (master
              ? <button className="btn primary" onClick={() => act("configure_app")} disabled={busy !== null}>{busy === "configure_app" ? "Configurando…" : "Configurar o webhook automaticamente"}</button>
              : <div className="sub">Peça ao Master para configurar o webhook do app.</div>)}
          </div>
        )}
      </div>

      <div className="diag-row">
        <div className="diag-head"><Pill tone={wabasTone}>{d ? `${wabasOk} de ${d.wabas.length} conta(s) inscrita(s)` : "…"}</Pill><b>2. Contas (WABAs) inscritas no app</b></div>
        {d && (
          <div className="diag-body">
            {!d.wabas.length && <div className="sub">Nenhuma conta sincronizada ainda — rode "Sincronizar agora".</div>}
            <ul className="steps" style={{ marginTop: 4 }}>
              {d.wabas.map((w) => (
                <li key={w.id}>
                  <b>{w.name || w.id}</b> — {w.error ? <span className="err">{w.error}</span> : w.subscribed ? <span className="ok">inscrita</span> : <span className="err">não inscrita</span>}
                  {w.apps.length > 0 && <span className="muted"> · apps que recebem os eventos: {w.apps.map((a) => a.name || a.id).join(", ")}</span>}
                </li>
              ))}
            </ul>
            {d.wabas.length > 0 && wabasOk < d.wabas.length && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => act("subscribe_wabas")} disabled={busy !== null}>{busy === "subscribe_wabas" ? "Inscrevendo…" : "Inscrever todas as contas"}</button>
            )}
          </div>
        )}
      </div>

      <div className="diag-row">
        <div className="diag-head"><Pill tone={tokenTone}>{!tk ? "…" : tk.error ? "Não foi possível conferir" : tk.valid === false ? "Token inválido" : tk.missing_scopes.length ? `Sem permissão: ${tk.missing_scopes.join(", ")}` : "Token válido"}</Pill><b>3. Token da conexão</b></div>
        {tk && (
          <div className="diag-body sub" style={{ margin: 0 }}>
            {tk.error ? <span className="err">{tk.error}</span> : <>
              {tk.app_name && <>App: {tk.app_name} · </>}{tk.type && <>tipo {tk.type} · </>}expira: {tk.expires_at === "never" ? "nunca" : fmt(tk.expires_at)}
              {tk.scopes.length > 0 && <> · permissões: {tk.scopes.join(", ")}</>}
            </>}
          </div>
        )}
      </div>

      <div className="diag-row">
        <div className="diag-head"><Pill tone={eventsTone}>{!ev ? "…" : sigProblem ? `${ev.last24h.invalid_signature} evento(s) rejeitado(s) por assinatura` : ev.last_at ? `Último evento ${fmt(ev.last_at)}` : "Nenhum evento recebido ainda"}</Pill><b>4. Eventos que chegaram aqui</b></div>
        {ev && (
          <div className="diag-body">
            {sigProblem && <div className="err" style={{ marginBottom: 6 }}>Chamadas estão chegando a este endereço, mas a assinatura não confere: a <b>chave secreta do app</b> salva no Ecossistema (Configurações ou Conexões) está diferente da do app.</div>}
            {!sigProblem && ev.last24h.invalid_signature > 0 && <div className="sub" style={{ marginBottom: 6 }}>{ev.last24h.invalid_signature} chamada(s) com assinatura inválida nas últimas 24 h foram ignoradas (normal quando alguém testa o endereço por fora).</div>}
            <div className="kv" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              <div><b>{ev.last24h.inbound}</b><span>mensagens recebidas (24 h)</span></div>
              <div><b>{ev.last24h.statuses}</b><span>status de envio (24 h)</span></div>
              <div><b>{ev.total.conversations}</b><span>conversas no Atendimento</span></div>
              <div><b>{ev.total.external_messages}</b><span>mensagens de outras ferramentas</span></div>
            </div>
            {ev.recent.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table>
                  <thead><tr><th>Quando</th><th>Evento</th><th>Detalhe</th></tr></thead>
                  <tbody>{ev.recent.map((r, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{fmt(r.received_at)}</td><td>{r.field}</td><td className="muted">{r.summary}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="sub" style={{ marginTop: 12 }}>
        A API da Meta não guarda nem devolve histórico: o Atendimento passa a mostrar as conversas a partir do momento em que o webhook está configurado e as contas inscritas.
        Mensagens enviadas por outras ferramentas chegam só como status (entregue/lida), sem o texto. O que a equipe manda pelo app do celular (número em coexistência) chega com o texto, desde que o campo <code>smb_message_echoes</code> esteja ligado nos Webhooks do app da Meta. Para testar, mande uma mensagem de um celular para um dos números e clique em "Verificar agora".
      </p>
    </div>
  );
}
