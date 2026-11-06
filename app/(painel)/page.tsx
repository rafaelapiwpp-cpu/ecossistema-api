import Header from "@/components/Header";
import Wordmark from "@/components/Wordmark";
import { MessagesChart, CostChart } from "@/components/Charts";
import { QualityPill } from "@/components/Pill";
import FavStar from "@/components/FavStar";
import WatchTabs from "@/components/WatchTabs";
import { Suspense } from "react";
import { getView, sum, type SP } from "@/lib/view";
import { CATEGORY_LABEL, fmtInt, fmtMoney, fmtMoney4, fmtPct } from "@/lib/format";
import { hasDb, query } from "@/lib/db";
import { isAdminRole } from "@/lib/roles";
import { listConnections } from "@/lib/connections";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Delta({ cur, prev, invert = false, pct = false }: { cur: number; prev: number; invert?: boolean; pct?: boolean }) {
  if (!prev) return <div className="delta">sem base no período anterior</div>;
  const diff = pct ? cur - prev : (cur - prev) / prev;
  const up = diff >= 0;
  const txt = pct ? `${up ? "+" : "−"}${Math.abs(diff * 100).toFixed(1).replace(".", ",")} p.p.` : `${up ? "▲" : "▼"} ${Math.abs(diff * 100).toFixed(0)}%`;
  void invert;
  return <div className="delta"><span className={up ? "up" : "down"}>{txt}</span> vs. período anterior</div>;
}

type Camp = { id: number; name: string; status: string; total: number; sent: number; delivered: number; read: number; replied: number; failed: number };

/** Disparos feitos pelo HUB no período (por data de envio), com o acumulado de respostas. */
async function campaignsInPeriod(from: string, to: string, wabaId: string, only: string[] | null): Promise<Camp[]> {
  if (!hasDb()) return [];
  try {
    return await query<Camp>(
      `select c.id, c.name, c.status, c.total,
         count(r.*) filter (where r.status in ('sent','delivered','read'))::int as sent,
         count(r.*) filter (where r.status in ('delivered','read'))::int as delivered,
         count(r.*) filter (where r.status = 'read')::int as read,
         count(r.*) filter (where r.replied)::int as replied,
         count(r.*) filter (where r.status = 'failed')::int as failed
       from campaigns c join campaign_recipients r on r.campaign_id = c.id
       where r.sent_at >= $1::date and r.sent_at < ($2::date + 1) and ($3 = '' or c.waba_id = $3)
         and ($4::text[] is null or c.waba_id = any($4::text[]))
       group by c.id order by max(r.sent_at) desc limit 8`, [from, to, wabaId, only]);
  } catch { return []; }
}

