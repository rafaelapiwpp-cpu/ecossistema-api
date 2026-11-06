"use client";
// Conexões: cada BM (portfólio) num cartão, com as contas e os números dentro.
// Master: cria, edita (token, app, quem vê), testa, liga/desliga e remove. Administradores e gestores: veem as da Equipe,
// sincronizam e dão apelido aos números. O token nunca volta inteiro para a tela.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Nav";
import PhoneProfileButton from "./PhoneProfile";
import { invalidateCatalog } from "@/lib/catalog-client";
import { fmtDateTime, fmtInt, LIMIT_LABEL, QUALITY_LABEL } from "@/lib/format";
import WatchSwitch from "./WatchSwitch";

type Phone = {
  id: string; waba_id: string; display_phone_number: string | null; verified_name: string | null; quality_rating: string | null;
  messaging_limit: string | null; status: string | null; name_status: string | null; label: string | null;
  /** este usuário acompanha o número na Visão geral */
  watched?: boolean;
};
type Waba = { id: string; name: string | null; currency: string | null; ownership: string | null; connection_id: number | null; templates: { approved: number; pending: number; rejected: number }; phones: Phone[] };
type Vis = "private" | "team";
type Conn = {
  id: number; name: string; kind: string; business_id: string | null; business_name: string | null; description?: string | null; visibility: Vis; active: boolean;
  status: string | null; last_error: string | null; last_sync_at: string | null; token_hint?: string; app_id?: string | null; has_app_secret?: boolean; waba_ids?: string | null;
  source_connection_id?: number | null;
  wabas: Waba[];
};
type LogLine = { step: string; ok: boolean; info?: string; conn?: number };
type Data = {
  me: { master: boolean; admin: boolean; role: string };
  connections: Conn[]; unlinked: Waba[];
  last_sync: { at: string; problems: LogLine[] } | null;
  webhook: { url: string; verify_token: string; main_app_id: string | null } | null;
};
type DiscPhone = { id: string; display_phone_number: string | null; verified_name: string | null; quality_rating: string | null; status: string | null };
type DiscWaba = { id: string; name: string | null; currency: string | null; phones: DiscPhone[]; current: { connection_id: number; name: string | null; visibility: string | null } | null };
type DiscGroup = { owner: { id: string; name: string }; source: { id: number; name: string }; existing: { id: number; name: string; visibility: string } | null; wabas: DiscWaba[] };
type Discovery = { ok: boolean; groups: DiscGroup[]; errors: string[]; sources: { id: number; name: string }[] };
type XferCheck = { id: string; name: string | null; ok: boolean; error?: string };
type XferCandidate = { id: number; name: string; visibility: Vis; active: boolean; source: { id: number | null; name: string | null }; wabas: XferCheck[]; ready: boolean };
type XferReport = { ok: boolean; target: { id: number; name: string; business_id: string | null; app_id: string | null }; candidates: XferCandidate[] };
type XferResult = XferReport & { moved: { id: number; name: string; wabas: number }[]; skipped: { id: number; name: string; reason: string }[]; sync: { ok: boolean; log: LogLine[] } | null };
type TestResult = {
  ok: boolean; total_wabas: number; errors: string[];
  token: { valid: boolean | null; type: string | null; app_name: string | null; expires_at: string | null; scopes: string[]; missing_scopes: string[]; error?: string };
  business: { id: string; name: string | null } | null;
  wabas: { id: string; name: string | null; ownership: string; phones: { id: string; display_phone_number: string | null; verified_name: string | null; quality_rating: string | null; status: string | null }[]; other: { name: string | null; visibility: string | null } | null }[];
};

