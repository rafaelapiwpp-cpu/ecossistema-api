"use client";
// Contatos: filtros (inclusive vindos do link, ex.: ?list=3), seleção de uma página ou de todos do filtro e a barra
// "Gerenciar selecionados" (tags, listas, departamento, opt-out). Usada em Contatos, em Leads e no portal da empresa.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { invalidateCatalog, loadCatalog } from "@/lib/catalog-client";
import { api, ago, EMPTY_FILTERS, filterQuery, filtersFrom, fmtPhone, nf, SOURCE_FILTER, SOURCE_LABEL, type Catalog, type Filters, type Row } from "./shared";
import ManageBar from "./ManageBar";
import EditModal from "./EditModal";
import { ImportModal } from "./ImportModal";

type Data = { rows: Row[]; total: number; page: number; limit: number };
const INTERACTION: [string, string][] = [["r1", "Já respondeu"], ["r0", "Nunca respondeu"], ["d7", "Escreveu nos últimos 7 dias"], ["d30", "Escreveu nos últimos 30 dias"], ["d90", "Escreveu nos últimos 90 dias"]];

export default function ContactsManager({ client = false, base = "/atendimento", preset, embedded = false, onChanged }: {
  client?: boolean; base?: string; preset?: Partial<Filters>; embedded?: boolean; onChanged?: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, ...preset });
  const [ready, setReady] = useState(embedded); // fora do modo embutido, espera ler os filtros do endereço
  const [q, setQ] = useState(preset?.q || "");
  const [data, setData] = useState<Data>({ rows: [], total: 0, page: 1, limit: 50 });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [all, setAll] = useState(false);
  const [edit, setEdit] = useState<Partial<Row> | null>(null);
  const [imp, setImp] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { loadCatalog<Catalog>(setCatalog, (e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (embedded) return;
    const f = filtersFrom(window.location.search, preset);
    setFilters(f); setQ(f.q); setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // busca: espera a pessoa parar de digitar
  useEffect(() => { const t = setTimeout(() => setFilters((f) => (f.q === q.trim() ? f : { ...f, q: q.trim() })), 350); return () => clearTimeout(t); }, [q]);

  const fkey = useMemo(() => filterQuery(filters).toString(), [filters]);
  useEffect(() => { setPage(1); setSel(new Set()); setAll(false); }, [fkey]);
  const qs = useMemo(() => { const p = new URLSearchParams(fkey); p.set("page", String(page)); return p.toString(); }, [fkey, page]);
  const load = useCallback(() => api(`/api/contatos?${qs}`).then((j: Data) => { setData(j); setErr(""); }).catch((e) => setErr(e.message)), [qs]);
  useEffect(() => { if (ready) load(); }, [load, ready]);
  const reloadCatalog = () => { invalidateCatalog(); return loadCatalog<Catalog>(setCatalog); };

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const active = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => k !== "q" && filters[k]).length;
  const interaction = filters.replied ? `r${filters.replied}` : filters.recent ? `d${filters.recent}` : "";
  const setInteraction = (v: string) => set({ replied: v.startsWith("r") ? v.slice(1) : "", recent: v.startsWith("d") ? v.slice(1) : "" });

  const pageIds = data.rows.map((r) => r.id);
  const pageAll = pageIds.length > 0 && (all || pageIds.every((id) => sel.has(id)));
  const count = all ? data.total : sel.size;
  const toggle = (id: number, on: boolean) => {
    if (all) { setAll(false); setSel(new Set(pageIds.filter((x) => x !== id))); return; }
    const n = new Set(sel); on ? n.add(id) : n.delete(id); setSel(n);
  };
  const togglePage = (on: boolean) => {
    if (all) { setAll(false); setSel(new Set()); return; }
    const n = new Set(sel); for (const id of pageIds) on ? n.add(id) : n.delete(id); setSel(n);
  };
  const run = async (action: string, extra: Record<string, unknown>, done: string) => {
    setMsg(""); setErr("");
    const body = all ? { action, all: true, filter: filters, ...extra } : { action, ids: [...sel], ...extra };
    const j = await api("/api/contatos", body);
    const same = j.selected - j.affected;
    setMsg(`${done} — ${nf(j.affected)} contato(s) alterado(s)${same > 0 ? ` (${nf(same)} já estavam assim)` : ""}.`);
    setSel(new Set()); setAll(false);
    await Promise.all([load(), reloadCatalog()]);
    onChanged?.();
  };
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const waba = (id: string) => catalog?.wabas.find((w) => w.id === id)?.name;

  return (
    <div className="cm">
      <div className="toolbar cm-filters">
        <input type="search" placeholder="Buscar nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <select value={filters.waba} onChange={(e) => set({ waba: e.target.value })} aria-label="Conta" className={filters.waba ? "on" : ""}><option value="">Todas as contas</option>{catalog?.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select>
        <select value={filters.source} onChange={(e) => set({ source: e.target.value })} aria-label="Origem" className={filters.source ? "on" : ""}><option value="">Origem: todas</option>{SOURCE_FILTER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={filters.tag} onChange={(e) => set({ tag: e.target.value })} aria-label="Tag" className={filters.tag ? "on" : ""}><option value="">Tag: todas</option><option value="none">Sem nenhuma tag</option>{catalog?.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {!client && <select value={filters.list} onChange={(e) => set({ list: e.target.value })} aria-label="Lista" className={filters.list ? "on" : ""}><option value="">Lista: todas</option><option value="none">Fora de qualquer lista</option>{catalog?.lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({nf(l.total)})</option>)}</select>}
        <select value={filters.department} onChange={(e) => set({ department: e.target.value })} aria-label="Departamento" className={filters.department ? "on" : ""}><option value="">Departamento: todos</option><option value="none">Sem departamento</option>{catalog?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={interaction} onChange={(e) => setInteraction(e.target.value)} aria-label="Interação" className={interaction ? "on" : ""}><option value="">Interação: todas</option>{INTERACTION.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={filters.optout} onChange={(e) => set({ optout: e.target.value })} aria-label="Opt-out" className={filters.optout ? "on" : ""}><option value="">Opt-out: todos</option><option value="0">Só quem aceita</option><option value="1">Só opt-out</option></select>
        {active > 0 && <button type="button" className="link" onClick={() => { setFilters({ ...EMPTY_FILTERS, q: filters.q }); }}>limpar filtros ({active})</button>}
        <span style={{ flex: 1 }} />
        <a className="btn" href={`/api/contatos/exportar?${fkey}`} title="Baixa os contatos deste filtro">Exportar CSV</a>
        <button type="button" className="btn" onClick={() => setImp(true)}>Importar planilha</button>
        <button type="button" className="btn primary" onClick={() => setEdit({ waba_id: filters.waba || catalog?.wabas[0]?.id, fields: {}, tags: [], lists: [] })}>Novo contato</button>
      </div>

      {err && <div className="banner"><span className="err">{err}</span></div>}
      {msg && <div className="banner"><span className="ok">{msg}</span></div>}
      {catalog && <ManageBar catalog={catalog} client={client} count={count} total={data.total} all={all} defaultWaba={filters.waba} onRun={run} onCreated={reloadCatalog} />}
      {pageAll && data.total > pageIds.length && (
        <div className="cm-all">
          {all
            ? <>Todos os <b>{nf(data.total)}</b> contatos deste filtro estão selecionados. <button type="button" className="link" onClick={() => { setAll(false); setSel(new Set()); }}>Limpar seleção</button></>
            : <>Os {nf(pageIds.length)} desta página estão selecionados. <button type="button" className="link" onClick={() => setAll(true)}>Selecionar todos os {nf(data.total)} contatos deste filtro</button></>}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="cm-table">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" aria-label="Selecionar a página" checked={pageAll} onChange={(e) => togglePage(e.target.checked)} /></th>
              <th>Contato</th><th>Conta</th><th>Tags</th>{!client && <th>Listas</th>}<th>Departamento</th><th>Origem</th><th>Última mensagem</th><th></th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className={all || sel.has(r.id) ? "sel" : undefined}>
                  <td><input type="checkbox" aria-label={`Selecionar ${r.name || r.phone}`} checked={all || sel.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /></td>
                  <td>
                    <b>{r.name || <span className="muted">sem nome</span>}</b>{r.opt_out && <span className="pill critical" style={{ marginLeft: 6 }}><i aria-hidden />Opt-out</span>}
                    <div className="muted num" style={{ fontSize: 12 }}>{fmtPhone(r.phone)}{r.email ? ` · ${r.email}` : ""}</div>
                  </td>
                  <td>{r.waba_name || waba(r.waba_id) || r.waba_id}</td>
                  <td><div className="cm-chips">{r.tags.map((t) => <span key={t.id} className="chip tag" style={{ background: t.color || undefined }}>{t.name}</span>)}{!r.tags.length && <span className="muted">—</span>}</div></td>
                  {!client && <td><div className="cm-chips">{r.lists.map((l) => <span key={l.id} className="chip">{l.name}</span>)}{!r.lists.length && <span className="muted">—</span>}</div></td>}
                  <td>{r.department_name || <span className="muted">—</span>}</td>
                  <td className="muted">{(r.source && SOURCE_LABEL[r.source]) || r.source || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{ago(r.last_inbound_at) || "nunca respondeu"}</td>
                  <td><div className="row-actions"><button type="button" className="btn" onClick={() => setEdit(r)}>Editar</button>{r.conversation_id && <Link className="btn" href={`${base}?c=${r.conversation_id}`}>Conversa</Link>}</div></td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={client ? 8 : 9} className="empty">{active || filters.q ? "Nenhum contato com estes filtros." : client ? "Nenhum contato ainda. Eles aparecem conforme as conversas chegam — ou importe uma planilha." : "Nenhum contato. Importe uma planilha ou aguarde as primeiras mensagens."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{nf(data.total)} contato(s){active || filters.q ? " neste filtro" : ""}</span>
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page} / {pages}</span>
          <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>

      {edit && catalog && <EditModal row={edit} catalog={catalog} client={client} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); reloadCatalog(); onChanged?.(); }} />}
      {imp && catalog && <ImportModal catalog={catalog} client={client} company={client ? base.split("/")[1] : undefined} onClose={() => setImp(false)} onDone={(m) => { setImp(false); setMsg(m); load(); reloadCatalog(); onChanged?.(); }} />}
    </div>
  );
}