export default async function Overview({ searchParams }: { searchParams: SP }) {
  const { all, ds, cur, prev, period, currency, wabaId, scope, session, watch } = await getView(searchParams);
  const canStar = isAdminRole(session?.user?.role); // Master/Admin marcam contas importantes
  const camps = await campaignsInPeriod(period.from, period.to, wabaId, scope && !scope.all ? scope.wabas : null);
  const cSent = camps.reduce((a, c) => a + c.sent, 0), cRead = camps.reduce((a, c) => a + c.read, 0), cRep = camps.reduce((a, c) => a + c.replied, 0), cDel = camps.reduce((a, c) => a + c.delivered, 0);

  const sent = sum(cur.messages, (r) => r.sent);
  const delivered = sum(cur.messages, (r) => r.delivered);
  const pSent = sum(prev.messages, (r) => r.sent);
  const pDelivered = sum(prev.messages, (r) => r.delivered);
  const cost = sum(cur.costs, (r) => r.cost);
  const pCost = sum(prev.costs, (r) => r.cost);
  const paid = sum(cur.costs.filter((r) => r.cost > 0), (r) => r.volume);
  const pPaid = sum(prev.costs.filter((r) => r.cost > 0), (r) => r.volume);
  const tDel = sum(cur.templateDaily, (r) => r.delivered);
  const tRead = sum(cur.templateDaily, (r) => r.read);
  const pTDel = sum(prev.templateDaily, (r) => r.delivered);
  const pTRead = sum(prev.templateDaily, (r) => r.read);

  // séries diárias
  const msgByDay = new Map(period.days.map((d) => [d, { day: d, sent: 0, delivered: 0 }]));
  for (const m of cur.messages) { const x = msgByDay.get(m.day); if (x) { x.sent += m.sent; x.delivered += m.delivered; } }
  const main = ["MARKETING", "UTILITY", "AUTHENTICATION"];
  const costByDay = new Map(period.days.map((d) => [d, { day: d } as Record<string, any>]));
  const usedKeys = new Set<string>();
  for (const c of cur.costs) {
    if (!c.cost) continue;
    const k = main.includes(c.pricing_category) ? c.pricing_category : "OTHER";
    usedKeys.add(k);
    const x = costByDay.get(c.day); if (x) x[k] = (x[k] || 0) + c.cost;
  }
  const keys = [...main, "OTHER"].filter((k) => usedKeys.has(k));
  const costData = [...costByDay.values()].map((r) => { for (const k of keys) r[k] = +(r[k] || 0).toFixed(2); return r; });

  // por conta
  const accounts = all.wabas
    .filter((w) => ds.phones.some((p) => p.waba_id === w.id) || cur.messages.some((m) => m.waba_id === w.id) || ds.templates.some((t) => t.waba_id === w.id))
    .map((w) => {
      const s = sum(cur.messages.filter((m) => m.waba_id === w.id), (r) => r.sent);
      const d = sum(cur.messages.filter((m) => m.waba_id === w.id), (r) => r.delivered);
      const c = sum(cur.costs.filter((m) => m.waba_id === w.id), (r) => r.cost);
      const mk = sum(cur.costs.filter((m) => m.waba_id === w.id && m.pricing_category === "MARKETING"), (r) => r.cost);
      const phones = ds.phones.filter((p) => p.waba_id === w.id);
      const approved = ds.templates.filter((t) => t.waba_id === w.id && t.status === "APPROVED").length;
      return { w, s, d, c, mk, phones, approved };
    })
    .sort((a, b) => b.c - a.c || b.s - a.s);
  const maxCost = Math.max(1, ...accounts.map((a) => a.c));

  // por categoria
  const cats = new Map<string, { vol: number; paid: number; cost: number }>();
  for (const c of cur.costs) {
    const x = cats.get(c.pricing_category) || { vol: 0, paid: 0, cost: 0 };
    x.vol += c.volume; if (c.cost > 0) x.paid += c.volume; x.cost += c.cost;
    cats.set(c.pricing_category, x);
  }
  const catRows = [...cats.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].vol - a[1].vol);

  // top templates
  const tmap = new Map(ds.templates.map((t) => [t.id, t]));
  const tagg = new Map<string, { sent: number; delivered: number; read: number; clicks: number; cost: number }>();
  for (const r of cur.templateDaily) {
    const x = tagg.get(r.template_id) || { sent: 0, delivered: 0, read: 0, clicks: 0, cost: 0 };
    x.sent += r.sent; x.delivered += r.delivered; x.read += r.read; x.clicks += r.clicks; x.cost += r.cost;
    tagg.set(r.template_id, x);
  }
  const topT = [...tagg.entries()].sort((a, b) => b[1].sent - a[1].sent).slice(0, 6);
  const wname = (id: string) => all.wabas.find((w) => w.id === id)?.name || id;

  // por BM (conexão): lista limpa, agrupada por categoria; clicar numa BM abre os seus números
  const connList = hasDb() ? await listConnections().catch(() => []) : [];
  const visibleConns = scope && !scope.all ? connList.filter((c) => scope.conns.includes(c.id)) : connList;
  const connById = new Map(visibleConns.map((c) => [c.id, c]));
  const connNameById = new Map(visibleConns.map((c) => [c.id, c.name]));
  const bmKeys: number[] = [];
  const seenBm = new Set<number>();
  for (const w of all.wabas) { const k = w.connection_id || 0; if (!seenBm.has(k)) { seenBm.add(k); bmKeys.push(k); } }
  for (const c of visibleConns) if (!seenBm.has(c.id)) { seenBm.add(c.id); bmKeys.push(c.id); }
  // "selo" curto da BM para o avatar: o número final do nome (02, 13, 9…) ou as 2 primeiras letras
  const bmTag = (name: string) => {
    const num = (name.match(/(\d+)(?!.*\d)/) || [])[1];
    if (num) return num.slice(-2);
    const w = name.replace(/\bBM\b/gi, "").replace(/[^A-Za-zÀ-ú0-9]+/g, " ").trim();
    return (w.slice(0, 2) || "BM").toUpperCase();
  };
  // destaque de BM "principal": sem regra fixa por nome de cliente (o Ecossistema nasce sem clientes)
  const principalOf = (_name: string): { cls: string; rank: number } | null => null;
  const bms = bmKeys
    .map((k) => {
      const conn = k ? connById.get(k) : null;
      const name = k ? conn?.name || "BM" : "Sem BM";
      const bw = all.wabas.filter((w) => (w.connection_id || 0) === k);
      const ids = new Set(bw.map((w) => w.id));
      const phones = ds.phones.filter((p) => ids.has(p.waba_id));
      const approved = ds.templates.filter((t) => t.status === "APPROVED" && ids.has(String(t.waba_id))).length;
      const s = sum(cur.messages.filter((m) => ids.has(String(m.waba_id))), (r) => r.sent);
      const c = sum(cur.costs.filter((m) => ids.has(String(m.waba_id))), (r) => r.cost);
      return { key: k, name, tag: bmTag(name), principal: principalOf(name), description: conn?.description || null, visibility: (conn?.visibility as string | undefined) || null, wabas: bw, phones, approved, s, c, featuredCount: phones.filter((p) => p.featured).length };
    })
    .filter((b) => (b.wabas.length || b.phones.length || b.key) && (!watch.active || b.phones.length)) // acompanhando: só as BMs com número marcado
    .sort((a, b) => (b.principal?.rank || 0) - (a.principal?.rank || 0) || b.phones.length - a.phones.length || b.s - a.s || b.c - a.c);
  const nBms = bms.filter((b) => b.key).length;
  const firstBm = bms[0];
  // categorias no estilo iOS (seções com cabeçalho)
  const bmSections = [
    { label: "Privadas · só o Master", items: bms.filter((b) => b.visibility === "private") },
    { label: "Compartilhadas com a equipe", items: bms.filter((b) => b.visibility === "team") },
    { label: "Contas sem BM", items: bms.filter((b) => b.visibility !== "private" && b.visibility !== "team") },
  ].filter((sec) => sec.items.length);
  const showBmSections = bmSections.length > 1;

  return (
    <>
      <Header title="Visão geral" subtitle={`${period.from.split("-").reverse().join("/")} a ${period.to.split("-").reverse().join("/")}`} all={all} />

      <section className="hero" aria-label="Ecossistema API">
        <div className="hero-glow" aria-hidden />
        <img className="hero-mark" src="/logo-icon.webp" alt="" aria-hidden />
        <div className="hero-brand"><Wordmark size="lg" /></div>
        <div className="hero-text">
          <div className="hero-title">Central da API Oficial do WhatsApp</div>
          <div className="hero-sub">Atendimento, disparos, fluxos automáticos, leads e métricas das suas contas — em um só lugar.</div>
          <div className="hero-chips">
            {nBms > 0 && <span><b>{fmtInt(nBms)}</b> BM{nBms === 1 ? "" : "s"}</span>}
            <span><b>{fmtInt(accounts.length)}</b> conta{accounts.length === 1 ? "" : "s"}</span>
            <span><b>{fmtInt(ds.phones.length)}</b> número{ds.phones.length === 1 ? "" : "s"}</span>
            <span><b>{fmtInt(ds.templates.filter((t) => t.status === "APPROVED").length)}</b> templates aprovados</span>
            <span><b>{fmtInt(sent)}</b> mensagens no período</span>
          </div>
        </div>
      </section>

      <div className="grid kpis">
        <div className="card kpi"><div className="label">Mensagens enviadas</div><div className="value num">{fmtInt(sent)}</div><Delta cur={sent} prev={pSent} /></div>
        <div className="card kpi"><div className="label">Taxa de entrega</div><div className="value num">{fmtPct(delivered / sent)}</div><Delta cur={sent ? delivered / sent : 0} prev={pSent ? pDelivered / pSent : 0} pct /></div>
        <div className="card kpi"><div className="label">Custo total</div><div className="value num">{fmtMoney(cost, currency)}</div><Delta cur={cost} prev={pCost} /></div>
        <div className="card kpi"><div className="label">Mensagens cobradas</div><div className="value num">{fmtInt(paid)}</div><Delta cur={paid} prev={pPaid} /></div>
        <div className="card kpi"><div className="label">Custo médio (cobrada)</div><div className="value num">{paid ? fmtMoney4(cost / paid, currency) : "—"}</div><Delta cur={paid ? cost / paid : 0} prev={pPaid ? pCost / pPaid : 0} /></div>
        <div className="card kpi"><div className="label">Leitura dos templates</div><div className="value num">{tDel ? fmtPct(tRead / tDel) : "—"}</div><Delta cur={tDel ? tRead / tDel : 0} prev={pTDel ? pTRead / pTDel : 0} pct /></div>
      </div>

      {bms.length > 0 && (
        <section className="bm-wrap section" aria-label="Suas BMs">
          <div className="bm-head">
            <div>
              <h2>Suas BMs</h2>
              <p className="sub">
                {watch.active
                  ? <>Mostrando os <b>{fmtInt(watch.ids.length)}</b> número{watch.ids.length === 1 ? "" : "s"} que você marcou para acompanhar · {fmtInt(watch.total)} conectado{watch.total === 1 ? "" : "s"}. </>
                  : nBms > 0 ? <>Você tem <b>{fmtInt(nBms)}</b> BM{nBms === 1 ? "" : "s"} conectada{nBms === 1 ? "" : "s"}. </> : null}
                Toque numa BM para ver os números dela. {watch.ids.length === 0 && <>Marque "Acompanhar na Visão geral" em <Link href="/conexoes">Conexões</Link> para ver aqui só os números que interessam a você.</>}
              </p>
            </div>
            {watch.ids.length > 0 && <Suspense><WatchTabs watching={watch.ids.length} total={watch.total} showAll={watch.showAll} /></Suspense>}
          </div>
          {bmSections.map((sec) => (
            <div className="bm-group" key={sec.label}>
              {showBmSections && <div className="bm-group-label">{sec.label}</div>}
              <div className="bm-list">
                {sec.items.map((b) => (
                  <details className={`bm-item${b.principal ? " principal" : ""}`} key={b.key} open={firstBm != null && b.key === firstBm.key}>
                    <summary className="bm-row">
                      <span className={`bm-avatar${b.principal ? " " + b.principal.cls : ""}`} aria-hidden>{b.tag}</span>
                      <span className="bm-row-main">
                        <span className="bm-row-title">
                          {b.name}
                          {b.principal && <span className={`bm-star ${b.principal.cls}`} title="BM principal">★</span>}
                          {b.visibility === "private" && <span className="bm-badge">Só Master</span>}
                        </span>
                        <span className="bm-row-sub">
                          {b.description || <>{fmtInt(b.phones.length)} número{b.phones.length === 1 ? "" : "s"} · {fmtInt(b.wabas.length)} conta{b.wabas.length === 1 ? "" : "s"}</>}
                        </span>
                      </span>
                      <span className="bm-row-count">
                        {b.featuredCount > 0 && <span className="bm-fav-count" title={`${b.featuredCount} conta${b.featuredCount === 1 ? "" : "s"} marcada${b.featuredCount === 1 ? "" : "s"} como importante${b.featuredCount === 1 ? "" : "s"}`}>★{fmtInt(b.featuredCount)}</span>}
                        <span className="bm-count-n">{fmtInt(b.phones.length)}</span>
                      </span>
                      <svg className="bm-chev" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </summary>
                    <div className="bm-body">
                      <div className="bm-stats">
                        <div><b>{fmtInt(b.wabas.length)}</b><span>conta{b.wabas.length === 1 ? "" : "s"}</span></div>
                        <div><b>{fmtInt(b.phones.length)}</b><span>número{b.phones.length === 1 ? "" : "s"}</span></div>
                        <div><b>{fmtInt(b.approved)}</b><span>templates</span></div>
                        <div><b>{fmtInt(b.s)}</b><span>enviadas</span></div>
                        <div><b>{fmtMoney(b.c, currency)}</b><span>custo</span></div>
                      </div>
                      {b.phones.length > 0 ? (
                        <ul className="bm-nums">
                          {[...b.phones].sort((x, y) => (y.featured ? 1 : 0) - (x.featured ? 1 : 0)).map((p) => (
                            <li className={`bm-num${p.featured ? " starred" : ""}`} key={p.id}>
                              <FavStar id={p.id} featured={!!p.featured} canEdit={canStar} />
                              <span className="bm-num-main">
                                <b>{p.display_phone_number || p.id}</b>
                                <small>{p.verified_name || "—"}{p.label ? ` · ${p.label}` : ""}</small>
                              </span>
                              <QualityPill q={p.quality_rating} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="bm-empty">{b.key ? "Nenhum número sincronizado nesta BM ainda." : "Contas que ainda não foram associadas a uma BM."}</div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="grid two section">
        <div className="card">
          <h2>Mensagens por dia</h2>
          <p className="sub">{watch.active ? "Enviadas e entregues pelas contas dos números que você acompanha" : "Enviadas e entregues por todos os números da seleção"}</p>
          <MessagesChart data={[...msgByDay.values()]} />
        </div>
        <div className="card">
          <h2>Custo por dia</h2>
          <p className="sub">Valor aproximado informado pela Meta, por categoria</p>
          {keys.length ? <CostChart data={costData} keys={keys} currency={currency} /> : <div className="empty">Sem custos no período</div>}
        </div>
      </div>

      {camps.length > 0 && (
        <div className="card section">
          <h2>Disparos feitos pelo Ecossistema</h2>
          <p className="sub">{fmtInt(cSent)} mensagens enviadas em {camps.length} disparo(s) no período · entrega {cSent ? fmtPct(cDel / cSent) : "—"} · leitura {cSent ? fmtPct(cRead / cSent) : "—"} · {fmtInt(cRep)} respostas ({cSent ? fmtPct(cRep / cSent) : "—"})</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Disparo</th><th className="r">Enviados</th><th className="r">Entrega</th><th className="r">Leitura</th><th className="r">Respostas</th><th className="r">Falhas</th></tr></thead>
              <tbody>
                {camps.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/disparos/${c.id}`}><b>{c.name}</b></Link></td>
                    <td className="r num">{fmtInt(c.sent)}</td>
                    <td className="r num">{c.sent ? fmtPct(c.delivered / c.sent) : "—"}</td>
                    <td className="r num">{c.sent ? fmtPct(c.read / c.sent) : "—"}</td>
                    <td className="r num">{fmtInt(c.replied)}{c.sent ? <span className="muted"> ({fmtPct(c.replied / c.sent)})</span> : null}</td>
                    <td className="r num">{c.failed ? <span style={{ color: "var(--critical)" }}>{fmtInt(c.failed)}</span> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card section">
        <h2>Por conta (WABA)</h2>
        <p className="sub">Ordenado por custo no período</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Conta</th><th>Número(s)</th><th>Qualidade</th><th className="r">Enviadas</th><th className="r">Entrega</th><th className="r">Marketing</th><th className="r">Custo total</th><th className="r">Templates aprovados</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.w.id}>
                  <td><b>{a.w.name || a.w.id}</b><div className="muted" style={{ fontSize: 12 }}>{a.w.connection_id && connNameById.get(a.w.connection_id) ? <>{connNameById.get(a.w.connection_id)} · </> : null}{a.w.id}</div></td>
                  <td className="num">{a.phones.map((p) => p.display_phone_number).join(", ") || <span className="muted">—</span>}</td>
                  <td>{a.phones[0] ? <QualityPill q={a.phones[0].quality_rating} /> : <span className="muted">—</span>}</td>
                  <td className="r num">{fmtInt(a.s)}</td>
                  <td className="r num">{a.s ? fmtPct(a.d / a.s) : "—"}</td>
                  <td className="r num">{fmtMoney(a.mk, currency)}</td>
                  <td className="r num"><div className="bar-cell">{fmtMoney(a.c, currency)}<div className="bar-track"><div className="bar-fill" style={{ width: `${(a.c / maxCost) * 100}%` }} /></div></div></td>
                  <td className="r num">{a.approved}</td>
                </tr>
              ))}
              {!accounts.length && <tr><td colSpan={8} className="empty">Nenhuma conta encontrada ainda — rode a primeira sincronização.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Templates mais enviados</h2>
          <p className="sub">Leitura e cliques ficam disponíveis por até 7 dias após o envio</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Template</th><th className="r">Enviados</th><th className="r">Leitura</th><th className="r">Cliques</th><th className="r">Custo</th></tr></thead>
              <tbody>
                {topT.map(([id, x]) => (
                  <tr key={id}>
                    <td><b>{tmap.get(id)?.name || id}</b><div className="muted" style={{ fontSize: 12 }}>{wname(tmap.get(id)?.waba_id || "")}</div></td>
                    <td className="r num">{fmtInt(x.sent)}</td>
                    <td className="r num">{x.delivered ? fmtPct(x.read / x.delivered) : "—"}</td>
                    <td className="r num">{fmtInt(x.clicks)}</td>
                    <td className="r num">{fmtMoney(x.cost, currency)}</td>
                  </tr>
                ))}
                {!topT.length && <tr><td colSpan={5} className="empty">Sem métricas de templates no período</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Custo por categoria</h2>
          <p className="sub">Atendimento e utilidade dentro da janela de 24h são gratuitos</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Categoria</th><th className="r">Mensagens</th><th className="r">Cobradas</th><th className="r">Custo</th><th className="r">Médio</th></tr></thead>
              <tbody>
                {catRows.map(([k, x]) => (
                  <tr key={k}>
                    <td>{CATEGORY_LABEL[k] || k}</td>
                    <td className="r num">{fmtInt(x.vol)}</td>
                    <td className="r num">{fmtInt(x.paid)}</td>
                    <td className="r num">{fmtMoney(x.cost, currency)}</td>
                    <td className="r num">{x.paid ? fmtMoney4(x.cost / x.paid, currency) : "—"}</td>
                  </tr>
                ))}
                {!catRows.length && <tr><td colSpan={5} className="empty">Sem dados no período</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
