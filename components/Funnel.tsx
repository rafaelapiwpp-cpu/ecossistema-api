"use client";
// Funil (quadro de etapas): colunas = etapas, cartões = contatos. Arrastar entre colunas; no celular, "Mover para…".
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadCatalog } from "@/lib/catalog-client";
import { Icon } from "./Nav";

type Tag = { id: number; name: string; color: string | null };
type Stage = { id: number; name: string; color: string | null; kind: "open" | "won" | "lost"; position: number };
type Card = {
  pipeline_id: number; stage_id: number; position: number; value: string | null; note: string | null; moved_at: string; created_at: string;
  contact_id: number; name: string | null; phone: string; opt_out: boolean;
  conversation_id: number | null; conversation_status: string | null; last_message_at: string | null; last_preview: string | null; unread_count: number | null; tags: Tag[];
};
type Pipe = { id: number; name: string; auto_add: boolean; stages: Stage[]; cards: Card[] };
type Catalog = { phones: { id: string; display_phone_number: string; verified_name: string | null; label?: string | null }[] };

const TZ = "America/Sao_Paulo";
const fmtPhone = (p: string) => (p.length === 13 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}` : p.length === 12 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}` : `+${p}`);
const fmtWhen = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), now = Date.now();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  if (day === new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now))) return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
};
const money = (v: string | null) => (v == null ? "" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v)));

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

const HELP_KEY = "hub.funil.ajuda";

