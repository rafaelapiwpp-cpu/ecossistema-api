"use client";
// Ajustes do portal de clientes: a empresa (marca e números), a conta do usuário, automações dos leads novos,
// departamentos, etiquetas e respostas rápidas (com atalho e variáveis).
import { useEffect, useRef, useState } from "react";
import { invalidateCatalog } from "@/lib/catalog-client";
import { QUICK_VARS } from "@/lib/companies";
import { Icon } from "./Nav";

type Item = { id: number; name: string; color: string | null };
type Settings = {
  company: { id: number; name: string; slug: string; tagline: string | null; logo: string | null; primary_color: string; secondary_color: string | null };
  departments: Item[]; tags: Item[]; auto_tag_ids: number[]; default_department_id: number | null;
  numbers: { id: string; display_phone_number: string; verified_name: string | null; label: string | null; quality_rating: string | null }[];
  users: { id: number; name: string; department_id: number | null }[];
  quickReplies: { id: number; title: string; body: string; shortcut: string | null }[];
  me: { id: number; name: string; email: string; department_id: number | null };
};
const COLORS = ["#8b7cf6", "#3987e5", "#199e70", "#d95926", "#c98500", "#d55181", "#e66767", "#6d5fd1"];
const QUALITY: Record<string, string> = { GREEN: "qualidade alta", YELLOW: "qualidade média", RED: "qualidade baixa" };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function PortalSettings({ company }: { company: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const load = () => api(`/api/portal?settings=1&company=${encodeURIComponent(company)}`).then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [company]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (body: any, done = "Salvo.") => {
    setErr(""); setOk("");
    try { const j = await api("/api/portal", { company, ...body }); setOk(done); invalidateCatalog(); await load(); return j; } catch (e: any) { setErr(e.message); }
  };
  if (!s) return <div className="muted">{err || "Carregando…"}</div>;
  return (
    <>
      {err && <div className="banner"><span className="err">{err}</span></div>}
      {ok && <div className="banner"><span className="ok">{ok}</span></div>}
      <div className="ps-grid">
        <CompanyCard s={s} />
        <AccountCard s={s} run={run} />
        <AutomationCard s={s} run={run} />
        <QuickCard s={s} run={run} />
        <SimpleCard title="Departamentos" sub="Ex.: Balcão, Entrega, Gerência. Quem tem departamento vê as conversas dele (e as sem departamento)." items={s.departments} kind="department" run={run} placeholder="Novo departamento" />
        <SimpleCard title="Etiquetas" sub="Marque leads e clientes (ex.: orçamento, entrega, cliente fiel). Aparecem no atendimento, nos contatos e no funil." items={s.tags} kind="tag" run={run} placeholder="Nova etiqueta" chips />
      </div>
    </>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return <div className="swatches">{COLORS.map((k) => <button key={k} type="button" className={`swatch ${value === k ? "on" : ""}`} style={{ background: k }} onClick={() => onChange(k)} aria-label={k} />)}</div>;
}

function CompanyCard({ s }: { s: Settings }) {
  const c = s.company;
  return (
    <div className="card">
      <h2>Minha empresa</h2>
      <div className="ps-brand" style={{ marginTop: 10 }}>
        <span className="pb-tile">{c.logo ? <img className="pb-logo" src={c.logo} alt="" /> : <span className="pb-mark">{initials(c.name)}</span>}</span>
        <div style={{ minWidth: 0, flex: 1 }}><b>{c.name}</b><span>{c.tagline || "Portal de atendimento"}</span></div>
        <div className="ps-colors" title="Cores da marca"><i style={{ background: c.primary_color }} />{c.secondary_color && <i style={{ background: c.secondary_color }} />}</div>
      </div>
      <p className="sub" style={{ marginTop: 12 }}>Números de WhatsApp que você atende por aqui:</p>
      <ul className="ps-numbers">
        {s.numbers.map((n) => <li key={n.id}><Icon name="phone" size={14} className="" /><b>{n.label || n.verified_name || n.display_phone_number}</b><span>{n.display_phone_number}{n.quality_rating && QUALITY[n.quality_rating.toUpperCase()] ? ` · ${QUALITY[n.quality_rating.toUpperCase()]}` : ""}</span></li>)}
        {!s.numbers.length && <li><span>Nenhum número liberado ainda.</span></li>}
      </ul>
      <p className="ps-hint" style={{ marginTop: 10 }}>Logo, cores, slogan e números são definidos por quem administra o sistema. Precisa mudar? Fale com a equipe que cuida da sua conta.</p>
    </div>
  );
}

function AccountCard({ s, run }: { s: Settings; run: (b: any, d?: string) => Promise<any> }) {
  const [name, setName] = useState(s.me.name);
  const [p1, setP1] = useState(""); const [p2, setP2] = useState("");
  useEffect(() => { setName(s.me.name); }, [s.me.name]);
  return (
    <div className="card">
      <h2>Minha conta</h2>
      <p className="sub">Como você aparece para a equipe e a sua senha de acesso.</p>
      <div className="grid" style={{ gap: 8 }}>
        <label className="field"><span>Seu nome</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>E-mail (login)</span><input value={s.me.email} readOnly /></label>
        <div><button className="btn primary" disabled={!name.trim() || name.trim() === s.me.name} onClick={() => run({ action: "my_profile", name }, "Nome atualizado.")}>Salvar nome</button></div>
      </div>
      <div className="ps-form">
        <b style={{ fontSize: 13.5 }}>Trocar senha</b>
        <div className="grid two" style={{ gap: 8 }}>
          <label className="field"><span>Nova senha (mín. 8)</span><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></label>
          <label className="field"><span>Confirmar</span><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></label>
        </div>
        <div><button className="btn" disabled={p1.length < 8 || p1 !== p2} onClick={async () => { await run({ action: "my_password", password: p1 }, "Senha alterada. Na próxima vez, entre com a senha nova."); setP1(""); setP2(""); }}>Alterar senha</button></div>
      </div>
    </div>
  );
}

function AutomationCard({ s, run }: { s: Settings; run: (b: any, d?: string) => Promise<any> }) {
  const [dep, setDep] = useState(s.default_department_id ? String(s.default_department_id) : "");
  const [tags, setTags] = useState<Set<number>>(new Set(s.auto_tag_ids));
  useEffect(() => { setDep(s.default_department_id ? String(s.default_department_id) : ""); setTags(new Set(s.auto_tag_ids)); }, [s.default_department_id, s.auto_tag_ids]);
  const dirty = dep !== (s.default_department_id ? String(s.default_department_id) : "") || [...tags].sort().join(",") !== [...s.auto_tag_ids].sort().join(",");
  return (
    <div className="card">
      <h2>Automações dos leads novos</h2>
      <p className="sub">Quando alguém escreve pela primeira vez (ou você cria um lead), o sistema já aplica isto sozinho.</p>
      <div className="grid" style={{ gap: 10 }}>
        <label className="field"><span>Departamento padrão das conversas novas</span>
          <select value={dep} onChange={(e) => setDep(e.target.value)}><option value="">— nenhum (fica sem departamento)</option>{s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <div className="field"><span>Etiquetas automáticas <span className="muted">(todo lead novo recebe)</span></span>
          <div className="tag-pick">
            {s.tags.map((t) => <label key={t.id} className={`chip pick ${tags.has(t.id) ? "on" : ""}`}><input type="checkbox" hidden checked={tags.has(t.id)} onChange={() => { const n = new Set(tags); n.has(t.id) ? n.delete(t.id) : n.add(t.id); setTags(n); }} />{t.name}</label>)}
            {!s.tags.length && <span className="muted">Crie etiquetas no card ao lado.</span>}
          </div>
        </div>
        <div className="row-actions"><button className="btn primary" disabled={!dirty} onClick={() => run({ action: "defaults_save", default_department_id: dep || null, auto_tag_ids: [...tags] }, "Automações salvas.")}>Salvar automações</button></div>
      </div>
    </div>
  );
}

function QuickCard({ s, run }: { s: Settings; run: (b: any, d?: string) => Promise<any> }) {
  const empty = { id: 0, title: "", shortcut: "", body: "" };
  const [f, setF] = useState(empty);
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const insertVar = (k: string) => {
    const el = bodyRef.current; const token = `{{${k}}}`;
    if (!el) { setF({ ...f, body: f.body + token }); return; }
    const a = el.selectionStart ?? f.body.length, b = el.selectionEnd ?? a;
    const body = f.body.slice(0, a) + token + f.body.slice(b);
    setF({ ...f, body });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const qn = q.trim().toLowerCase();
  const list = s.quickReplies.filter((x) => !qn || x.title.toLowerCase().includes(qn) || (x.shortcut || "").includes(qn) || x.body.toLowerCase().includes(qn));
  return (
    <div className="card" id="respostas">
      <h2>Respostas rápidas</h2>
      <p className="sub">Textos prontos para responder em um clique. No atendimento, clique no raio ou digite <code>/</code> e o atalho (ex.: <code>/horario</code>). As variáveis são trocadas pelo dado do contato na hora.</p>
      {s.quickReplies.length > 4 && <input placeholder="Buscar resposta" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />}
      <div className="ps-list">
        {list.map((x) => (
          <div key={x.id} className="ps-item">
            <div><b>{x.shortcut && <span className="ps-key">/{x.shortcut}</span>}{x.title}</b><small>{x.body}</small></div>
            <div className="row-actions"><button className="btn" onClick={() => setF({ id: x.id, title: x.title, shortcut: x.shortcut || "", body: x.body })}>Editar</button><button className="btn" onClick={() => confirm(`Excluir a resposta “${x.title}”?`) && run({ action: "quick_delete", id: x.id }, "Resposta excluída.")} aria-label="Excluir">✕</button></div>
          </div>
        ))}
        {!s.quickReplies.length && <div className="muted">Nenhuma resposta rápida ainda. Comece pelas mais usadas: saudação, horário de funcionamento, formas de pagamento, entrega.</div>}
      </div>
      <div className="ps-form">
        <b style={{ fontSize: 13.5 }}>{f.id ? "Editar resposta" : "Nova resposta"}</b>
        <div className="grid two" style={{ gap: 8 }}>
          <label className="field"><span>Título</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ex.: Horário de funcionamento" /></label>
          <label className="field"><span>Atalho <span className="muted">(opcional)</span></span><div className="cp-slug"><span>/</span><input value={f.shortcut} onChange={(e) => setF({ ...f, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="horario" /></div></label>
        </div>
        <label className="field"><span>Texto</span><textarea ref={bodyRef} rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={"{{saudacao}}, {{primeiro_nome}}! Aqui é {{atendente}}, da {{empresa}}. Como posso ajudar?"} /></label>
        <div className="field"><span>Inserir variável</span><div className="ps-vars">{QUICK_VARS.map((v) => <button key={v.key} type="button" onClick={() => insertVar(v.key)} title={v.label}>{`{{${v.key}}}`}</button>)}</div></div>
        <div className="row-actions">
          <button className="btn primary" disabled={!f.title.trim() || !f.body.trim()} onClick={async () => { const r = await run({ action: "quick_save", ...f }, f.id ? "Resposta atualizada." : "Resposta criada."); if (r) setF(empty); }}>{f.id ? "Salvar" : "Adicionar"}</button>
          {f.id ? <button className="btn" onClick={() => setF(empty)}>Cancelar</button> : null}
        </div>
      </div>
    </div>
  );
}

function SimpleCard({ title, sub, items, kind, run, placeholder, chips }: { title: string; sub: string; items: Item[]; kind: "department" | "tag"; run: (b: any, d?: string) => Promise<any>; placeholder: string; chips?: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[kind === "tag" ? 0 : 1]);
  const label = kind === "tag" ? "a etiqueta" : "o departamento";
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="sub">{sub}</p>
      {chips
        ? <div className="tag-pick">{items.map((t) => <span key={t.id} className="chip tag" style={{ background: t.color || undefined }}>{t.name} <button className="link" style={{ color: "inherit", marginLeft: 4 }} onClick={() => confirm(`Excluir ${label} ${t.name}?`) && run({ action: `${kind}_delete`, id: t.id })} aria-label={`Excluir ${t.name}`}>✕</button></span>)}{!items.length && <span className="muted">Nenhuma ainda.</span>}</div>
        : <div className="ps-list">{items.map((x) => <div key={x.id} className="ps-item"><span className="color-dot" style={{ background: x.color || "var(--text-3)" }} /><div><b>{x.name}</b></div><button className="btn" onClick={() => confirm(`Excluir ${label} ${x.name}? As conversas dele ficam sem departamento.`) && run({ action: `${kind}_delete`, id: x.id })}>Excluir</button></div>)}{!items.length && <div className="muted">Nenhum ainda.</div>}</div>}
      <div className="ps-form">
        <div className="kv-row"><input placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && name.trim()) { await run({ action: `${kind}_save`, name, color }); setName(""); } }} /><Swatches value={color} onChange={setColor} /></div>
        <div><button className="btn primary" disabled={!name.trim()} onClick={async () => { await run({ action: `${kind}_save`, name, color }); setName(""); }}>Adicionar</button></div>
      </div>
    </div>
  );
}
