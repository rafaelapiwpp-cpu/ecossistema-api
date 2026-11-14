"use client";
import { useMemo, useState } from "react";
import { FRONT_COLOR, KIND_LABEL, costOf, fmtDM, isDisparo, profitOf, revenueOf, type Entry, type Kind } from "@/lib/finance";
import { fmtInt, fmtMoney, fmtMoney4, fmtPct } from "@/lib/format";
import type { FinProps } from "./Finance";

const KIND_TABS: ["all" | Kind, string][] = [["all", "Tudo"], ["gf7", "GF7"], ["bm", "Minha BM"], ["consultoria", "Consultoria"], ["servico", "Serviços"]];
const STATUS: [string, string][] = [["all", "Todos"], ["receber", "A receber"], ["pagar", "Custo a pagar"]];
type SortKey = "day" | "client" | "volume" | "revenue" | "cost" | "profit" | "margin";
const margin = (e: Entry) => (revenueOf(e) > 0 ? profitOf(e) / revenueOf(e) : 0);
const VALUE: Record<SortKey, (e: Entry) => number | string> = {
  day: (e) => e.day, client: (e) => (e.client || e.title).toLowerCase(), volume: (e) => e.volume,
  revenue: revenueOf, cost: costOf, profit: profitOf, margin,
};

