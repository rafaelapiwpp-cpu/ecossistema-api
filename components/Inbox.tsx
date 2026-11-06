"use client";
// Atendimento: lista de conversas · conversa · painel do contato (formato Datacrazy, acabamento dos Fluxos).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadCatalog } from "@/lib/catalog-client";
import { isAdminRole } from "@/lib/roles";
import { pulseNow, subscribePulse } from "@/lib/pulse";
import { cacheGet, cacheInfo, cacheSet, cacheStale } from "@/lib/client-cache";
import { metaErrorHint } from "@/lib/meta-errors";
import { Icon } from "./Nav";
import FunnelSection from "./FunnelSection";
import { AttachTray, ClipMenu, DropOverlay } from "./inbox/AttachTray";
import { namePasted, stageFile, uploadStaged, type Staged } from "./inbox/attach";
import DeliveryQuick from "./inbox/DeliveryQuick";

type Tag = { id: number; name: string; color: string | null };
type Catalog = {
  departments: { id: number; name: string; color: string | null }[];
  users: { id: number; name: string; role: string; department_id: number | null; active: boolean }[];
  tags: Tag[];
  lists: { id: number; name: string }[];
  phones: { id: string; waba_id: string; display_phone_number: string; verified_name: string | null; label?: string | null }[];
  wabas: { id: string; name: string | null }[];
  templates: { id: string; waba_id: string; name: string; language: string; category: string; components: any[] | null }[];
  quickReplies: { id: number; title: string; body: string; department_id: number | null; shortcut?: string | null }[];
  me: { id: number; name: string; role: string; department_id: number | null };
  /** Portal de clientes: a empresa do usuário (null no HUB); `delivery` = recurso Teleentrega ligado. */
  company?: { id: number; name: string; slug: string; delivery?: boolean } | null;
  /** HUB: empresas com a Teleentrega ligada (o atalho aparece nas conversas delas). */
  deliveryCompanies?: number[];
};
type ConvRow = {
  id: number; waba_id: string; phone_number_id: string; contact_id: number; status: string; assigned_user_id: number | null; department_id: number | null; company_id?: number | null;
  origin: string | null; last_message_at: string | null; last_inbound_at: string | null; last_outbound_at: string | null; last_preview: string | null; unread_count: number;
  window_expires_at: string | null; created_at: string; contact_name: string | null; contact_phone: string; opt_out: boolean; assigned_name: string | null;
  department_name: string | null; department_color: string | null; display_phone_number: string | null; phone_name: string | null; tags: Tag[];
};
type Msg = {
  id: number; wamid: string | null; direction: "in" | "out"; type: string; body: string | null; media_id: string | null; media_mime: string | null; media_filename: string | null;
  payload: any; status: string | null; error_code: number | null; error_title: string | null; ts: string; template_name: string | null;
  sent_by_name?: string | null; campaign_name?: string | null; flow_name?: string | null;
  /** tamanho da imagem guardada no HUB (reserva o espaço antes de carregar) */
  media_w?: number | null; media_h?: number | null;
  /** anexo ainda subindo: prévia local e progresso (0–1) */
  local_url?: string | null; progress?: number | null;
};
type Ev = { id: number; type: string; data: any; created_at: string; user_name: string | null; target_name: string | null; department_name: string | null };
type Thread = {
  conv: ConvRow;
  contact: { id: number; phone: string; name: string | null; email: string | null; fields: Record<string, any>; department_id: number | null; opt_out: boolean; notes: string | null; source: string | null; created_at?: string; tags: Tag[]; lists: { id: number; name: string }[] };
  messages: Msg[];
  notes: { id: number; body: string; user_name: string | null; created_at: string }[];
  events: Ev[];
  history: {
    campaigns: { id: number; name: string; status: string; ts: string | null }[];
    flows: { id: number; name: string; status: string; ts: string | null }[];
    others: { id: number; status: string; last_message_at: string | null; created_at: string; display_phone_number: string | null; label: string | null }[];
  };
};

