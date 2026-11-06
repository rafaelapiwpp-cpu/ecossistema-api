"use client";
import { ASSIGNABLE_ROLES, ROLE_LABEL, isAdminRole, isMaster } from "@/lib/roles";
import { useEffect, useState } from "react";

type Catalog = {
  departments: { id: number; name: string; color: string | null }[];
  users: { id: number; name: string; email: string; role: string; department_id: number | null; active: boolean; recovery_email?: string | null }[];
  tags: { id: number; name: string; color: string | null }[];
  lists: { id: number; name: string; description: string | null; total: number; waba_id: string | null }[];
  wabas: { id: string; name: string | null }[];
  quickReplies: { id: number; title: string; body: string; department_id: number | null; shortcut?: string | null }[];
  me: { id: number; role: string };
};

const COLORS = ["#8b7cf6", "#3987e5", "#199e70", "#d95926", "#c98500", "#d55181", "#e66767", "#6d5fd1"];

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function Team() {
  const [c, setC] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const load = () => api("/api/catalogo").then(setC).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (body: any, done?: string) => {
    setErr(""); setOk("");
    try { const j = await api("/api/equipe", body); setOk(done || "Salvo."); await load(); if (j.relogin) setOk("Senha alterada. Entre novamente na próxima vez."); } catch (e: any) { setErr(e.message); }
  };
  if (!c) return <div className="muted">Carregando…</div>;
  const admin = isAdminRole(c.me.role);
  return (
    <>
      {err && <div className="banner"><span className="err">{err}</span></div>}
      {ok && <div className="banner"><span className="ok">{ok}</span></div>}
      <div className="grid three">
        <UsersCard c={c} admin={admin} run={run} />
        <DepartmentsCard c={c} run={run} />
        <QuickCard c={c} run={run} />
        <TagsCard c={c} run={run} />
        <ListsCard c={c} run={run} />
        <PasswordCard run={run} />
      </div>
    </>
  );
}

function UsersCard({ c, admin, run }: { c: Catalog; admin: boolean; run: (b: any, d?: string) => Promise<void> }) {
  const empty = { id: 0, name: "", email: "", role: "atendente", department_id: "", password: "", recovery_email: "" };
  const [f, setF] = useState<any>(empty);
  return (
    <div className="card wide">
      <h2>Usuários</h2>
      <p className="sub">Cada pessoa entra com o próprio login. Atendentes veem as conversas do seu departamento; gestores e administradores veem tudo o que é da equipe. BMs marcadas como <b>Só Master</b> aparecem apenas para o Master.</p>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Papel</th><th>Departamento</th><th></th></tr></thead><tbody>
        {c.users.map((u) => (
          <tr key={u.id} style={{ opacity: u.active ? 1 : .5 }}>
            <td><b>{u.name}</b><div className="muted" style={{ fontSize: 12 }}>{u.email}{u.recovery_email && u.recovery_email !== u.email ? <> · recuperação: {u.recovery_email}</> : null}</div></td>
            <td>{isMaster(u.role) ? <span className="role-master">Master</span> : ROLE_LABEL[u.role] || u.role}</td>
            <td>{c.departments.find((d) => d.id === u.department_id)?.name || <span className="muted">—</span>}</td>
            <td>{admin && (!isMaster(u.role) || isMaster(c.me.role)) && <div className="row-actions"><button className="btn" onClick={() => setF({ id: u.id, name: u.name, email: u.email, role: u.role, department_id: u.department_id ? String(u.department_id) : "", password: "", recovery_email: u.recovery_email || "" })}>Editar</button>{u.id !== c.me.id && !isMaster(u.role) && <button className="btn" onClick={() => run({ action: "user_active", id: u.id, active: !u.active })}>{u.active ? "Desativar" : "Ativar"}</button>}</div>}</td>
          </tr>
        ))}
      </tbody></table></div>
      {admin && (
        <div className="grid" style={{ gap: 8, marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>{f.id ? "Editar usuário" : "Novo usuário"}</b>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="field"><span>Nome</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field"><span>E-mail (login)</span><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>Papel</span>{isMaster(f.role)
              ? <select value="master" disabled><option value="master">Master (dono do sistema)</option></select>
              : <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ASSIGNABLE_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}</select>}</label>
            <label className="field"><span>Departamento</span><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">—</option>{c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="field" style={{ gridColumn: "span 2" }}><span>E-mail de recuperação <span className="muted">(recebe o código de "Esqueci minha senha"; se vazio, vale o login quando for um e-mail)</span></span><input type="email" value={f.recovery_email} onChange={(e) => setF({ ...f, recovery_email: e.target.value })} placeholder="pessoa@gmail.com" /></label>
            <label className="field" style={{ gridColumn: "span 2" }}><span>{f.id ? "Nova senha (deixe vazio para manter)" : "Senha (mín. 8)"}</span><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></label>
          </div>
          <div className="row-actions"><button className="btn primary" onClick={async () => { await run({ action: "user_save", ...f, department_id: f.department_id || null }); setF(empty); }}>{f.id ? "Salvar" : "Criar usuário"}</button>{f.id ? <button className="btn" onClick={() => setF(empty)}>Cancelar</button> : null}</div>
        </div>
      )}
    </div>
  );
}

