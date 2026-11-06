"use client";
import { Icon } from "./Nav";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { invalidateCatalog, loadCatalog } from "@/lib/catalog-client";
import { normalizePhone } from "@/lib/phone";
import { guessColumns, readPasted, readTable, type Table } from "@/lib/sheet-client";
import ContactsManager from "@/components/contacts/ContactsManager";
import type { Filters } from "@/components/contacts/shared";
import Groups, { type Counts } from "@/components/leads/Groups";

type Catalog = {
  departments: { id: number; name: string; company_id?: number | null }[]; tags: { id: number; name: string; color: string | null; company_id?: number | null }[];
  lists: { id: number; name: string; total: number; waba_id?: string | null }[]; wabas: { id: string; name: string | null }[]; me: { role: string };
};
type ListRow = {
  id: number; name: string; waba_id: string | null; description: string | null; tag_id: number | null; last_import_at: string | null; imported: number; created_at: string;
  waba_name: string | null; tag_name: string | null; tag_color: string | null; total: number; opted_out: number; replied: number;
};

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function Leads() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [totals, setTotals] = useState<{ contacts: number; in_lists: number; tags: number } | null>(null);
  const [wizard, setWizard] = useState<{ listId?: number } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [rename, setRename] = useState<ListRow | null>(null);
  const [del, setDel] = useState<ListRow | null>(null);
  const [newList, setNewList] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [focus, setFocus] = useState<Partial<Filters>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const below = useRef<HTMLDivElement>(null);

  const load = useCallback(() => Promise.all([
    api("/api/leads").then((j) => { setLists(j.lists); setTotals(j.totals); }),
    api("/api/contatos/resumo").then(setCounts),
  ]).catch((e) => setErr(e.message)), []);
  useEffect(() => { loadCatalog<Catalog>(setCatalog, (e) => setErr(e.message)); load(); }, [load]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("importar")) setWizard({}); }, []);
  const refresh = () => { invalidateCatalog(); loadCatalog<Catalog>(setCatalog); load(); };
  // clicar numa lista, tag ou departamento abre os contatos dela logo abaixo, já com a barra de gerenciamento
  const show = (f: Partial<Filters>) => { setFocus(f); setTimeout(() => below.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  const focusKey = JSON.stringify(focus);
  const focusLabel = focus.list ? `Leads da lista “${lists.find((l) => String(l.id) === focus.list)?.name || "…"}”`
    : focus.tag === "none" ? "Contatos sem tag" : focus.tag ? `Contatos com a tag “${catalog?.tags.find((x) => String(x.id) === focus.tag)?.name || "…"}”`
      : focus.department === "none" ? "Contatos sem departamento" : focus.department ? `Contatos do departamento “${catalog?.departments.find((x) => String(x.id) === focus.department)?.name || "…"}”`
        : "Todos os contatos";
  const canEdit = catalog ? catalog.me.role !== "atendente" : true;

  const act = async (body: any, ok: string) => {
    setErr(""); setMsg("");
    try { const j = await api("/api/leads", body); setMsg(ok); refresh(); return j; } catch (e: any) { setErr(e.message); throw e; }
  };

  return (
    <>
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13 }}>Suba a planilha de leads, escolha a coluna do nome e do telefone, e a lista (com a tag dela) fica pronta para os disparos e fluxos.</span>
        <span style={{ flex: 1 }} />
        {canEdit && <button className="btn" onClick={() => setNewList(true)}>Nova lista</button>}
        {canEdit && <button className="btn primary" onClick={() => setWizard({})}>Importar leads</button>}
      </div>
      {err && <div className="banner err">{err}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="grid kpis leads-kpis">
        <div className="card kpi"><div className="label">Listas de leads</div><div className="value num">{fmtInt(lists.length)}</div><div className="delta">prontas para disparos e fluxos</div></div>
        <div className="card kpi"><div className="label">Leads em listas</div><div className="value num">{totals ? fmtInt(totals.in_lists) : "—"}</div><div className="delta">de {totals ? fmtInt(totals.contacts) : "—"} contatos no total</div></div>
        <div className="card kpi"><div className="label">Tags</div><div className="value num">{totals ? fmtInt(totals.tags) : "—"}</div><div className="delta">cada lista pode ter a sua</div></div>
      </div>

      <div className="card section">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Lista</th><th>Conta</th><th className="r">Leads</th><th className="r">Responderam</th><th className="r">Opt-out</th><th>Tag</th><th>Última importação</th><th></th></tr></thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id}>
                  <td><button type="button" className="link lg-name" onClick={() => show({ list: String(l.id) })} title="Ver e gerenciar os leads desta lista"><b>{l.name}</b></button>{l.description && <div className="muted" style={{ fontSize: 12 }}>{l.description}</div>}</td>
                  <td>{l.waba_name || <span className="muted">qualquer</span>}</td>
                  <td className="r num"><button type="button" className="link" onClick={() => show({ list: String(l.id) })}><b>{fmtInt(l.total)}</b></button></td>
                  <td className="r num">{l.replied ? <>{fmtInt(l.replied)} <span className="muted">({Math.round((l.replied / Math.max(l.total, 1)) * 100)}%)</span></> : "—"}</td>
                  <td className="r num">{l.opted_out ? <span style={{ color: "var(--critical)" }}>{fmtInt(l.opted_out)}</span> : "0"}</td>
                  <td>{l.tag_name ? <span className="chip tag" style={{ background: l.tag_color || undefined }}>{l.tag_name}</span> : canEdit ? <button className="link" onClick={() => act({ action: "set_tag", id: l.id }, `Tag "${l.name}" criada e aplicada aos leads da lista.`)}>criar tag</button> : <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{l.last_import_at ? `${fmtDateTime(l.last_import_at)} · ${fmtInt(l.imported)} importado(s)` : fmtDateTime(l.created_at)}</td>
                  <td>
                    <div className="row-actions" style={{ position: "relative", justifyContent: "flex-end" }}>
                      <Link className="btn" href={`/disparos?lista=${l.id}`} title="Criar um disparo para esta lista">Disparar</Link>
                      <Link className="btn" href={`/fluxos?lista=${l.id}`} title="Criar um fluxo para esta lista">Fluxo</Link>
                      <button className="btn" onClick={() => show({ list: String(l.id) })}>Gerenciar</button>
                      {canEdit && <button className="btn" onClick={() => setWizard({ listId: l.id })}>Importar mais</button>}
                      <button className="btn icon" onClick={() => setMenu(menu === l.id ? null : l.id)} aria-label="Mais opções">⋯</button>
                      {menu === l.id && (
                        <div className="fmenu" onMouseLeave={() => setMenu(null)}>
                          <Link className="link" href={`/contatos?list=${l.id}`}>Ver os leads</Link>
                          <a className="link" href={`/api/contatos/exportar?list=${l.id}`}>Baixar CSV</a>
                          {canEdit && <button className="link" onClick={() => { setMenu(null); setRename(l); }}>Renomear</button>}
                          {canEdit && <button className="link" style={{ color: "var(--critical)" }} onClick={() => { setMenu(null); setDel(l); }}>Excluir lista</button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!lists.length && <tr><td colSpan={8} className="empty">Nenhuma lista ainda. Clique em <b>Nova lista</b> (e escolha os contatos abaixo) ou em <b>Importar leads</b> para subir uma planilha.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {catalog && <Groups catalog={catalog as any} counts={counts} focus={focus} onFocus={show} onChanged={refresh} />}

      <div ref={below} className="lg-manage">
        <div className="lg-manage-head">
          <h2>{focusLabel}</h2>
          {focusKey !== "{}" && <button type="button" className="link" onClick={() => setFocus({})}>ver todos os contatos</button>}
          <span className="muted">Filtre, marque e use <b>Gerenciar selecionados</b> para pôr tags, listas e departamentos — inclusive em quem chegou conversando.</span>
        </div>
        <ContactsManager key={focusKey} preset={focus} embedded onChanged={() => load()} />
      </div>

      {newList && catalog && (
        <Modal title="Nova lista" onClose={() => setNewList(false)}>
          <NewListForm catalog={catalog} onCreate={async (b) => { const j = await act({ action: "create_list", ...b }, `Lista “${b.name}” criada. Agora marque os contatos abaixo e use Gerenciar selecionados → Adicionar à lista.`); setNewList(false); show(b.waba_id ? { waba: b.waba_id } as Partial<Filters> : {}); return j; }} />
        </Modal>
      )}
      {wizard && catalog && <ImportWizard catalog={catalog} lists={lists} listId={wizard.listId} onClose={() => setWizard(null)} onDone={(m) => { setWizard(null); setMsg(m); refresh(); }} />}
      {rename && (
        <Modal title="Renomear lista" onClose={() => setRename(null)}>
          <RenameForm list={rename} onSave={async (name, description) => { await act({ action: "rename", id: rename.id, name, description }, "Lista renomeada."); setRename(null); }} />
        </Modal>
      )}
      {del && (
        <Modal title="Excluir lista" onClose={() => setDel(null)}>
          <DeleteForm list={del} onDelete={async (deleteContacts) => { await act({ action: "delete", id: del.id, delete_contacts: deleteContacts }, "Lista excluída."); setDel(null); }} />
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${wide ? "wizard" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn icon" onClick={onClose} aria-label="Fechar">×</button></div>
        {children}
      </div>
    </div>
  );
}

function NewListForm({ catalog, onCreate }: { catalog: Catalog; onCreate: (b: { name: string; waba_id: string; description: string; create_tag: boolean; tag_name: string }) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [waba, setWaba] = useState(catalog.wabas[0]?.id || "");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <label className="field"><span>Nome da lista</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ex.: Clientes Loja 7 — outubro" maxLength={80} /></label>
      <label className="field"><span>Conta (cliente)</span><select value={waba} onChange={(e) => setWaba(e.target.value)}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
      <label className="field"><span>Descrição (opcional)</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex.: quem comprou no mês" maxLength={300} /></label>
      <label className="check"><input type="checkbox" checked={tag} onChange={(e) => setTag(e.target.checked)} /> <span>Criar também uma tag com o mesmo nome (os contatos da lista ficam marcados no Atendimento)</span></label>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>A lista nasce vazia: depois é só marcar os contatos (inclusive os que chegaram conversando) e usar <b>Gerenciar selecionados → Adicionar à lista</b>.</p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary" disabled={busy || !name.trim() || !waba} onClick={async () => { setBusy(true); try { await onCreate({ name: name.trim(), waba_id: waba, description: description.trim(), create_tag: tag, tag_name: name.trim() }); } catch { setBusy(false); } }}>{busy ? "Criando…" : "Criar lista"}</button></div>
    </div>
  );
}

function RenameForm({ list, onSave }: { list: ListRow; onSave: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description || "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <label className="field"><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="field"><span>Descrição (opcional)</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex.: leads do formulário do site, outubro" /></label>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); try { await onSave(name.trim(), description.trim()); } finally { setBusy(false); } }}>Salvar</button></div>
    </div>
  );
}

function DeleteForm({ list, onDelete }: { list: ListRow; onDelete: (deleteContacts: boolean) => Promise<void> }) {
  const [also, setAlso] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid" style={{ gap: 10 }}>
      <p style={{ margin: 0 }}>Excluir a lista <b>{list.name}</b> ({fmtInt(list.total)} leads)? Os contatos continuam existindo em Contatos; só a lista deixa de existir.</p>
      <label className="check"><input type="checkbox" checked={also} onChange={(e) => setAlso(e.target.checked)} /> <span>Apagar também os contatos que só existem nesta lista e nunca conversaram com a gente</span></label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button className="btn primary" style={{ background: "var(--critical)", borderColor: "var(--critical)", color: "#fff" }} disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(also); } finally { setBusy(false); } }}>Excluir</button></div>
    </div>
  );
}

