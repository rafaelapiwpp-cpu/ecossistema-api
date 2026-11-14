"use client";
import { useEffect, useMemo, useState } from "react";
import { costOf, fmtDM, monthName, revenueOf, type Entry } from "@/lib/finance";
import { fmtMoney } from "@/lib/format";
import type { FinProps } from "./Finance";

/** Saldo digitado à brasileira ("12.345,67"); aceita negativo. */
const dec = (v: string) => { const t = String(v).trim().replace(/[R$\s]/g, ""); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const str = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sum = (list: Entry[], f: (e: Entry) => number) => Math.round(list.reduce((a, e) => a + f(e), 0) * 100) / 100;
const mil = (n: number) => `R$ ${String(Math.round(n / 100) / 10).replace(".", ",")} mil`;

/** Caixa: saldo de cada conta, o que ainda vai entrar e sair, e de onde veio o dinheiro que está na conta. */
export default function Cash({ s, data, run, openEntry, goal }: FinProps) {
  const cfg = data.config;
  const [rows, setRows] = useState(() => cfg.accounts.map((a) => ({ name: a.name, balance: str(a.balance) })));
  const [busy, setBusy] = useState(false);
  const [fixedIn, setFixedIn] = useState(true);
  useEffect(() => { setRows(cfg.accounts.map((a) => ({ name: a.name, balance: str(a.balance) }))); }, [cfg.accounts]);
  const setRow = (i: number, patch: Partial<{ name: string; balance: string }>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const typed = rows.reduce((a, r) => a + dec(r.balance), 0);
  const saved = cfg.accounts.reduce((a, r) => a + r.balance, 0);
  const dirty = JSON.stringify(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), dec(r.balance)])) !== JSON.stringify(cfg.accounts.map((a) => [a.name, a.balance]));
  const cash = dirty ? typed : saved;
  const has = rows.some((r) => r.name.trim());

  // pendências de todos os meses (não só do mês escolhido): é o que ainda mexe no caixa
  const c = useMemo(() => {
    const toReceive = data.entries.filter((e) => !e.paid && revenueOf(e) > 0).sort((a, b) => (a.due || a.day).localeCompare(b.due || b.day));
    const toPay = data.entries.filter((e) => !e.cost_paid && costOf(e) > 0);
    const received = sum(s.entries.filter((e) => e.paid), revenueOf);
    const paidCost = sum(s.entries.filter((e) => e.cost_paid), costOf);
    return { toReceive, toPay, rec: sum(toReceive, revenueOf), pay: sum(toPay, costOf), received, paidCost };
  }, [data.entries, s.entries]);
  const full = cash + c.rec - c.pay;
  const fixed = fixedIn ? s.byFront.fixa : 0;
  const netMonth = c.received + fixed - c.paidCost;
  const before = cash - netMonth;
  const missing = Math.max(0, goal - s.forecast);

  const save = async () => {
    setBusy(true);
    await run({ action: "config_save", config: { accounts: rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), balance: dec(r.balance) })), cashAt: s.today } }, "Caixa atualizado.");
    setBusy(false);
  };

  return (
    <>
      <div className="grid fin-three">
        <div className="card kpi"><div className="label">Em caixa agora</div><div className="value num">{fmtMoney(cash)}</div>
          <div className="delta">{has ? (cfg.cashAt && !dirty ? <>Saldo conferido em {fmtDM(cfg.cashAt)}</> : "Ainda não salvo") : "Cadastre as suas contas abaixo"}</div></div>
        <div className="card kpi"><div className="label">Ainda vai entrar e sair</div><div className="value num">{fmtMoney(c.rec - c.pay)}</div>
          <div className="delta">A receber {fmtMoney(c.rec)} · a pagar {fmtMoney(c.pay)}</div></div>
        <div className="card kpi fin-kpi-hl"><div className="label">Valor cheio</div><div className="value num">{fmtMoney(full)}</div>
          <div className="delta">Caixa + o que falta receber − o que falta pagar</div></div>
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Contas e saldos</h2>
          <p className="sub">Coloque o saldo de hoje de cada banco ou conta. Quando o saldo mudar, é só corrigir aqui e salvar.</p>
          <div className="fin-accounts">
            {rows.map((r, i) => (
              <div key={i} className="fin-account">
                <label className="field"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Banco ou conta (ex.: Nubank PJ)" aria-label="Nome da conta" /></label>
                <label className="field"><input inputMode="decimal" value={r.balance} onChange={(e) => setRow(i, { balance: e.target.value })} onBlur={() => setRow(i, { balance: str(dec(r.balance)) })} placeholder="Saldo (R$)" aria-label="Saldo em reais" /></label>
                <button type="button" className="btn small" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Tirar ${r.name || "conta"}`}>✕</button>
              </div>
            ))}
            {!rows.length && <div className="muted" style={{ fontSize: 13 }}>Nenhuma conta cadastrada ainda.</div>}
          </div>
          <div className="fin-modal-foot" style={{ marginTop: 14 }}>
            <button type="button" className="btn tint" onClick={() => setRows((x) => [...x, { name: "", balance: "" }])}>Adicionar conta</button>
            <div className="row-actions"><span className="muted num" style={{ fontSize: 13 }}>Total: <b>{fmtMoney(typed)}</b></span><button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? "Salvando…" : "Salvar saldos"}</button></div>
          </div>
        </div>

        <div className="card">
          <h2>De onde vem o caixa</h2>
          <p className="sub">O saldo de hoje comparado com o que já entrou e saiu em {monthName(s.month)}.</p>
          <div className="fin-ledger">
            <div><span>Recebido dos clientes no mês</span><b className="num">{fmtMoney(c.received)}</b></div>
            <div><span><label className="fin-check"><input type="checkbox" checked={fixedIn} onChange={(e) => setFixedIn(e.target.checked)} />Entradas fixas já recebidas</label></span><b className="num">{fmtMoney(fixed)}</b></div>
            <div><span>Custo dos disparos já pago</span><b className="num">− {fmtMoney(c.paidCost)}</b></div>
            <div className="sum"><span>Entrou no mês, líquido</span><b className="num">{fmtMoney(netMonth)}</b></div>
            <div><span>Em caixa agora</span><b className="num">{fmtMoney(cash)}</b></div>
            <div className="hl"><span>{before >= 0 ? "Veio de antes deste mês" : "Saiu a mais do que entrou"}</span><b className="num">{has ? fmtMoney(Math.abs(before)) : "—"}</b></div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>{has ? "Esse último número é a diferença entre o saldo e o que entrou no mês: sobra de meses anteriores, já descontado o que você gastou ou retirou." : "Cadastre os saldos para ver quanto do caixa veio de antes."}</p>
        </div>
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>O que ainda vai entrar</h2>
          <p className="sub">Tudo o que está a receber, de qualquer mês. Clique para abrir e marcar como recebido.</p>
          <div className="fin-list">
            {c.toReceive.map((e) => (
              <button key={e.id} type="button" onClick={() => openEntry(e)}>
                <span><b>{e.client || e.title || "Sem nome"}</b><small>{e.title && e.client ? `${e.title} · ` : ""}{e.due ? `receber em ${fmtDM(e.due)}` : `de ${fmtDM(e.day)}`}</small></span>
                <span className="num">{fmtMoney(revenueOf(e))}</span>
              </button>
            ))}
            {!c.toReceive.length && <div className="muted" style={{ fontSize: 13 }}>Nada a receber.</div>}
            {c.toPay.map((e) => (
              <button key={`p${e.id}`} type="button" onClick={() => openEntry(e)}>
                <span><b>{e.client || e.title || "Sem nome"}</b><small>custo a pagar · de {fmtDM(e.day)}</small></span>
                <span className="num err">− {fmtMoney(costOf(e))}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Para onde o caixa vai</h2>
          <p className="sub">Contando só o que já está lançado e o que falta para a meta em foco.</p>
          <div className="fin-ledger">
            <div><span>Em caixa agora</span><b className="num">{fmtMoney(cash)}</b></div>
            <div><span>Quando receber e pagar tudo o que está em aberto</span><b className="num">{fmtMoney(full)}</b></div>
            <div className="hl"><span>Se bater a meta de {mil(goal)} até {fmtDM(s.close)}</span><b className="num">{fmtMoney(full + missing)}</b></div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>{missing > 0 ? <>Faltam {fmtMoney(missing)} de lucro para a meta; o plano por semana está em Projeção e plano.</> : "A meta em foco já foi batida."} Não desconta retiradas e gastos futuros.</p>
        </div>
      </div>
    </>
  );
}
