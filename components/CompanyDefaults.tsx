"use client";
// "Padrões para empresas novas": o que toda empresa nova já recebe pronta ao ser cadastrada (funil, respostas rápidas, departamentos).
import { useEffect, useState } from "react";
import type { CompanyDefaults as Defaults } from "@/lib/companies";

const COLORS = ["#8b7cf6", "#3987e5", "#199e70", "#d95926", "#c98500", "#d55181", "#e66767", "#6d5fd1"];
const KIND_LABEL: Record<string, string> = { open: "Em andamento", won: "Ganho", lost: "Perdido" };

export default function CompanyDefaultsCard({ defaults, run }: { defaults: Defaults; run: (b: any, done?: string) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Defaults>(defaults);
  useEffect(() => setD(defaults), [JSON.stringify(defaults)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [depDraft, setDepDraft] = useState("");
  const dirty = JSON.stringify(d) !== JSON.stringify(defaults);
  const setStage = (i: number, patch: Partial<Defaults["stages"][number]>) => setD({ ...d, stages: d.stages.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setQuick = (i: number, patch: Partial<Defaults["quick_replies"][number]>) => setD({ ...d, quick_replies: d.quick_replies.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
  const addDep = () => { const n = depDraft.trim(); if (n && !d.departments.some((x) => x.toLowerCase() === n.toLowerCase())) setD({ ...d, departments: [...d.departments, n] }); setDepDraft(""); };
  return (
    <div className="card">
      <div className="cp-head">
        <div><h2>Padrões para empresas novas</h2><p className="sub">O que toda farmácia nova já recebe pronto ao ser cadastrada. Não muda as empresas que já existem.</p></div>
        <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? "Fechar" : "Editar padrões"}</button>
      </div>
      <div className="cd-summary">
        <div><b>Funil de vendas</b><span>{defaults.stages.map((s) => s.name).join(" · ")}, com entrada automática</span></div>
        <div><b>Respostas rápidas</b><span>{defaults.quick_replies.length ? `${defaults.quick_replies.length} modelo${defaults.quick_replies.length === 1 ? "" : "s"} com {{nome}} e {{saudacao}}` : "nenhuma"}</span></div>
        <div><b>Departamentos</b><span>{defaults.departments.length ? defaults.departments.join(" · ") : "nenhum (a empresa cria os dela)"}</span></div>
      </div>
      {open && (
        <div className="cd-edit">
          <h3>Etapas do funil</h3>
          <div className="cd-list">
            {d.stages.map((s, i) => (
              <div key={i} className="cd-row">
                <input value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} placeholder="Nome da etapa" aria-label="Nome da etapa" />
                <select value={s.kind} onChange={(e) => setStage(i, { kind: e.target.value as any })} aria-label="Tipo">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <div className="swatches">{COLORS.map((k) => <button key={k} type="button" className={`swatch ${s.color === k ? "on" : ""}`} style={{ background: k }} onClick={() => setStage(i, { color: k })} aria-label={k} />)}</div>
                <button type="button" className="btn small quiet danger" onClick={() => setD({ ...d, stages: d.stages.filter((_, k) => k !== i) })} disabled={d.stages.length <= 1}>Tirar</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn small" onClick={() => setD({ ...d, stages: [...d.stages, { name: "", color: COLORS[d.stages.length % COLORS.length], kind: "open" }] })} disabled={d.stages.length >= 12}>+ Etapa</button>

          <h3>Respostas rápidas</h3>
          <div className="cd-list">
            {d.quick_replies.map((q, i) => (
              <div key={i} className="cd-row quick">
                <input value={q.title} onChange={(e) => setQuick(i, { title: e.target.value })} placeholder="Título" aria-label="Título" />
                <input value={q.shortcut} onChange={(e) => setQuick(i, { shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })} placeholder="atalho" aria-label="Atalho (digite / na mensagem)" />
                <textarea rows={2} value={q.body} onChange={(e) => setQuick(i, { body: e.target.value })} placeholder="Texto — use {{nome}}, {{primeiro_nome}}, {{atendente}}, {{empresa}}, {{saudacao}}" aria-label="Texto" />
                <button type="button" className="btn small quiet danger" onClick={() => setD({ ...d, quick_replies: d.quick_replies.filter((_, k) => k !== i) })}>Tirar</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn small" onClick={() => setD({ ...d, quick_replies: [...d.quick_replies, { title: "", body: "", shortcut: "" }] })} disabled={d.quick_replies.length >= 20}>+ Resposta</button>

          <h3>Departamentos</h3>
          <div className="cw-chips">
            {d.departments.map((x) => <span key={x} className="chip pick on" onClick={() => setD({ ...d, departments: d.departments.filter((y) => y !== x) })} title="Tirar">{x} ×</span>)}
            <input value={depDraft} onChange={(e) => setDepDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDep(); } }} onBlur={addDep} placeholder="Novo departamento + Enter" aria-label="Novo departamento" />
          </div>

          <div className="row-actions" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!dirty} onClick={() => run({ action: "defaults_save", defaults: d }, "Padrões salvos. Valem para as próximas empresas.")}>Salvar padrões</button>
            <button className="btn" disabled={!dirty} onClick={() => setD(defaults)}>Desfazer</button>
          </div>
        </div>
      )}
    </div>
  );
}