// ---------- assistente de importação ----------

type Map = { phone: string; name: string; email: string; extras: Record<string, boolean> };
const CHUNK = 500;
const cleanFileName = (s: string) => s.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60);

function ImportWizard({ catalog, lists, listId, onClose, onDone }: { catalog: Catalog; lists: ListRow[]; listId?: number; onClose: () => void; onDone: (msg: string) => void }) {
  const existing = listId ? lists.find((l) => l.id === listId) : undefined;
  const [step, setStep] = useState(0);
  const [table, setTable] = useState<Table | null>(null);
  const [map, setMap] = useState<Map>({ phone: "", name: "", email: "", extras: {} });
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dest, setDest] = useState({
    mode: existing ? "existing" : "new", list_id: existing ? String(existing.id) : "", new_name: "", waba_id: existing?.waba_id || catalog.wabas[0]?.id || "",
    create_tag: !existing || !existing.tag_id, tag_name: "", tag_ids: [] as number[], department_id: "", ddi: "55",
  });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; invalid: number; duplicates: number; list: string; listId: number } | null>(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyTable = (t: Table) => {
    if (!t.rows.length) { setErr("Não encontrei nenhuma linha com dados nesse arquivo."); return; }
    const g = guessColumns(t);
    const extras: Record<string, boolean> = {};
    for (const h of t.headers) if (![g.phone, g.name, g.email].includes(h)) extras[h] = t.headers.length <= 12;
    setTable(t); setMap({ ...g, extras }); setErr("");
    if (!dest.new_name) setDest((d) => ({ ...d, new_name: cleanFileName(t.source.split(" · ")[0]) || "Leads" }));
    setStep(1);
  };
  const onFile = async (file: File) => {
    try { applyTable(await readTable(file)); } catch (e: any) { setErr(`Não consegui ler o arquivo: ${e.message}`); }
  };

  // estatísticas das linhas com o mapeamento atual
  const stats = useMemo(() => {
    if (!table || !map.phone) return null;
    const pi = table.headers.indexOf(map.phone);
    const seen = new Set<string>();
    let valid = 0, invalid = 0, dup = 0;
    for (const r of table.rows) {
      const p = normalizePhone(r[pi] || "", dest.ddi || "55");
      if (!p) invalid++; else if (seen.has(p)) dup++; else { seen.add(p); valid++; }
    }
    return { valid, invalid, dup };
  }, [table, map.phone, dest.ddi]);

  const run = async () => {
    if (!table || !map.phone) return;
    setErr("");
    try {
      let id = Number(dest.list_id);
      let listName = existing?.name || "";
      if (dest.mode === "new") {
        const name = dest.new_name.trim();
        if (!name) { setErr("Dê um nome à lista."); return; }
        const j = await api("/api/leads", { action: "create_list", name, waba_id: dest.waba_id, create_tag: dest.create_tag, tag_name: dest.tag_name.trim() || name });
        id = j.list.id; listName = name;
      } else {
        if (!id) { setErr("Escolha a lista."); return; }
        const l = lists.find((x) => x.id === id); listName = l?.name || "";
        if (dest.create_tag && l && !l.tag_id) await api("/api/leads", { action: "set_tag", id, tag_name: dest.tag_name.trim() || l.name });
      }
      setStep(3);
      const hi = (h: string) => table.headers.indexOf(h);
      const extraCols = table.headers.filter((h) => map.extras[h] && ![map.phone, map.name, map.email].includes(h));
      const rows = table.rows.map((r) => ({
        phone: r[hi(map.phone)] || "", name: map.name ? r[hi(map.name)] || "" : "", email: map.email ? r[hi(map.email)] || "" : "",
        fields: Object.fromEntries(extraCols.map((h) => [h, r[hi(h)] || ""])),
      }));
      const totals = { inserted: 0, updated: 0, invalid: 0, duplicates: 0 };
      setProgress({ done: 0, total: rows.length });
      // repetidos entre lotes: tira aqui para a contagem ficar certa
      const seen = new Set<string>();
      const unique = rows.filter((r) => { const p = normalizePhone(r.phone, dest.ddi || "55"); if (!p) return true; if (seen.has(p)) { totals.duplicates++; return false; } seen.add(p); return true; });
      for (let i = 0; i < unique.length; i += CHUNK) {
        const j = await api("/api/leads", { action: "import", list_id: id, waba_id: dest.waba_id, rows: unique.slice(i, i + CHUNK), tag_ids: dest.tag_ids, department_id: dest.department_id || null, ddi: dest.ddi || "55" });
        totals.inserted += j.inserted; totals.updated += j.updated; totals.invalid += j.invalid; totals.duplicates += j.duplicates;
        setProgress({ done: Math.min(i + CHUNK, unique.length) + (rows.length - unique.length), total: rows.length });
      }
      setResult({ ...totals, list: listName, listId: id });
    } catch (e: any) { setErr(e.message); setStep(2); }
  };

  const steps = ["Arquivo", "Colunas", "Destino", "Importação"];
  const preview = table ? table.rows.slice(0, 5) : [];

  return (
    <div className="modal-back" onClick={step === 3 && !result ? undefined : onClose}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>{existing ? `Importar mais leads em "${existing.name}"` : "Importar leads"}</h2>{(step !== 3 || result) && <button className="btn icon" onClick={onClose} aria-label="Fechar">×</button>}</div>
        <div className="wizard-steps">{steps.map((s, i) => <span key={s} className={`wstep ${i === step ? "on" : i < step ? "done" : ""}`} onClick={() => i < step && step < 3 && setStep(i)}>{i + 1}. {s}</span>)}</div>
        {err && <div className="banner err" style={{ margin: 0 }}>{err}</div>}

        {step === 0 && (
          <div className="grid" style={{ gap: 12 }}>
            {!paste ? (
              <>
                <div className={`drop ${drag ? "on" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }} onClick={() => fileRef.current?.click()}>
                  <div style={{ color: "var(--text-3)" }}><Icon name="doc" size={34} className="" /></div>
                  <b>Arraste a planilha aqui ou clique para escolher</b>
                  <div className="muted">CSV, TXT ou Excel (.xlsx). Precisa ter uma coluna com o telefone; nome e e-mail são opcionais. Até 20 mil linhas por vez.</div>
                  <input ref={fileRef} type="file" hidden accept=".csv,.txt,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Dica: no Excel ou Google Sheets, a primeira linha deve ter os nomes das colunas (ex.: Nome, Telefone, Cidade). Telefones sem o 55 recebem o DDI automaticamente.</div>
                <div><button className="link" onClick={() => setPaste(true)}>Prefiro colar os números</button></div>
              </>
            ) : (
              <>
                <label className="field"><span>Cole um lead por linha (telefone, ou nome;telefone)</span><textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"85 99999-0001\nMaria;85 99999-0002"} style={{ fontFamily: "inherit" }} /></label>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}><button className="link" onClick={() => setPaste(false)}>Voltar para o arquivo</button><button className="btn primary" disabled={!pasted.trim()} onClick={() => applyTable(readPasted(pasted))}>Continuar</button></div>
              </>
            )}
          </div>
        )}

        {step === 1 && table && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="muted" style={{ fontSize: 13 }}>{table.source} · {fmtInt(table.rows.length)} linha(s) · {table.headers.length} coluna(s)</div>
            <div className="grid three" style={{ gap: 10 }}>
              <label className="field"><span>Coluna do telefone *</span><select value={map.phone} onChange={(e) => setMap({ ...map, phone: e.target.value })}><option value="">—</option>{table.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
              <label className="field"><span>Coluna do nome</span><select value={map.name} onChange={(e) => setMap({ ...map, name: e.target.value })}><option value="">— (sem nome)</option>{table.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
              <label className="field"><span>Coluna do e-mail</span><select value={map.email} onChange={(e) => setMap({ ...map, email: e.target.value })}><option value="">— (sem e-mail)</option>{table.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
            </div>
            {stats && (
              <div className="kv" style={{ margin: 0 }}>
                <div><b style={{ color: "var(--good)" }}>{fmtInt(stats.valid)}</b><span>telefones válidos</span></div>
                <div><b style={{ color: stats.invalid ? "var(--critical)" : undefined }}>{fmtInt(stats.invalid)}</b><span>inválidos (serão ignorados)</span></div>
                <div><b>{fmtInt(stats.dup)}</b><span>repetidos na planilha</span></div>
              </div>
            )}
            <div className="table-wrap preview-table">
              <table>
                <thead><tr>{table.headers.map((h) => <th key={h}>{h}{h === map.phone ? <> <span className="chip tag">telefone</span></> : h === map.name ? <> <span className="chip tag">nome</span></> : h === map.email ? <> <span className="chip tag">e-mail</span></> : null}</th>)}</tr></thead>
                <tbody>{preview.map((r, i) => <tr key={i}>{table.headers.map((h, j) => <td key={h} className={h === map.phone ? "num" : ""}>{r[j]}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {table.headers.some((h) => ![map.phone, map.name, map.email].includes(h)) && (
              <div className="field"><span>Outras colunas guardadas como campos do contato (viram variáveis nos templates, ex.: {"{{campo.cidade}}"})</span>
                <div className="chips">{table.headers.filter((h) => ![map.phone, map.name, map.email].includes(h)).map((h) => <label key={h} className={`chip pick ${map.extras[h] ? "on" : ""}`}><input type="checkbox" hidden checked={!!map.extras[h]} onChange={(e) => setMap({ ...map, extras: { ...map.extras, [h]: e.target.checked } })} />{h}</label>)}</div>
              </div>
            )}
            <div className="wizard-foot"><button className="btn" onClick={() => setStep(0)}>Voltar</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={!map.phone || !stats?.valid} onClick={() => setStep(2)}>Continuar</button></div>
          </div>
        )}

        {step === 2 && table && (
          <div className="grid" style={{ gap: 12 }}>
            {!existing && (
              <div className="seg" style={{ justifySelf: "start" }}>
                <a className={dest.mode === "new" ? "on" : ""} style={{ cursor: "pointer" }} onClick={() => setDest({ ...dest, mode: "new" })}>Lista nova</a>
                <a className={dest.mode === "existing" ? "on" : ""} style={{ cursor: "pointer" }} onClick={() => setDest({ ...dest, mode: "existing" })}>Lista existente</a>
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {dest.mode === "new"
                ? <label className="field"><span>Nome da lista *</span><input value={dest.new_name} onChange={(e) => setDest({ ...dest, new_name: e.target.value, tag_name: dest.tag_name === dest.new_name ? e.target.value : dest.tag_name })} placeholder="ex.: Leads do site — outubro" autoFocus /></label>
                : <label className="field"><span>Lista *</span><select value={dest.list_id} onChange={(e) => setDest({ ...dest, list_id: e.target.value })} disabled={!!existing}><option value="">—</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({fmtInt(l.total)})</option>)}</select></label>}
              <label className="field"><span>Conta (WABA) dos leads</span><select value={dest.waba_id} onChange={(e) => setDest({ ...dest, waba_id: e.target.value })}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
            </div>
            <label className="check"><input type="checkbox" checked={dest.create_tag} onChange={(e) => setDest({ ...dest, create_tag: e.target.checked })} disabled={dest.mode === "existing" && !!lists.find((l) => String(l.id) === dest.list_id)?.tag_id} />
              <span><b>Criar uma tag para esta lista</b> e marcar todos os leads com ela — assim você seleciona esse público por tag nos disparos e fluxos.</span></label>
            {dest.create_tag && <label className="field"><span>Nome da tag</span><input value={dest.tag_name || (dest.mode === "new" ? dest.new_name : lists.find((l) => String(l.id) === dest.list_id)?.name || "")} onChange={(e) => setDest({ ...dest, tag_name: e.target.value })} /></label>}
            {catalog.tags.length > 0 && (
              <div className="field"><span>Tags adicionais (opcional)</span><div className="chips">{catalog.tags.map((t) => <button key={t.id} type="button" className={`chip pick ${dest.tag_ids.includes(t.id) ? "on" : ""}`} onClick={() => setDest({ ...dest, tag_ids: dest.tag_ids.includes(t.id) ? dest.tag_ids.filter((x) => x !== t.id) : [...dest.tag_ids, t.id] })}>{t.name}</button>)}</div></div>
            )}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="field"><span>Departamento (opcional)</span><select value={dest.department_id} onChange={(e) => setDest({ ...dest, department_id: e.target.value })}><option value="">—</option>{catalog.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="field"><span>DDI padrão (para números sem país)</span><input value={dest.ddi} onChange={(e) => setDest({ ...dest, ddi: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></label>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Leads que já existem (mesmo telefone) são atualizados — nome e campos novos entram, nada é apagado. Quem pediu para não receber (opt-out) continua fora dos envios.</div>
            <div className="wizard-foot"><button className="btn" onClick={() => setStep(1)}>Voltar</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={run}>Importar {fmtInt(stats?.valid || 0)} lead(s)</button></div>
          </div>
        )}

        {step === 3 && (
          <div className="grid" style={{ gap: 12 }}>
            {!result ? (
              <>
                <div>Importando… {progress ? `${fmtInt(progress.done)} de ${fmtInt(progress.total)}` : ""}</div>
                <div className="prog-track"><div className="prog-ok" style={{ width: `${progress ? (progress.done / Math.max(progress.total, 1)) * 100 : 5}%`, transition: "width .3s" }} /></div>
                <div className="muted" style={{ fontSize: 12 }}>Não feche esta janela até terminar.</div>
              </>
            ) : (
              <>
                <div className="banner" style={{ margin: 0 }}><b>Importação concluída</b> na lista <b>{result.list}</b>.</div>
                <div className="kv" style={{ margin: 0 }}>
                  <div><b style={{ color: "var(--good)" }}>{fmtInt(result.inserted)}</b><span>leads novos</span></div>
                  <div><b>{fmtInt(result.updated)}</b><span>já existiam (atualizados)</span></div>
                  <div><b style={{ color: result.invalid ? "var(--critical)" : undefined }}>{fmtInt(result.invalid)}</b><span>telefones inválidos</span></div>
                  <div><b>{fmtInt(result.duplicates)}</b><span>repetidos ignorados</span></div>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>Agora é só escolher esta lista (ou a tag dela) no público do disparo ou no bloco Início de um fluxo.</div>
                <div className="wizard-foot" style={{ flexWrap: "wrap" }}>
                  <Link className="btn" href={`/contatos?list=${result.listId}`}>Ver os leads</Link>
                  <span style={{ flex: 1 }} />
                  <Link className="btn" href={`/fluxos?lista=${result.listId}`}>Criar fluxo</Link>
                  <Link className="btn primary" href={`/disparos?lista=${result.listId}`}>Criar disparo</Link>
                  <button className="btn" onClick={() => onDone(`Lista "${result.list}": ${fmtInt(result.inserted)} lead(s) novo(s), ${fmtInt(result.updated)} atualizado(s).`)}>Fechar</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