/** Lançamentos do mês: filtra, ordena, marca recebido/pago com um clique e abre para editar. */
export default function Entries({ s, run, openEntry }: FinProps) {
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "day", desc: true });
  const [busy, setBusy] = useState(0);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = s.entries.filter((e) =>
      (kind === "all" || e.kind === kind) &&
      (status === "all" || (status === "receber" ? !e.paid && revenueOf(e) > 0 : !e.cost_paid && costOf(e) > 0)) &&
      (!term || `${e.client} ${e.title} ${e.note}`.toLowerCase().includes(term)));
    const get = VALUE[sort.key];
    return rows.sort((a, b) => { const x: any = get(a), y: any = get(b); const c = x < y ? -1 : x > y ? 1 : a.id - b.id; return sort.desc ? -c : c; });
  }, [s.entries, kind, status, q, sort]);

  const tot = list.reduce((a, e) => ({ volume: a.volume + e.volume, delivered: a.delivered + e.delivered, revenue: a.revenue + revenueOf(e), cost: a.cost + costOf(e), profit: a.profit + profitOf(e) }), { volume: 0, delivered: 0, revenue: 0, cost: 0, profit: 0 });
  const flag = async (e: Entry, patch: { paid?: boolean; cost_paid?: boolean }, done: string) => { setBusy(e.id); await run({ action: "entry_flag", id: e.id, ...patch }, done); setBusy(0); };
  const Th = ({ k, children, r }: { k: SortKey; children: React.ReactNode; r?: boolean }) => (
    <th className={r ? "r" : ""} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" className="fin-th" onClick={() => setSort((x) => ({ key: k, desc: x.key === k ? !x.desc : k !== "client" }))}>{children}{sort.key === k ? (sort.desc ? " ↓" : " ↑") : ""}</button>
    </th>
  );

  return (
    <div className="card">
      <div className="fin-filters">
        <div className="fin-switch" role="group" aria-label="Tipo">{KIND_TABS.map(([k, label]) => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{label}</button>)}</div>
        <div className="fin-switch" role="group" aria-label="Situação">{STATUS.map(([k, label]) => <button key={k} type="button" className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{label}</button>)}</div>
        <label className="field fin-search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou campanha" aria-label="Buscar" /></label>
      </div>
      <div className="table-wrap">
        <table className="fin-entries">
          <thead><tr>
            <Th k="day">Data</Th><Th k="client">Cliente e campanha</Th><Th k="volume" r>Cobrados</Th><th className="r">Entregues</th><th className="r">Preço</th>
            <Th k="revenue" r>Cliente paga</Th><Th k="cost" r>Custo</Th><Th k="profit" r>Lucro</Th><Th k="margin" r>Margem</Th><th>Cliente</th><th>Custo</th><th />
          </tr></thead>
          <tbody>
            {list.map((e) => {
              const shot = isDisparo(e.kind), cost = costOf(e);
              return (
                <tr key={e.id}>
                  <td className="num">{fmtDM(e.day)}{e.month !== e.day.slice(0, 7) ? <small className="muted"> · conta em {e.month.slice(5)}/{e.month.slice(2, 4)}</small> : null}</td>
                  <td><b><i className="fin-dot" style={{ background: FRONT_COLOR[e.kind] }} />{e.client || e.title || "Sem nome"}</b>
                    <div className="muted fin-sub2">{KIND_LABEL[e.kind]}{e.title && e.client ? ` · ${e.title}` : ""}{e.note ? ` · ${e.note}` : ""}</div></td>
                  <td className="r num">{e.volume ? fmtInt(e.volume) : "—"}</td>
                  <td className="r num">{shot && e.delivered ? <>{fmtInt(e.delivered)}{e.volume ? <small className="muted"> {fmtPct(e.delivered / e.volume)}</small> : null}</> : "—"}</td>
                  <td className="r num">{e.volume ? fmtMoney4(e.price) : "—"}</td>
                  <td className="r num">{fmtMoney(revenueOf(e))}</td>
                  <td className="r num">{cost > 0 ? fmtMoney(cost) : "—"}</td>
                  <td className="r num"><b>{fmtMoney(profitOf(e))}</b></td>
                  <td className="r num">{shot ? fmtPct(margin(e)) : "—"}</td>
                  <td><button type="button" className={`pill fin-flag ${e.paid ? "good" : "warning"}`} disabled={busy === e.id} title="Clique para alternar"
                    onClick={() => flag(e, { paid: !e.paid }, e.paid ? "Voltou para a receber." : "Marcado como recebido.")}><i aria-hidden />{e.paid ? "Recebido" : e.due ? `Receber ${fmtDM(e.due)}` : "A receber"}</button></td>
                  <td>{cost > 0 ? <button type="button" className={`pill fin-flag ${e.cost_paid ? "good" : "warning"}`} disabled={busy === e.id} title="Clique para alternar"
                    onClick={() => flag(e, { cost_paid: !e.cost_paid }, e.cost_paid ? "Custo voltou para a pagar." : "Custo marcado como pago.")}><i aria-hidden />{e.cost_paid ? "Pago" : "A pagar"}</button> : <span className="muted">—</span>}</td>
                  <td className="r"><button type="button" className="btn small" onClick={() => openEntry(e)}>Editar</button></td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={12} className="empty">{s.entries.length ? "Nenhum lançamento com esse filtro" : "Nenhum lançamento neste mês"}</td></tr>}
          </tbody>
          {list.length > 1 && (
            <tfoot><tr>
              <td /><td><b>{list.length} lançamentos</b></td><td className="r num">{tot.volume ? fmtInt(tot.volume) : "—"}</td><td className="r num">{tot.delivered ? fmtInt(tot.delivered) : "—"}</td><td />
              <td className="r num"><b>{fmtMoney(tot.revenue)}</b></td><td className="r num"><b>{fmtMoney(tot.cost)}</b></td><td className="r num"><b>{fmtMoney(tot.profit)}</b></td>
              <td className="r num">{tot.revenue > 0 ? fmtPct(tot.profit / tot.revenue) : "—"}</td><td /><td /><td />
            </tr></tfoot>
          )}
        </table>
      </div>
      {s.fixed.length > 0 && <p className="muted" style={{ fontSize: 12.5, margin: "12px 0 0" }}>Além destes, o mês tem {fmtMoney(s.byFront.fixa)} de entradas fixas ({s.fixed.map((f) => f.client).join(", ")}), cadastradas em Ajustes.</p>}
    </div>
  );
}