export default function Funnel({ company, base, help = false }: { company: string; base: string; help?: boolean }) {
  const [pipes, setPipes] = useState<Pipe[] | null>(null);
  const [pid, setPid] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState<{ contact: number; from: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [open, setOpen] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [showHelp, setShowHelp] = useState(false); // "Como funciona": aparece até a pessoa dispensar (fica salvo no navegador)
  useEffect(() => { if (!help) return; try { setShowHelp(localStorage.getItem(HELP_KEY) !== "0"); } catch { setShowHelp(true); } }, [help]);
  const dismissHelp = () => { setShowHelp(false); try { localStorage.setItem(HELP_KEY, "0"); } catch {} };
  const qs = `company=${encodeURIComponent(company)}`;

  const load = useCallback(async () => {
    try { const j = await api(`/api/funil?${qs}`); setPipes(j.pipelines); setPid((p) => p && j.pipelines.some((x: Pipe) => x.id === p) ? p : j.pipelines[0]?.id ?? null); }
    catch (e: any) { setErr(e.message); }
  }, [qs]);
  useEffect(() => { load(); loadCatalog<Catalog>(setCatalog); }, [load]);
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]); // acompanha leads novos dos disparos

  const pipe = useMemo(() => pipes?.find((p) => p.id === pid) || null, [pipes, pid]);
  const cards = useMemo(() => {
    if (!pipe) return [] as Card[];
    const t = q.trim().toLowerCase();
    return t ? pipe.cards.filter((c) => (c.name || "").toLowerCase().includes(t) || c.phone.includes(t.replace(/\D/g, "") || "\u0000")) : pipe.cards;
  }, [pipe, q]);

  const move = async (contactId: number, stageId: number) => {
    if (!pipe) return;
    setErr("");
    // otimista: muda na tela e salva
    setPipes((ps) => ps?.map((p) => p.id !== pipe.id ? p : { ...p, cards: p.cards.map((c) => c.contact_id === contactId ? { ...c, stage_id: stageId, moved_at: new Date().toISOString() } : c) }) || null);
    try { await api("/api/funil", { action: "move", company, pipeline_id: pipe.id, contact_id: contactId, stage_id: stageId }); }
    catch (e: any) { setErr(e.message); load(); }
  };
  const remove = async (contactId: number) => {
    if (!pipe || !confirm("Tirar este contato do funil? (o contato continua existindo)")) return;
    try { await api("/api/funil", { action: "remove", company, pipeline_id: pipe.id, contact_id: contactId }); setOpen(null); load(); } catch (e: any) { setErr(e.message); }
  };
  const saveCard = async (c: Card, value: string, note: string) => {
    if (!pipe) return;
    try { await api("/api/funil", { action: "card", company, pipeline_id: pipe.id, contact_id: c.contact_id, value, note }); setOpen(null); load(); } catch (e: any) { setErr(e.message); }
  };
  const startChat = async (c: Card) => {
    try {
      const j = await api("/api/funil", { action: "start_conversation", company, contact_id: c.contact_id, phone_number_id: catalog?.phones[0]?.id });
      window.location.href = `${base}?c=${j.conversation_id}`;
    } catch (e: any) { setErr(e.message); }
  };

  if (!pipes) return <div className="muted">{err || "Carregando…"}</div>;
  if (!pipes.length) return <div className="banner">Nenhum funil liberado para você ainda. Peça ao administrador do Ecossistema.</div>;

  return (
    <>
      <div className="toolbar fn-toolbar">
        {pipes.length > 1 && <select value={pid || ""} onChange={(e) => setPid(Number(e.target.value))}>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <input type="search" placeholder="Buscar nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        <span className="muted fn-count">{pipe?.cards.length || 0} lead(s)</span>
        {help && !showHelp && <button type="button" className="btn" onClick={() => setShowHelp(true)} title="Como funciona o funil">?</button>}
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} className="" />Novo lead</button>
      </div>
      {err && <div className="banner"><span className="err">{err}</span></div>}
      {help && showHelp && (
        <section className="fn-help" aria-label="Como funciona o funil">
          <div className="fn-help-head"><b>Como funciona o funil</b><button type="button" className="btn icon" onClick={dismissHelp} aria-label="Fechar explicação"><Icon name="close" size={12} className="" /></button></div>
          <ol>
            <li><span className="fn-help-n">1</span><div><b>Entrada automática</b><span>Quem escreve pela primeira vez para o seu WhatsApp entra sozinho na etapa <em>{pipe?.stages[0]?.name || "Novo"}</em>. Também dá para incluir alguém à mão em <em>Novo lead</em>.</span></div></li>
            <li><span className="fn-help-n">2</span><div><b>Avance as etapas</b><span>Arraste o cartão para a próxima coluna conforme a conversa evolui (no celular, use <em>Mover para</em>). Clique no cartão para anotar valor e observações ou abrir a conversa.</span></div></li>
            <li><span className="fn-help-n">3</span><div><b>Feche o ciclo</b><span>Leve para <em>{pipe?.stages.find((s) => s.kind === "won")?.name || "Fechado"}</em> quando vender e para <em>{pipe?.stages.find((s) => s.kind === "lost")?.name || "Perdido"}</em> quando não der. As etapas e os funis são definidos por quem administra o sistema.</span></div></li>
          </ol>
        </section>
      )}

      {pipe && (
        <div className="fn-board" role="list">
          {pipe.stages.map((st) => {
            const col = cards.filter((c) => c.stage_id === st.id).sort((a, b) => b.moved_at.localeCompare(a.moved_at));
            const total = col.reduce((s, c) => s + (c.value ? Number(c.value) : 0), 0);
            return (
              <section key={st.id} className={`fn-col kind-${st.kind}${over === st.id ? " over" : ""}`} role="listitem"
                onDragOver={(e) => { e.preventDefault(); if (over !== st.id) setOver(st.id); }}
                onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); if (drag && drag.from !== st.id) move(drag.contact, st.id); setDrag(null); }}>
                <header className="fn-head" style={{ "--c": st.color || "var(--accent)" } as React.CSSProperties}>
                  <i aria-hidden /><b>{st.name}</b><em>{col.length}</em>
                  {total > 0 && <span className="fn-total">{money(String(total))}</span>}
                </header>
                <div className="fn-cards">
                  {col.map((c) => (
                    <article key={c.contact_id} className={`fn-card${drag?.contact === c.contact_id ? " dragging" : ""}${c.opt_out ? " optout" : ""}`} draggable
                      onDragStart={(e) => { setDrag({ contact: c.contact_id, from: st.id }); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => setOpen(c)}>
                      <div className="fn-card-top">
                        <b>{c.name || fmtPhone(c.phone)}</b>
                        {c.unread_count ? <span className="fn-unread">{c.unread_count}</span> : <span className="fn-when">{fmtWhen(c.last_message_at || c.moved_at)}</span>}
                      </div>
                      {c.name && <div className="fn-phone">{fmtPhone(c.phone)}</div>}
                      {c.last_preview && <p className="fn-preview">{c.last_preview}</p>}
                      {(c.tags.length > 0 || c.value) && (
                        <div className="fn-meta">
                          {c.tags.slice(0, 3).map((t) => <span key={t.id} className="fn-tag" style={{ "--c": t.color || "var(--accent)" } as React.CSSProperties}>{t.name}</span>)}
                          {c.value && <span className="fn-value">{money(c.value)}</span>}
                        </div>
                      )}
                      <select className="fn-move" value={st.id} onClick={(e) => e.stopPropagation()} onChange={(e) => move(c.contact_id, Number(e.target.value))} aria-label="Mover para">
                        {pipe.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </article>
                  ))}
                  {!col.length && <div className="fn-empty">Arraste leads para cá</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {open && pipe && <CardModal card={open} pipe={pipe} base={base} onClose={() => setOpen(null)} onMove={(s) => { move(open.contact_id, s); setOpen(null); }} onRemove={() => remove(open.contact_id)} onSave={(v, n) => saveCard(open, v, n)} onChat={() => startChat(open)} />}
      {adding && pipe && <NewLeadModal pipe={pipe} company={company} phones={catalog?.phones || []} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

function CardModal({ card, pipe, base, onClose, onMove, onRemove, onSave, onChat }: {
  card: Card; pipe: Pipe; base: string; onClose: () => void; onMove: (stageId: number) => void; onRemove: () => void; onSave: (value: string, note: string) => void; onChat: () => void;
}) {
  const [value, setValue] = useState(card.value ? String(Number(card.value)).replace(".", ",") : "");
  const [note, setNote] = useState(card.note || "");
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal fn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><b>{card.name || fmtPhone(card.phone)}</b><button className="btn icon" onClick={onClose} aria-label="Fechar">✕</button></div>
        <div className="muted" style={{ fontSize: 13 }}>{fmtPhone(card.phone)}{card.opt_out ? " · pediu para não receber mensagens" : ""}</div>
        <label className="field"><span>Etapa</span>
          <select value={card.stage_id} onChange={(e) => onMove(Number(e.target.value))}>{pipe.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <div className="grid" style={{ gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <label className="field"><span>Valor (R$)</span><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></label>
          <label className="field"><span>Observação do lead</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: quer orçamento de 3 caixas" /></label>
        </div>
        <div className="fn-modal-actions">
          {card.conversation_id
            ? <Link className="btn primary" href={`${base}?c=${card.conversation_id}`}><Icon name="chat" size={15} className="" />Abrir conversa</Link>
            : <button className="btn primary" onClick={onChat}><Icon name="chat" size={15} className="" />Iniciar conversa</button>}
          <button className="btn" onClick={() => onSave(value, note)}>Salvar</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onRemove}>Tirar do funil</button>
        </div>
      </div>
    </div>
  );
}

function NewLeadModal({ pipe, company, phones, onClose, onDone }: { pipe: Pipe; company: string; phones: Catalog["phones"]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", stage_id: String(pipe.stages[0]?.id || ""), phone_number_id: phones[0]?.id || "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(""); setBusy(true);
    try { await api("/api/funil", { action: "new_lead", company, pipeline_id: pipe.id, ...f }); onDone(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal fn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><b>Novo lead</b><button className="btn icon" onClick={onClose} aria-label="Fechar">✕</button></div>
        {err && <div className="err">{err}</div>}
        <label className="field"><span>Nome</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
        <label className="field"><span>WhatsApp (DDD + número)</span><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="85 99999-8888" /></label>
        <div className="grid" style={{ gridTemplateColumns: phones.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
          <label className="field"><span>Etapa</span><select value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>{pipe.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          {phones.length > 1 && <label className="field"><span>Número que vai atender</span><select value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })}>{phones.map((p) => <option key={p.id} value={p.id}>{p.label || p.verified_name || p.display_phone_number}</option>)}</select></label>}
        </div>
        <div className="fn-modal-actions"><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={save}>Adicionar</button></div>
      </div>
    </div>
  );
}
