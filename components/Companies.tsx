"use client";
// Configurações → Empresas (portal de clientes): empresa com marca própria, números que ela atende, usuários-cliente
// (login, departamento, números e funis que veem), funis/etapas, departamentos e etiquetas da empresa.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Nav";
import { FEATURES, slugify, type CompanyDefaults } from "@/lib/companies";
import CompanyWizard, { NumberPicker, readLogo, type Num } from "./CompanyWizard";
import CompanyDefaultsCard from "./CompanyDefaults";

type Stage = { id: number; name: string; color: string | null; kind: "open" | "won" | "lost"; position: number };
type Pipe = { id: number; name: string; auto_add: boolean; stages: Stage[] };
type CUser = { id: number; name: string; email: string; department_id: number | null; active: boolean; last_login_at: string | null; phone_ids: string[]; pipeline_ids: number[] };
type Company = {
  id: number; name: string; slug: string; primary_color: string; secondary_color: string | null; logo_url: string | null; tagline: string | null; active: boolean;
  default_department_id: number | null; auto_tag_ids: number[]; features: Record<string, boolean> | null;
  phone_ids: string[]; users: CUser[]; pipelines: Pipe[]; departments: { id: number; name: string; color: string | null }[]; tags: { id: number; name: string; color: string | null }[];
};
type Data = { companies: Company[]; numbers: Num[]; phoneOwner: Record<string, number>; defaults: CompanyDefaults };

const COLORS = ["#8b7cf6", "#3987e5", "#199e70", "#d95926", "#c98500", "#d55181", "#e66767", "#6d5fd1"];
const KIND_LABEL: Record<string, string> = { open: "Em andamento", won: "Ganho", lost: "Perdido" };

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

const j2msg = (b: any) => b.user ? "Empresa criada com o primeiro usuário. Passe o e-mail e a senha para a pessoa." : "Empresa criada. Quando quiser, cadastre os usuários dela abaixo.";

