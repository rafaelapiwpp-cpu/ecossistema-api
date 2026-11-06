"use client";
// Cadastro de empresa em uma tela só: dados e marca, números que ela atende, departamentos e o primeiro usuário.
// O que toda empresa nova recebe pronto (funil, respostas rápidas, departamentos padrão) vem dos "Padrões para empresas novas".
import { useMemo, useState } from "react";
import { slugify } from "@/lib/companies";
import type { CompanyDefaults } from "@/lib/companies";

export type Num = { id: string; waba_id: string; display_phone_number: string; verified_name: string | null; label: string | null; quality_rating: string | null; waba_name: string | null; connection_id: number | null; connection_name: string | null };
type OwnerMap = Record<string, number>;

/** Lê um arquivo de imagem pequeno como data URL (fica guardado junto com a empresa). */
export function readLogo(file: File): Promise<string> {
  return new Promise((res, rej) => {
    if (file.size > 300 * 1024) return rej(new Error("Logo muito grande: use um arquivo de até 300 KB (PNG, JPG, WEBP ou SVG)"));
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Não foi possível ler o arquivo"));
    r.readAsDataURL(file);
  });
}

/** Lista de números agrupada por BM, com os já usados por outra empresa marcados. */
export function NumberPicker({ numbers, owner, companies, selfId, sel, onChange }: { numbers: Num[]; owner: OwnerMap; companies: { id: number; name: string }[]; selfId: number | null; sel: Set<string>; onChange: (s: Set<string>) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: Num[] }>();
    for (const n of numbers) { const k = n.connection_name || "Sem BM"; if (!m.has(k)) m.set(k, { name: k, items: [] }); m.get(k)!.items.push(n); }
    return [...m.values()];
  }, [numbers]);
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); onChange(n); };
  if (!numbers.length) return <p className="muted">Nenhum número disponível — sincronize as conexões primeiro.</p>;
  return (
    <>
      {groups.map((g) => (
        <details key={g.name} className="cp-group" open={g.items.some((n) => sel.has(n.id))}>
          <summary><b>{g.name}</b><em>{g.items.filter((n) => sel.has(n.id)).length}/{g.items.length}</em>
            <button type="button" className="link" onClick={(e) => { e.preventDefault(); const n = new Set(sel); const all = g.items.every((x) => n.has(x.id)); for (const x of g.items) all ? n.delete(x.id) : n.add(x.id); onChange(n); }}>{g.items.every((x) => sel.has(x.id)) ? "desmarcar todos" : "marcar todos"}</button>
          </summary>
          <div className="cp-nums">
            {g.items.map((n) => {
              const other = owner[n.id] && owner[n.id] !== selfId ? companies.find((c) => c.id === owner[n.id]) : null;
              return (
                <label key={n.id} className={`cp-num${sel.has(n.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={sel.has(n.id)} onChange={() => toggle(n.id)} />
                  <span className="cp-num-main"><b>{n.display_phone_number}</b><small>{n.label || n.verified_name || "—"}{n.waba_name ? ` · ${n.waba_name}` : ""}</small></span>
                  {other && <span className="cp-owner" title="Marcar aqui tira o número da outra empresa">{other.name}</span>}
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </>
  );
}

export default function CompanyWizard({ numbers, owner, companies, defaults, onCancel, onCreate }: {
  numbers: Num[]; owner: OwnerMap; companies: { id: number; name: string }[]; defaults: CompanyDefaults; onCancel: () => void; onCreate: (body: any) => Promise<any>;
}) {
  const [f, setF] = useState({ name: "", slug: "", tagline: "", primary_color: "#6b3fe4", secondary_color: "", logo_url: "" });
  const [touched, setTouched] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [deps, setDeps] = useState<string[]>(defaults.departments);
  const [depDraft, setDepDraft] = useState("");
  const [u, setU] = useState({ name: "", email: "", password: "", department: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = touched ? f.slug : slugify(f.name);
  const userStarted = !!(u.name || u.email || u.password);
  const userOk = !userStarted || (u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && u.password.length >= 8);
  const addDep = () => { const n = depDraft.trim(); if (n && !deps.some((d) => d.toLowerCase() === n.toLowerCase())) setDeps([...deps, n]); setDepDraft(""); };
  const create = async () => {
    setBusy(true); setErr("");
    try { await onCreate({ action: "company_create", ...f, slug, phone_ids: [...sel], departments: deps, user: userStarted ? u : null }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card cw">
      <div className="cp-head">
        <div><h2>Nova empresa</h2><p className="sub">Nome, endereço do portal, marca, números, departamentos e o primeiro usuário — em uma tela só. Ao criar, a empresa já nasce com o funil, as respostas rápidas e os departamentos dos padrões.</p></div>
        <button className="btn" onClick={onCancel}>Cancelar</button>
      </div>
      {err && <div className="banner err"><span>{err}</span></div>}

      <section className="cw-step">
        <h3><span>1</span>Dados e marca</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="field"><span>Nome da empresa</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Farmácia São José" autoFocus /></label>
          <label className="field"><span>Endereço do portal</span><div className="cp-slug"><span>{origin}/</span><input value={slug} onChange={(e) => { setTouched(true); setF({ ...f, slug: slugify(e.target.value) }); }} placeholder="farmacia-sao-jose" /></div></label>
          <label className="field" style={{ gridColumn: "span 2" }}><span>Slogan <span className="muted">(opcional · aparece sob o nome no portal e no login)</span></span><input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value.slice(0, 80) })} placeholder="ex.: Sua farmácia de confiança, 24 horas" /></label>
          <label className="field"><span>Cor principal <span className="muted">(botões, links, destaque)</span></span>
            <div className="cp-color"><input type="color" value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} aria-label="Cor principal" /><input value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} /></div>
          </label>
          <label className="field"><span>Cor secundária <span className="muted">(opcional)</span></span>
            <div className="cp-color"><input type="color" value={f.secondary_color || f.primary_color} onChange={(e) => setF({ ...f, secondary_color: e.target.value })} aria-label="Cor secundária" /><input value={f.secondary_color} onChange={(e) => setF({ ...f, secondary_color: e.target.value })} placeholder="—" /></div>
          </label>
          <div className="field" style={{ gridColumn: "span 2" }}><span>Logo <span className="muted">(quadrado fica melhor · PNG/JPG/WEBP/SVG até 300 KB, ou um endereço https)</span></span>
            <div className="cp-logo">
              <span className="cp-mark big" style={{ background: f.primary_color }}>{f.logo_url ? <img src={f.logo_url} alt="" /> : (f.name || "?").slice(0, 2).toUpperCase()}</span>
              <input value={f.logo_url.startsWith("data:") ? "(arquivo enviado)" : f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} placeholder="https://…/logo.png" readOnly={f.logo_url.startsWith("data:")} />
              <label className="btn">Enviar arquivo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setF({ ...f, logo_url: await readLogo(file) }); setErr(""); } catch (x: any) { setErr(x.message); } }} /></label>
              {f.logo_url && <button className="btn" type="button" onClick={() => setF({ ...f, logo_url: "" })}>Tirar</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="cw-step">
        <h3><span>2</span>Números que a empresa atende <em>{sel.size ? `${sel.size} marcado${sel.size === 1 ? "" : "s"}` : "nenhum ainda"}</em></h3>
        <p className="sub">As conversas desses números aparecem no portal dela. Um número atende uma empresa só. Sem número, os usuários entram e não veem conversa nenhuma — dá para ligar depois.</p>
        <NumberPicker numbers={numbers} owner={owner} companies={companies} selfId={null} sel={sel} onChange={setSel} />
      </section>

      <section className="cw-step">
        <h3><span>3</span>Departamentos <em>{deps.length ? deps.join(" · ") : "opcional"}</em></h3>
        <p className="sub">Ex.: Balcão, Entrega, Gerência. Um usuário com departamento só vê as conversas dele (e as sem departamento).</p>
        <div className="cw-chips">
          {deps.map((d) => <span key={d} className="chip pick on" onClick={() => setDeps(deps.filter((x) => x !== d))} title="Tirar">{d} ×</span>)}
          <input value={depDraft} onChange={(e) => setDepDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDep(); } }} onBlur={addDep} placeholder="Novo departamento + Enter" aria-label="Novo departamento" />
        </div>
      </section>

      <section className="cw-step">
        <h3><span>4</span>Primeiro usuário <em>{userStarted ? (userOk ? "pronto" : "incompleto") : "opcional"}</em></h3>
        <p className="sub">Quem vai atender: e-mail é o login; senha inicial com 8+ caracteres (a pessoa troca em Ajustes → Minha conta). Sem departamento = vê tudo da empresa.</p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="field"><span>Nome</span><input value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} placeholder="Ana Balcão" /></label>
          <label className="field"><span>E-mail (login)</span><input type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} placeholder="ana@farmacia.com" /></label>
          <label className="field"><span>Senha inicial</span><input type="password" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} placeholder="mínimo 8 caracteres" autoComplete="new-password" /></label>
          <label className="field"><span>Departamento</span><select value={u.department} onChange={(e) => setU({ ...u, department: e.target.value })}><option value="">— vê tudo da empresa</option>{deps.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        </div>
      </section>

      <section className="cw-step cw-ready">
        <h3><span>✓</span>Já vem pronto</h3>
        <p className="sub">Funil "Funil de vendas" com {defaults.stages.map((s) => s.name).join(" → ")} e entrada automática · {defaults.quick_replies.length} resposta{defaults.quick_replies.length === 1 ? "" : "s"} rápida{defaults.quick_replies.length === 1 ? "" : "s"}{defaults.departments.length ? ` · departamentos ${defaults.departments.join(", ")}` : ""}. Edite em "Padrões para empresas novas".</p>
      </section>

      <div className="row-actions" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy || !f.name.trim() || !userOk} onClick={create}>{busy ? "Criando…" : "Criar empresa"}</button>
        <button className="btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
