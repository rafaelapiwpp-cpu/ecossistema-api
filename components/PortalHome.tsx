"use client";
// Início do portal de clientes: banner na cor da empresa (logo como marca d'água), conversas por situação,
// fila de atendimento, atividade dos últimos 7 dias, números atendidos (com foto) e funil.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./Nav";
import { subscribePulse } from "@/lib/pulse";
import { cacheGet, cacheSet, sessionLoad, sessionSave } from "@/lib/client-cache";

type Day = { day: string; in: number; out: number; closed: number; started: number };
type Summary = {
  company: { id: number; name: string; slug: string; tagline: string | null; logo: string | null };
  me: { id: number; name: string; role: string };
  counts: { open: number; pending: number; closed: number; unread: number; closed_today: number; in_today: number; out_today: number };
  numbers: { id: string; display_phone_number: string; verified_name: string | null; label: string | null; quality_rating: string | null; picture: string | null; open: number; pending: number; closed: number }[];
  waiting: { id: number; last_preview: string | null; last_message_at: string | null; unread_count: number; status: string; contact_name: string | null; contact_phone: string; department_name: string | null; department_color: string | null }[];
  funnel: { id: number; name: string; total: number; value_open?: number; value_won?: number; stages: { id: number; name: string; color: string | null; kind: string; n: number; value?: number }[] } | null;
  series?: Day[];
  team?: number;
};
type Brand = { name: string; slug: string; tagline: string | null; logo: string | null };

const TZ = "America/Sao_Paulo";
const initials = (name: string | null, fallback = "?") => (name ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : fallback);
const fmtPhone = (p: string) => (p.length === 13 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}` : p.length === 12 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}` : `+${p}`);
const QUALITY: Record<string, [string, string]> = { GREEN: ["good", "Qualidade alta"], YELLOW: ["warn", "Qualidade média"], RED: ["bad", "Qualidade baixa"] };
const greeting = () => { const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date())); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
const today = () => { const s = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date()); return s.charAt(0).toUpperCase() + s.slice(1); };
const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  return sameDay ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d) : new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
};
const dayDate = (day: string) => new Date(`${day}T15:00:00Z`); // meio do dia em qualquer fuso do Brasil
const weekday = (day: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" }).format(dayDate(day)).replace(".", "");
const dayNum = (day: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric" }).format(dayDate(day));
const dayLong = (day: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(dayDate(day));
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
/** Variação do avatar (0-3) a partir do nome/telefone — sempre dentro da paleta da empresa (CSS .ph-av[data-v]). */
const variant = (seed: string) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 4; };

/** Foto do número; se a URL da Meta já tiver expirado, volta para as iniciais. */
function Pic({ src, fallback, lazy }: { src: string | null; fallback: React.ReactNode; lazy?: boolean }) {
  const [bad, setBad] = useState<string | null>(null);
  return src && bad !== src ? <img src={src} alt="" loading={lazy ? "lazy" : undefined} decoding="async" onError={() => setBad(src)} /> : <>{fallback}</>;
}

/** Anel de proporção (ex.: quantas das conversas ativas estão aguardando). */
function Ring({ value, total }: { value: number; total: number }) {
  const r = 19, c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <svg className="ph-ring" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={r} className="ph-ring-bg" />
      <circle cx="24" cy="24" r={r} className="ph-ring-fg" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 24 24)" />
      <text x="24" y="25" textAnchor="middle" dominantBaseline="middle">{total > 0 ? `${Math.round(pct * 100)}%` : "–"}</text>
    </svg>
  );
}

/** Mini-barras dos últimos 7 dias. */
function Spark({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ph-spark" aria-hidden>
      {values.map((v, i) => <i key={i} className={i === values.length - 1 ? "now" : ""} style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }} title={`${labels[i]}: ${v}`} />)}
    </div>
  );
}