async function api<T = any>(body?: any): Promise<T> {
  const r = await fetch("/api/conexoes", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j as T;
}

const VIS: Record<Vis, { label: string; icon: string; text: string }> = {
  private: { label: "Só Master", icon: "lock", text: "Conversas, contatos, disparos e números desta BM aparecem só para você." },
  team: { label: "Equipe", icon: "users", text: "Administradores, gestores e atendentes também veem e usam esta BM." },
};

function ago(iso: string | null) {
  if (!iso) return "nunca sincronizada";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "sincronizada agora";
  if (s < 3600) return `sincronizada há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `sincronizada há ${Math.floor(s / 3600)} h`;
  return `sincronizada em ${fmtDateTime(iso)}`;
}

function state(c: Conn): { tone: string; label: string } {
  if (!c.active) return { tone: "neutral", label: "Desligada" };
  if (c.status === "error") return { tone: "critical", label: "Com erro" };
  if (c.status === "warning") return { tone: "warning", label: "Atenção" };
  if (c.status === "ok") return { tone: "good", label: "Conectada" };
  return { tone: "neutral", label: "Aguardando sincronização" };
}

const phonesOf = (c: Conn) => c.wabas.flatMap((w) => w.phones);
const syncSummary = (log: LogLine[]) => {
  const bad = log.filter((l) => !l.ok).length;
  return bad ? `Sincronizado com ${bad} aviso(s)` : "Sincronizado — tudo certo";
};

function Badge({ v }: { v: Vis }) {
  return <span className={`cx-badge ${v}`}><Icon name={VIS[v].icon} size={12} className="" />{VIS[v].label}</span>;
}

function Quality({ q }: { q: string | null }) {
  return <span className={`cx-q ${q || "UNKNOWN"}`}><i aria-hidden />{QUALITY_LABEL[q || "UNKNOWN"] || q}</span>;
}

/** Alerta no estilo iOS (confirmações). */
function Confirm({ title, text, ok, danger, onOk, onCancel }: { title: string; text: string; ok: string; danger?: boolean; onOk: () => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <div className="cx-alert-back" onClick={onCancel}>
      <div className="cx-alert" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="cx-alert-body"><b>{title}</b><p>{text}</p></div>
        <div className="cx-alert-btns">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="button" className={danger ? "danger" : "strong"} onClick={onOk} autoFocus>{ok}</button>
        </div>
      </div>
    </div>
  );
}

export default function Connections() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | Vis>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ id: number | "new"; tab?: SheetTab } | null>(null);
  const [disc, setDisc] = useState(false);
  const [xfer, setXfer] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [ask, setAsk] = useState<null | { title: string; text: string; ok: string; danger?: boolean; run: () => void }>(null);

  const load = useCallback(() => api<Data>().then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3800); return () => clearTimeout(t); }, [toast]);
  const changed = useCallback(async () => { invalidateCatalog(); await load(); }, [load]);

  const master = !!d?.me.master;
  const conns = d?.connections || [];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return conns.filter((c) => (tab === "all" || c.visibility === tab) && (!needle
      || [c.name, c.business_name, c.business_id, ...c.wabas.map((w) => w.name), ...phonesOf(c).flatMap((p) => [p.display_phone_number, p.verified_name, p.label])]
        .some((x) => (x || "").toLowerCase().includes(needle))));
  }, [conns, tab, q]);
  const totals = useMemo(() => {
    const phones = conns.flatMap(phonesOf);
    return {
      conns: conns.length, wabas: conns.reduce((a, c) => a + c.wabas.length, 0), phones: phones.length,
      attention: conns.filter((c) => c.active && (c.status === "error" || c.status === "warning")).length,
      errors: conns.filter((c) => c.active && c.status === "error").length,
    };
  }, [conns]);

  const sync = async (c: Conn) => {
    setSyncing(c.id);
    try { const r = await api<{ ok: boolean; log: LogLine[] }>({ action: "sync", id: c.id }); setToast({ text: `${c.name}: ${syncSummary(r.log)}`, bad: !r.ok }); await changed(); }
    catch (e: any) { setToast({ text: e.message, bad: true }); }
    finally { setSyncing(null); }
  };
  const toggle = (c: Conn) => {
    const go = async () => {
      setD((x) => x && { ...x, connections: x.connections.map((y) => (y.id === c.id ? { ...y, active: !c.active } : y)) });
      try { await api({ action: "toggle", id: c.id, active: !c.active }); setToast({ text: c.active ? `${c.name} desligada` : `${c.name} ligada` }); await changed(); }
      catch (e: any) { setToast({ text: e.message, bad: true }); await load(); }
    };
    if (c.active) setAsk({ title: `Desligar ${c.name}?`, text: "Os envios por esta BM (atendimento, disparos e fluxos) ficam bloqueados até você ligar de novo. Nada é apagado.", ok: "Desligar", danger: true, run: go });
    else go();
  };

  const current = open && open.id !== "new" ? conns.find((c) => c.id === open.id) || null : null;

  return (
    <div className="cx">
      <div className="cx-head">
        <div>
          <h1>Conexões</h1>
          <p>{master ? "Cada BM entra com o token do usuário do sistema — sem login do Facebook. Você decide quem vê cada uma." : "BMs da equipe conectadas à API oficial do WhatsApp."}</p>
        </div>
        <div className="cx-tools">
          {master && (
            <div className="cx-seg" role="tablist" aria-label="Filtrar conexões">
              {([["all", "Todas"], ["private", "Só Master"], ["team", "Equipe"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {k !== "all" && <Icon name={VIS[k].icon} size={13} className="" />}{l}<span className="n">{k === "all" ? conns.length : conns.filter((c) => c.visibility === k).length}</span>
                </button>
              ))}
            </div>
          )}
          <label className="cx-search"><Icon name="search" size={16} className="" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar BM, conta ou número…" aria-label="Buscar conexões" /></label>
          {master && <button className="btn primary" onClick={() => setOpen({ id: "new" })}><Icon name="plus" size={16} className="" />Nova conexão</button>}
        </div>
      </div>

      {err && <div className="banner err">{err}</div>}

      {d && (
        <div className="cx-stats">
          <div className="cx-stat"><b>{fmtInt(totals.conns)}</b><span>{totals.conns === 1 ? "conexão (BM)" : "conexões (BMs)"}</span></div>
          <div className="cx-stat"><b>{fmtInt(totals.wabas)}</b><span>contas do WhatsApp</span></div>
          <div className="cx-stat"><b>{fmtInt(totals.phones)}</b><span>números</span></div>
          <div className={`cx-stat ${totals.errors ? "bad" : totals.attention ? "warn" : ""}`}><b>{totals.attention ? fmtInt(totals.attention) : "✓"}</b><span>{totals.attention ? "precisam de atenção" : "tudo funcionando"}</span></div>
        </div>
      )}

      <div className="cx-grid">
        {master && (
          <div className="cx-card new">
            <div className="cx-id">
              <span className="cx-logo"><Icon name="plug" size={22} className="" /></span>
              <div><span className="cx-kind">WhatsApp Cloud · Oficial</span><b className="cx-name">Conectar nova BM</b></div>
            </div>
            <p>Cole o token do usuário do sistema e o ID do portfólio. O Ecossistema encontra as contas e os números sozinho.</p>
            <button type="button" className="cx-cta" onClick={() => setOpen({ id: "new" })}><Icon name="plus" size={16} className="" />Nova conexão</button>
          </div>
        )}
        {master && conns.some((c) => c.business_id && !c.source_connection_id) && (
          <div className="cx-card new shared">
            <div className="cx-id">
              <span className="cx-logo"><Icon name="users" size={22} className="" /></span>
              <div><span className="cx-kind">Parcerias · sem token novo</span><b className="cx-name">Contas compartilhadas</b></div>
            </div>
            <p>Outras BMs compartilharam contas do WhatsApp com a sua BM? O Ecossistema as encontra, agrupa por BM dona e cria uma conexão de Equipe para cada uma, usando o token que já existe.</p>
            <button type="button" className="cx-cta" onClick={() => setDisc(true)}><Icon name="search" size={16} className="" />Procurar contas compartilhadas</button>
          </div>
        )}
        {master && conns.length >= 2 && conns.some((c) => c.business_id && !c.source_connection_id) && (
          <div className="cx-card new xfer">
            <div className="cx-id">
              <span className="cx-logo"><Icon name="refresh" size={22} className="" /></span>
              <div><span className="cx-kind">Migração · sem perder histórico</span><b className="cx-name">Mudar de BM</b></div>
            </div>
            <p>Vai trocar a BM principal do Ecossistema? As outras conexões passam a usar o token (e o app) da BM nova. O Ecossistema confere antes se cada conta já está acessível por ela.</p>
            <button type="button" className="cx-cta" onClick={() => setXfer(true)}><Icon name="refresh" size={16} className="" />Transferir conexões</button>
          </div>
        )}
        {!d && !err && [0, 1, 2].map((i) => <div key={i} className="cx-card skeleton" aria-hidden />)}
        {list.map((c) => {
          const st = state(c);
          const phones = phonesOf(c);
          return (
            <article key={c.id} className={`cx-card${c.active ? "" : " off"}`}>
              <div className="cx-top">
                <span className={`pill ${st.tone}`}><i aria-hidden />{st.label}</span>
                {master
                  ? <label className="check small" title={c.active ? "Desligar conexão" : "Ligar conexão"}><input type="checkbox" checked={c.active} onChange={() => toggle(c)} aria-label={c.active ? "Desligar conexão" : "Ligar conexão"} /></label>
                  : <Badge v={c.visibility} />}
              </div>
              <div className="cx-id">
                <span className="cx-logo"><Icon name="chat" size={20} className="" /></span>
                <div>
                  <span className="cx-kind">WhatsApp Cloud · Oficial</span>
                  <b className="cx-name" title={c.name}>{c.name}</b>
                  <span className="cx-biz">{c.business_name && c.business_name !== c.name ? `${c.business_name} · ` : ""}{c.business_id ? `Portfólio ${c.business_id}` : "Contas indicadas manualmente"}</span>
                </div>
              </div>
              {c.description && <div className="cx-desc" title={c.description}>{c.description}</div>}
              {master && <div className="cx-badges"><Badge v={c.visibility} />{c.app_id && <span className="cx-badge"><Icon name="settings" size={12} className="" />App próprio</span>}</div>}
              <div className="cx-nums">
                <div className="cx-nums-head"><span><b>{c.wabas.length}</b> {c.wabas.length === 1 ? "conta" : "contas"} · <b>{phones.length}</b> {phones.length === 1 ? "número" : "números"}</span></div>
                {phones.slice(0, 3).map((p) => (
                  <div className={`cx-num${p.watched ? " watched" : ""}`} key={p.id}>
                    <span className="cx-av"><Icon name="phone" size={14} className="" /></span>
                    <div><b>{p.display_phone_number || p.id}{p.label && <em>{p.label}</em>}</b><small>{p.verified_name || "—"}{p.watched && <span className="cx-watch-tag">· na Visão geral</span>}</small></div>
                    <Quality q={p.quality_rating} />
                  </div>
                ))}
                {phones.length > 3 && <div className="cx-more">+ {phones.length - 3} {phones.length - 3 === 1 ? "número" : "números"}</div>}
                {!phones.length && <div className="cx-empty-nums">{c.last_sync_at ? "Nenhum número encontrado nas contas desta BM." : "Sincronize para trazer as contas e os números."}</div>}
              </div>
              {c.active && c.status === "error" && c.last_error && <div className="cx-err">{c.last_error}</div>}
              <div className="cx-foot">
                <span className="muted">{ago(c.last_sync_at)}</span>
                <div className="cx-foot-btns">
                  {(master || d?.me.admin) && <button type="button" className={`cx-icon-btn${syncing === c.id ? " spin" : ""}`} onClick={() => sync(c)} disabled={syncing !== null || !c.active} title="Sincronizar agora" aria-label={`Sincronizar ${c.name}`}><Icon name="refresh" size={16} className="" /></button>}
                  <button type="button" className="cx-open" onClick={() => setOpen({ id: c.id })}><Icon name="settings" size={15} className="" />Gerenciar</button>
                </div>
              </div>
            </article>
          );
        })}
        {d && !list.length && <div className="cx-none">{q ? "Nenhuma conexão com esse nome." : master ? "Nenhuma conexão neste filtro." : "Nenhuma BM da equipe conectada ainda. O Master cadastra as conexões."}</div>}
      </div>

      {master && d && d.unlinked.length > 0 && (
        <div className="cx-section">
          <h2>Contas fora das conexões <Badge v="private" /></h2>
          <p>Ficaram sem BM (por exemplo, saíram do limite de uma conexão). Continuam no Ecossistema, visíveis só para você. Para entregá-las a uma conexão, deixe o campo “Limitar contas” dela vazio (ou inclua o ID) e sincronize.</p>
          <div className="cx-nums">
            {d.unlinked.map((w) => (
              <div className="cx-num" key={w.id}>
                <span className="cx-av"><Icon name="layers" size={14} className="" /></span>
                <div><b>{w.name || w.id}</b><small>WABA {w.id} · {w.phones.length} número(s)</small></div>
                <span className="cx-q">{w.templates.approved} templates</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d?.last_sync && d.last_sync.problems.length > 0 && (
        <details className="cx-section">
          <summary><Icon name="alert" size={16} className="" />{d.last_sync.problems.length} aviso(s) na última sincronização · {fmtDateTime(d.last_sync.at)}</summary>
          <ul className="cx-problems">{d.last_sync.problems.map((l, i) => <li key={i}><b>{l.step}</b><span>{l.info}</span></li>)}</ul>
        </details>
      )}

      {open && d && (open.id === "new" || current) && (
        <ConnSheet
          key={String(open.id)}
          data={d} conn={current} initialTab={open.tab}
          onClose={() => setOpen(null)}
          onChanged={changed}
          onCreated={(id) => setOpen({ id, tab: "numbers" })}
          onToast={(text, bad) => setToast({ text, bad })}
          ask={(a) => setAsk(a)}
        />
      )}
      {disc && d && <DiscoverSheet onClose={() => setDisc(false)} onChanged={changed} onToast={(text, bad) => setToast({ text, bad })} />}
      {xfer && d && <TransferSheet conns={conns} onClose={() => setXfer(false)} onChanged={changed} onToast={(text, bad) => setToast({ text, bad })} />}
      {ask && <Confirm title={ask.title} text={ask.text} ok={ask.ok} danger={ask.danger} onCancel={() => setAsk(null)} onOk={() => { const run = ask.run; setAsk(null); run(); }} />}
      {toast && <div className={`cx-toast${toast.bad ? " bad" : ""}`} role="status"><Icon name={toast.bad ? "alert" : "check"} size={16} className="" />{toast.text}</div>}
    </div>
  );
}

type SheetTab = "conn" | "numbers" | "webhook";
type Ask = { title: string; text: string; ok: string; danger?: boolean; run: () => void };

function ConnSheet({ data, conn, initialTab, onClose, onChanged, onCreated, onToast, ask }: {
  data: Data; conn: Conn | null; initialTab?: SheetTab;
  onClose: () => void; onChanged: () => Promise<void>; onCreated: (id: number) => void; onToast: (t: string, bad?: boolean) => void; ask: (a: Ask) => void;
}) {
  const master = data.me.master;
  const isNew = !conn;
  const [tab, setTab] = useState<SheetTab>(initialTab || (isNew || master ? "conn" : "numbers"));
  const [f, setF] = useState({
    name: conn?.name || "", description: conn?.description || "", visibility: (conn?.visibility || "private") as Vis, business_id: conn?.business_id || "",
    token: "", own_app: !!conn?.app_id, app_id: conn?.app_id || "", app_secret: "", waba_ids: conn?.waba_ids || "",
  });
  const [busy, setBusy] = useState<null | "test" | "save" | "sync" | "delete">(null);
  const [err, setErr] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [log, setLog] = useState<LogLine[] | null>(null);
  const [showToken, setShowToken] = useState(false);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setTest(null); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  const payload = () => ({ id: conn?.id, ...f });
  const doTest = async () => {
    setBusy("test"); setErr(""); setTest(null);
    try { setTest(await api<TestResult>({ action: "test", ...payload() })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const doSave = async (sync: boolean) => {
    const go = async () => {
      setBusy("save"); setErr(""); setLog(null);
      try {
        const r = await api<{ ok: boolean; id: number; sync: { ok: boolean; log: LogLine[] } | null }>({ action: "save", ...payload(), sync });
        await onChanged();
        onToast(r.sync ? `${f.name}: ${syncSummary(r.sync.log)}` : isNew ? "Conexão criada" : "Alterações salvas", r.sync ? !r.sync.ok : false);
        if (r.sync) setLog(r.sync.log);
        setF((x) => ({ ...x, token: "", app_secret: "" }));
        if (isNew) onCreated(r.id);
      } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
    };
    if (conn && conn.visibility === "private" && f.visibility === "team") {
      ask({ title: "Abrir esta BM para a equipe?", text: "Administradores, gestores e atendentes passam a ver as conversas, contatos, disparos e números desta BM.", ok: "Abrir para a equipe", run: go });
    } else if (conn && conn.visibility === "team" && f.visibility === "private") {
      ask({ title: "Tornar esta BM só sua?", text: "A equipe deixa de ver as conversas, contatos, disparos e números desta BM. Disparos e fluxos em andamento continuam rodando.", ok: "Só Master", run: go });
    } else go();
  };
  const doSync = async () => {
    if (!conn) return;
    setBusy("sync"); setErr(""); setLog(null);
    try { const r = await api<{ ok: boolean; log: LogLine[] }>({ action: "sync", id: conn.id }); setLog(r.log); onToast(`${conn.name}: ${syncSummary(r.log)}`, !r.ok); await onChanged(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const doDelete = () => {
    if (!conn) return;
    ask({
      title: `Remover ${conn.name}?`, danger: true, ok: "Remover",
      text: "O token sai do Ecossistema. As contas e todo o histórico continuam aqui, visíveis só para você, até a BM ser conectada de novo.",
      run: async () => {
        setBusy("delete");
        try { await api({ action: "delete", id: conn.id }); onToast("Conexão removida"); await onChanged(); onClose(); }
        catch (e: any) { setErr(e.message); setBusy(null); }
      },
    });
  };

  const canSync = !!conn && (master || data.me.admin);
  const tabs: [SheetTab, string][] = [
    ...(master || !isNew ? [["conn", master ? "Conexão" : "Detalhes"] as [SheetTab, string]] : []),
    ...(!isNew ? [["numbers", "Números"] as [SheetTab, string]] : []),
    ...(master ? [["webhook", "Webhook"] as [SheetTab, string]] : []),
  ];
  const st = conn ? state(conn) : null;

  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal cx-modal" role="dialog" aria-label={conn ? `Gerenciar ${conn.name}` : "Nova conexão"} onClick={(e) => e.stopPropagation()}>
        <div className="cx-mhead">
          <span className="cx-logo big"><Icon name={isNew ? "plug" : "chat"} size={24} className="" /></span>
          <div>
            <h2>{conn ? conn.name : "Nova conexão"}</h2>
            <p>{conn ? <>{st?.label} · {ago(conn.last_sync_at)}</> : "WhatsApp Cloud · API oficial da Meta"}</p>
          </div>
          <button type="button" className="cx-close" onClick={onClose} disabled={!!busy} aria-label="Fechar"><Icon name="close" size={14} className="" /></button>
        </div>
        {tabs.length > 1 && (
          <div className="cx-mtabs">
            <div className="cx-seg" role="tablist">
              {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
            </div>
          </div>
        )}

        <div className="cx-mbody">
          {err && <div className="banner err" style={{ margin: 0 }}>{err}</div>}

          {tab === "conn" && master && (
            <>
              <div className="cx-group">
                <h3>Identificação</h3>
                <label className="field"><span>Nome da conexão</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Minha empresa – BM principal" maxLength={60} /></label>
                <label className="field"><span>Descrição <span className="muted">(opcional — aparece na Visão geral para identificar esta BM)</span></span><textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Farmácias — rede Associadas · disparos de ofertas" maxLength={280} /></label>
                <div className="field">
                  <span>Quem vê esta BM</span>
                  <div className="cx-vis" role="radiogroup" aria-label="Quem vê esta BM">
                    {(["private", "team"] as Vis[]).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={f.visibility === v} className={`${v}${f.visibility === v ? " on" : ""}`} onClick={() => set({ visibility: v })}>
                        <b><Icon name={VIS[v].icon} size={14} className="" />{VIS[v].label}</b><span>{VIS[v].text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="cx-group">
                <h3>Acesso à Meta</h3>
                <label className="field"><span>ID do portfólio (BM)</span><input value={f.business_id} onChange={(e) => set({ business_id: e.target.value })} inputMode="numeric" placeholder="Ex.: 1234567890123456" /></label>
                <div className="field">
                  <span>Token do usuário do sistema {conn?.token_hint && <span className="cx-current">(atual: {conn.token_hint})</span>}</span>
                  <div className="cx-secret-wrap">
                    <textarea rows={3} className={showToken ? "" : "hide"} value={f.token} onChange={(e) => set({ token: e.target.value })} placeholder={conn ? "Deixe em branco para manter o token atual" : "EAAG…"} autoComplete="off" spellCheck={false} aria-label="Token do usuário do sistema" />
                    {f.token && <button type="button" onClick={() => setShowToken(!showToken)}><Icon name="eye" size={13} className="" />{showToken ? "Ocultar" : "Mostrar"}</button>}
                  </div>
                </div>
                <p className="cx-hint">No Gerenciador de Negócios: Configurações → Usuários do sistema → Gerar token, com as permissões <b>whatsapp_business_messaging</b> e <b>whatsapp_business_management</b> (e <b>business_management</b> para listar as contas sozinho). Escolha “nunca expira”.</p>
                <div className="field">
                  <span>App da Meta</span>
                  <div className="cx-seg" role="radiogroup" aria-label="App da Meta">
                    <button type="button" role="radio" aria-checked={!f.own_app} className={!f.own_app ? "on" : ""} onClick={() => set({ own_app: false })}>App principal do Ecossistema</button>
                    <button type="button" role="radio" aria-checked={f.own_app} className={f.own_app ? "on" : ""} onClick={() => set({ own_app: true })}>App próprio desta BM</button>
                  </div>
                </div>
                {f.own_app && (
                  <div className="cx-two">
                    <label className="field"><span>ID do app</span><input value={f.app_id} onChange={(e) => set({ app_id: e.target.value })} inputMode="numeric" /></label>
                    <label className="field"><span>Chave secreta do app {conn?.has_app_secret && conn.app_id === f.app_id && <span className="cx-current">(guardada)</span>}</span><input type="password" value={f.app_secret} onChange={(e) => set({ app_secret: e.target.value })} placeholder={conn?.has_app_secret ? "Deixe em branco para manter" : ""} autoComplete="new-password" /></label>
                  </div>
                )}
                <label className="field"><span>Limitar contas <span className="muted">(opcional — IDs de WABA separados por vírgula; vazio = todas da BM)</span></span><input value={f.waba_ids} onChange={(e) => set({ waba_ids: e.target.value })} inputMode="numeric" /></label>
              </div>

              {test && <TestBox t={test} />}
              {log && <SyncLog log={log} />}

              {conn && (
                <div className="cx-danger">
                  <div><b>Remover conexão</b><span>O histórico fica no Ecossistema, visível só para você.</span></div>
                  <button type="button" className="btn danger" onClick={doDelete} disabled={!!busy}><Icon name="trash" size={15} className="" />{busy === "delete" ? "Removendo…" : "Remover"}</button>
                </div>
              )}
            </>
          )}

          {tab === "conn" && !master && conn && (
            <div className="cx-group">
              <h3>Detalhes</h3>
              <div className="cx-two">
                <div className="field"><span>Portfólio (BM)</span><b>{conn.business_name || "—"}</b><span className="muted">{conn.business_id ? `ID ${conn.business_id}` : "Contas indicadas manualmente"}</span></div>
                <div className="field"><span>Situação</span><span><span className={`pill ${st!.tone}`}><i aria-hidden />{st!.label}</span></span><span className="muted">{ago(conn.last_sync_at)}</span></div>
              </div>
              {conn.description && <div className="field"><span>Descrição</span><span>{conn.description}</span></div>}
              {conn.last_error && <div className="cx-err">{conn.last_error}</div>}
              <p className="cx-hint">Token, app e quem vê esta BM são gerenciados pelo Master.</p>
              {log && <SyncLog log={log} />}
            </div>
          )}

          {tab === "numbers" && conn && <NumbersTab conn={conn} master={master} admin={data.me.admin} onChanged={onChanged} onToast={onToast} log={log} />}

          {tab === "webhook" && master && data.webhook && (
            <>
              <div className="cx-group">
                <h3>Webhook</h3>
                <p className="cx-hint" style={{ margin: 0 }}>{f.own_app
                  ? "Esta BM usa um app próprio: no painel desse app (WhatsApp → Configuração → Webhook), use os dados abaixo e assine o campo messages. A chave secreta do app precisa estar salva aqui para o Ecossistema aceitar os eventos."
                  : `Esta BM usa o app principal do Ecossistema${data.webhook.main_app_id ? ` (ID ${data.webhook.main_app_id})` : ""}: o webhook já está configurado nele. A cada sincronização o Ecossistema inscreve as contas no app sozinho.`}</p>
                <CopyField label="URL de callback" value={data.webhook.url} />
                <CopyField label="Token de verificação" value={data.webhook.verify_token} />
              </div>
            </>
          )}
        </div>

        <div className="cx-mfoot">
          {tab === "conn" && master ? (
            <>
              <button type="button" className="btn" onClick={doTest} disabled={!!busy || (!f.token && !conn)}><Icon name="check" size={15} className="" />{busy === "test" ? "Testando…" : "Testar conexão"}</button>
              <span className="grow" />
              <button type="button" className="btn" onClick={() => doSave(false)} disabled={!!busy || !f.name.trim()}>{busy === "save" ? "Salvando…" : "Salvar"}</button>
              <button type="button" className="btn primary" onClick={() => doSave(true)} disabled={!!busy || !f.name.trim()}><Icon name="refresh" size={15} className="" />{busy === "save" ? "Salvando…" : "Salvar e sincronizar"}</button>
            </>
          ) : (
            <>
              <span className="grow" />
              {canSync && <button type="button" className="btn primary" onClick={doSync} disabled={!!busy || !conn!.active}><Icon name="refresh" size={15} className="" />{busy === "sync" ? "Sincronizando…" : "Sincronizar agora"}</button>}
              <button type="button" className="btn" onClick={onClose} disabled={!!busy}>Fechar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Contas que outras BMs compartilharam com uma BM conectada: o Master escolhe quais entram e o HUB cria uma conexão de Equipe por BM dona. */
function DiscoverSheet({ onClose, onChanged, onToast }: { onClose: () => void; onChanged: () => Promise<void>; onToast: (t: string, bad?: boolean) => void }) {
  const [res, setRes] = useState<Discovery | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<null | "find" | "adopt">(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ results: { owner: string; id: number; created: boolean; wabas: number }[]; sync: { ok: boolean; log: LogLine[] } | null } | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const find = useCallback(async () => {
    setBusy("find"); setErr(""); setDone(null);
    try {
      const r = await api<Discovery>({ action: "discover" });
      setRes(r);
      // pré-seleciona o que ainda não está em nenhuma conexão de Equipe
      setSel(new Set(r.groups.flatMap((g) => g.wabas.filter((w) => !w.current || w.current.visibility !== "team").map((w) => w.id))));
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }, []);
  useEffect(() => { find(); }, [find]);
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (g: DiscGroup, on: boolean) => setSel((x) => { const n = new Set(x); for (const w of g.wabas) { if (on) n.add(w.id); else n.delete(w.id); } return n; });
  const chosen = (res?.groups || []).map((g) => ({ g, ids: g.wabas.filter((w) => sel.has(w.id)).map((w) => w.id) })).filter((x) => x.ids.length);
  const adopt = async () => {
    setBusy("adopt"); setErr("");
    try {
      const r = await api<{ ok: boolean; results: { owner: string; id: number; created: boolean; wabas: number }[]; sync: { ok: boolean; log: LogLine[] } | null }>({
        action: "adopt", visibility: "team", sync: true,
        groups: chosen.map(({ g, ids }) => ({ source_id: g.source.id, owner_id: g.owner.id, owner_name: g.owner.name, waba_ids: ids })),
      });
      setDone(r);
      await onChanged();
      onToast(`${r.results.length} conexão(ões) de Equipe ${r.results.some((x) => x.created) ? "criada(s)" : "atualizada(s)"}${r.sync ? ` · ${syncSummary(r.sync.log)}` : ""}`, r.sync ? !r.sync.ok : false);
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const total = (res?.groups || []).reduce((a, g) => a + g.wabas.length, 0);
  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal cx-modal" role="dialog" aria-label="Contas compartilhadas" onClick={(e) => e.stopPropagation()}>
        <div className="cx-mhead">
          <span className="cx-logo big"><Icon name="users" size={24} className="" /></span>
          <div>
            <h2>Contas compartilhadas</h2>
            <p>{busy === "find" ? "Procurando na Meta…" : res ? `${total} conta(s) em ${res.groups.length} BM(s) parceira(s)` : "Contas que outras BMs compartilharam com a sua"}</p>
          </div>
          <button type="button" className="cx-close" onClick={onClose} disabled={!!busy} aria-label="Fechar"><Icon name="close" size={14} className="" /></button>
        </div>
        <div className="cx-mbody">
          {err && <div className="banner err" style={{ margin: 0 }}>{err}</div>}
          {busy === "find" && <div className="cx-group"><p className="cx-hint" style={{ margin: 0 }}>Lendo as contas compartilhadas com {res?.sources.map((x) => x.name).join(", ") || "a sua BM"}…</p></div>}
          {res && !done && (
            <>
              <p className="cx-hint" style={{ margin: 0 }}>Cada BM dona vira uma conexão <b>Equipe</b> (administradores, gestores e atendentes passam a ver as contas marcadas). O token usado é o de <b>{res.sources.map((x) => x.name).join(", ")}</b> — nada novo para colar. Para compartilhar mais contas, no Gerenciador de Negócios da BM dona: Usuários → Parceiros → Adicionar → Contas do WhatsApp.</p>
              {!res.groups.length && <div className="cx-group"><h3>Nenhuma conta compartilhada encontrada</h3><p className="cx-hint" style={{ margin: 0 }}>As outras BMs ainda não compartilharam contas do WhatsApp com a sua BM, ou o usuário do sistema do token ainda não recebeu essas contas (Gerenciador → Usuários do sistema → Atribuir ativos).</p></div>}
              {res.groups.map((g) => {
                const all = g.wabas.every((w) => sel.has(w.id));
                return (
                  <div className="cx-group cx-disc" key={`${g.source.id}|${g.owner.id}`}>
                    <div className="cx-disc-head">
                      <label className="check small"><input type="checkbox" checked={all} onChange={(e) => toggleGroup(g, e.target.checked)} aria-label={`Selecionar todas as contas de ${g.owner.name}`} /></label>
                      <div><h3>{g.owner.name}</h3><span className="muted">Portfólio {g.owner.id} · {g.wabas.length} conta(s){g.existing ? ` · já tem a conexão “${g.existing.name}” (${g.existing.visibility === "team" ? "Equipe" : "Só Master"}) — as contas marcadas entram nela` : " · conexão nova de Equipe"}</span></div>
                    </div>
                    {g.wabas.map((w) => (
                      <label className="cx-disc-row" key={w.id}>
                        <input type="checkbox" checked={sel.has(w.id)} onChange={() => toggle(w.id)} />
                        <div>
                          <b>{w.name || w.id}</b>
                          <small>{w.phones.length ? w.phones.map((p) => `${p.display_phone_number || p.id}${p.verified_name ? ` (${p.verified_name})` : ""}`).join(" · ") : "sem número"}{w.current ? ` · hoje em “${w.current.name}” (${w.current.visibility === "team" ? "Equipe" : "Só Master"})` : ""}</small>
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })}
              {res.errors.length > 0 && <ul className="errs cx-problems">{res.errors.map((e, i) => <li key={i}><span>{e}</span></li>)}</ul>}
            </>
          )}
          {done && (
            <div className="cx-group">
              <h3>Pronto</h3>
              <ul className="cx-problems">{done.results.map((r) => <li key={r.id}><b>{r.owner}</b><span>{r.created ? "conexão criada" : "conexão atualizada"} · {r.wabas} conta(s)</span></li>)}</ul>
              {done.sync && <SyncLog log={done.sync.log} />}
            </div>
          )}
        </div>
        <div className="cx-mfoot">
          {!done && <button type="button" className="btn" onClick={find} disabled={!!busy}><Icon name="refresh" size={15} className="" />{busy === "find" ? "Procurando…" : "Procurar de novo"}</button>}
          <span className="grow" />
          {done
            ? <button type="button" className="btn primary" onClick={onClose}>Fechar</button>
            : <button type="button" className="btn primary" onClick={adopt} disabled={!!busy || !chosen.length}><Icon name="plus" size={15} className="" />{busy === "adopt" ? "Criando e sincronizando…" : `Criar conexões de Equipe (${chosen.length})`}</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * Mudar de BM: as conexões escolhidas passam a usar o token (e o app) de outra conexão — a BM nova "casa" do HUB.
 * Antes de transferir, o HUB confere conta por conta se o token de destino já a enxerga (compartilhada + atribuída ao usuário do sistema).
 */
function TransferSheet({ conns, onClose, onChanged, onToast }: { conns: Conn[]; onClose: () => void; onChanged: () => Promise<void>; onToast: (t: string, bad?: boolean) => void }) {
  const targets = conns.filter((c) => c.business_id && !c.source_connection_id);
  const [target, setTarget] = useState<number>(targets.length === 1 ? targets[0].id : 0);
  const [rep, setRep] = useState<XferReport | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<null | "check" | "transfer">(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<XferResult | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const connsRef = useRef(conns); connsRef.current = conns;
  const check = useCallback(async (id: number) => {
    if (!id) return;
    setBusy("check"); setErr(""); setDone(null); setRep(null);
    try {
      const r = await api<XferReport>({ action: "transfer_check", target_id: id });
      setRep(r);
      // pré-seleciona o que já pode ir — menos a BM "casa" atual (origem de outras conexões), que o Master transfere por último, de propósito
      const isHome = (c: XferCandidate) => connsRef.current.some((o) => o.source_connection_id === c.id);
      setSel(new Set(r.candidates.filter((c) => c.ready && !isHome(c)).map((c) => c.id)));
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }, []);
  useEffect(() => { check(target); }, [target, check]);
  const toggle = (id: number) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = (rep?.candidates || []).filter((c) => sel.has(c.id));
  const transfer = async () => {
    setBusy("transfer"); setErr("");
    try {
      const r = await api<XferResult>({ action: "transfer", target_id: target, ids: chosen.map((c) => c.id), sync: true });
      setDone(r);
      await onChanged();
      onToast(`${r.moved.length} conexão(ões) transferida(s) para ${r.target.name}${r.skipped.length ? ` · ${r.skipped.length} ficou(aram) como estava(m)` : ""}${r.sync ? ` · ${syncSummary(r.sync.log)}` : ""}`, (r.sync ? !r.sync.ok : false) || (!r.moved.length && r.skipped.length > 0));
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const ready = (rep?.candidates || []).filter((c) => c.ready).length;
  const tname = targets.find((t) => t.id === target)?.name || "a BM nova";
  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal cx-modal" role="dialog" aria-label="Mudar de BM" onClick={(e) => e.stopPropagation()}>
        <div className="cx-mhead">
          <span className="cx-logo big"><Icon name="refresh" size={24} className="" /></span>
          <div>
            <h2>Mudar de BM</h2>
            <p>{busy === "check" ? `Conferindo o acesso pelo token de ${tname}…` : rep ? `${ready} de ${rep.candidates.length} conexão(ões) pronta(s) para ir para ${rep.target.name}` : "As conexões passam a usar o token da BM nova"}</p>
          </div>
          <button type="button" className="cx-close" onClick={onClose} disabled={!!busy} aria-label="Fechar"><Icon name="close" size={14} className="" /></button>
        </div>
        <div className="cx-mbody">
          {err && <div className="banner err" style={{ margin: 0 }}>{err}</div>}
          {!done && (
            <div className="cx-group">
              <h3>Para qual BM?</h3>
              <label className="field"><span>Conexão de destino (a BM nova, com token e app próprios)</span>
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={!!busy}>
                  {!target && <option value={0}>Escolha a BM de destino…</option>}
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.name}{t.business_id ? ` · ${t.business_id}` : ""}{t.app_id ? " · app próprio" : ""}</option>)}
                </select>
              </label>
              <p className="cx-hint" style={{ margin: 0 }}>Nada é apagado: contas, números, conversas e histórico ficam onde estão. Só muda <b>por qual BM</b> o Ecossistema fala com a Meta. Antes, em cada BM dona: Parceiros → compartilhar as contas do WhatsApp com <b>{tname}</b>; e na {tname}: Usuários do sistema → atribuir essas contas ao usuário do token. O app antigo continua recebendo até você desfazer as parcerias antigas — o Ecossistema ignora eventos repetidos.</p>
            </div>
          )}
          {rep && !done && (
            <>
              {!rep.candidates.length && <div className="cx-group"><h3>Nenhuma conexão para transferir</h3><p className="cx-hint" style={{ margin: 0 }}>Todas as outras conexões já usam o token de {rep.target.name}.</p></div>}
              {rep.candidates.map((c) => (
                <div className={`cx-group cx-disc${c.ready ? "" : " off"}`} key={c.id}>
                  <div className="cx-disc-head">
                    <label className="check small"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} disabled={!c.ready} aria-label={`Transferir ${c.name}`} /></label>
                    <div>
                      <h3>{c.name} <span className={`pill ${c.ready ? "good" : "warning"}`}><i aria-hidden />{c.ready ? "Pronta" : "Ainda não"}</span></h3>
                      <span className="muted">{c.source.name ? `hoje usa o token de ${c.source.name}` : "hoje usa token próprio"} · {c.wabas.length} conta(s){c.active ? "" : " · desligada"}</span>
                    </div>
                  </div>
                  {c.wabas.map((w) => (
                    <div className="cx-disc-row" key={w.id}>
                      <Icon name={w.ok ? "check" : "alert"} size={15} className={w.ok ? "ok" : "bad"} />
                      <div><b>{w.name || w.id}</b><small>{w.ok ? `WABA ${w.id} · acessível por ${rep.target.name}` : `WABA ${w.id} · ${w.error || "sem acesso"}`}</small></div>
                    </div>
                  ))}
                  {!c.wabas.length && <div className="cx-disc-row"><div><small>Sem contas no Ecossistema — só o token e o app mudam.</small></div></div>}
                </div>
              ))}
            </>
          )}
          {done && (
            <div className="cx-group">
              <h3>Pronto</h3>
              <ul className="cx-problems">
                {done.moved.map((m) => <li key={m.id}><b>{m.name}</b><span>agora usa o token de {done.target.name} · {m.wabas} conta(s)</span></li>)}
                {done.skipped.map((m) => <li key={`s${m.id}`}><b>{m.name}</b><span>não transferida — {m.reason}</span></li>)}
              </ul>
              {done.sync && <SyncLog log={done.sync.log} />}
            </div>
          )}
        </div>
        <div className="cx-mfoot">
          {!done && <button type="button" className="btn" onClick={() => check(target)} disabled={!!busy || !target}><Icon name="refresh" size={15} className="" />{busy === "check" ? "Conferindo…" : "Conferir de novo"}</button>}
          <span className="grow" />
          {done
            ? <button type="button" className="btn primary" onClick={onClose}>Fechar</button>
            : <button type="button" className="btn primary" onClick={transfer} disabled={!!busy || !chosen.length}><Icon name="refresh" size={15} className="" />{busy === "transfer" ? "Transferindo e sincronizando…" : `Transferir (${chosen.length})`}</button>}
        </div>
      </div>
    </div>
  );
}

function TestBox({ t }: { t: TestResult }) {
  const tk = t.token;
  const tokenOk = tk.valid !== false && !tk.error;
  return (
    <div className={`cx-test${t.ok ? "" : " bad"}`}>
      <b><Icon name={t.ok ? "check" : "alert"} size={16} className="" />{t.ok ? "Tudo certo — pode salvar" : "Encontramos problemas"}</b>
      <ul>
        <li>
          <span>{tokenOk ? "✓" : "✕"}</span>
          <span>Token {tk.error ? <span className="errs">— {tk.error}</span> : tk.valid === false ? "inválido" : "válido"}
            {tokenOk && <> · {tk.app_name ? `app ${tk.app_name} · ` : ""}expira: {tk.expires_at === "never" || !tk.expires_at ? "nunca" : fmtDateTime(tk.expires_at)}</>}
            {tk.missing_scopes.length > 0 && <span className="errs"> · falta: {tk.missing_scopes.join(", ")}</span>}</span>
        </li>
        {t.business && <li><span>✓</span><span>Portfólio <b>{t.business.name || t.business.id}</b></span></li>}
        <li><span>{t.wabas.length ? "✓" : "✕"}</span><span>{t.total_wabas} conta(s) do WhatsApp encontrada(s)</span></li>
      </ul>
      {t.wabas.map((w) => (
        <div className="w" key={w.id}>
          <b>{w.name || w.id} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {w.ownership === "client" ? "conta de cliente" : "da BM"} · {w.phones.length} número(s)</span></b>
          {w.phones.length > 0 && <small>{w.phones.map((p) => `${p.display_phone_number || p.id}${p.verified_name ? ` (${p.verified_name})` : ""}`).join(" · ")}</small>}
          {w.other && <small className="errs">Já está na conexão “{w.other.name}” ({w.other.visibility === "team" ? "Equipe" : "Só Master"}){w.other.visibility === "private" ? " — continua lá" : ""}.</small>}
        </div>
      ))}
      {t.errors.length > 0 && <ul className="errs">{t.errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>}
    </div>
  );
}

function SyncLog({ log }: { log: LogLine[] }) {
  const bad = log.filter((l) => !l.ok);
  return (
    <div className={`cx-test${bad.length ? " bad" : ""}`}>
      <b><Icon name={bad.length ? "alert" : "check"} size={16} className="" />{syncSummary(log)}</b>
      <div className="cx-log">
        {(bad.length ? bad : log).slice(0, 60).map((l, i) => <div key={i}><span className={l.ok ? "ok" : "no"}>{l.ok ? "✓" : "✕"}</span><span><b>{l.step}</b>{l.info ? ` — ${l.info}` : ""}</span></div>)}
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* sem permissão */ } };
  return (
    <div className="field">
      <span>{label}</span>
      <div className="cx-copy"><div className="code">{value}</div><button type="button" className="btn" onClick={copy}><Icon name={ok ? "check" : "copy"} size={15} className="" />{ok ? "Copiado" : "Copiar"}</button></div>
    </div>
  );
}

function NumbersTab({ conn, master, admin, onChanged, onToast, log }: { conn: Conn; master: boolean; admin: boolean; onChanged: () => Promise<void>; onToast: (t: string, bad?: boolean) => void; log: LogLine[] | null }) {
  if (!conn.wabas.length) {
    return (
      <div className="cx-group">
        <h3>Números</h3>
        <p className="cx-hint" style={{ margin: 0 }}>{conn.last_sync_at ? "Nenhuma conta encontrada nesta BM. Confira o ID do portfólio e as permissões do token." : "Ainda não sincronizada. Clique em “Sincronizar agora” para trazer as contas e os números."}</p>
        {log && <SyncLog log={log} />}
      </div>
    );
  }
  return (
    <>
      {log && <SyncLog log={log} />}
      {conn.wabas.map((w) => (
        <div className="cx-group cx-waba" key={w.id}>
          <div className="cx-waba-head">
            <b>{w.name || w.id}</b>
            <span>WABA {w.id} · {w.currency || "—"} · {w.ownership === "client" ? "conta de cliente" : "da BM"} · {w.templates.approved} templates aprovados{w.templates.pending ? ` · ${w.templates.pending} em análise` : ""}</span>
          </div>
          {w.phones.map((p) => <NumberRow key={p.id} p={p} canAdmin={master || admin} onChanged={onChanged} onToast={onToast} />)}
          {!w.phones.length && <p className="cx-hint" style={{ margin: 0 }}>Nenhum número nesta conta.</p>}
        </div>
      ))}
    </>
  );
}

function NumberRow({ p, canAdmin, onChanged, onToast }: { p: Phone; canAdmin: boolean; onChanged: () => Promise<void>; onToast: (t: string, bad?: boolean) => void }) {
  const [label, setLabel] = useState(p.label || "");
  const [saved, setSaved] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const saveLabel = async () => {
    if ((p.label || "") === label.trim()) return;
    try { await api({ action: "phone_label", phone_number_id: p.id, label: label.trim() }); setSaved(true); setTimeout(() => setSaved(false), 1500); await onChanged(); }
    catch (e: any) { onToast(e.message, true); }
  };
  const register = async () => {
    setBusy(true);
    try { await api({ action: "register", phone_number_id: p.id, pin }); onToast(`${p.display_phone_number} ativado na API`); setPinOpen(false); setPin(""); await onChanged(); }
    catch (e: any) { onToast(e.message, true); } finally { setBusy(false); }
  };
  const connected = p.status === "CONNECTED";
  return (
    <div className="cx-numrow">
      <span className="cx-av"><Icon name="phone" size={15} className="" /></span>
      <div>
        <b>{p.display_phone_number || p.id}</b>
        <small>
          <span>{p.verified_name || "—"}</span>
          <Quality q={p.quality_rating} />
          {p.messaging_limit && <span>{LIMIT_LABEL[p.messaging_limit] || p.messaging_limit}</span>}
          <span className={`pill ${connected ? "good" : "warning"}`} style={{ fontSize: 11, padding: "1px 7px 1px 6px" }}><i aria-hidden />{connected ? "Conectado" : p.status || "—"}</span>
        </small>
      </div>
      <label className="cx-label" title="Apelido interno (aparece no Atendimento e nos Disparos)">
        <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} placeholder="Apelido (ex.: Comercial)" maxLength={40} aria-label={`Apelido de ${p.display_phone_number}`} />
        {saved && <i>salvo</i>}
      </label>
      <div className="cx-numbtns">
        <WatchSwitch id={p.id} watched={!!p.watched} />
        <PhoneProfileButton phoneNumberId={p.id} label={p.verified_name || p.display_phone_number || p.id} canEdit={canAdmin} />
        {canAdmin && !connected && <button type="button" className="btn small tint" onClick={() => setPinOpen(!pinOpen)}>Ativar</button>}
      </div>
      {pinOpen && (
        <div className="cx-pin">
          <span>PIN de confirmação em duas etapas do número (6 dígitos). Ele não fica salvo.</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="PIN" />
          <button type="button" className="btn small primary" onClick={register} disabled={busy || pin.length !== 6}>{busy ? "Ativando…" : "Ativar na API"}</button>
        </div>
      )}
    </div>
  );
}