export default function Companies() {
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const load = () => api("/api/empresas").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (body: any, done = "Salvo.") => {
    setErr(""); setOk("");
    try { const j = await api("/api/empresas", body); setOk(done); await load(); return j; } catch (e: any) { setErr(e.message); throw e; }
  };
  const company = useMemo(() => d?.companies.find((c) => c.id === sel) || null, [d, sel]);
  if (!d) return <div className="card"><h2>Empresas (portal de clientes)</h2><p className="muted">{err || "Carregando…"}</p></div>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {err && <div className="banner"><span className="err">{err}</span></div>}
      {ok && <div className="banner"><span className="ok">{ok}</span></div>}

      <div className="card">
        <div className="cp-head">
          <div><h2>Empresas (portal de clientes)</h2><p className="sub">Cada empresa entra pelo próprio endereço, com o nome e a cor dela, e só vê o atendimento dos números que você liberar.</p></div>
          <button className="btn primary" onClick={() => { setCreating(true); setSel(null); }}><Icon name="plus" size={15} className="" />Nova empresa</button>
        </div>
        {d.companies.length > 0 && (
          <div className="cp-list">
            {d.companies.map((c) => (
              <button key={c.id} type="button" className={`cp-item${sel === c.id ? " on" : ""}${c.active ? "" : " off"}`} onClick={() => { setSel(c.id); setCreating(false); }}>
                <span className="cp-mark" style={{ background: c.primary_color }}>{c.logo_url ? <img src={c.logo_url} alt="" /> : c.name.slice(0, 2).toUpperCase()}</span>
                <span className="cp-main"><b>{c.name}{!c.active && <span className="cp-flag off">desativada</span>}{c.active && !c.phone_ids.length && <span className="cp-flag warn">sem número</span>}{c.active && !c.users.length && <span className="cp-flag warn">sem usuário</span>}</b><small>/{c.slug} · {c.phone_ids.length} número{c.phone_ids.length === 1 ? "" : "s"} · {c.users.length} usuário{c.users.length === 1 ? "" : "s"} · {c.departments.length} departamento{c.departments.length === 1 ? "" : "s"}{c.logo_url ? "" : " · sem logo"}</small></span>
                <Icon name="back" size={14} className="cp-chev" />
              </button>
            ))}
          </div>
        )}
        {!d.companies.length && !creating && <p className="muted" style={{ margin: "10px 0 0" }}>Nenhuma empresa ainda. Crie a primeira para liberar o portal a um cliente.</p>}
      </div>

      {creating && <CompanyWizard key="new" numbers={d.numbers} owner={d.phoneOwner} companies={d.companies} defaults={d.defaults} onCancel={() => setCreating(false)} onCreate={async (b) => { const j = await run(b, j2msg(b)); setCreating(false); setSel(j.id); if (j.warnings?.length) setErr(j.warnings.join(" · ")); }} />}
      {!creating && !company && <CompanyDefaultsCard defaults={d.defaults} run={run} />}

      {company && (
        <>
          {!company.phone_ids.length && company.active && <div className="banner warn"><b>Falta ligar um número.</b> Sem número, os usuários entram e não veem conversa nenhuma — marque abaixo em "Números que a empresa atende".</div>}
          <CompanyForm key={company.id} company={company} onCancel={() => setSel(null)} onSaved={(b) => run({ action: "company_save", id: company.id, ...b })} onToggle={() => run({ action: "company_active", id: company.id, active: !company.active }, company.active ? "Empresa desativada: os usuários dela não entram mais." : "Empresa reativada.")} />
          <NumbersCard company={company} numbers={d.numbers} owner={d.phoneOwner} companies={d.companies} run={run} />
          <UsersCard company={company} numbers={d.numbers} run={run} />
          <PipelinesCard company={company} run={run} />
          <AutomationCard company={company} run={run} />
          <FeaturesCard company={company} run={run} />
          <div className="grid two" style={{ alignItems: "start" }}>
            <SimpleListCard title="Departamentos da empresa" sub="Ex.: Balcão, Entrega, Gerência. Um usuário com departamento só vê as conversas dele (e as sem departamento)." items={company.departments} onAdd={(name, color) => run({ action: "department_save", company_id: company.id, name, color })} onDelete={(id) => run({ action: "department_delete", id })} />
            <SimpleListCard title="Etiquetas da empresa" sub="A empresa também cria as suas em Ajustes, dentro do portal." items={company.tags} onAdd={(name, color) => run({ action: "tag_save", company_id: company.id, name, color })} onDelete={(id) => run({ action: "tag_delete", id })} chips />
          </div>
        </>
      )}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return <div className="swatches">{COLORS.map((k) => <button key={k} type="button" className={`swatch ${value === k ? "on" : ""}`} style={{ background: k }} onClick={() => onChange(k)} aria-label={k} />)}</div>;
}