function DepartmentsCard({ c, run }: { c: Catalog; run: (b: any, d?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="card">
      <h2>Departamentos</h2>
      <p className="sub">Vendas, suporte, financeiro… As conversas e os contatos podem ser direcionados a um departamento.</p>
      <div className="grid" style={{ gap: 6 }}>
        {c.departments.map((d) => <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="color-dot" style={{ background: d.color || "var(--text-3)" }} /><span style={{ flex: 1 }}>{d.name}</span><button className="btn" onClick={() => confirm(`Excluir o departamento ${d.name}?`) && run({ action: "department_delete", id: d.id })}>Excluir</button></div>)}
        {!c.departments.length && <div className="muted">Nenhum departamento ainda.</div>}
      </div>
      <div className="kv-row" style={{ marginTop: 12 }}>
        <input placeholder="Nome do depto." value={name} onChange={(e) => setName(e.target.value)} />
        <Swatches value={color} onChange={setColor} />
      </div>
      <button className="btn primary" onClick={async () => { if (name.trim()) { await run({ action: "department_save", name, color }); setName(""); } }}>Adicionar</button>
    </div>
  );
}

function TagsCard({ c, run }: { c: Catalog; run: (b: any, d?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="card">
      <h2>Tags</h2>
      <p className="sub">Etiquetas livres para contatos e conversas (ex.: lead-quente, cliente, cancelou).</p>
      <div className="tag-pick">{c.tags.map((t) => <span key={t.id} className="chip tag" style={{ background: t.color || undefined }}>{t.name} <button className="link" style={{ color: "inherit", marginLeft: 4 }} onClick={() => confirm(`Excluir a tag ${t.name}?`) && run({ action: "tag_delete", id: t.id })}>✕</button></span>)}{!c.tags.length && <span className="muted">Nenhuma tag.</span>}</div>
      <div className="kv-row" style={{ marginTop: 12 }}>
        <input placeholder="Nova tag" value={name} onChange={(e) => setName(e.target.value)} />
        <Swatches value={color} onChange={setColor} />
      </div>
      <button className="btn primary" onClick={async () => { if (name.trim()) { await run({ action: "tag_save", name, color }); setName(""); } }}>Adicionar</button>
    </div>
  );
}

function ListsCard({ c, run }: { c: Catalog; run: (b: any, d?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [waba, setWaba] = useState(c.wabas[0]?.id || "");
  return (
    <div className="card">
      <h2>Listas</h2>
      <p className="sub">Grupos fixos de contatos, usados como público dos disparos.</p>
      <div className="table-wrap"><table><thead><tr><th>Lista</th><th className="r">Contatos</th><th></th></tr></thead><tbody>
        {c.lists.map((l) => <tr key={l.id}><td><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.wabas.find((w) => w.id === l.waba_id)?.name || ""}</div></td><td className="r num">{l.total}</td><td><button className="btn" onClick={() => confirm(`Excluir a lista ${l.name}?`) && run({ action: "list_delete", id: l.id })}>Excluir</button></td></tr>)}
        {!c.lists.length && <tr><td colSpan={3} className="muted">Nenhuma lista.</td></tr>}
      </tbody></table></div>
      <div className="kv-row" style={{ marginTop: 12 }}>
        <input placeholder="Nova lista" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={waba} onChange={(e) => setWaba(e.target.value)} style={{ minHeight: 32 }}>{c.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select>
      </div>
      <button className="btn primary" onClick={async () => { if (name.trim()) { await run({ action: "list_save", name, waba_id: waba }); setName(""); } }}>Adicionar</button>
    </div>
  );
}

function QuickCard({ c, run }: { c: Catalog; run: (b: any, d?: string) => Promise<void> }) {
  const empty = { id: 0, title: "", body: "", department_id: "", shortcut: "" };
  const [f, setF] = useState(empty);
  return (
    <div className="card">
      <h2>Respostas rápidas</h2>
      <p className="sub">Textos prontos para o atendimento: raio no chat ou <code>/atalho</code> na mensagem. Variáveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{telefone}}"}, {"{{atendente}}"}, {"{{saudacao}}"}.</p>
      <div className="grid" style={{ gap: 6 }}>
        {c.quickReplies.map((q) => <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><div style={{ flex: 1 }}><b>{q.shortcut && <code style={{ marginRight: 6 }}>/{q.shortcut}</code>}{q.title}</b><div className="muted" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{q.body}</div></div><button className="btn" onClick={() => setF({ id: q.id, title: q.title, body: q.body, department_id: q.department_id ? String(q.department_id) : "", shortcut: q.shortcut || "" })}>Editar</button><button className="btn" onClick={() => run({ action: "quick_delete", id: q.id })}>✕</button></div>)}
        {!c.quickReplies.length && <div className="muted">Nenhuma resposta rápida.</div>}
      </div>
      <div className="grid" style={{ gap: 8, marginTop: 12 }}>
        <label className="field"><span>Título</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ex.: Horário de funcionamento" /></label>
        <label className="field"><span>Atalho <span className="muted">(opcional)</span></span><div className="cp-slug"><span>/</span><input value={f.shortcut} onChange={(e) => setF({ ...f, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="horario" /></div></label>
        <label className="field"><span>Texto</span><textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        <label className="field"><span>Só para o departamento</span><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">Todos</option>{c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <div className="row-actions"><button className="btn primary" onClick={async () => { await run({ action: "quick_save", ...f, department_id: f.department_id || null }); setF(empty); }}>{f.id ? "Salvar" : "Adicionar"}</button>{f.id ? <button className="btn" onClick={() => setF(empty)}>Cancelar</button> : null}</div>
      </div>
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return <div className="swatches">{COLORS.map((k) => <button key={k} type="button" className={`swatch ${value === k ? "on" : ""}`} style={{ background: k }} onClick={() => onChange(k)} aria-label={k} />)}</div>;
}

function PasswordCard({ run }: { run: (b: any, d?: string) => Promise<void> }) {
  const [p1, setP1] = useState(""); const [p2, setP2] = useState("");
  return (
    <div className="card">
      <h2>Minha senha</h2>
      <p className="sub">Troque a sua senha de acesso.</p>
      <div className="grid" style={{ gap: 8 }}>
        <label className="field"><span>Nova senha (mín. 8)</span><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></label>
        <label className="field"><span>Confirmar</span><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></label>
        <div><button className="btn primary" disabled={!p1 || p1 !== p2} onClick={async () => { await run({ action: "my_password", password: p1 }, "Senha alterada."); setP1(""); setP2(""); }}>Alterar senha</button></div>
      </div>
    </div>
  );
}
