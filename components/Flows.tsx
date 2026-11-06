"use client";
// Página inicial das automações: pastas à esquerda e o quadro "Fluxo de automações" com os cartões.
import { isManagerRole } from "@/lib/roles";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { FLOW_STATUS } from "@/lib/flow-shared";
import { loadCatalog } from "@/lib/catalog-client";
import type { Catalog } from "@/components/Campaigns";
import { AutomationsSidebar, FlowThumb, NewFlowModal, folderOf, useFlowRows, useSideCollapsed, type FlowRow } from "@/components/flow/Automations";
import { FIcon } from "@/components/flow/icons";

const TONE: Record<string, string> = { draft: "neutral", active: "good", paused: "serious", archived: "neutral" };

function summary(r: FlowRow) {
  if (r.description) return r.description;
  const c = r.counts || {};
  const run = (c.queued || 0) + (c.running || 0) + (c.waiting_reply || 0) + (c.waiting_time || 0);
  const parts = [`${r.blocks} bloco${r.blocks === 1 ? "" : "s"}`, r.display_phone_number || r.phone_name || ""].filter(Boolean);
  if (run) parts.push(`${fmtInt(run)} em andamento`);
  return parts.join(" · ");
}

export default function Flows() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const { rows, err, reload } = useFlowRows();
  const [sideMin, setSideMin] = useSideCollapsed();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("");
  const [creating, setCreating] = useState<{ waba?: string | null; list?: number | null } | null>(null);
  useEffect(() => { const l = Number(new URLSearchParams(window.location.search).get("lista") || 0); if (l) setCreating({ list: l }); }, []);
  useEffect(() => { loadCatalog<Catalog>(setCatalog); }, []);
  const live = (rows || []).some((r) => r.status === "active" && ((r.counts.queued || 0) + (r.counts.running || 0) > 0));
  useEffect(() => { if (!live) return; const t = setInterval(reload, 8000); return () => clearInterval(t); }, [live, reload]);
  const canEdit = isManagerRole(catalog?.me.role);
  const wabas = catalog?.wabas || [];
  useEffect(() => { if (!folder && wabas[0]) setFolder(wabas[0].id); }, [wabas, folder]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || folderOf(r).toLowerCase().includes(needle) || (r.description || "").toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <div className={`flow-page${sideMin ? " side-min" : ""}`}>
      <AutomationsSidebar rows={rows} canEdit={!!canEdit} onNew={() => setCreating({ waba: folder || null })} onOpen={(id) => router.push(`/fluxos/${id}`)} collapsed={sideMin} setCollapsed={setSideMin} />
      <section className="flow-stage home">
        <div className="fhome">
          <div className="fhome-head">
            <div><h1>Fluxo de automações</h1><div className="seg"><a className="on">Minhas automações</a></div></div>
            <label className="fhome-search"><FIcon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar…" aria-label="Pesquisar automações" /></label>
          </div>
          {err && <div className="banner err">{err}</div>}
          <div className="fhome-grid">
            {canEdit && (
              <div className="fcard new">
                <b className="fcard-title">Criar nova automação</b>
                <p className="fcard-desc">Escolha a pasta (conta do WhatsApp) e monte o fluxo arrastando os blocos. Não há limite para a criatividade.</p>
                <div className="fcard-folders" role="listbox" aria-label="Pasta">
                  {wabas.map((w) => (
                    <button key={w.id} type="button" role="option" aria-selected={folder === w.id} className={folder === w.id ? "on" : ""} onClick={() => setFolder(w.id)}>
                      <FIcon name="flow" size={15} />{w.name || w.id}
                    </button>
                  ))}
                  {!wabas.length && <span className="muted">Carregando contas…</span>}
                </div>
                <button type="button" className="fcard-cta" onClick={() => setCreating({ waba: folder || null })} disabled={!catalog}><FIcon name="plus" size={16} stroke={2.2} />Criar nova automação</button>
              </div>
            )}
            {!rows && <div className="fcard skeleton" aria-hidden />}
            {list.map((r) => {
              const c = r.counts || {};
              const fails = (c.failed || 0) + (c.stopped || 0);
              return (
                <article key={r.id} className="fcard">
                  <button type="button" className="fcard-thumb" onClick={() => router.push(`/fluxos/${r.id}`)} aria-label={`Abrir ${r.name}`}><FlowThumb nodes={r.thumb_nodes} edges={r.thumb_edges} /></button>
                  <div className="fcard-body">
                    <b className="fcard-title" title={r.name}>{r.name}</b>
                    <span className="fcard-folder">{folderOf(r)}</span>
                    <p className="fcard-desc">{summary(r)}</p>
                    <div className="fcard-meta">
                      <span className={`pill ${TONE[r.status] || "neutral"}`}><i aria-hidden />{FLOW_STATUS[r.status] || r.status}</span>
                      {(c.done || 0) > 0 && <span className="num">{fmtInt(c.done)} concluídos</span>}
                      {fails > 0 && <span className="num err">{fmtInt(fails)} falhas</span>}
                    </div>
                    {r.last_error && <p className="fcard-err">{r.last_error}</p>}
                    <div className="fcard-foot">
                      <button type="button" className="fcard-open" onClick={() => router.push(`/fluxos/${r.id}`)}><FIcon name="arrowRight" size={15} stroke={2.1} />Abrir automação</button>
                      <span className="muted">{r.last_activity ? fmtDateTime(r.last_activity) : ""}</span>
                    </div>
                  </div>
                </article>
              );
            })}
            {rows && !list.length && <div className="fhome-empty">{q ? "Nenhuma automação com esse nome." : canEdit ? "Nenhuma automação ainda. Crie a primeira no cartão ao lado." : "Nenhuma automação ainda."}</div>}
          </div>
        </div>
      </section>
      {creating && catalog && <NewFlowModal catalog={catalog} presetList={creating.list} presetWaba={creating.waba} onClose={() => setCreating(null)} onCreated={(id) => router.push(`/fluxos/${id}`)} />}
    </div>
  );
}