function CompanyForm({ company, onCancel, onSaved, onToggle }: { company: Company | null; onCancel: () => void; onSaved: (b: any) => Promise<any>; onToggle?: () => void }) {
  const [f, setF] = useState({ name: company?.name || "", slug: company?.slug || "", primary_color: company?.primary_color || "#6b3fe4", secondary_color: company?.secondary_color || "", logo_url: company?.logo_url || "", tagline: company?.tagline || "" });
  const [touched, setTouched] = useState(Boolean(company));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = touched ? f.slug : slugify(f.name);
  const save = async () => {
    setBusy(true); setErr("");
    try { await onSaved({ ...f, slug }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="cp-head">
        <div><h2>{company ? company.name : "Nova empresa"}</h2><p className="sub">{company ? <>Portal: <a href={`/${company.slug}`} target="_blank" rel="noreferrer">{origin}/{company.slug}</a> · login em <a href={`/${company.slug}/login`} target="_blank" rel="noreferrer">/{company.slug}/login</a></> : "Nome, endereço do portal e identidade visual."}</p></div>
        {company && onToggle && <button className="btn" onClick={onToggle}>{company.active ? "Desativar" : "Reativar"}</button>}
      </div>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="field"><span>Nome da empresa</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Farmácia São José" /></label>
        <label className="field"><span>Endereço do portal</span><div className="cp-slug"><span>{origin}/</span><input value={slug} onChange={(e) => { setTouched(true); setF({ ...f, slug: slugify(e.target.value) }); }} placeholder="farmacia-sao-jose" /></div></label>
        <label className="field" style={{ gridColumn: "span 2" }}><span>Slogan <span className="muted">(opcional · aparece sob o nome no portal e no login)</span></span><input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value.slice(0, 80) })} placeholder="ex.: Sua farmácia de confiança, 24 horas" /></label>
        <label className="field"><span>Cor principal <span className="muted">(botões, links, destaque)</span></span>
          <div className="cp-color"><input type="color" value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} aria-label="Cor principal" /><input value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} /></div>
        </label>
        <label className="field"><span>Cor secundária <span className="muted">(opcional)</span></span>
          <div className="cp-color"><input type="color" value={f.secondary_color || f.primary_color} onChange={(e) => setF({ ...f, secondary_color: e.target.value })} aria-label="Cor secundária" /><input value={f.secondary_color} onChange={(e) => setF({ ...f, secondary_color: e.target.value })} placeholder="—" /></div>
        </label>
        <div className="field" style={{ gridColumn: "span 2" }}><span>Logo <span className="muted">(PNG/JPG/WEBP/SVG até 300 KB, ou um endereço https)</span></span>
          <div className="cp-logo">
            <span className="cp-mark big" style={{ background: f.primary_color }}>{f.logo_url ? <img src={f.logo_url} alt="" /> : (f.name || "?").slice(0, 2).toUpperCase()}</span>
            <input value={f.logo_url.startsWith("data:") ? "(arquivo enviado)" : f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} placeholder="https://…/logo.png" readOnly={f.logo_url.startsWith("data:")} />
            <label className="btn">Enviar arquivo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setF({ ...f, logo_url: await readLogo(file) }); setErr(""); } catch (x: any) { setErr(x.message); } }} /></label>
            {f.logo_url && <button className="btn" type="button" onClick={() => setF({ ...f, logo_url: "" })}>Tirar</button>}
          </div>
        </div>
      </div>
      <div className="row-actions" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy || !f.name.trim()} onClick={save}>{company ? "Salvar" : "Criar empresa"}</button>
        <button className="btn" onClick={onCancel}>{company ? "Fechar" : "Cancelar"}</button>
      </div>
    </div>
  );
}