export default function PortalHome({ company, userName }: { company: Brand; userName: string }) {
  const key = `summary:${company.slug}`;
  // volta para o Início: os últimos números aparecem na hora (cache da tela) e se atualizam por trás
  const [d, setD] = useState<Summary | null>(() => cacheGet<Summary>(key) ?? null);
  const [err, setErr] = useState("");
  const base = `/${company.slug}`;
  useEffect(() => {
    let alive = true;
    if (!cacheGet(key)) { const s = sessionLoad<Summary>(key); if (s) setD(s); } // depois de um F5: o último resumo enquanto busca
    let inflight = false, again = false;
    const load = () => {
      if (inflight) { again = true; return; }
      inflight = true;
      fetch(`/api/portal?summary=1&company=${encodeURIComponent(company.slug)}`, { cache: "no-store" })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erro ${r.status}`); return j as Summary; })
        .then((j) => { if (alive) { setD(j); setErr(""); cacheSet(key, j); sessionSave(key, j); } })
        .catch((e) => { if (alive) setErr(e.message); })
        .finally(() => { inflight = false; if (again && alive) { again = false; load(); } });
    };
    load();
    // canal de novidades: mensagem nova, conversa encerrada, atribuída… os números se atualizam sozinhos
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribePulse(() => { if (timer) return; timer = setTimeout(() => { timer = null; load(); }, 700); });
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000); // rede de segurança
    return () => { alive = false; clearInterval(t); unsub(); if (timer) clearTimeout(timer); };
  }, [company.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = (userName || "").trim().split(/\s+/)[0] || "";
  const c = d?.counts;
  const active = c ? c.open + c.pending : 0;
  const waitingLine = !c ? "" : c.open === 0 ? (c.pending > 0 ? `Nenhuma conversa esperando por você — ${plural(c.pending, "conversa aguarda", "conversas aguardam")} o cliente.` : "Nenhuma conversa aguardando resposta. Tudo em dia!") : c.open === 1 ? "1 conversa aguardando a sua resposta." : `${c.open} conversas aguardando a sua resposta.`;
  const series = d?.series || [];
  const labels = series.map((s) => dayLong(s.day));
  const sum = (k: keyof Day) => series.reduce((a, s) => a + Number(s[k] || 0), 0);
  const maxBar = Math.max(1, ...series.map((s) => Math.max(s.in, s.out)));
  const n0 = d?.numbers[0];
  const q0 = n0?.quality_rating ? QUALITY[n0.quality_rating.toUpperCase()] : null;

  return (
    <div className="ph">
      <section className="ph-hero">
        <div className="ph-hero-art" aria-hidden>{company.logo ? <img src={company.logo} alt="" /> : <b>{initials(company.name)}</b>}</div>
        <div className="ph-hero-glow" aria-hidden />
        <div className="ph-hero-hi">
          <small><i aria-hidden />{today()}</small>
          <h1>{greeting()}{first ? <>, <em>{first}</em></> : ""}</h1>
          <p>{waitingLine || "Carregando o seu dia…"}</p>
          <div className="ph-hero-actions">
            <Link className="ph-cta" href={`${base}/atendimento`}><Icon name="chat" size={17} className="" />Abrir atendimento</Link>
            <Link className="ph-cta ghost" href={`${base}/funil`}><Icon name="leads" size={17} className="" />Ver funil</Link>
          </div>
        </div>
        {/* cartão de vidro com a marca, o número conectado e três números rápidos (como no site da própria empresa) */}
        <aside className="ph-glass" aria-label="Sua empresa">
          <div className="ph-glass-brand">
            <span className="ph-glass-tile">{company.logo ? <img src={company.logo} alt="" /> : <b>{initials(company.name)}</b>}</span>
            <div><b>{company.name}</b><span>{company.tagline || "Portal de atendimento"}</span></div>
          </div>
          {d && (
            <div className="ph-glass-num">
              {d.numbers.length === 1 && n0 ? (
                <>
                  <span className="ph-glass-pic"><Pic src={n0.picture} fallback={<b>{initials(n0.label || n0.verified_name, n0.display_phone_number.slice(-2))}</b>} /><i className="wa" aria-hidden><Icon name="chat" size={9} className="" /></i></span>
                  <div><b>{n0.label || n0.verified_name || "WhatsApp"}</b><span>{n0.display_phone_number}{q0 ? ` · ${q0[1].replace("Qualidade ", "qualidade ")}` : ""}</span></div>
                  {q0 && <i className={`q ${q0[0]}`} title={q0[1]} />}
                </>
              ) : (
                <>
                  <span className="ph-glass-pic"><b><Icon name="phone" size={14} className="" /></b></span>
                  <div><b>{d.numbers.length ? plural(d.numbers.length, "número conectado", "números conectados") : "Nenhum número liberado"}</b><span>{d.numbers.length ? "WhatsApp Business" : "fale com quem administra a conta"}</span></div>
                </>
              )}
            </div>
          )}
          <div className="ph-glass-stats">
            <span><b>{d ? d.team ?? "–" : "–"}</b>{d && d.team === 1 ? "atendente" : "atendentes"}</span>
            <span><b>{d?.funnel ? d.funnel.total : "–"}</b>{d?.funnel && d.funnel.total === 1 ? "lead no funil" : "leads no funil"}</span>
            <span><b>{c ? c.in_today + c.out_today : "–"}</b>{c && c.in_today + c.out_today === 1 ? "mensagem hoje" : "mensagens hoje"}</span>
          </div>
        </aside>
      </section>

      {err && <div className="banner"><span className="err">{err}</span></div>}

      <section className="ph-stats" aria-label="Conversas">
        <Link href={`${base}/atendimento`} className="ph-stat wait">
          <div className="ph-stat-main"><span className="ph-stat-ico"><Icon name="alert" size={18} className="" /></span><b>{c ? c.open : "–"}</b><span>Aguardando resposta</span><em>{c ? (c.unread > 0 ? plural(c.unread, "mensagem não lida", "mensagens não lidas") : "tudo lido") : ""}</em></div>
          {c && <Ring value={c.open} total={active} />}
        </Link>
        <Link href={`${base}/atendimento`} className="ph-stat going">
          <div className="ph-stat-main"><span className="ph-stat-ico"><Icon name="chat" size={18} className="" /></span><b>{c ? c.pending : "–"}</b><span>Em andamento</span><em>aguardando o cliente</em></div>
          {c && <Ring value={c.pending} total={active} />}
        </Link>
        <div className="ph-stat done">
          <div className="ph-stat-main"><span className="ph-stat-ico"><Icon name="check" size={18} className="" /></span><b>{c ? c.closed_today : "–"}</b><span>Encerradas hoje</span><em>{c ? `${c.closed} no total` : ""}</em></div>
          {series.length > 0 && <Spark values={series.map((s) => s.closed)} labels={labels} />}
        </div>
        <div className="ph-stat msgs">
          <div className="ph-stat-main"><span className="ph-stat-ico"><Icon name="send" size={18} className="" /></span><b>{c ? c.in_today : "–"}</b><span>Recebidas hoje</span><em>{c ? `${c.out_today} enviada${c.out_today === 1 ? "" : "s"}` : ""}</em></div>
          {series.length > 0 && <Spark values={series.map((s) => s.in)} labels={labels} />}
        </div>
      </section>

      <div className="ph-cols">
        <div className="ph-col">
          <section className="card ph-card">
            <div className="ph-card-head"><h2>Fila de atendimento</h2><Link href={`${base}/atendimento`} className="ph-more">Ver todas <Icon name="back" size={12} className="ph-arrow" /></Link></div>
            {!d && <div className="ph-skel" aria-hidden />}
            {d && !d.waiting.length && <div className="ph-empty"><span className="ph-empty-ico good"><Icon name="check" size={20} className="" /></span><b>Tudo em dia</b><span>Nenhuma conversa esperando por você. As novas aparecem aqui assim que chegam.</span></div>}
            <ul className="ph-queue">
              {d?.waiting.map((w) => (
                <li key={w.id}>
                  <Link href={`${base}/atendimento?c=${w.id}`}>
                    <span className="ph-av" data-v={variant(w.contact_name || w.contact_phone)}>{initials(w.contact_name, w.contact_phone.slice(-2))}</span>
                    <div className="ph-q-main">
                      <div><b>{w.contact_name || fmtPhone(w.contact_phone)}</b><time>{when(w.last_message_at)}</time></div>
                      <span>{w.last_preview || "—"}</span>
                      <div className="ph-q-meta">
                        <em className={w.status === "open" ? "wait" : "going"}>{w.status === "open" ? "Aguardando resposta" : "Em andamento"}</em>
                        {w.department_name && <em style={{ "--c": w.department_color || undefined } as React.CSSProperties}><i />{w.department_name}</em>}
                      </div>
                    </div>
                    {w.unread_count > 0 ? <span className="ph-unread">{w.unread_count}</span> : <Icon name="back" size={14} className="ph-arrow ph-q-go" />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card ph-card">
            <div className="ph-card-head">
              <h2>Atividade dos últimos 7 dias</h2>
              <span className="ph-legend"><i className="in" />Recebidas<i className="out" />Enviadas</span>
            </div>
            {!d && <div className="ph-skel" aria-hidden />}
            {series.length > 0 && (
              <>
                <div className="ph-chart" role="img" aria-label={`Mensagens por dia: ${series.map((s) => `${dayLong(s.day)} ${s.in} recebidas e ${s.out} enviadas`).join("; ")}`}>
                  {series.map((s, i) => (
                    <div key={s.day} className={`ph-day${i === series.length - 1 ? " now" : ""}`} title={`${dayLong(s.day)}: ${s.in} recebida${s.in === 1 ? "" : "s"} · ${s.out} enviada${s.out === 1 ? "" : "s"} · ${s.closed} encerrada${s.closed === 1 ? "" : "s"}`}>
                      <div className="ph-bars">
                        <i className="in" style={{ height: `${s.in ? Math.max(4, Math.round((s.in / maxBar) * 100)) : 0}%` }} />
                        <i className="out" style={{ height: `${s.out ? Math.max(4, Math.round((s.out / maxBar) * 100)) : 0}%` }} />
                      </div>
                      <span><b>{weekday(s.day)}</b>{dayNum(s.day)}</span>
                    </div>
                  ))}
                </div>
                <div className="ph-week">
                  <span><b>{sum("in")}</b> recebidas</span><span><b>{sum("out")}</b> enviadas</span><span><b>{sum("started")}</b> conversas novas</span><span><b>{sum("closed")}</b> encerradas</span>
                </div>
                {sum("in") + sum("out") === 0 && <p className="muted" style={{ margin: "8px 0 0", fontSize: 12.5 }}>Sem mensagens nos últimos 7 dias. Quando o movimento começar, o gráfico mostra o ritmo de cada dia.</p>}
              </>
            )}
          </section>
        </div>

        <div className="ph-col">
          <section className="card ph-card">
            <div className="ph-card-head"><h2>Seus números</h2><span className="muted">{d ? plural(d.numbers.length, "número", "números") : ""}</span></div>
            {!d && <div className="ph-skel" aria-hidden />}
            {d && !d.numbers.length && <p className="muted">Nenhum número liberado para você ainda. Fale com quem administra a sua conta.</p>}
            <ul className="ph-numbers">
              {d?.numbers.map((n) => {
                const q = n.quality_rating ? QUALITY[n.quality_rating.toUpperCase()] : null;
                return (
                  <li key={n.id}>
                    <span className="ph-num-pic"><Pic src={n.picture} lazy fallback={<b>{initials(n.label || n.verified_name, n.display_phone_number.slice(-2))}</b>} /><i className="ph-wa" aria-hidden><Icon name="chat" size={10} className="" /></i></span>
                    <div className="ph-num-main">
                      <b>{n.label || n.verified_name || n.display_phone_number}</b>
                      <span>{n.display_phone_number}{n.label && n.verified_name ? ` · ${n.verified_name}` : ""}</span>
                      <div className="ph-num-counts"><em className="wait"><b>{n.open}</b> aguardando</em><em className="going"><b>{n.pending}</b> em andamento</em><em><b>{n.closed}</b> encerradas</em></div>
                    </div>
                    {q && <span className={`ph-q ${q[0]}`} title={q[1]}><i />{q[1].replace("Qualidade ", "")}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card ph-card">
            <div className="ph-card-head"><h2>{d?.funnel ? d.funnel.name : "Funil"}</h2><Link href={`${base}/funil`} className="ph-more">Abrir funil <Icon name="back" size={12} className="ph-arrow" /></Link></div>
            {!d && <div className="ph-skel" aria-hidden />}
            {d && !d.funnel && <p className="muted">Nenhum funil ainda.</p>}
            {d?.funnel && (
              <div className="ph-funnel">
                <div className="ph-funnel-top">
                  <div className="ph-funnel-total"><b>{d.funnel.total}</b><span>{d.funnel.total === 1 ? "lead no funil" : "leads no funil"}</span></div>
                  {(d.funnel.value_open || 0) + (d.funnel.value_won || 0) > 0 && (
                    <div className="ph-funnel-money">
                      {(d.funnel.value_open || 0) > 0 && <span><b>{money(d.funnel.value_open || 0)}</b>em negociação</span>}
                      {(d.funnel.value_won || 0) > 0 && <span className="won"><b>{money(d.funnel.value_won || 0)}</b>fechado</span>}
                    </div>
                  )}
                </div>
                <ul>
                  {d.funnel.stages.map((s) => {
                    const pct = d.funnel!.total ? Math.max(4, Math.round((s.n / d.funnel!.total) * 100)) : 0;
                    return <li key={s.id} style={{ "--c": s.color || "var(--accent-fill)" } as React.CSSProperties}><div className="ph-stage-top"><span><i />{s.name}</span><b>{s.n}</b></div><div className="ph-bar"><div style={{ width: `${pct}%` }} /></div></li>;
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