const TZ = "America/Sao_Paulo";
const fmtTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const fmtWhen = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)}`;
function dayLabel(iso: string) {
  const k = dayKey(iso), today = dayKey(new Date().toISOString()), y = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (k === today) return "Hoje";
  if (k === y) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" }).format(new Date(iso));
}
const fmtListTime = (iso: string | null) => {
  if (!iso) return "";
  const k = dayKey(iso);
  if (k === dayKey(new Date().toISOString())) return fmtTime(iso);
  if (k === dayKey(new Date(Date.now() - 86400000).toISOString())) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(new Date(iso));
};
const fmtPhone = (p: string) => (p.length === 13 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}` : p.length === 12 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}` : `+${p}`);
const initials = (name: string | null, phone: string) => (name ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : phone.slice(-2));

const PALETTE: [string, string][] = [["#a58bff", "#6b3fe4"], ["#5ac8fa", "#0a7aff"], ["#4cd964", "#1f9d45"], ["#ffb340", "#ff7a00"], ["#ff7a95", "#e0245e"], ["#64d2ff", "#2a9fc9"], ["#d38bff", "#9b3fd6"], ["#ffd426", "#d49b00"]];
const hashOf = (seed: string) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const paletteOf = (seed: string) => PALETTE[hashOf(seed) % PALETTE.length];

/**
 * Responsividade (vale para o HUB e para o portal de todas as empresas — só nome, logo e cores mudam):
 * - DOCK_MIN: largura mínima da área do Atendimento (tela − menu lateral) para o painel do contato ficar em coluna;
 *   abaixo disso ele abre por cima da conversa. Com lista (300–372 px) + painel (300–360 px), sobram ≥ 540 px para a conversa.
 * - Com 2+ números, o filtro por número é um único botão com menu (a linha de atalhos fica igual em toda empresa,
 *   qualquer que seja a quantidade de números ou o tamanho dos nomes).
 * - MAX_ROW_TAGS: etiquetas mostradas inteiras na linha da conversa; as demais viram "+N" (todas aparecem no painel).
 */
const DOCK_MIN = 1200;
const MAX_ROW_TAGS = 3;
const phoneName = (p: { label?: string | null; verified_name: string | null; display_phone_number: string }) => p.label || p.verified_name || p.display_phone_number;

const STATUS_TABS: [string, string][] = [["open", "Aguardando"], ["pending", "Andamento"], ["disparo", "Disparo"], ["closed", "Encerradas"], ["all", "Todas"]];
const STATUS_HINT: Record<string, string> = { disparo: "Robô: disparos e fluxos que o cliente ainda não respondeu e conversas que o robô está atendendo. Vai para Aguardando quando o cliente responde um disparo ou o robô transfere.", open: "Conversas esperando a sua resposta", pending: "Você já respondeu; aguardando o cliente", closed: "Atendimentos encerrados", all: "Todas as conversas" };
const STATUS_LABEL: Record<string, string> = { open: "Aguardando atendimento", pending: "Aguardando cliente", disparo: "Com o robô (automação)", closed: "Encerrada" };
const ORIGIN: Record<string, { label: string; icon: string | null }> = {
  organica: { label: "Orgânica", icon: null }, disparo: { label: "Disparo (automação)", icon: "robot" }, fluxo: { label: "Fluxo (automação)", icon: "robot" },
  externo: { label: "Outra ferramenta", icon: "layers" }, anuncio: { label: "Anúncio", icon: "sparkles" }, manual: { label: "Manual", icon: "person" },
};
const CAMPAIGN_ST: Record<string, string> = { pending: "na fila", sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou", skipped: "pulado" };
const FLOW_ST: Record<string, string> = { queued: "na fila", running: "em andamento", waiting_time: "aguardando tempo", waiting_reply: "aguardando resposta", done: "concluído", failed: "falhou", stopped: "interrompido" };
const ADDR: [string, string][] = [["cep", "CEP"], ["uf", "UF"], ["endereco", "Rua / avenida"], ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"], ["cidade", "Cidade"]];
const ADDR_KEYS = new Set(ADDR.map((a) => a[0]));

async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

function windowState(expires: string | null) {
  if (!expires) return { open: false, label: "Só template" };
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return { open: false, label: "Janela fechada" };
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { open: true, label: h ? `Janela ${h}h${String(m).padStart(2, "0")}` : `Janela ${m} min` };
}

function Avatar({ name, phone, size = 44, origin }: { name: string | null; phone: string; size?: number; origin?: string | null }) {
  const [c1, c2] = paletteOf(name || phone);
  const o = origin ? ORIGIN[origin] : null;
  // data-v: no portal de clientes o CSS troca a paleta colorida por 4 variações das cores da empresa
  return (
    <span className="at-av" data-v={hashOf(name || phone) % 4} style={{ "--s": `${size}px`, "--c1": c1, "--c2": c2 } as React.CSSProperties} aria-hidden>
      {initials(name, phone)}
      {o?.icon && <span className="at-av-badge" title={o.label}><Icon name={o.icon} size={10} className="" /></span>}
    </span>
  );
}

const userInitials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Variáveis das respostas rápidas ({{nome}}, {{primeiro_nome}}, {{telefone}}, {{atendente}}, {{empresa}}, {{saudacao}}). */
function fillQuick(body: string, contact: { name: string | null; phone: string } | null, me: { name: string } | null, company: { name: string } | null | undefined) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
  const vars: Record<string, string> = {
    nome: contact?.name || "", primeiro_nome: (contact?.name || "").trim().split(/\s+/)[0] || "", telefone: contact ? fmtPhone(contact.phone) : "",
    atendente: (me?.name || "").trim().split(/\s+/)[0] || "", empresa: company?.name || "", saudacao: h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (all, k: string) => (k.toLowerCase() in vars ? vars[k.toLowerCase()] : all)).replace(/ +,/g, ",").replace(/  +/g, " ");
}

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```) como elementos — sem HTML cru. */
function waFormat(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /```([^`]+)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] != null) out.push(<b key={k++}>{m[2]}</b>);
    else if (m[3] != null) out.push(<i key={k++}>{m[3]}</i>);
    else if (m[4] != null) out.push(<s key={k++}>{m[4]}</s>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Usada pelo HUB (/atendimento) e pelo portal de clientes (/{empresa}): a API já devolve só o que o usuário pode ver. */
export default function Inbox() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [filters, setFilters] = useState({ status: "open", phone: "", department: "", origin: "", tag: "", assigned: "", unread: false, q: "" });
  const [rows, setRows] = useState<ConvRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [quickQ, setQuickQ] = useState("");
  const [quickIdx, setQuickIdx] = useState(0);
  const [slashMode, setSlashMode] = useState(false); // menu aberto por "/" no início da mensagem
  const [showFilters, setShowFilters] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logo: string } | null>(null); // portal: marca da empresa na tela vazia
  // painel do contato em coluna só quando a área do Atendimento tem largura para as três colunas (senão ele flutua por cima)
  const [dock, setDock] = useState(true);
  const atRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]); // anexos na prévia, antes de enviar
  const [drag, setDrag] = useState(false);
  const mediaRetry = useRef(new Map<number, { it: Staged; convId: number; pnid: string }>()); // anexos que falharam (Reenviar)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastIdRef = useRef(0);

  useEffect(() => { loadCatalog<Catalog>(setCatalog, (e) => setError(e.message)); }, []);
  useEffect(() => { const el = document.querySelector<HTMLElement>("[data-company-name]"); if (el) setBrand({ name: el.dataset.companyName || "", logo: el.dataset.logo || "" }); }, []);
  // a largura que vale é a da área do Atendimento (tela menos o menu lateral, aberto ou recolhido), não a da janela
  useEffect(() => {
    const el = atRef.current;
    if (!el) return;
    const measure = () => setDock(el.clientWidth >= DOCK_MIN);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // painel do contato aberto por padrão só quando cabe em coluna
  useEffect(() => {
    const wide = (atRef.current?.clientWidth ?? window.innerWidth) >= DOCK_MIN;
    try { setPanel(wide && localStorage.getItem("hub.at.panel") !== "0"); } catch { setPanel(wide); }
  }, []);
  const togglePanel = () => setPanel((p) => { try { if (dock) localStorage.setItem("hub.at.panel", p ? "0" : "1"); } catch { /* ignorado */ } return !p; });

  // a conversa fica "presa" no fim enquanto o usuário estiver lá: imagens que terminam de carregar não empurram as últimas mensagens
  const atBottomRef = useRef(true);
  const onBodyScroll = () => { const el = bodyRef.current; if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160; };
  const toBottom = (smooth = false) => { atBottomRef.current = true; setTimeout(() => { const el = bodyRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" }); }, 30); };
  const keepBottom = useCallback(() => { if (!atBottomRef.current) return; const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, []);
  // mensagem nova chegando com o usuário no fim: rola antes de pintar (nenhum quadro com a mensagem escondida)
  const msgCount = thread?.messages.length ?? 0;
  useLayoutEffect(() => { if (msgCount) keepBottom(); }, [msgCount, keepBottom]);

  // cache das telas no navegador, separado por endereço (HUB interno x portal de cada empresa)
  const ns = typeof window !== "undefined" ? window.location.pathname.replace(/\/atendimento.*$/, "") || "/" : "/";
  const tkey = (id: number) => `thread:${ns}:${id}`;
  const selectedRef = useRef<number | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const listQuery = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v === true ? "1" : String(v));
    return q.toString();
  }, [filters]);
  const queryRef = useRef(listQuery);
  useEffect(() => { queryRef.current = listQuery; }, [listQuery]);
  // conversas do topo da lista ficam pré-carregadas (abrem na hora); as imagens recentes já vão para o cache do navegador
  const prefetching = useRef(new Set<number>());
  const prefetchThread = useCallback(async (id: number) => {
    const info = cacheInfo(tkey(id));
    if ((!info.stale && info.age < 5 * 60_000) || prefetching.current.has(id) || document.hidden) return;
    prefetching.current.add(id);
    try {
      const j: Thread = await api(`/api/conversations/${id}`);
      cacheSet(tkey(id), j);
      for (const m of j.messages.filter((x) => x.media_id && (x.type === "image" || x.type === "sticker")).slice(-3)) { const img = new Image(); img.src = `/api/media/${m.media_id}`; }
    } catch { /* abre normalmente depois */ }
    finally { prefetching.current.delete(id); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPrefetch = (id: number) => { if (hoverRef.current) clearTimeout(hoverRef.current); hoverRef.current = setTimeout(() => { void prefetchThread(id); }, 120); };

  const loadList = useCallback(async () => {
    const q = queryRef.current;
    try {
      const j = await api(`/api/conversations?${q}`);
      if (q !== queryRef.current) return;
      setRows(j.rows); setCounts(j.counts);
      cacheSet(`list:${ns}:${q}`, { rows: j.rows, counts: j.counts });
      // pré-carrega as primeiras conversas, uma de cada vez
      void (async () => { for (const c of (j.rows as ConvRow[]).slice(0, 6)) if (c.id !== selectedRef.current) await prefetchThread(c.id); })();
    } catch (e: any) { setError(e.message); }
  }, [prefetchThread]); // eslint-disable-line react-hooks/exhaustive-deps
  // lista: aparece na hora com o que já estava em cache e se atualiza; os avisos do canal de novidades fazem o resto
  // (a cada 60 s, com a aba à vista, ela confere sozinha, como rede de segurança)
  useEffect(() => {
    const c = cacheGet<{ rows: ConvRow[]; counts: Record<string, number> }>(`list:${ns}:${listQuery}`);
    if (c) { setRows(c.rows); setCounts(c.counts); }
    loadList();
    const t = setInterval(() => { if (!document.hidden) loadList(); }, 60000);
    return () => clearInterval(t);
  }, [loadList, listQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const openConversation = useCallback(async (id: number) => {
    const cached = cacheGet<Thread>(tkey(id));
    setSelected(id); selectedRef.current = id; setMobileChat(true); setError(""); setShowQuick(false); setSlashMode(false);
    setThread(cached || null);
    if (cached) { lastIdRef.current = cached.messages.at(-1)?.id || 0; toBottom(); }
    try {
      const j: Thread = await api(`/api/conversations/${id}`);
      if (selectedRef.current !== id) return; // já abriu outra
      setThread(j); cacheSet(tkey(id), j); lastIdRef.current = j.messages.at(-1)?.id || 0;
      if (j.conv.unread_count > 0) api(`/api/conversations/${id}`, { action: "read" }).then(loadList).catch(() => {});
      if (!cached) toBottom(); else requestAnimationFrame(keepBottom);
    } catch (e: any) { if (!cached) setError(e.message); }
  }, [loadList, keepBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = Number(new URLSearchParams(window.location.search).get("c") || 0);
    if (c) { setFilters((f) => ({ ...f, status: "all" })); openConversation(c); }
  }, [openConversation]);

  // novidades da conversa aberta: mensagens novas, tiques de entregue/lida e o eco do celular trocando a linha provisória
  const pulling = useRef(false);
  const pullAgain = useRef(false);
  const pullDelta = useCallback(async () => {
    const id = selectedRef.current;
    if (!id) return;
    if (pulling.current) { pullAgain.current = true; return; }
    pulling.current = true;
    try {
      const j = await api(`/api/conversations/${id}?after=${lastIdRef.current}`);
      const incoming: Msg[] = j.messages || [];
      setThread((cur) => {
        if (!cur || cur.conv.id !== id) return cur;
        const byId = new Map(cur.messages.map((m) => [m.id, m]));
        const upd = new Map<number, Msg>();
        for (const st of (j.statuses || []) as Msg[]) {
          const m = byId.get(st.id);
          if (m && (m.status !== st.status || m.error_code !== st.error_code || m.type !== st.type || m.body !== st.body || m.media_id !== st.media_id)) upd.set(m.id, { ...m, ...st });
        }
        const fresh = incoming.filter((m) => !byId.has(m.id));
        const same = !upd.size && !fresh.length && JSON.stringify(cur.conv) === JSON.stringify(j.conv) && JSON.stringify(cur.contact) === JSON.stringify(j.contact);
        if (same) return cur; // nada mudou: não redesenha a conversa
        let msgs = upd.size ? cur.messages.map((m) => upd.get(m.id) || m) : cur.messages;
        if (fresh.length) {
          // envio instantâneo: se a mensagem real chegou pelo aviso antes da resposta do envio, a bolha provisória sai
          msgs = [...msgs.filter((t) => !(t.id < 0 && t.status === "sending" && !t.local_url && fresh.some((f) => f.direction === "out" && f.body === t.body))), ...fresh];
          lastIdRef.current = Math.max(lastIdRef.current, fresh.at(-1)!.id);
        }
        const next = { ...cur, conv: j.conv, contact: j.contact, messages: msgs };
        cacheSet(tkey(id), next);
        return next;
      });
      if (incoming.length) {
        requestAnimationFrame(keepBottom);
        if (incoming.some((m) => m.direction === "in")) api(`/api/conversations/${id}`, { action: "read" }).catch(() => {});
      }
    } catch { /* confere de novo no próximo aviso */ }
    finally {
      pulling.current = false;
      if (pullAgain.current) { pullAgain.current = false; void pullDelta(); }
    }
  }, [keepBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  // canal de novidades: lista e conversa aberta se atualizam sozinhas assim que algo muda (sem F5)
  useEffect(() => {
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleList = (ms = 200) => { if (listTimer) return; listTimer = setTimeout(() => { listTimer = null; loadList(); }, ms); };
    const unsub = subscribePulse((ev) => {
      if (ev.reset || ev.resync) { scheduleList(0); void pullDelta(); return; }
      const ids = new Set(ev.changes.map((c) => c.c).filter((x): x is number => x != null));
      if (selectedRef.current && ids.has(selectedRef.current)) void pullDelta();
      for (const id of ids) if (id !== selectedRef.current) cacheStale(tkey(id));
      scheduleList();
    });
    // rede de segurança: confere a conversa aberta a cada 60 s com a aba à vista (aviso perdido, rede instável)
    const t = setInterval(() => { if (!document.hidden) void pullDelta(); }, 60000);
    return () => { unsub(); clearInterval(t); if (listTimer) clearTimeout(listTimer); };
  }, [loadList, pullDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshThread = useCallback(async () => {
    if (!selected) return;
    const j: Thread = await api(`/api/conversations/${selected}`);
    setThread(j); cacheSet(tkey(selected), j); lastIdRef.current = j.messages.at(-1)?.id || 0;
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (action: string, extra: any = {}) => {
    if (!selected) return;
    setBusy(true); setError("");
    try { const j = await api(`/api/conversations/${selected}`, { action, ...extra }); await refreshThread(); loadList(); pulseNow(); return j; }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const pushMessage = (m: Msg) => {
    setThread((cur) => (cur ? { ...cur, messages: [...cur.messages, m] } : cur));
    lastIdRef.current = Math.max(lastIdRef.current, m.id);
    toBottom(true); loadList();
  };
  /**
   * Envio instantâneo: a mensagem entra na conversa na hora (relógio), e vira "enviada" (✓) quando a Meta aceita.
   * Se falhar, fica marcada com "Reenviar" — o campo de texto continua livre para a próxima mensagem.
   */
  const sendText = async (body: string) => {
    const convId = selected;
    if (!body || !convId) return;
    const tempId = -Date.now() - Math.floor(Math.random() * 1000);
    const temp: Msg = { id: tempId, wamid: null, direction: "out", type: "text", body, media_id: null, media_mime: null, media_filename: null, payload: null, status: "sending", error_code: null, error_title: null, ts: new Date().toISOString(), template_name: null, sent_by_name: catalog?.me.name || null };
    setError("");
    setThread((cur) => (cur && cur.conv.id === convId ? { ...cur, messages: [...cur.messages, temp] } : cur));
    toBottom(true);
    try {
      const j = await api(`/api/conversations/${convId}`, { action: "send", type: "text", body });
      setThread((cur) => {
        if (!cur || cur.conv.id !== convId) return cur;
        const msgs = cur.messages.filter((m) => m.id !== tempId);
        if (!msgs.some((m) => m.id === j.message.id)) msgs.push(j.message);
        return { ...cur, messages: msgs };
      });
      lastIdRef.current = Math.max(lastIdRef.current, j.message.id);
      loadList();
      pulseNow(); // os tiques de enviada/entregue/lida chegam nos próximos segundos
    } catch (e: any) {
      setThread((cur) => (cur && cur.conv.id === convId ? { ...cur, messages: cur.messages.map((m) => (m.id === tempId ? { ...m, status: "failed", error_title: e.message || "Falha no envio" } : m)) } : cur));
    }
  };
  const send = () => {
    const body = text.trim();
    if (!body || !selected || !win.open) return;
    setText(""); setShowQuick(false); setSlashMode(false);
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.style.height = "auto"; el.focus(); } });
    void sendText(body);
  };
  const retry = (m: Msg) => {
    const r = mediaRetry.current.get(m.id);
    if (r) { // anexo: sobe e envia de novo o mesmo arquivo
      mediaRetry.current.delete(m.id);
      const tempId = -Date.now() - Math.floor(Math.random() * 1000);
      setThread((cur) => (cur && cur.conv.id === r.convId ? { ...cur, messages: [...cur.messages.filter((x) => x.id !== m.id), tempMedia(r.it, tempId)] } : cur));
      void sendOne(r.it, tempId, r.convId, r.pnid);
      return;
    }
    setThread((cur) => (cur ? { ...cur, messages: cur.messages.filter((x) => x.id !== m.id) } : cur));
    void sendText(m.body || "");
  };
  /** Anexos (clipe, colar ou arrastar): preparam o envio e abrem a prévia — só vão quando clicar em Enviar. */
  const addFiles = async (files: File[], asDoc = false) => {
    if (!thread || !files.length) return;
    if (!win.open) { setError("A janela de 24 h está fechada: anexos só podem ir depois que o cliente escrever (ou envie um template)."); return; }
    setError(files.length > 30 ? "Até 30 arquivos por vez — os demais ficaram de fora." : "");
    const list = await Promise.all(files.slice(0, 30).map((f) => stageFile(namePasted(f), asDoc)));
    if (!staged.length && text.trim() && list[0]) { list[0] = { ...list[0], caption: text.trim().slice(0, 1024) }; setText(""); } // o texto digitado vira a legenda
    setStaged((cur) => [...cur, ...list]);
    if (!dock) setPanel(false); // tela estreita: o painel do contato flutua por cima — sai da frente da prévia
  };
  const removeStaged = (id: string) => {
    const x = staged.find((i) => i.id === id); if (x) URL.revokeObjectURL(x.url);
    setStaged((cur) => cur.filter((i) => i.id !== id));
  };
  const cancelStaged = () => {
    staged.forEach((x) => URL.revokeObjectURL(x.url)); setStaged([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const tempMedia = (it: Staged, id: number): Msg => ({
    id, wamid: null, direction: "out", type: it.kind, body: it.kind === "audio" ? null : it.caption.trim() || null, media_id: null, media_mime: it.mime, media_filename: it.name,
    payload: null, status: "sending", error_code: null, error_title: null, ts: new Date().toISOString(), template_name: null, sent_by_name: catalog?.me.name || null, local_url: it.url, progress: 0,
  });
  const patchMsg = (convId: number, id: number, patch: Partial<Msg>) =>
    setThread((cur) => (cur && cur.conv.id === convId ? { ...cur, messages: cur.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : cur));
  /** Um anexo: sobe (com progresso na bolha) e envia; se falhar, a bolha fica com "Reenviar". */
  const sendOne = async (it: Staged, tempId: number, convId: number, pnid: string) => {
    try {
      const up = await uploadStaged(it, pnid, (p) => patchMsg(convId, tempId, { progress: p }));
      const j = await api(`/api/conversations/${convId}`, { action: "send", type: "media", kind: it.kind, media_id: up.id, mime: up.mime, filename: up.filename, caption: it.kind === "audio" ? null : it.caption.trim() || null });
      setThread((cur) => {
        if (!cur || cur.conv.id !== convId) return cur;
        const has = cur.messages.some((m) => m.id === j.message.id); // o aviso em tempo real pode ter trazido antes
        return { ...cur, messages: has ? cur.messages.filter((m) => m.id !== tempId) : cur.messages.map((m) => (m.id === tempId ? j.message : m)) };
      });
      mediaRetry.current.delete(tempId);
      setTimeout(() => URL.revokeObjectURL(it.url), 60000); // a bolha já mostra a cópia guardada no HUB
      loadList(); pulseNow();
    } catch (e: any) {
      mediaRetry.current.set(tempId, { it, convId, pnid });
      patchMsg(convId, tempId, { status: "failed", error_title: e.message || "Falha no envio", progress: null });
    }
  };
  /** Envia os anexos da prévia em ordem (cada um vira uma mensagem, como no WhatsApp). */
  const sendStaged = () => {
    const convId = selected, pnid = thread?.conv.phone_number_id;
    if (!convId || !pnid) return;
    const go = staged.filter((x) => !x.error);
    staged.filter((x) => x.error).forEach((x) => URL.revokeObjectURL(x.url));
    setStaged([]); setError("");
    const base = -Date.now();
    const temps = go.map((it, k) => ({ it, tempId: base - k * 10 - Math.floor(Math.random() * 9) }));
    setThread((cur) => (cur && cur.conv.id === convId ? { ...cur, messages: [...cur.messages, ...temps.map((t) => tempMedia(t.it, t.tempId))] } : cur));
    toBottom(true);
    requestAnimationFrame(() => inputRef.current?.focus());
    void (async () => { for (const t of temps) await sendOne(t.it, t.tempId, convId, pnid); })();
  };
  // colar imagem (Ctrl+V) com a conversa aberta: vai para a prévia
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const fs = Array.from(e.clipboardData?.files || []);
      if (!thread || !fs.length) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']") && t !== inputRef.current && !t.closest(".at-tray")) return;
      e.preventDefault();
      void addFiles(fs);
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  });
  // arrastar arquivos sobre a conversa
  const dragFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const onDragOver = (e: React.DragEvent) => {
    if (!thread || !dragFiles(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = win.open ? "copy" : "none";
    if (!drag) setDrag(true);
  };
  const onDragLeave = (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); };
  const onDrop = (e: React.DragEvent) => {
    if (!dragFiles(e)) return;
    e.preventDefault(); setDrag(false);
    if (thread && win.open) void addFiles(Array.from(e.dataTransfer.files));
  };

  // respostas rápidas fecham ao clicar fora
  useEffect(() => {
    if (!showQuick) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement)?.closest?.(".at-quick, .at-bar textarea")) { setShowQuick(false); setSlashMode(false); setQuickQ(""); } };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showQuick]);
  // textarea cresce com o texto
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }, [text]);

  const win = windowState(thread?.conv.window_expires_at ?? null);
  const quickAll = (catalog?.quickReplies || []).filter((q) => !q.department_id || q.department_id === thread?.conv.department_id || q.department_id === catalog?.me.department_id);
  const qn = quickQ.trim().toLowerCase().replace(/^\//, "");
  const quick = !qn ? quickAll : quickAll.filter((q) => (q.shortcut || "").toLowerCase().startsWith(qn) || q.title.toLowerCase().includes(qn) || q.body.toLowerCase().includes(qn));
  const openQuick = (viaSlash = false) => { setShowQuick(true); setSlashMode(viaSlash); setQuickIdx(0); if (!viaSlash) setQuickQ(""); };
  const closeQuick = () => { setShowQuick(false); setSlashMode(false); setQuickQ(""); };
  const applyQuick = (q: Catalog["quickReplies"][number]) => {
    setText(fillQuick(q.body, thread?.contact || null, catalog?.me || null, catalog?.company));
    closeQuick();
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  };
  const quickKeys = (e: React.KeyboardEvent) => {
    if (!showQuick) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setQuickIdx((i) => Math.min(i + 1, Math.max(quick.length - 1, 0))); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setQuickIdx((i) => Math.max(i - 1, 0)); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeQuick(); if (slashMode) setText(""); return true; }
    if (e.key === "Enter" && !e.shiftKey && quick[quickIdx]) { e.preventDefault(); applyQuick(quick[quickIdx]); return true; }
    if (e.key === "Tab" && quick[quickIdx]) { e.preventDefault(); applyQuick(quick[quickIdx]); return true; }
    return false;
  };
  const onType = (v: string) => {
    setText(v);
    if (v.startsWith("/") && !v.includes("\n")) { if (!showQuick) openQuick(true); setQuickQ(v.slice(1)); setQuickIdx(0); }
    else if (slashMode) closeQuick();
  };
  const manageHref = catalog?.company ? `/${catalog.company.slug}/ajustes#respostas` : "/equipe";
  // atalho de teleentrega: no portal, quando a empresa tem o recurso; no HUB, quando a conversa é de uma empresa que tem
  const deliveryCompanyId = catalog?.company
    ? (catalog.company.delivery ? catalog.company.id : null)
    : (thread?.conv.company_id && catalog?.deliveryCompanies?.includes(thread.conv.company_id) ? thread.conv.company_id : null);
  const insertText = (t: string) => {
    setText((cur) => (cur.trim() ? cur.replace(/\s+$/, "") + "\n" + t : t));
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  };
  const phoneOf = (id: string) => catalog?.phones.find((p) => p.id === id);
  // número que atende a conversa aberta (nome dado na conexão ou o nome verificado na Meta)
  const threadPhone = thread ? phoneOf(thread.conv.phone_number_id) : undefined;
  const threadVia = thread ? (threadPhone ? phoneName(threadPhone) : thread.conv.phone_name || thread.conv.display_phone_number || "") : "";
  const activeFilters = ["phone", "department", "origin", "tag"].filter((k) => (filters as any)[k]).length + (filters.assigned && !["me", "none"].includes(filters.assigned) ? 1 : 0);
  const clearFilters = () => setFilters({ status: filters.status, phone: "", department: "", origin: "", tag: "", assigned: "", unread: false, q: "" });
  // filtros escolhidos no painel, mostrados como chips removíveis (os que já têm chip rápido não repetem)
  const activeChips: { key: "phone" | "department" | "assigned" | "origin" | "tag"; label: string; value: string }[] = [];
  // com 2+ números o filtro de número já aparece na linha de atalhos (botão com menu), então não repete aqui
  const quickPhones = catalog && catalog.phones.length > 1 ? catalog.phones.map((p) => p.id) : [];
  if (filters.phone && !quickPhones.includes(filters.phone)) { const p = phoneOf(filters.phone); activeChips.push({ key: "phone", label: "Número", value: p ? phoneName(p) : filters.phone }); }
  if (filters.department) activeChips.push({ key: "department", label: "Departamento", value: catalog?.departments.find((d) => String(d.id) === filters.department)?.name || "…" });
  if (filters.assigned && !["me", "none"].includes(filters.assigned)) activeChips.push({ key: "assigned", label: "Atendente", value: catalog?.users.find((u) => String(u.id) === filters.assigned)?.name || "…" });
  if (filters.origin) activeChips.push({ key: "origin", label: "Origem", value: ORIGIN[filters.origin]?.label || filters.origin });
  if (filters.tag) activeChips.push({ key: "tag", label: "Etiqueta", value: catalog?.tags.find((t) => String(t.id) === filters.tag)?.name || "…" });

  // mensagens + eventos, agrupados por dia
  const timeline = useMemo(() => {
    if (!thread) return [];
    type Item = { kind: "msg"; ts: string; m: Msg } | { kind: "ev"; ts: string; e: Ev };
    const items: Item[] = [
      ...thread.messages.map((m) => ({ kind: "msg" as const, ts: m.ts, k: m.id < 0 && m.status === "sending" ? `~${m.ts}` : m.ts, m })),
      ...(thread.events || []).filter((e) => e.type !== "tags").map((e) => ({ kind: "ev" as const, ts: e.created_at, k: e.created_at, e })),
    ].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)); // envios em andamento ficam no fim, na ordem escolhida
    const days: { key: string; label: string; items: Item[] }[] = [];
    for (const it of items) {
      const k = dayKey(it.ts);
      if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, label: dayLabel(it.ts), items: [] });
      days[days.length - 1].items.push(it);
    }
    return days;
  }, [thread]);

  const tplOf = (m: Msg) => (m.type === "template" && m.template_name ? catalog?.templates.find((t) => t.name === m.template_name && t.waba_id === thread?.conv.waba_id) : undefined);

  return (
    <div ref={atRef} className={`at${mobileChat ? " chat-open" : ""}${panel && thread ? "" : " no-panel"}${dock ? "" : " float-panel"}`}>
      {/* ---------- lista ---------- */}
      <aside className="at-list">
        <div className="at-lhead">
          <div className="at-ltitle">
            {/* portal no celular: a marca da empresa ao lado do título (a faixa da marca some para a conversa ter a tela toda) */}
            {brand && <span className="at-brand" title={brand.name} aria-hidden>{brand.logo ? <img src={brand.logo} alt="" /> : userInitials(brand.name)}</span>}
            <h1>Atendimento</h1>
            <div>
              <button type="button" className={`at-fbtn${showFilters || activeFilters > 0 ? " on" : ""}`} onClick={() => setShowFilters(!showFilters)} title="Filtrar por número, departamento, atendente, origem ou etiqueta" aria-label="Filtros" aria-pressed={showFilters} aria-expanded={showFilters}>
                <Icon name="filter" size={15} className="" />Filtros{activeFilters > 0 && <i>{activeFilters}</i>}
              </button>
            </div>
          </div>
          <label className="at-search">
            <Icon name="search" size={15} className="" />
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Nome, telefone ou mensagem" title="Buscar por nome, telefone ou trecho da mensagem" aria-label="Buscar conversas por nome, telefone ou mensagem" />
            {filters.q && <button type="button" onClick={() => setFilters({ ...filters, q: "" })} aria-label="Limpar busca"><Icon name="close" size={10} className="" /></button>}
          </label>
          <div className="at-seg" role="tablist" aria-label="Situação">
            {STATUS_TABS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filters.status === k} className={`s-${k}${filters.status === k ? " on" : ""}`} onClick={() => setFilters({ ...filters, status: k })} title={STATUS_HINT[k]}>
                <b>{k === "all" ? Object.values(counts).reduce((a, n) => a + n, 0) : counts[k] ?? 0}</b>{k === "disparo" ? <span className="at-seg-ico" aria-label={l}><Icon name="robot" size={15} className="" /></span> : <span>{l}</span>}
              </button>
            ))}
          </div>
          {/* atalhos: quebram de linha em vez de rolar escondidos (nenhum fica cortado); os números ficam num menu */}
          <div className="at-chips">
            <button type="button" className={`at-chip${filters.assigned === "me" ? " on" : ""}`} onClick={() => setFilters({ ...filters, assigned: filters.assigned === "me" ? "" : "me" })} title="Só as conversas atribuídas a você"><Icon name="person" size={13} className="" /><span>Minhas</span></button>
            <button type="button" className={`at-chip${filters.unread ? " on" : ""}`} onClick={() => setFilters({ ...filters, unread: !filters.unread })} title="Só conversas com mensagens não lidas"><Icon name="chat" size={13} className="" /><span>Não lidas</span></button>
            <button type="button" className={`at-chip${filters.assigned === "none" ? " on" : ""}`} onClick={() => setFilters({ ...filters, assigned: filters.assigned === "none" ? "" : "none" })} title="Conversas que ninguém assumiu ainda"><span>Sem atendente</span></button>
            {catalog && catalog.phones.length > 1 && <NumberMenu phones={catalog.phones} value={filters.phone} onChange={(id) => setFilters({ ...filters, phone: id })} />}
          </div>
          {activeChips.length > 0 && !showFilters && (
            <div className="at-active" aria-label="Filtros ativos">
              {activeChips.map((f) => <button key={f.key} type="button" className="at-achip" onClick={() => setFilters({ ...filters, [f.key]: "" })} title="Tirar este filtro"><small>{f.label}</small>{f.value}<Icon name="close" size={9} className="" /></button>)}
              <button type="button" className="at-aclear" onClick={clearFilters}>Limpar</button>
            </div>
          )}
          {showFilters && (
            <div className="at-filters" role="group" aria-label="Filtrar conversas">
              <div className="at-filters-head"><b>Filtrar conversas</b><span className="at-muted">{rows ? `${rows.length} conversa${rows.length === 1 ? "" : "s"}` : ""}</span>{activeFilters > 0 && <button type="button" onClick={clearFilters}>Limpar tudo</button>}</div>
              <label className={`at-flt${filters.phone ? " on" : ""}`}><span><Icon name="phone" size={12} className="" />Número</span>
                <select value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })}><option value="">Todos</option>{catalog?.phones.map((p) => <option key={p.id} value={p.id}>{p.label ? `${p.label} · ` : ""}{p.verified_name || p.display_phone_number}</option>)}</select></label>
              <label className={`at-flt${filters.department ? " on" : ""}`}><span><Icon name="users" size={13} className="" />Departamento</span>
                <select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}><option value="">Todos</option>{catalog?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className={`at-flt${filters.assigned ? " on" : ""}`}><span><Icon name="person" size={12} className="" />Atendente</span>
                <select value={filters.assigned} onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}><option value="">Qualquer um</option><option value="me">Minhas</option><option value="none">Sem atendente</option>{catalog?.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
              <label className={`at-flt${filters.origin ? " on" : ""}`}><span><Icon name="sparkles" size={12} className="" />Origem</span>
                <select value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })}><option value="">Qualquer</option>{Object.entries(ORIGIN).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}</select></label>
              <label className={`at-flt${filters.tag ? " on" : ""}`}><span><Icon name="tag" size={12} className="" />Etiqueta</span>
                <select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}><option value="">Qualquer</option>{catalog?.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <p className="at-flt-hint">Os filtros valem junto com a situação escolhida acima ({STATUS_TABS.find(([k]) => k === filters.status)?.[1] || "Todas"}). A busca encontra por nome, telefone ou trecho da mensagem.</p>
            </div>
          )}
        </div>
        <ul className="at-convs">
          {!rows && [0, 1, 2, 3, 4].map((i) => <li key={i} className="at-skel" aria-hidden />)}
          {rows?.map((c) => {
            const outLast = !!c.last_outbound_at && (!c.last_inbound_at || c.last_outbound_at >= c.last_inbound_at);
            const ph = phoneOf(c.phone_number_id);
            const [u1, u2] = c.assigned_name ? paletteOf(c.assigned_name) : ["", ""];
            const name = c.contact_name || fmtPhone(c.contact_phone);
            const via = ph ? phoneName(ph) : c.phone_name || c.display_phone_number || "";
            // etiquetas: as MAX_ROW_TAGS primeiras inteiras; as demais viram "+N" (o nome delas aparece ao passar o mouse)
            const rowTags = c.tags.slice(0, MAX_ROW_TAGS);
            const moreTags = c.tags.slice(MAX_ROW_TAGS);
            return (
              <li key={c.id} className={`at-conv${selected === c.id ? " sel" : ""}${c.unread_count ? " unread" : ""}`} onClick={() => openConversation(c.id)}
                onMouseEnter={() => hoverPrefetch(c.id)} onTouchStart={() => hoverPrefetch(c.id)}
                tabIndex={0} role="button" aria-current={selected === c.id ? "true" : undefined} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openConversation(c.id); } }}>
                <Avatar name={c.contact_name} phone={c.contact_phone} origin={c.origin} />
                <div className="at-conv-main">
                  <div className="at-conv-top"><b title={name}>{name}</b><time>{fmtListTime(c.last_message_at)}</time></div>
                  <div className="at-conv-prev">
                    {c.status === "disparo" ? <span title="Automação (disparo/fluxo) — o cliente ainda não respondeu" style={{ display: "inline-flex", flex: "none" }}><Icon name="robot" size={13} className="" /></span> : outLast && <Icon name="check" size={13} className="" />}
                    <span className="at-ptxt" title={c.last_preview || undefined}>{c.last_preview || "—"}</span>
                    {c.unread_count > 0 && <span className="at-unread" title={`${c.unread_count} mensage${c.unread_count === 1 ? "m" : "ns"} não lida${c.unread_count === 1 ? "" : "s"}`}>{c.unread_count}</span>}
                  </div>
                  <div className="at-conv-meta">
                    {c.assigned_name && <span className="at-tag who" title={`Atendente: ${c.assigned_name}`} style={{ "--c1": u1, "--c2": u2 } as React.CSSProperties}><em>{userInitials(c.assigned_name)}</em><span>{c.assigned_name.split(" ")[0]}</span></span>}
                    {c.department_name && <span className="at-tag" title={`Departamento: ${c.department_name}`} style={{ "--c": c.department_color || undefined } as React.CSSProperties}><i /><span>{c.department_name}</span></span>}
                    {catalog && catalog.phones.length > 1 && !filters.phone && via && <span className="at-tag" title={`Número que atende: ${via}`}><Icon name="phone" size={10} className="" /><span>{via}</span></span>}
                    {rowTags.map((t) => <span key={t.id} className="at-tag solid" title={`Etiqueta: ${t.name}`} style={{ "--c": t.color || undefined } as React.CSSProperties}><span>{t.name}</span></span>)}
                    {moreTags.length > 0 && <span className="at-tag more" title={`Mais etiquetas: ${moreTags.map((t) => t.name).join(", ")}`}>+{moreTags.length}</span>}
                  </div>
                </div>
              </li>
            );
          })}
          {rows && !rows.length && (
            <li className="at-empty">
              {Object.values(counts).some((n) => n > 0) || filters.q ? "Nenhuma conversa com esses filtros." : <>
                Nenhuma conversa ainda. As mensagens chegam pela Meta em tempo real depois que o webhook está configurado
                {isAdminRole(catalog?.me.role) ? <> — confira em <a href="/configuracoes#webhook">Configurações → Diagnóstico do webhook</a></> : " (peça ao administrador para conferir em Configurações)"}.
              </>}
            </li>
          )}
        </ul>
      </aside>

      {/* ---------- conversa ---------- */}
      <section className="at-chat" onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {!selected && (
          <div className="at-nochat">
            <span className={`at-nochat-ico${brand?.logo ? " logo" : ""}`}>{brand?.logo ? <img src={brand.logo} alt="" /> : <Icon name="chat" size={28} className="" />}</span>
            <b>{brand ? `Atendimento · ${brand.name}` : "Escolha uma conversa"}</b>
            <p>{brand ? "Escolha uma conversa ao lado. As novas aparecem em “Novas”; ao responder, passam para “Andamento”." : "As conversas novas aparecem em “Novas”. Ao responder, elas passam para “Andamento”."}</p>
          </div>
        )}
        {selected && !thread && <div className="at-nochat"><p>{error || "Carregando conversa…"}</p></div>}
        {thread && (
          <>
            <header className="at-chead">
              <button type="button" className="at-ibtn at-back" onClick={() => setMobileChat(false)} aria-label="Voltar"><Icon name="back" size={18} className="" /></button>
              <Avatar name={thread.contact.name} phone={thread.contact.phone} size={40} />
              <div className="at-ctitle">
                <b title={thread.contact.name || fmtPhone(thread.contact.phone)}>{thread.contact.name || fmtPhone(thread.contact.phone)}</b>
                {/* telefone · número que atende · janela: quebram de linha quando não cabem (nada some no celular) */}
                <span>
                  <span className="at-cphone">{fmtPhone(thread.contact.phone)}</span>
                  <span className={`at-win ${win.open ? "open" : "closed"}`} title="Janela de 24 h para mensagens livres">{win.label}</span>
                  {threadVia && <span className="at-via" title={`Número que atende: ${threadVia}`}><Icon name="phone" size={10} className="" /><span>{threadVia}</span></span>}
                </span>
              </div>
              <div className="at-cactions">
                {thread.conv.status === "closed"
                  ? <button type="button" className="at-btn" onClick={() => act("reopen")} disabled={busy} title="Reabrir conversa"><Icon name="refresh" size={15} className="" /><span className="lbl">Reabrir</span></button>
                  : <button type="button" className="at-btn tint" onClick={() => act("close")} disabled={busy} title="Encerrar conversa"><Icon name="check" size={15} className="" /><span className="lbl">Encerrar</span></button>}
                <button type="button" className={`at-ibtn${panel ? " on" : ""}`} onClick={togglePanel} title="Dados do contato" aria-label="Dados do contato" aria-pressed={panel}><Icon name="sidebar" size={19} className="" /></button>
              </div>
            </header>

            <div className="at-cbody" ref={bodyRef} onScroll={onBodyScroll}>
              {timeline.map((d) => (
                <div key={d.key}>
                  <div className="at-day"><span>{d.label}</span></div>
                  {d.items.map((it, i) => {
                    if (it.kind === "ev") return <EventPill key={`e${it.e.id}`} e={it.e} />;
                    const prev = i > 0 ? d.items[i - 1] : null;
                    const first = !prev || prev.kind !== "msg" || prev.m.direction !== it.m.direction || senderOf(prev.m) !== senderOf(it.m) || new Date(it.m.ts).getTime() - new Date(prev.m.ts).getTime() > 10 * 60000;
                    return <Bubble key={it.m.id} m={it.m} first={first} tpl={tplOf(it.m)} onMedia={keepBottom} onRetry={it.m.id < 0 && it.m.status === "failed" ? () => retry(it.m) : undefined} />;
                  })}
                </div>
              ))}
              {!thread.messages.length && <div className="at-event"><span>Nenhuma mensagem nesta conversa ainda.</span></div>}
            </div>

            {error && <div className="at-cerror">{error}</div>}

            <footer className="at-composer">
              {thread.contact.opt_out && <div className="at-notice warn"><Icon name="alert" size={16} className="" /><span>Este contato pediu para não receber mensagens (opt-out). Responda só se ele escrever primeiro.</span></div>}
              {!win.open && thread.conv.status !== "closed" && (
                <div className="at-notice"><Icon name="alert" size={16} className="" /><span>A janela de 24 h está fechada. Para falar com o contato, envie um template aprovado.</span><button type="button" className="at-btn primary" onClick={() => setShowTemplate(true)}>Enviar template</button></div>
              )}
              <div className="at-bar">
                <ClipMenu disabled={!win.open} onPick={(fs, asDoc) => void addFiles(fs, asDoc)} />
                {deliveryCompanyId != null && <DeliveryQuick companyId={deliveryCompanyId} portalSlug={catalog?.company?.slug || null} disabled={!win.open} onInsert={insertText} />}
                <div className="at-quick">
                  <button type="button" className={`at-ibtn${showQuick ? " on" : quickAll.length ? " tint" : ""}`} title="Respostas rápidas (ou digite / na mensagem)" aria-label="Respostas rápidas" aria-expanded={showQuick} onClick={() => (showQuick ? closeQuick() : openQuick(false))} disabled={!win.open}><Icon name="bolt" size={19} className="" /></button>
                  {showQuick && (
                    <div className="at-quick-menu" role="listbox" aria-label="Respostas rápidas">
                      <div className="at-quick-head">
                        {slashMode ? <b>Respostas rápidas{qn ? ` · "${qn}"` : ""}</b> : (
                          <label className="at-search"><Icon name="search" size={14} className="" /><input autoFocus value={quickQ} onChange={(e) => { setQuickQ(e.target.value); setQuickIdx(0); }} onKeyDown={(e) => { quickKeys(e); }} placeholder="Buscar resposta ou atalho" aria-label="Buscar resposta rápida" /></label>
                        )}
                      </div>
                      <div className="at-quick-list">
                        {quick.map((q, i) => (
                          <button type="button" key={q.id} role="option" aria-selected={i === quickIdx} className={i === quickIdx ? "on" : ""} onMouseEnter={() => setQuickIdx(i)} onClick={() => applyQuick(q)}>
                            <b>{q.title}</b>{q.shortcut && <kbd>/{q.shortcut}</kbd>}<span>{q.body}</span>
                          </button>
                        ))}
                        {!quick.length && (
                          <div className="at-quick-empty">
                            {quickAll.length ? "Nenhuma resposta com esse nome." : <>Nenhuma resposta rápida ainda. <a href={manageHref}>Cadastre em {catalog?.company ? "Ajustes" : "Equipe"}</a> — textos prontos com {"{{nome}}"} e {"{{saudacao}}"} para responder em um clique.</>}
                          </div>
                        )}
                      </div>
                      <div className="at-quick-foot"><span><kbd>↑</kbd><kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> usar</span><span><kbd>Esc</kbd> fechar</span><span>Dica: digite <kbd>/</kbd> na mensagem</span></div>
                    </div>
                  )}
                </div>
                <textarea
                  ref={inputRef} rows={1}
                  placeholder={win.open ? (quickAll.length ? "Mensagem · digite / para uma resposta rápida" : "Mensagem") : "Janela fechada · use um template"} title="Enter envia · Shift+Enter quebra linha · / abre as respostas rápidas"
                  value={text} disabled={!win.open}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => { if (quickKeys(e)) return; if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                />
                <button type="button" className="at-ibtn" title="Enviar template" aria-label="Enviar template" onClick={() => setShowTemplate(true)} disabled={busy}><Icon name="doc" size={19} className="" /></button>
                <button type="button" className="at-send" onClick={send} disabled={!win.open || !text.trim()} title="Enviar" aria-label="Enviar"><Icon name="up" size={18} className="" /></button>
              </div>
            </footer>
            {staged.length > 0 && (
              <AttachTray items={staged} to={thread.contact.name || fmtPhone(thread.contact.phone)} onCaption={(id, caption) => setStaged((cur) => cur.map((x) => (x.id === id ? { ...x, caption } : x)))}
                onRemove={removeStaged} onAdd={(fs) => void addFiles(fs)} onSend={sendStaged} onCancel={cancelStaged} />
            )}
            {drag && <DropOverlay closed={!win.open} />}
          </>
        )}
      </section>

      {thread && panel && (
        <ContactPanel thread={thread} catalog={catalog} busy={busy} onAct={act} onClose={() => setPanel(false)} onTemplate={() => setShowTemplate(true)} onOpen={openConversation} />
      )}

      {thread && showTemplate && catalog && (
        <TemplateModal catalog={catalog} wabaId={thread.conv.waba_id} contact={thread.contact} onClose={() => setShowTemplate(false)} onSend={async (payload) => { setShowTemplate(false); await act("send", { type: "template", ...payload }); toBottom(true); }} />
      )}
    </div>
  );
}