/** Automações da empresa: departamento padrão das conversas novas e etiquetas automáticas dos leads novos. */
function AutomationCard({ company, run }: { company: Company; run: (b: any, d?: string) => Promise<any> }) {
  const [dep, setDep] = useState(company.default_department_id ? String(company.default_department_id) : "");
  const [tags, setTags] = useState<Set<number>>(new Set(company.auto_tag_ids || []));
  useEffect(() => { setDep(company.default_department_id ? String(company.default_department_id) : ""); setTags(new Set(company.auto_tag_ids || [])); }, [company.id, company.default_department_id, (company.auto_tag_ids || []).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = dep !== (company.default_department_id ? String(company.default_department_id) : "") || [...tags].sort().join(",") !== [...(company.auto_tag_ids || [])].sort().join(",");
  return (
    <div className="card">
      <div className="cp-head"><div><h2>Automações dos leads novos</h2><p className="sub">Quando alguém escreve pela primeira vez para um número da empresa (ou um lead é criado no funil), a conversa já nasce no departamento padrão e o contato recebe as etiquetas automáticas. A empresa também pode ajustar isto em Ajustes, no portal.</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="field"><span>Departamento padrão das conversas novas</span>
          <select value={dep} onChange={(e) => setDep(e.target.value)}><option value="">— nenhum</option>{company.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <div className="field"><span>Etiquetas automáticas</span>
          <div className="tag-pick">
            {company.tags.map((t) => <label key={t.id} className={`chip pick ${tags.has(t.id) ? "on" : ""}`}><input type="checkbox" hidden checked={tags.has(t.id)} onChange={() => { const n = new Set(tags); n.has(t.id) ? n.delete(t.id) : n.add(t.id); setTags(n); }} />{t.name}</label>)}
            {!company.tags.length && <span className="muted">Crie etiquetas da empresa abaixo.</span>}
          </div>
        </div>
      </div>
      <div className="row-actions" style={{ marginTop: 12 }}><button className="btn primary" disabled={!dirty} onClick={() => run({ action: "company_defaults", id: company.id, default_department_id: dep || null, auto_tag_ids: [...tags] }, "Automações salvas.")}>Salvar automações</button></div>
    </div>
  );
}

/** Recursos liga/desliga da empresa: todo recurso novo é validado na loja de homologação antes de ligar nas empresas reais. */
function FeaturesCard({ company, run }: { company: Company; run: (b: any, done?: string) => Promise<any> }) {
  const f = company.features || {};
  const toggle = (key: string, label: string) => run({ action: "company_features", id: company.id, features: { ...f, [key]: !f[key] } }, f[key] ? `${label} desligado para ${company.name}.` : `${label} ligado para ${company.name}.`);
  return (
    <div className="card">
      <div className="cp-head"><div><h2>Recursos da empresa</h2><p className="sub">Ligue um recurso novo primeiro na loja de homologação; depois de validado, ligue nas empresas reais. Desligado, nada muda para a empresa.</p></div></div>
      <div className="cp-features">
        {FEATURES.map((x) => (
          <label key={x.key} className={`cp-feature ${f[x.key] ? "on" : ""}`}>
            <input type="checkbox" checked={!!f[x.key]} onChange={() => toggle(x.key, x.label)} />
            <span><b>{x.label}</b><small>{x.help}</small></span>
            <em>{f[x.key] ? "Ligado" : "Desligado"}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

function NumbersCard({ company, numbers, owner, companies, run }: { company: Company; numbers: Num[]; owner: Record<string, number>; companies: Company[]; run: (b: any, d?: string) => Promise<any> }) {
  const [sel, setSel] = useState<Set<string>>(new Set(company.phone_ids));
  useEffect(() => { setSel(new Set(company.phone_ids)); }, [company.id, company.phone_ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = sel.size !== company.phone_ids.length || company.phone_ids.some((p) => !sel.has(p));
  return (
    <div className="card">
      <h2>Números que a empresa atende</h2>
      <p className="sub">As conversas desses números aparecem no portal dela (e os contatos dessas conversas passam a ser da empresa). Um número atende uma empresa só.</p>
      <NumberPicker numbers={numbers} owner={owner} companies={companies} selfId={company.id} sel={sel} onChange={setSel} />
      <div className="row-actions" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!dirty} onClick={() => run({ action: "company_phones", id: company.id, phone_ids: [...sel] }, "Números salvos.")}>Salvar números ({sel.size})</button>
        {dirty && <button className="btn" onClick={() => setSel(new Set(company.phone_ids))}>Desfazer</button>}
      </div>
    </div>
  );
}

function UsersCard({ company, numbers, run }: { company: Company; numbers: Num[]; run: (b: any, d?: string) => Promise<any> }) {
  const empty = { id: 0, name: "", email: "", password: "", department_id: "", phone_ids: new Set<string>(), pipeline_ids: new Set<number>() };
  const [f, setF] = useState<any>(empty);
  const [open, setOpen] = useState(false);
  const myNums = numbers.filter((n) => company.phone_ids.includes(n.id));
  const edit = (u: CUser) => { setF({ id: u.id, name: u.name, email: u.email, password: "", department_id: u.department_id ? String(u.department_id) : "", phone_ids: new Set(u.phone_ids), pipeline_ids: new Set(u.pipeline_ids) }); setOpen(true); };
  const save = async () => {
    await run({ action: "user_save", company_id: company.id, id: f.id || undefined, name: f.name, email: f.email, password: f.password || undefined, department_id: f.department_id || null, phone_ids: [...f.phone_ids], pipeline_ids: [...f.pipeline_ids] }, f.id ? "Usuário salvo." : "Usuário criado. Passe o e-mail e a senha para a pessoa.");
    setF(empty); setOpen(false);
  };
  const togg = (key: "phone_ids" | "pipeline_ids", v: any) => setF((x: any) => { const n = new Set(x[key]); n.has(v) ? n.delete(v) : n.add(v); return { ...x, [key]: n }; });
  return (
    <div className="card">
      <div className="cp-head">
        <div><h2>Usuários da empresa</h2><p className="sub">Entram em /{company.slug}/login com e-mail e senha. Sem números marcados, o usuário atende todos os números da empresa; sem funis marcados, vê todos os funis dela.</p></div>
        <button className="btn primary" onClick={() => { setF(empty); setOpen(true); }}><Icon name="plus" size={15} className="" />Novo usuário</button>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Departamento</th><th>Números</th><th>Funis</th><th>Último acesso</th><th></th></tr></thead><tbody>
        {company.users.map((u) => (
          <tr key={u.id} style={{ opacity: u.active ? 1 : .5 }}>
            <td><b>{u.name}</b><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></td>
            <td>{company.departments.find((x) => x.id === u.department_id)?.name || <span className="muted">—</span>}</td>
            <td>{u.phone_ids.length ? u.phone_ids.length : <span className="muted">todos</span>}</td>
            <td>{u.pipeline_ids.length ? u.pipeline_ids.length : <span className="muted">todos</span>}</td>
            <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}</td>
            <td><div className="row-actions"><button className="btn" onClick={() => edit(u)}>Editar</button><button className="btn" onClick={() => run({ action: "user_active", id: u.id, active: !u.active })}>{u.active ? "Desativar" : "Ativar"}</button></div></td>
          </tr>
        ))}
        {!company.users.length && <tr><td colSpan={6} className="muted">Nenhum usuário ainda.</td></tr>}
      </tbody></table></div>
      {open && (
        <div className="grid" style={{ gap: 8, marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>{f.id ? "Editar usuário" : "Novo usuário"}</b>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="field"><span>Nome</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field"><span>E-mail (login)</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>{f.id ? "Nova senha (vazio = manter)" : "Senha (mín. 8)"}</span><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></label>
            <label className="field"><span>Departamento</span><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">— (vê tudo da empresa)</option>{company.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </div>
          <div className="field"><span>Números que atende <span className="muted">(nenhum marcado = todos)</span></span>
            <div className="tag-pick">{myNums.map((n) => <label key={n.id} className={`chip pick ${f.phone_ids.has(n.id) ? "on" : ""}`}><input type="checkbox" hidden checked={f.phone_ids.has(n.id)} onChange={() => togg("phone_ids", n.id)} />{n.label || n.verified_name || n.display_phone_number}</label>)}{!myNums.length && <span className="muted">Marque os números da empresa acima primeiro.</span>}</div>
          </div>
          <div className="field"><span>Funis que vê <span className="muted">(nenhum marcado = todos)</span></span>
            <div className="tag-pick">{company.pipelines.map((p) => <label key={p.id} className={`chip pick ${f.pipeline_ids.has(p.id) ? "on" : ""}`}><input type="checkbox" hidden checked={f.pipeline_ids.has(p.id)} onChange={() => togg("pipeline_ids", p.id)} />{p.name}</label>)}</div>
          </div>
          <div className="row-actions"><button className="btn primary" disabled={!f.name.trim() || !f.email.trim() || (!f.id && f.password.length < 8)} onClick={save}>{f.id ? "Salvar" : "Criar usuário"}</button><button className="btn" onClick={() => { setF(empty); setOpen(false); }}>Cancelar</button></div>
        </div>
      )}
    </div>
  );
}

function PipelinesCard({ company, run }: { company: Company; run: (b: any, d?: string) => Promise<any> }) {
  const [editing, setEditing] = useState<{ id: number; name: string; auto_add: boolean; stages: { id?: number; name: string; color: string; kind: string }[] } | null>(null);
  const start = (p?: Pipe) => setEditing(p
    ? { id: p.id, name: p.name, auto_add: p.auto_add, stages: p.stages.map((s) => ({ id: s.id, name: s.name, color: s.color || COLORS[0], kind: s.kind })) }
    : { id: 0, name: "", auto_add: true, stages: [{ name: "Novo", color: "#3987e5", kind: "open" }, { name: "Em contato", color: "#8b7cf6", kind: "open" }, { name: "Fechado", color: "#199e70", kind: "won" }] });
  const setStage = (i: number, patch: any) => setEditing((e) => e && { ...e, stages: e.stages.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const moveStage = (i: number, dir: -1 | 1) => setEditing((e) => { if (!e) return e; const j = i + dir; if (j < 0 || j >= e.stages.length) return e; const st = [...e.stages]; [st[i], st[j]] = [st[j], st[i]]; return { ...e, stages: st }; });
  return (
    <div className="card">
      <div className="cp-head">
        <div><h2>Funis</h2><p className="sub">Quadro de etapas do atendimento. Com "entrada automática", todo contato novo dos números da empresa entra na 1ª etapa do primeiro funil assim que escreve.</p></div>
        <button className="btn primary" onClick={() => start()}><Icon name="plus" size={15} className="" />Novo funil</button>
      </div>
      <div className="grid" style={{ gap: 8 }}>
        {company.pipelines.map((p) => (
          <div key={p.id} className="cp-pipe">
            <div className="cp-pipe-main"><b>{p.name}</b>{p.auto_add && <span className="pill good"><i aria-hidden />entrada automática</span>}
              <div className="cp-stages">{p.stages.map((s) => <span key={s.id} className="cp-stage" style={{ "--c": s.color || "var(--accent)" } as React.CSSProperties}><i />{s.name}</span>)}</div>
            </div>
            <div className="row-actions"><button className="btn" onClick={() => start(p)}>Editar</button><button className="btn" onClick={() => confirm(`Excluir o funil ${p.name}? Os leads saem do funil (os contatos continuam).`) && run({ action: "pipeline_delete", id: p.id })}>Excluir</button></div>
          </div>
        ))}
        {!company.pipelines.length && <div className="muted">Nenhum funil.</div>}
      </div>
      {editing && (
        <div className="grid" style={{ gap: 8, marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>{editing.id ? "Editar funil" : "Novo funil"}</b>
          <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <label className="field"><span>Nome do funil</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Funil de vendas" /></label>
            <label className="check"><input type="checkbox" checked={editing.auto_add} onChange={(e) => setEditing({ ...editing, auto_add: e.target.checked })} /> <span>Entrada automática</span></label>
          </div>
          <div className="field"><span>Etapas (na ordem)</span>
            <div className="grid" style={{ gap: 6 }}>
              {editing.stages.map((s, i) => (
                <div key={i} className="cp-stage-row">
                  <input value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} placeholder={`Etapa ${i + 1}`} />
                  <select value={s.kind} onChange={(e) => setStage(i, { kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <Swatches value={s.color} onChange={(c) => setStage(i, { color: c })} />
                  <button type="button" className="btn icon" onClick={() => moveStage(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                  <button type="button" className="btn icon" onClick={() => moveStage(i, 1)} disabled={i === editing.stages.length - 1} aria-label="Descer">↓</button>
                  <button type="button" className="btn icon" onClick={() => setEditing({ ...editing, stages: editing.stages.filter((_, j) => j !== i) })} disabled={editing.stages.length <= 1} aria-label="Remover">✕</button>
                </div>
              ))}
              <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setEditing({ ...editing, stages: [...editing.stages, { name: "", color: COLORS[editing.stages.length % COLORS.length], kind: "open" }] })}>+ etapa</button>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn primary" disabled={!editing.name.trim() || !editing.stages.some((s) => s.name.trim())} onClick={async () => { await run({ action: "pipeline_save", company_id: company.id, id: editing.id || undefined, name: editing.name, auto_add: editing.auto_add, stages: editing.stages }); setEditing(null); }}>Salvar funil</button>
            <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleListCard({ title, sub, items, onAdd, onDelete, chips = false }: { title: string; sub: string; items: { id: number; name: string; color: string | null }[]; onAdd: (name: string, color: string) => Promise<any>; onDelete: (id: number) => Promise<any>; chips?: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="sub">{sub}</p>
      {chips
        ? <div className="tag-pick">{items.map((t) => <span key={t.id} className="chip tag" style={{ background: t.color || undefined }}>{t.name} <button className="link" style={{ color: "inherit", marginLeft: 4 }} onClick={() => confirm(`Excluir ${t.name}?`) && onDelete(t.id)}>✕</button></span>)}{!items.length && <span className="muted">Nenhuma ainda.</span>}</div>
        : <div className="grid" style={{ gap: 6 }}>{items.map((x) => <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="color-dot" style={{ background: x.color || "var(--text-3)" }} /><span style={{ flex: 1 }}>{x.name}</span><button className="btn" onClick={() => confirm(`Excluir ${x.name}?`) && onDelete(x.id)}>Excluir</button></div>)}{!items.length && <div className="muted">Nenhum ainda.</div>}</div>}
      <div className="kv-row" style={{ marginTop: 12 }}>
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Swatches value={color} onChange={setColor} />
      </div>
      <button className="btn primary" onClick={async () => { if (name.trim()) { await onAdd(name.trim(), color); setName(""); } }}>Adicionar</button>
    </div>
  );
}
