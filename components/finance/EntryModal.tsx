"use client";
import { useEffect, useState } from "react";
import { KIND_LABEL, isDisparo, lastDayOf, monthName, monthOf, nextMonth, type Config, type Entry, type Kind } from "@/lib/finance";
import { fmtInt, fmtMoney, fmtMoney4, fmtPct } from "@/lib/format";
import type { Run } from "./Finance";

const KINDS: [Kind, string][] = [
  ["gf7", "Campanha enviada pela plataforma GF7"], ["bm", "Disparo feito na minha própria BM"],
  ["consultoria", "Venda ou parcela de consultoria"], ["servico", "Qualquer outro serviço avulso"],
];
/** Valor digitado à brasileira: "2.345,00", "2345,5" ou "0.27" (ponto sozinho vale como vírgula). */
const dec = (v: string) => { const t = String(v).trim(); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isFinite(n) && n > 0 ? n : 0; };
/** Quantidade: só os dígitos ("10.000" = 10000). */
const qty = (v: string) => Number(String(v).replace(/\D/g, "")) || 0;
const str = (n: number | undefined, digits = 2) => (n ? String(Number(n.toFixed(digits))).replace(".", ",") : "");

/** Novo lançamento / edição: escolhe o tipo e mostra só os campos daquele tipo, com a conta na hora. */
export default function EntryModal({ entry, kind, month, today, config, clients, run, onClose }: {
  entry: Partial<Entry> | null; kind?: Kind; month: string; today: string; config: Config; clients: string[]; run: Run; onClose: () => void;
}) {
  const id = entry?.id || 0;
  // dia sugerido: hoje se cair no mês aberto; senão o último dia do mês escolhido
  const defDay = monthOf(today) === month ? today : today > lastDayOf(month) ? lastDayOf(month) : `${month}-01`;
  const [f, setF] = useState({
    kind: (entry?.kind || kind || "gf7") as Kind,
    day: entry?.day || defDay, month: entry?.month || month,
    client: entry?.client || "", title: entry?.title || "",
    volume: entry?.volume ? String(entry.volume) : "", delivered: entry?.delivered ? String(entry.delivered) : "",
    price: str(entry?.price || config.price, 4), unit_cost: str(entry?.unit_cost || config.unitCost, 4),
    amount: str(entry?.amount), paid: entry?.paid ?? false, cost_paid: entry?.cost_paid ?? false,
    due: entry?.due || "", note: entry?.note || "",
    byValue: !!entry && !entry.volume && !!entry.amount,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  const shot = isDisparo(f.kind);
  const byVolume = shot && !f.byValue;
  const volume = qty(f.volume), delivered = qty(f.delivered);
  const revenue = byVolume ? volume * dec(f.price) : dec(f.amount);
  const cost = shot ? delivered * dec(f.unit_cost) : 0;
  const profit = revenue - cost;
  const months = [nextMonth(monthOf(f.day), -1), monthOf(f.day), nextMonth(monthOf(f.day))];
  if (!months.includes(f.month)) months.push(f.month);

  const save = async () => {
    setError("");
    if (!f.day) return setError("Informe a data.");
    if (byVolume && !volume) return setError("Informe quantos disparos foram cobrados.");
    if (!byVolume && !dec(f.amount)) return setError("Informe o valor.");
    setBusy(true);
    const good = await run({
      action: "entry_save", id, kind: f.kind, day: f.day, month: f.month, client: f.client, title: f.title,
      volume: byVolume ? volume : 0, delivered: shot ? delivered : 0, price: dec(f.price), unit_cost: dec(f.unit_cost),
      amount: byVolume ? 0 : dec(f.amount), paid: f.paid, cost_paid: shot && cost > 0 ? f.cost_paid : true, due: f.paid ? null : f.due || null, note: f.note,
    }, id ? "Lançamento atualizado." : "Lançamento registrado.");
    setBusy(false);
    if (good) onClose();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal fin-modal" role="dialog" aria-modal="true" aria-label={id ? "Editar lançamento" : "Novo lançamento"}>
        <h2>{id ? "Editar lançamento" : "Novo lançamento"}</h2>
        <div className="fin-kinds" role="radiogroup" aria-label="Tipo">
          {KINDS.map(([k, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? "on" : ""} onClick={() => set({ kind: k })}>
              <b>{KIND_LABEL[k]}</b><span>{hint}</span>
            </button>
          ))}
        </div>
        <div className="fin-form">
          <label className="field"><span>Cliente</span><input list="fin-clients" value={f.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nome do cliente" /></label>
          <datalist id="fin-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          <label className="field"><span>{shot ? "Nome da campanha" : "Descrição"}</span><input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={shot ? "Ex.: Oferta de novembro" : "Ex.: Consultoria (parcela 1/2)"} /></label>
          <label className="field"><span>Data</span><input type="date" value={f.day} onChange={(e) => set({ day: e.target.value, month: e.target.value ? (monthOf(e.target.value) === monthOf(f.day) ? f.month : monthOf(e.target.value)) : f.month })} /></label>
          <label className="field"><span>Conta em qual mês</span><select value={f.month} onChange={(e) => set({ month: e.target.value })}>{months.sort().map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></label>
          {shot && (
            <div className="fin-switch wide" role="group" aria-label="Como lançar">
              <button type="button" className={!f.byValue ? "on" : ""} onClick={() => set({ byValue: false })}>Por quantidade de disparos</button>
              <button type="button" className={f.byValue ? "on" : ""} onClick={() => set({ byValue: true })}>Só o valor fechado</button>
            </div>
          )}
          {byVolume ? (
            <>
              <label className="field"><span>Disparos cobrados do cliente</span><input inputMode="numeric" value={f.volume} onChange={(e) => set({ volume: e.target.value })} placeholder="Ex.: 10000" /></label>
              <label className="field"><span>Preço por disparo (R$)</span><input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} /></label>
            </>
          ) : (
            <label className="field wide"><span>Valor (R$)</span><input inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Ex.: 2345,00" /></label>
          )}
          {shot && (
            <>
              <label className="field"><span>Mensagens entregues{f.kind === "gf7" ? " (pela GF7)" : ""}</span><input inputMode="numeric" value={f.delivered} onChange={(e) => set({ delivered: e.target.value })} placeholder={f.kind === "gf7" ? "Como aparece na GF7" : "Deixe vazio se não tem custo"} /></label>
              <label className="field"><span>Custo por entregue (R$)</span><input inputMode="decimal" value={f.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} /></label>
            </>
          )}
          <label className="fin-check"><input type="checkbox" checked={f.paid} onChange={(e) => set({ paid: e.target.checked })} /><span>Cliente já pagou</span></label>
          {shot && cost > 0
            ? <label className="fin-check"><input type="checkbox" checked={f.cost_paid} onChange={(e) => set({ cost_paid: e.target.checked })} /><span>{f.kind === "gf7" ? "Já paguei a GF7" : "Custo já pago"}</span></label>
            : <span />}
          {!f.paid && <label className="field"><span>Receber em (opcional)</span><input type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} /></label>}
          <label className="field wide"><span>Observação (opcional)</span><input value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
        </div>
        <div className="fin-calc" aria-live="polite">
          <div><span>Cliente paga</span><b className="num">{fmtMoney(revenue)}</b></div>
          {shot && <div><span>Custo</span><b className="num">{fmtMoney(cost)}</b></div>}
          <div className="hl"><span>Lucro</span><b className="num">{fmtMoney(profit)}</b></div>
          {byVolume && volume > 0 && <div><span>Por disparo</span><b className="num">{fmtMoney4(profit / volume)}</b></div>}
          {shot && revenue > 0 && <div><span>Margem</span><b className="num">{fmtPct(profit / revenue)}</b></div>}
          {byVolume && volume > 0 && delivered > 0 && <div><span>Entrega</span><b className="num">{fmtPct(delivered / volume)} <small>({fmtInt(delivered)})</small></b></div>}
        </div>
        {error && <div className="banner err" style={{ margin: 0 }}>{error}</div>}
        <div className="fin-modal-foot">
          {id ? <button className="btn danger" disabled={busy} onClick={async () => { if (confirm("Excluir este lançamento? Não dá para desfazer.")) { setBusy(true); const good = await run({ action: "entry_delete", id }, "Lançamento excluído."); setBusy(false); if (good) onClose(); } }}>Excluir</button> : <span />}
          <div className="row-actions"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? "Salvando…" : id ? "Salvar" : "Lançar"}</button></div>
        </div>
      </div>
    </div>
  );
}