/**
 * Filtro por número (empresas com 2+ números): um único botão na linha de atalhos e um menu com o nome inteiro de cada
 * número e o telefone — igual para qualquer empresa, com 2 ou 20 números, nomes curtos ou longos.
 */
function NumberMenu({ phones, value, onChange }: { phones: Catalog["phones"]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchable = phones.length > 8; // muitos números (ex.: HUB): busca no topo do menu
  const qn = q.trim().toLowerCase(), digits = qn.replace(/\D/g, "");
  const shown = !qn ? phones : phones.filter((p) => phoneName(p).toLowerCase().includes(qn) || (p.verified_name || "").toLowerCase().includes(qn) || (!!digits && p.display_phone_number.replace(/\D/g, "").includes(digits)));
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    (root?.querySelector<HTMLElement>(".at-nmenu-q input") || root?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]'))?.focus();
    const away = (e: MouseEvent) => { if (!root?.contains(e.target as Node)) setOpen(false); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); btnRef.current?.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const opts = [...(root?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])];
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      opts[e.key === "ArrowDown" ? Math.min(i + 1, opts.length - 1) : Math.max(i - 1, 0)]?.focus();
    };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", keys); };
  }, [open]);
  const cur = phones.find((p) => p.id === value);
  const pick = (id: string) => { onChange(id); setOpen(false); btnRef.current?.focus(); };
  return (
    <div className="at-nmenu" ref={ref}>
      <button ref={btnRef} type="button" className={`at-chip${cur ? " on" : ""}${open ? " open" : ""}`} onClick={() => { setQ(""); setOpen(!open); }} aria-haspopup="listbox" aria-expanded={open}
        title={cur ? `Só o número ${phoneName(cur)} (${cur.display_phone_number}) · clique para trocar` : "Filtrar por número"}>
        <Icon name="phone" size={12} className="" /><span>{cur ? phoneName(cur) : "Números"}</span>{!cur && <em>{phones.length}</em>}
        <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="at-nmenu-pop">
          {searchable && (
            <label className="at-search at-nmenu-q"><Icon name="search" size={14} className="" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou telefone" aria-label="Buscar número"
                onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); pick(shown[0].id); } }} />
            </label>
          )}
          <div className="at-nmenu-list" role="listbox" aria-label="Filtrar por número">
            {!qn && (
              <button type="button" role="option" aria-selected={!value} className={!value ? "on" : ""} onClick={() => pick("")}>
                <span className="at-nmenu-ico"><Icon name="layers" size={14} className="" /></span>
                <span className="at-nmenu-txt"><b>Todos os números</b><small>{phones.length} números</small></span>
                {!value && <Icon name="check" size={14} className="" />}
              </button>
            )}
            {qn && !shown.length && <div className="at-nmenu-empty">Nenhum número com “{q.trim()}”.</div>}
            {shown.map((p) => {
              const n = phoneName(p), on = value === p.id;
              const sub = [n !== p.display_phone_number ? p.display_phone_number : "", p.label && p.verified_name && p.verified_name !== p.label ? p.verified_name : ""].filter(Boolean).join(" · ");
              return (
                <button key={p.id} type="button" role="option" aria-selected={on} className={on ? "on" : ""} onClick={() => pick(on ? "" : p.id)}>
                  <span className="at-nmenu-ico"><Icon name="phone" size={13} className="" /></span>
                  <span className="at-nmenu-txt"><b>{n}</b>{sub && <small>{sub}</small>}</span>
                  {on && <Icon name="check" size={14} className="" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Quem enviou (para agrupar balões e mostrar o rótulo). */
function senderOf(m: Msg) {
  if (m.direction === "in") return "in";
  return m.flow_name ? `f:${m.flow_name}` : m.campaign_name ? `c:${m.campaign_name}` : m.type === "external" ? "ext" : m.payload?.smb_echo ? "cel" : `u:${m.sent_by_name || ""}`;
}

function EventPill({ e }: { e: Ev }) {
  const who = e.user_name || "Sistema";
  const d = e.data || {};
  let icon = "refresh", text = e.type, cls = "";
  switch (e.type) {
    case "closed": icon = "check"; text = d.by === "auto" ? "Encerrada por inatividade" : d.by === "flow" ? "Encerrada pelo fluxo" : `${who} encerrou a conversa`; break;
    case "reopened": icon = "refresh"; text = d.by === "inbound" ? "Reaberta: o cliente voltou a escrever" : `${who} reabriu a conversa`; break;
    case "assigned": icon = "person"; text = e.target_name ? `${who} atribuiu a ${e.target_name}` : `${who} tirou o atendente`; break;
    case "department": icon = "users"; text = e.department_name ? `${who} transferiu para ${e.department_name}` : `${who} tirou o departamento`; break;
    case "handoff": icon = "flow"; cls = "handoff"; text = `Fluxo ${d.flow_name || ""} passou para atendimento humano${d.note ? ` — ${d.note}` : ""}`; break;
    case "opt_out": icon = "alert"; text = d.word ? `Cliente pediu para não receber mensagens (“${d.word}”)` : `${who} bloqueou envios para este contato`; break;
    case "opt_in": icon = "check"; text = d.word ? `Cliente voltou a aceitar mensagens (“${d.word}”)` : `${who} liberou envios para este contato`; break;
  }
  return <div className={`at-event ${cls}`}><span><Icon name={icon} size={12} className="" /><span>{text} <em>· {fmtTime(e.created_at)}</em></span></span></div>;
}

function Ticks({ m }: { m: Msg }) {
  if (m.direction !== "out") return null;
  if (m.status === "sending") return <span className="at-ticks sending" title="Enviando…"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>;
  if (m.status === "failed") return <span className="at-ticks fail" title={metaErrorHint(m.error_code) || m.error_title || "Falhou"}>✕</span>;
  if (m.status === "read") return <span className="at-ticks read" title="Lida">✓✓</span>;
  if (m.status === "delivered") return <span className="at-ticks" title="Entregue">✓✓</span>;
  return <span className="at-ticks" title="Enviada">✓</span>;
}

function buttonsOf(m: Msg, tpl?: Catalog["templates"][number]): { text: string; icon: string | null }[] {
  if (tpl) {
    const b = (tpl.components || []).find((c: any) => c.type === "BUTTONS");
    return (b?.buttons || []).map((x: any) => ({ text: x.text, icon: x.type === "URL" ? "up" : x.type === "PHONE_NUMBER" ? "phone" : x.type === "COPY_CODE" ? "copy" : null }));
  }
  const a = m.payload?.action;
  if (m.type === "interactive" && m.direction === "out" && a) {
    if (Array.isArray(a.buttons)) return a.buttons.map((x: any) => ({ text: x.reply?.title || x.title || "", icon: null }));
    if (a.button) return [{ text: a.button, icon: "doc" }];
  }
  return [];
}

/** Tamanho de exibição da imagem (cabe em 300×320 sem distorcer) — reservado antes de a imagem carregar. */
function mediaBox(m: Msg): React.CSSProperties | undefined {
  const w = m.media_w || 0, h = m.media_h || 0;
  if (!w || !h) return undefined;
  const k = Math.min(1, 300 / w, 320 / h);
  return { width: Math.max(80, Math.round(w * k)), aspectRatio: `${w} / ${h}`, height: "auto" };
}

function Bubble({ m, first, tpl, onRetry, onMedia }: { m: Msg; first: boolean; tpl?: Catalog["templates"][number]; onRetry?: () => void; onMedia?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const out = m.direction === "out";
  const media = m.local_url || (m.media_id ? `/api/media/${m.media_id}` : null);
  const box = mediaBox(m);
  const shown = () => { setLoaded(true); onMedia?.(); };
  const auto = out && !!(m.flow_name || m.campaign_name);
  const ext = out && m.type === "external";
  const who = !out ? null
    : m.flow_name ? { icon: "robot", text: `Fluxo · ${m.flow_name}` }
    : m.campaign_name ? { icon: "robot", text: `Disparo · ${m.campaign_name}` }
    : ext ? { icon: "layers", text: "Outra ferramenta" }
    : m.payload?.smb_echo ? { icon: "phone", text: "Enviada pelo celular" }
    : m.sent_by_name ? { icon: "person", text: m.sent_by_name } : null;
  const header = tpl ? (tpl.components || []).find((c: any) => c.type === "HEADER") : null;
  const hParams: string[] = ((m.payload?.components || []).find((c: any) => c?.type === "header")?.parameters || []).filter((x: any) => x?.type === "text").map((x: any) => String(x.text));
  const headerText = header?.format === "TEXT" && header.text ? String(header.text).replace(/\{\{(\d+)\}\}/g, (all: string, n: string) => hParams[Number(n) - 1] ?? all) : null;
  const footer = tpl ? (tpl.components || []).find((c: any) => c.type === "FOOTER")?.text : m.type === "interactive" ? m.payload?.footer?.text : null;
  const btns = buttonsOf(m, tpl);
  const reply = !out && (m.type === "button" || m.type === "interactive");
  return (
    <div className={`at-row ${out ? "out" : "in"}${first ? " first" : ""}${auto ? " auto" : ""}${ext ? " ext" : ""}${m.status === "sending" ? " sending" : ""}`}>
      {who && first && <div className="at-who"><Icon name={who.icon} size={11} className="" />{who.text}</div>}
      <div className={`at-bubble${m.status === "failed" ? " failed" : ""}`}>
        {m.type === "template" && !tpl && <div className="at-bkind"><Icon name="doc" size={11} className="" />Template {m.template_name}</div>}
        {headerText && !/\{\{\d+\}\}/.test(headerText) && <div className="at-btitle">{headerText}</div>}
        {header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format) && !media && <div className="at-bhead-media"><Icon name={header.format === "DOCUMENT" ? "doc" : "sparkles"} size={22} className="" /></div>}
        {reply && <div className="at-reply"><Icon name="back" size={11} className="" />Resposta de botão</div>}
        {m.type === "image" && media && <a href={media} target="_blank" rel="noreferrer"><img src={media} alt="" className={`at-bmedia${loaded ? "" : " wait"}`} style={box} loading="lazy" decoding="async" onLoad={shown} onError={shown} /></a>}
        {m.type === "sticker" && media && <img src={media} alt="" className="at-bsticker" loading="lazy" onLoad={onMedia} />}
        {m.type === "video" && media && <video src={media} controls className="at-bmedia" preload="metadata" onLoadedMetadata={onMedia} />}
        {m.type === "audio" && media && <audio src={media} controls className="at-baudio" preload="none" />}
        {m.type === "document" && media && <a className="at-bdoc" href={media} target="_blank" rel="noreferrer"><Icon name="doc" size={18} className="" /><span>{m.media_filename || "Documento"}</span></a>}
        {m.type === "location" && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="pin" size={15} className="" />{m.body}</div>}
        {m.type === "contacts" && <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="person" size={15} className="" />{m.body}</div>}
        {m.type === "reaction" && <div>Reagiu com {m.body}</div>}
        {(["text", "template", "external", "interactive", "button", "image", "video", "document", "order", "system", "unsupported"].includes(m.type)) && m.body && <div className="at-btext">{waFormat(m.body)}</div>}
        {footer && <div className="at-bfoot">{footer}</div>}
        <div className="at-meta">{m.status === "sending" && m.local_url && m.progress != null && <span className="at-up">{m.progress < 1 ? `Enviando ${Math.round(m.progress * 100)}%` : "Enviando…"}</span>}{fmtTime(m.ts)}<Ticks m={m} /></div>
      </div>
      {btns.length > 0 && <div className="at-btns">{btns.map((b, i) => <span key={i}>{b.icon && <Icon name={b.icon} size={13} className="" />}{b.text}</span>)}</div>}
      {m.status === "failed" && <div className="at-fail"><span title={m.error_title || undefined}>{metaErrorHint(m.error_code) || m.error_title || "Falha no envio"}{m.error_code ? ` (${m.error_code})` : ""}</span>{onRetry && <button type="button" onClick={onRetry}>Reenviar</button>}</div>}
    </div>
  );
}

/** Seção recolhível (estado lembrado no navegador). */
export function Section({ id, title, icon, count, children, defaultOpen = true }: { id: string; title: string; icon: string; count?: number | string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { try { const v = localStorage.getItem(`hub.at.sec.${id}`); if (v) setOpen(v === "1"); } catch { /* ignorado */ } }, [id]);
  return (
    <details className="at-sec" open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); try { localStorage.setItem(`hub.at.sec.${id}`, o ? "1" : "0"); } catch { /* ignorado */ } }}>
      <summary><Icon name={icon} size={16} className="" /><span>{title}</span>{count != null && <em>{count}</em>}<svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg></summary>
      <div className="at-sbody">{children}</div>
    </details>
  );
}

type Form = { name: string; email: string; notes: string; addr: Record<string, string>; custom: [string, string][] };
const formOf = (c: Thread["contact"]): Form => ({
  name: c.name || "", email: c.email || "", notes: c.notes || "",
  addr: Object.fromEntries(ADDR.map(([k]) => [k, String(c.fields?.[k] ?? "")])),
  custom: Object.entries(c.fields || {}).filter(([k]) => !ADDR_KEYS.has(k)).map(([k, v]) => [k, String(v ?? "")]),
});

function ContactPanel({ thread, catalog, busy, onAct, onClose, onTemplate, onOpen }: {
  thread: Thread; catalog: Catalog | null; busy: boolean; onAct: (a: string, extra?: any) => Promise<any>; onClose: () => void; onTemplate: () => void; onOpen: (id: number) => void;
}) {
  const c = thread.contact, conv = thread.conv;
  const [form, setForm] = useState<Form>(() => formOf(c));
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const base = useMemo(() => JSON.stringify(formOf(c)), [c]);
  useEffect(() => { setForm(formOf(c)); }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(form) !== base;
  const tagIds = new Set(c.tags.map((t) => t.id));
  const save = async () => {
    const fields: Record<string, string> = {};
    for (const [k, v] of form.custom) if (k.trim()) fields[k.trim()] = v;
    for (const [k, v] of Object.entries(form.addr)) if (v.trim()) fields[k] = v.trim();
    await onAct("contact", { name: form.name, email: form.email, notes: form.notes, fields });
  };
  const addNote = async () => { const b = note.trim(); if (!b) return; setNote(""); await onAct("note", { body: b }); };
  const copy = async () => { try { await navigator.clipboard.writeText(`+${c.phone}`); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* sem permissão */ } };
  const setAddr = (k: string, v: string) => setForm((f) => ({ ...f, addr: { ...f.addr, [k]: v } }));

  // histórico: eventos + disparos + fluxos + outras conversas, do mais novo para o mais antigo
  const history = useMemo(() => {
    type H = { ts: string; icon: string; tone: string; node: React.ReactNode };
    const out: H[] = [];
    for (const e of thread.events || []) {
      if (e.type === "tags") continue;
      const who = e.user_name || "Sistema", d = e.data || {};
      const map: Record<string, [string, string, React.ReactNode]> = {
        closed: ["check", "good", d.by === "auto" ? "Encerrada por inatividade" : d.by === "flow" ? "Encerrada pelo fluxo" : <><b>{who}</b> encerrou</>],
        reopened: ["refresh", "", d.by === "inbound" ? "Reaberta pelo cliente" : <><b>{who}</b> reabriu</>],
        assigned: ["person", "accent", e.target_name ? <><b>{who}</b> atribuiu a <b>{e.target_name}</b></> : <><b>{who}</b> tirou o atendente</>],
        department: ["users", "accent", e.department_name ? <><b>{who}</b> transferiu para <b>{e.department_name}</b></> : <><b>{who}</b> tirou o departamento</>],
        handoff: ["flow", "accent", <>Fluxo <b>{d.flow_name}</b> passou para humano</>],
        opt_out: ["alert", "bad", "Pediu para não receber mensagens"],
        opt_in: ["check", "good", "Voltou a aceitar mensagens"],
      };
      const [icon, tone, node] = map[e.type] || ["refresh", "", e.type];
      out.push({ ts: e.created_at, icon, tone, node });
    }
    for (const x of thread.history?.campaigns || []) if (x.ts) out.push({ ts: x.ts, icon: "send", tone: x.status === "failed" ? "bad" : "accent", node: <>Disparo <b>{x.name}</b> · {CAMPAIGN_ST[x.status] || x.status}</> });
    for (const x of thread.history?.flows || []) if (x.ts) out.push({ ts: x.ts, icon: "flow", tone: x.status === "failed" ? "bad" : x.status === "done" ? "good" : "accent", node: <>Fluxo <b>{x.name}</b> · {FLOW_ST[x.status] || x.status}</> });
    for (const x of thread.history?.others || []) out.push({ ts: x.last_message_at || x.created_at, icon: "chat", tone: "", node: <>Conversa por <button type="button" onClick={() => onOpen(x.id)}>{x.label || x.display_phone_number || "outro número"}</button> · {STATUS_LABEL[x.status] || x.status}</> });
    out.push({ ts: conv.created_at, icon: "sparkles", tone: "", node: <>Primeiro contato{conv.origin && ORIGIN[conv.origin] ? <> · {ORIGIN[conv.origin].label}</> : null}</> });
    return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 30);
  }, [thread, conv.created_at, conv.origin, onOpen]);

  return (
    <aside className="at-panel" aria-label="Dados do contato">
      <div className="at-pscroll">
        <div className="at-pcard">
          <button type="button" className="at-ibtn at-pclose" onClick={onClose} aria-label="Fechar painel"><Icon name="close" size={14} className="" /></button>
          <Avatar name={c.name} phone={c.phone} size={68} origin={conv.origin} />
          <b>{c.name || fmtPhone(c.phone)}</b>
          <span className="at-pphone">{fmtPhone(c.phone)}<button type="button" onClick={copy} title="Copiar número" aria-label="Copiar número"><Icon name={copied ? "check" : "copy"} size={13} className="" /></button></span>
          {c.tags.length > 0 && <div className="at-ptags">{c.tags.map((t) => <span key={t.id} className="at-tag solid" title={`Etiqueta: ${t.name}`} style={{ "--c": t.color || undefined } as React.CSSProperties}><span>{t.name}</span></span>)}</div>}
        </div>

        <Section id="acoes" title="Ações" icon="bolt">
          <div className="at-acts">
            <button type="button" onClick={onTemplate} disabled={busy}><Icon name="doc" size={18} className="" /><span>Template</span></button>
            {conv.status === "closed"
              ? <button type="button" onClick={() => onAct("reopen")} disabled={busy}><Icon name="refresh" size={18} className="" /><span>Reabrir</span></button>
              : <button type="button" className="good" onClick={() => onAct("close")} disabled={busy}><Icon name="check" size={18} className="" /><span>Encerrar</span></button>}
            <button type="button" onClick={() => onAct("assign", { user_id: catalog?.me.id })} disabled={busy || conv.assigned_user_id === catalog?.me.id}><Icon name="person" size={18} className="" /><span>Assumir</span></button>
            <button type="button" className={c.opt_out ? "good" : "danger"} onClick={() => onAct("contact", { opt_out: !c.opt_out })} disabled={busy}><Icon name={c.opt_out ? "check" : "alert"} size={18} className="" /><span>{c.opt_out ? "Liberar" : "Bloquear"}</span></button>
          </div>
          <label className="at-f"><span>Atendente</span>
            <select value={conv.assigned_user_id || ""} onChange={(e) => onAct("assign", { user_id: e.target.value || null })} disabled={busy}><option value="">Sem atendente</option>{catalog?.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
          <label className="at-f"><span>Departamento da conversa</span>
            <select value={conv.department_id || ""} onChange={(e) => onAct("department", { department_id: e.target.value || null })} disabled={busy}><option value="">Sem departamento</option>{catalog?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <div className="at-f"><span>Etiquetas</span>
            <div className="at-tagpick">
              {catalog?.tags.map((t) => {
                const on = tagIds.has(t.id);
                return <button key={t.id} type="button" className={on ? "on" : ""} style={{ "--c": t.color || undefined } as React.CSSProperties} aria-pressed={on} disabled={busy}
                  onClick={() => { const next = new Set(tagIds); on ? next.delete(t.id) : next.add(t.id); onAct("tags", { tag_ids: [...next] }); }}><i />{t.name}</button>;
              })}
              {!catalog?.tags.length && <span className="at-muted">{catalog?.company ? "Crie etiquetas em Ajustes." : "Crie tags em Equipe."}</span>}
            </div>
          </div>
        </Section>

        <FunnelSection contactId={c.id} />

        <Section id="perfil" title="Perfil" icon="person">
          <label className="at-f"><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do contato" /></label>
          <label className="at-f"><span>E-mail</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" /></label>
          <label className="at-f"><span>Departamento do contato</span>
            <select value={c.department_id || ""} onChange={(e) => onAct("contact", { department_id: e.target.value || null })} disabled={busy}><option value="">—</option>{catalog?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <div className="at-f2">
            <div className="at-f"><span>Origem</span><div className="at-ro">{(conv.origin && ORIGIN[conv.origin]?.label) || c.source || "—"}</div></div>
            <div className="at-f"><span>Situação</span><div className="at-ro">{STATUS_LABEL[conv.status] || conv.status}</div></div>
          </div>
          {c.lists.length > 0 && <div className="at-f"><span>Listas</span><div className="at-tagpick">{c.lists.map((l) => <span key={l.id} className="at-tag">{l.name}</span>)}</div></div>}
          <label className="at-f"><span>Observações</span><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Algo importante sobre este contato" /></label>
        </Section>

        <Section id="endereco" title="Endereço" icon="pin" defaultOpen={false} count={form.addr.cidade ? `${form.addr.cidade}${form.addr.uf ? `/${form.addr.uf}` : ""}` : undefined}>
          <div className="at-f2 cep">
            <label className="at-f"><span>CEP</span><input value={form.addr.cep} onChange={(e) => setAddr("cep", e.target.value)} inputMode="numeric" placeholder="00000-000" /></label>
            <label className="at-f"><span>UF</span><input value={form.addr.uf} onChange={(e) => setAddr("uf", e.target.value.toUpperCase().slice(0, 2))} placeholder="CE" /></label>
          </div>
          <label className="at-f"><span>Rua / avenida</span><input value={form.addr.endereco} onChange={(e) => setAddr("endereco", e.target.value)} /></label>
          <div className="at-f2 num">
            <label className="at-f"><span>Número</span><input value={form.addr.numero} onChange={(e) => setAddr("numero", e.target.value)} /></label>
            <label className="at-f"><span>Complemento</span><input value={form.addr.complemento} onChange={(e) => setAddr("complemento", e.target.value)} /></label>
          </div>
          <div className="at-f2">
            <label className="at-f"><span>Bairro</span><input value={form.addr.bairro} onChange={(e) => setAddr("bairro", e.target.value)} /></label>
            <label className="at-f"><span>Cidade</span><input value={form.addr.cidade} onChange={(e) => setAddr("cidade", e.target.value)} /></label>
          </div>
        </Section>

        <Section id="campos" title="Campos personalizados" icon="layers" defaultOpen={false} count={form.custom.length || undefined}>
          {form.custom.map(([k, v], i) => (
            <div key={i} className="at-kv">
              <input placeholder="campo" value={k} onChange={(e) => setForm({ ...form, custom: form.custom.map((f, j) => (j === i ? [e.target.value, f[1]] : f)) })} aria-label="Nome do campo" />
              <input placeholder="valor" value={v} onChange={(e) => setForm({ ...form, custom: form.custom.map((f, j) => (j === i ? [f[0], e.target.value] : f)) })} aria-label="Valor do campo" />
              <button type="button" onClick={() => setForm({ ...form, custom: form.custom.filter((_, j) => j !== i) })} aria-label="Remover campo"><Icon name="close" size={11} className="" /></button>
            </div>
          ))}
          <button type="button" className="at-link" onClick={() => setForm({ ...form, custom: [...form.custom, ["", ""]] })}>+ Adicionar campo</button>
        </Section>

        <Section id="notas" title="Notas internas" icon="doc" count={thread.notes.length || undefined}>
          <div className="at-notes">
            {thread.notes.map((n) => <div key={n.id} className="at-note">{n.body}<small>{n.user_name || "—"} · {fmtWhen(n.created_at)}</small></div>)}
            {!thread.notes.length && <span className="at-muted">Nenhuma nota. Só a equipe vê o que for escrito aqui.</span>}
          </div>
          <div className="at-noteadd">
            <textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nova nota…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }} aria-label="Nova nota" />
            <button type="button" className="at-btn" onClick={addNote} disabled={!note.trim() || busy}>Anotar</button>
          </div>
        </Section>

        <Section id="historico" title="Histórico" icon="refresh" count={history.length}>
          <ul className="at-tl">
            {history.map((h, i) => (
              <li key={i}><span className={`at-tl-ico ${h.tone}`}><Icon name={h.icon} size={12} className="" /></span><div className="at-tl-txt">{h.node}<small>{fmtWhen(h.ts)}</small></div></li>
            ))}
          </ul>
        </Section>
      </div>
      {dirty && (
        <div className="at-psave">
          <button type="button" className="at-btn" onClick={() => setForm(formOf(c))} disabled={busy}>Descartar</button>
          <button type="button" className="at-btn primary" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar contato"}</button>
        </div>
      )}
    </aside>
  );
}

function TemplateModal({ catalog, wabaId, contact, onClose, onSend }: { catalog: Catalog; wabaId: string; contact: Thread["contact"]; onClose: () => void; onSend: (p: any) => Promise<void> }) {
  const list = catalog.templates.filter((t) => t.waba_id === wabaId);
  const [q, setQ] = useState("");
  const [tid, setTid] = useState(list[0]?.id || "");
  const shown = list.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const t = list.find((x) => x.id === tid);
  const body = (t?.components || []).find((c: any) => c.type === "BODY")?.text || "";
  const header = (t?.components || []).find((c: any) => c.type === "HEADER");
  const nParams = (body.match(/\{\{\d+\}\}/g) || []).length;
  const [params, setParams] = useState<string[]>([]);
  const first = contact.name?.split(" ")[0] || "";
  useEffect(() => { setParams(Array.from({ length: nParams }, (_, i) => (i === 0 ? first : ""))); }, [tid, nParams, first]);
  const headerVar = header?.format === "TEXT" && /\{\{1\}\}/.test(header.text || "");
  const [headerText, setHeaderText] = useState("");
  useEffect(() => { setHeaderText(headerVar ? first : ""); }, [tid, headerVar, first]);
  const urlButtons: { index: number; text: string; url: string }[] = (((t?.components || []).find((c: any) => c.type === "BUTTONS")?.buttons) || [])
    .map((x: any, i: number) => ({ index: i, text: x.text, url: x.url || "", type: x.type })).filter((x: any) => x.type === "URL" && /\{\{1\}\}/.test(x.url));
  const [urlParams, setUrlParams] = useState<Record<number, string>>({});
  useEffect(() => { setUrlParams({}); }, [tid]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const preview = body.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => params[Number(n) - 1] || `{{${n}}}`);
  const needsMedia = header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format);
  const fake: Msg = { id: 0, wamid: null, direction: "out", type: "template", body: preview || "—", media_id: null, media_mime: null, media_filename: null, payload: headerVar && headerText ? { components: [{ type: "header", parameters: [{ type: "text", text: headerText }] }] } : null, status: null, error_code: null, error_title: null, ts: new Date().toISOString(), template_name: t?.name || null };
  const missing = params.some((p) => !p.trim()) || (headerVar && !headerText.trim()) || urlButtons.some((b) => !(urlParams[b.index] || "").trim());
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal at-tpl" role="dialog" aria-label="Enviar template" onClick={(e) => e.stopPropagation()}>
        <div className="at-tpl-head"><h2>Enviar template</h2><button type="button" className="at-ibtn" onClick={onClose} aria-label="Fechar"><Icon name="close" size={14} className="" /></button></div>
        <div className="at-tpl-body">
          <div className="at-tpl-list">
            {list.length > 6 && <label className="at-search"><Icon name="search" size={14} className="" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar template" aria-label="Buscar template" /></label>}
            {shown.map((x) => <button key={x.id} type="button" className={`at-tpl-item${x.id === tid ? " on" : ""}`} onClick={() => setTid(x.id)}><b>{x.name}</b><span>{x.language} · {x.category === "MARKETING" ? "Marketing" : x.category === "UTILITY" ? "Utilidade" : x.category === "AUTHENTICATION" ? "Autenticação" : x.category}</span></button>)}
            {!list.length && <p className="at-muted">Nenhum template aprovado nesta conta. Rode a sincronização em Conexões.</p>}
            {headerVar && <label className="at-f"><span>Cabeçalho {"{{1}}"}</span><input value={headerText} onChange={(e) => setHeaderText(e.target.value)} /></label>}
            {params.map((v, i) => <label key={i} className="at-f"><span>Variável {`{{${i + 1}}}`}</span><input value={v} onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))} /></label>)}
            {urlButtons.map((b) => <label key={b.index} className="at-f"><span>Final do link do botão “{b.text}” <span className="at-muted">({b.url.replace("{{1}}", "…")})</span></span><input value={urlParams[b.index] || ""} onChange={(e) => setUrlParams({ ...urlParams, [b.index]: e.target.value })} /></label>)}
            {needsMedia && <div className="at-notice warn"><Icon name="alert" size={16} className="" /><span>Este template tem cabeçalho de mídia ({String(header.format).toLowerCase()}); o envio pelo Atendimento ainda não anexa mídia no cabeçalho.</span></div>}
          </div>
          <div className="at-tpl-prev">{t ? <Bubble m={fake} first={false} tpl={t} /> : <span className="at-muted">Escolha um template</span>}</div>
        </div>
        <div className="at-tpl-foot">
          <button type="button" className="at-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="at-btn primary" disabled={!t || needsMedia || missing} onClick={() => t && onSend({ template_id: t.id, name: t.name, language: t.language, params, header_text: headerVar ? headerText : undefined, button_params: urlButtons.map((b) => ({ index: b.index, text: urlParams[b.index] || "" })) })}><Icon name="up" size={15} className="" />Enviar</button>
        </div>
      </div>
    </div>
  );
}
