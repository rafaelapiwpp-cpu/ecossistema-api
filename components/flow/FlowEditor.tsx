"use client";
// Construtor de fluxos: lista de automações, canvas com blocos, barra de ações, painel de propriedades e prévia no iPhone.
import { isManagerRole } from "@/lib/roles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, addEdge, useNodesState, useEdgesState, useReactFlow, useNodesInitialized,
  type Connection, type Edge, type OnBeforeDelete, type OnSelectionChangeParams, type OnConnectEnd, type OnConnectStart,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { FLOW_STATUS, RUN_STATUS, phoneSplitOf, portsOf, splitBranchesOf, triggersOf, validateGraph, equalSplit, type FlowNode, type Graph, type NodeType } from "@/lib/flow-shared";
import { api, fmtPhone } from "@/components/Campaigns";
import { loadCatalog } from "@/lib/catalog-client";
import { BlockNode, FlowUiContext, type BlockNodeType, type FlowUi, type NodeStat, type Stats } from "./BlockNode";
import { FlowEdge } from "./FlowEdge";
import { NodePreview, Panel, SAMPLE, hasPreview, type Audience, type SampleContact } from "./panels";
import { AddModal, RunsPanel, StartModal, TestModal, type Loaded } from "./runs";
import { AutomationsSidebar, NewFlowModal, useFlowRows, useSideCollapsed } from "./Automations";
import { BLOCK, PICKER, defaultData, uid, type Catalog, type Ctx, type Options } from "./shared";
import { FIcon } from "./icons";
import { newTrigger } from "./triggers";

const nodeTypes = { block: BlockNode };
const edgeTypes = { flow: FlowEdge };
const CLIP_KEY = "hub.flow.clipboard";
const FLOW_TONE: Record<string, string> = { draft: "neutral", active: "good", paused: "serious", archived: "neutral" };

/** JSON com chaves ordenadas (o banco reordena as chaves do jsonb; sem isso tudo pareceria "alterado"). */
function canon(v: any): string {
  const sort = (x: any): any => (Array.isArray(x) ? x.map(sort) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x);
  return JSON.stringify(sort(v));
}
function toRf(g: Graph): { nodes: BlockNodeType[]; edges: Edge[] } {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: "block" as const, position: { x: n.x, y: n.y }, data: { kind: n.type, d: n.data || {} }, deletable: n.type !== "start" })),
    edges: g.edges.map((e) => ({ id: e.id, source: e.from, sourceHandle: e.port, target: e.to, type: "flow" })),
  };
}
function toGraph(nodes: BlockNodeType[], edges: Edge[]): Graph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, x: Math.round(n.position.x), y: Math.round(n.position.y), data: n.data.d })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, port: e.sourceHandle || "out", to: e.target })),
  };
}
const isTyping = () => { const el = document.activeElement as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "fluxo";

/** Mensagem do Iniciar / Adicionar: quantos entraram na fila e por que os outros ficaram de fora. */
function queueMsg(r: any, when: string | null) {
  if (!r) return { ok: true, text: "Pronto." };
  const out: string[] = [];
  if (r.active) out.push(`${fmtInt(r.active)} já está(ão) no meio deste fluxo`);
  if (r.done) out.push(`${fmtInt(r.done)} já concluíram (para reenviar, marque “Enviar de novo para quem já concluiu”)`);
  if (r.failedSkipped) out.push(`${fmtInt(r.failedSkipped)} falharam antes`);
  if (r.optout) out.push(`${fmtInt(r.optout)} pediram para não receber`);
  const head = r.queued
    ? `${fmtInt(r.queued)} contato(s) entraram na fila${when ? ` para ${fmtDateTime(when)}` : ""}${r.retried ? ` (${fmtInt(r.retried)} nova(s) tentativa(s) de quem falhou antes)` : ""}.`
    : "Nenhum contato entrou na fila.";
  return { ok: r.queued > 0, text: out.length ? `${head} Ficaram de fora: ${out.join(" · ")}.` : head };
}

export default function FlowEditor(props: { id: number; role: string }) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;
}

type Picker = { x: number; y: number; flow: { x: number; y: number }; source?: { node: string; port: string } } | null;
type Clip = { type: NodeType; data: any; title?: string } | null;

function Editor({ id, role }: { id: number; role: string }) {
  const router = useRouter();
  const rf = useReactFlow();
  const canEdit = isManagerRole(role);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sub, setSub] = useState<{ node: string; key: string; n: number } | null>(null); // gatilho aberto no painel do Início
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [savedJson, setSavedJson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<"start" | "test" | "add" | "new" | "meta" | "help" | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [probOpen, setProbOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [locked, setLocked] = useState(false);
  const [clip, setClip] = useState<Clip>(null);
  const [sample, setSample] = useState<SampleContact>(SAMPLE);
  const [confirm, setConfirm] = useState<{ title: string; text: string; ok: string; danger?: boolean; run: () => void } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { rows, reload: reloadRows } = useFlowRows();
  const [sideMin, setSideMin] = useSideCollapsed();

  const say = (ok: boolean, text: string) => setToast({ ok, text });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.ok ? 3800 : 7000); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async (withRuns = false) => {
    const j: Loaded = await api(`/api/fluxos/${id}${withRuns ? "?runs=1" : ""}`);
    setLoaded(j);
    return j;
  }, [id]);

  // histórico para desfazer/refazer
  const hist = useRef<{ past: string[]; future: string[]; cur: string | null }>({ past: [], future: [], cur: null });
  const [, setHistTick] = useState(0);

  useEffect(() => {
    setLoaded(null); setSelected(null); setPicker(null); setRunsOpen(false);
    Promise.all([load(), loadCatalog<Catalog>(setCatalog), api("/api/fluxos", { action: "options" }).catch(() => ({ fields: [], users: [], campaigns: [] }))]).then(([j, , o]) => {
      setOptions(o); setName(j.flow.name); setDesc(String(j.flow.settings?.description || ""));
      const { nodes: ns, edges: es } = toRf(j.flow.graph);
      setNodes(ns); setEdges(es); setSavedJson(canon(j.flow.graph));
      hist.current = { past: [], future: [], cur: canon(j.flow.graph) };
      fitted.current = false;
    }).catch((e) => say(false, e.message));
    try { const c = localStorage.getItem(CLIP_KEY); setClip(c ? JSON.parse(c) : null); } catch { /* ignorado */ }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const graphJson = useMemo(() => canon(graph), [graph]);
  const settingsChanged = loaded ? desc !== String(loaded.flow.settings?.description || "") : false;
  const dirty = graphJson !== savedJson || (loaded ? name !== loaded.flow.name : false) || settingsChanged;

  useEffect(() => {
    const h = hist.current;
    if (h.cur === null || graphJson === h.cur || !loaded) return;
    const t = setTimeout(() => {
      if (graphJson === h.cur) return;
      h.past.push(h.cur!); if (h.past.length > 80) h.past.shift();
      h.cur = graphJson; h.future = []; setHistTick((x) => x + 1);
    }, 450);
    return () => clearTimeout(t);
  }, [graphJson, loaded]);
  const applyGraph = (json: string) => {
    const g = JSON.parse(json) as Graph;
    const { nodes: ns, edges: es } = toRf(g);
    hist.current.cur = json;
    setNodes(ns); setEdges(es);
    if (selected && !g.nodes.some((n) => n.id === selected)) setSelected(null);
    setHistTick((x) => x + 1);
  };
  const undo = () => { const h = hist.current; if (!h.past.length || h.cur === null) return; h.future.push(h.cur); applyGraph(h.past.pop()!); };
  const redo = () => { const h = hist.current; if (!h.future.length || h.cur === null) return; h.past.push(h.cur); applyGraph(h.future.pop()!); };

  const nodesReady = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => { if (nodesReady && !fitted.current && nodes.length) { fitted.current = true; setTimeout(() => rf.fitView({ padding: 0.18, maxZoom: 0.95, duration: 0 }), 30); } }, [nodesReady, nodes.length, rf]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const ctx: Ctx | null = useMemo(() => (catalog && options && loaded ? { catalog, options, templates: loaded.templates } : null), [catalog, options, loaded]);
  const kindsKey = nodes.map((n) => `${n.id}:${n.data.kind}`).join(",");
  const stats: Stats = useMemo(() => {
    if (!loaded) return null;
    const kind = new Map(nodes.map((n) => [n.id, n.data.kind]));
    const branches: Record<string, Record<string, number>> = {};
    for (const b of loaded.stats.branches) (branches[b.node_id] ||= {})[b.port] = b.n;
    const out: Record<string, NodeStat> = {};
    for (const n of loaded.stats.nodes) {
      const k = kind.get(n.node_id);
      const br = branches[n.node_id] || {};
      const undelivered = n.undelivered || 0, waiting = n.waiting || 0;
      let alerts = 0, success = n.entered - n.errors;
      if (k === "template") { alerts = undelivered; success -= undelivered; } // aceito pela Meta mas não entregue não é sucesso
      else if (k === "message") { alerts = (br.closed || 0) + undelivered; success -= alerts; }
      else if (k === "wait") { alerts = br.timeout || 0; success = Object.entries(br).reduce((a, [p, v]) => (p === "timeout" ? a : a + v), 0); } // sucesso = respondeu
      else if (k === "delay") success -= waiting;
      out[n.node_id] = { entered: n.entered, errors: n.errors, alerts, success: Math.max(0, success), waiting };
    }
    return { nodes: out, branches };
  }, [loaded, kindsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const connected = useMemo(() => new Set(edges.map((e) => `${e.source}|${e.sourceHandle || "out"}`)), [edges]);
  const wabaPhones = useMemo(() => (catalog && loaded ? catalog.phones.filter((p) => p.waba_id === loaded.flow.waba_id).map((p) => ({ id: p.id })) : undefined), [catalog, loaded]);
  const problems = useMemo(() => (loaded ? validateGraph(graph, loaded.templates as any, wabaPhones) : []), [graph, loaded, wabaPhones]);

  // público do Início (uma consulta, compartilhada pelo painel do Início, randomizadores e prévia)
  const startNode = nodes.find((n) => n.data.kind === "start");
  const startFlowNode: FlowNode | null = startNode ? { id: startNode.id, type: "start", x: startNode.position.x, y: startNode.position.y, data: startNode.data.d } : null;
  const audienceKey = canon(startNode?.data.d?.audience ?? null);
  const [audience, setAudience] = useState<Audience>(null);
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const t = setTimeout(() => api(`/api/fluxos/${id}`, { action: "preview", audience: JSON.parse(audienceKey) ?? undefined }).then((j) => { if (alive) setAudience(j); }).catch(() => { if (alive) setAudience({ total: 0, sample: [] }); }), 350);
    return () => { alive = false; clearTimeout(t); };
  }, [audienceKey, id, loaded != null]); // eslint-disable-line react-hooks/exhaustive-deps
  // atualiza os números dos blocos sozinho: rápido enquanto envia; mais devagar enquanto aguarda respostas/prazos; parado com a aba escondida
  const cnt = loaded?.stats.counts;
  const sending = Boolean(cnt && (cnt.queued || 0) + (cnt.running || 0) > 0);
  const waitingAny = Boolean(cnt && (cnt.waiting_reply || 0) + (cnt.waiting_time || 0) > 0);
  const every = runsOpen || sending ? 5000 : waitingAny ? 15000 : 0;
  useEffect(() => {
    if (!every) return;
    const t = setInterval(() => { if (!document.hidden) load(runsOpen).catch(() => {}); }, every);
    const back = () => { if (!document.hidden) load(runsOpen).catch(() => {}); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [every, runsOpen, load]);

  // ---------- edição ----------
  const connectFrom = useRef<{ x: number; y: number } | null>(null);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, id: `e${uid("")}`, type: "flow" }, eds.filter((e) => !(e.source === c.source && (e.sourceHandle || "out") === (c.sourceHandle || "out")))));
  }, [setEdges]);
  const onConnectStart: OnConnectStart = useCallback((ev) => {
    const p = "touches" in ev ? ev.touches[0] : (ev as MouseEvent);
    connectFrom.current = p ? { x: p.clientX, y: p.clientY } : null;
  }, []);
  const openPicker = useCallback((client: { x: number; y: number }, source?: { node: string; port: string }) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const W = 248, H = 470;
    const x = Math.max(12, Math.min(client.x - r.left + 8, r.width - W - 12));
    const y = Math.max(12, Math.min(client.y - r.top - 24, r.height - H - 12));
    setPicker({ x, y, flow: rf.screenToFlowPosition(client), source });
  }, [rf]);
  const onConnectEnd: OnConnectEnd = useCallback((ev, cs) => {
    if (!canEdit || cs.isValid || cs.toNode || !cs.fromNode || !cs.fromHandle || cs.fromHandle.type !== "source") return;
    const p = "changedTouches" in ev ? ev.changedTouches[0] : (ev as MouseEvent);
    const port = cs.fromHandle.id || "out";
    const start = connectFrom.current;
    const moved = start ? Math.hypot(p.clientX - start.x, p.clientY - start.y) : 99;
    if (moved < 6 && edges.some((e) => e.source === cs.fromNode!.id && (e.sourceHandle || "out") === port)) return; // clique numa saída já ligada
    openPicker({ x: p.clientX, y: p.clientY }, { node: cs.fromNode.id, port });
  }, [canEdit, edges, openPicker]);

  const onBeforeDelete: OnBeforeDelete<BlockNodeType, Edge> = useCallback(async ({ nodes: ns, edges: es }) => ({ nodes: ns.filter((n) => n.data.kind !== "start"), edges: es }), []);
  const onSelectionChange = useCallback(({ nodes: ns }: OnSelectionChangeParams) => { if (ns.length === 1) setSelected(ns[0].id); else if (!ns.length) setSelected(null); }, []);

  const addNodeAt = (type: NodeType, at: { x: number; y: number }, source?: { node: string; port: string }, data?: any) => {
    const nid = uid();
    const pos = { x: Math.round(at.x), y: Math.round(at.y - 28) };
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)).concat([{ id: nid, type: "block", position: pos, data: { kind: type, d: data ?? defaultData(type) }, selected: true, deletable: true }]));
    if (source) setEdges((es) => addEdge({ source: source.node, sourceHandle: source.port, target: nid, targetHandle: null, id: `e${uid("")}`, type: "flow" }, es.filter((e) => !(e.source === source.node && (e.sourceHandle || "out") === source.port))));
    setSelected(nid);
    setPicker(null);
  };
  /** "+" da barra: ao lado do bloco selecionado (ligado à primeira saída livre) ou no centro da tela. */
  const pickerFromToolbar = () => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const sel = nodes.find((n) => n.id === selected);
    if (sel) {
      const free = portsOf({ id: sel.id, type: sel.data.kind, x: 0, y: 0, data: sel.data.d }).find((p) => !connected.has(`${sel.id}|${p.id}`));
      const w = sel.measured?.width || 300;
      const at = rf.flowToScreenPosition({ x: sel.position.x + w + 90, y: sel.position.y + 30 });
      openPicker(at, free ? { node: sel.id, port: free.id } : undefined);
    } else openPicker({ x: r.left + r.width / 2 - 124, y: r.top + 120 });
  };
  const updateData = (nid: string, patch: any) => setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, d: { ...n.data.d, ...patch } } } : n)));
  const removeNode = (nid: string) => { setNodes((ns) => ns.filter((n) => n.id !== nid)); setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid)); if (selected === nid) setSelected(null); };
  const duplicateNode = (nid: string) => {
    const n = nodes.find((x) => x.id === nid); if (!n || n.data.kind === "start") return;
    addNodeAt(n.data.kind, { x: n.position.x + 48, y: n.position.y + 48 + 28 }, undefined, JSON.parse(JSON.stringify(n.data.d)));
  };
  const copyNode = (nid: string) => {
    const n = nodes.find((x) => x.id === nid); if (!n) return;
    if (n.data.kind === "start") { say(false, "O bloco Início não pode ser copiado (cada fluxo tem o seu)."); return; }
    const c: Clip = { type: n.data.kind, data: n.data.d };
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* ignorado */ }
    setClip(c); say(true, "Bloco copiado. Cole com Ctrl+V aqui ou em outro fluxo.");
  };
  const pasteAt = (at?: { x: number; y: number }, source?: { node: string; port: string }) => {
    let c = clip;
    try { const raw = localStorage.getItem(CLIP_KEY); if (raw) c = JSON.parse(raw); } catch { /* ignorado */ }
    if (!c) return;
    const r = stage.current?.getBoundingClientRect();
    const pos = at || rf.screenToFlowPosition({ x: (r?.left || 0) + (r?.width || 800) / 2, y: (r?.top || 0) + (r?.height || 600) / 2 });
    addNodeAt(c.type, pos, source, JSON.parse(JSON.stringify(c.data)));
  };
  const addItem = (nid: string) => {
    const n = nodes.find((x) => x.id === nid); if (!n) return;
    const d = n.data.d || {};
    if (n.data.kind === "start") {
      const t = newTrigger(loaded?.flow.phone_number_id || "");
      updateData(nid, { triggers: [...triggersOf(d), t] });
      setSub({ node: nid, key: t.id, n: Date.now() });
    }
    if (n.data.kind === "action") updateData(nid, { actions: [...(d.actions || []), { type: "add_tag", tag_id: "" }] });
    if (n.data.kind === "wait") updateData(nid, { options: [...(d.options || []), { id: `o${(d.options || []).length + 1}_${Date.now().toString(36).slice(-3)}`, label: "", match: "contains", value: "" }] });
    if (n.data.kind === "split") {
      const br = splitBranchesOf(d); const k = br.length + 1; const eq = equalSplit(k);
      if (k <= 8) updateData(nid, { branches: [...br, { id: `r${Date.now().toString(36)}${k}`, label: String.fromCharCode(64 + k), pct: 0 }].map((b, i) => ({ ...b, pct: eq[i] })) });
    }
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === nid })));
    setSelected(nid);
  };

  const onItem = (nid: string, key: string, op: "open" | "delete") => {
    const n = nodes.find((x) => x.id === nid); if (!n) return;
    if (op === "delete") {
      if (!canEdit || !window.confirm("Remover este gatilho? O fluxo deixa de iniciar sozinho por ele.")) return;
      updateData(nid, { triggers: triggersOf(n.data.d).filter((t) => t.id !== key) });
      setSub(null);
      return;
    }
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === nid })));
    setSelected(nid);
    setSub({ node: nid, key, n: Date.now() });
  };
  const ui: FlowUi = useMemo(() => ({ ctx, stats, canEdit, connected, onAdd: addItem, onDelete: removeNode, onDuplicate: duplicateNode, onCopy: copyNode, onItem }), [ctx, stats, canEdit, connected, nodes, clip, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!canEdit || !dirty) return;
    setBusy("save");
    try {
      const settings = { ...(loaded?.flow.settings || {}), description: desc.trim() || undefined };
      const j = await api(`/api/fluxos/${id}`, { action: "save", graph, name, settings });
      setSavedJson(canon(graph));
      setLoaded((l) => (l ? { ...l, flow: { ...l.flow, name, settings }, problems: j.problems } : l));
      say(true, j.problems?.length ? `Salvo. ${j.problems.length} pendência(s) antes de ativar.` : "Salvo.");
      reloadRows();
    } catch (e: any) { say(false, e.message); }
    setBusy(null);
  };
  const act = async (action: string, extra: any = {}, okText?: string) => {
    setBusy(action);
    try {
      if (dirty) await api(`/api/fluxos/${id}`, { action: "save", graph, name, settings: { ...(loaded?.flow.settings || {}), description: desc.trim() || undefined } }).then(() => setSavedJson(canon(graph)));
      const j = await api(`/api/fluxos/${id}`, { action, ...extra });
      await load(runsOpen);
      if (okText) say(true, okText);
      setBusy(null); reloadRows();
      return j;
    } catch (e: any) { say(false, e.message); setBusy(null); throw e; }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ hub_flow: 1, name, description: desc, exported_at: new Date().toISOString(), graph }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fluxo-${slug(name)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const go = (path: string) => { if (dirty && !window.confirm("Há alterações não salvas neste fluxo. Sair mesmo assim?")) return; router.push(path); };

  // atalhos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if (e.key === "Escape") { if (picker) setPicker(null); else if (more || probOpen) { setMore(false); setProbOpen(false); } else if (selected) { setSelected(null); setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); } return; }
      if (isTyping() || !canEdit) return;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "c" && selected) { copyNode(selected); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); pasteAt(); }
      else if (mod && e.key.toLowerCase() === "d" && selected) { e.preventDefault(); duplicateNode(selected); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  // quando o painel abre, desloca a tela se o bloco ficou escondido atrás dele
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      const n = rf.getInternalNode(selected); const r = stage.current?.getBoundingClientRect();
      const cover = stage.current?.querySelector(".fpanel-wrap")?.getBoundingClientRect();
      const dock = stage.current?.querySelector(".fphone-dock")?.getBoundingClientRect();
      if (!n || !r || !cover) return;
      const right = Math.max(cover.right, dock && getComputedStyle(stage.current!.querySelector(".fphone-dock")!).display !== "none" ? dock.right : 0);
      const vp = rf.getViewport();
      const z = vp.zoom < 0.72 ? 0.82 : vp.zoom; // bloco legível ao abrir o painel
      const pos = n.internals.positionAbsolute;
      const w = (n.measured.width || 300) * z, h = (n.measured.height || 200) * z;
      const sx = r.left + vp.x + pos.x * vp.zoom, sy = r.top + vp.y + pos.y * vp.zoom; // posição atual na tela
      const hidden = sx < right + 24;
      if (z === vp.zoom && !hidden) return;
      if (right + w + 48 > r.right) return; // não há espaço à direita do painel
      const tx = hidden || z !== vp.zoom ? right + 48 : sx; // canto do bloco na tela, depois do ajuste
      const ty = Math.max(r.top + 110, Math.min(sy, r.bottom - h - 70));
      rf.setViewport({ zoom: z, x: tx - r.left - pos.x * z, y: ty - r.top - pos.y * z }, { duration: 340 });
    }, 60);
    return () => clearTimeout(t);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const edgesView = useMemo(() => edges.map((e) => ({ ...e, type: "flow", className: selected && (e.source === selected || e.target === selected) ? "hl" : undefined })), [edges, selected]);

  if (!loaded || !ctx) {
    return (
      <div className="flow-page">
        <AutomationsSidebar rows={rows} currentId={id} canEdit={canEdit} onNew={() => setModal("new")} onOpen={(fid) => go(`/fluxos/${fid}`)} collapsed={sideMin} setCollapsed={setSideMin} />
        <section className="flow-stage"><div className="flow-loading">{toast && !toast.ok ? toast.text : <><span className="spin" />Carregando o fluxo…</>}</div></section>
      </div>
    );
  }
  const f = loaded.flow;
  const selNode = nodes.find((n) => n.id === selected) || null;
  const selFlowNode: FlowNode | null = selNode ? { id: selNode.id, type: selNode.data.kind, x: selNode.position.x, y: selNode.position.y, data: selNode.data.d } : null;
  const incoming = selNode ? edges.filter((e) => e.target === selNode.id).map((e) => nodes.find((n) => n.id === e.source)).filter(Boolean).map((n) => ({ id: n!.id, type: n!.data.kind, x: 0, y: 0, data: n!.data.d })) : [];
  const counts = loaded.stats.counts;
  const activeRuns = (counts.queued || 0) + (counts.running || 0) + (counts.waiting_reply || 0) + (counts.waiting_time || 0);
  const split = phoneSplitOf(startFlowNode?.data, f.phone_number_id);
  const phoneLabel = (pnid: string) => { const p = ctx.catalog.phones.find((x) => x.id === pnid); return p ? p.display_phone_number : pnid === f.phone_number_id ? (f.display_phone_number || pnid) : pnid; };
  const subtitle = split.length > 1 ? `${split.length} números` : (f.display_phone_number || f.phone_name || "");
  const business = ctx.catalog.phones.find((p) => p.id === f.phone_number_id)?.verified_name || f.phone_name || f.waba_name || "Sua empresa";
  const showPhone = hasPreview(selFlowNode) && canEdit;
  const powerTip = f.status === "active" ? "Pausar fluxo" : f.status === "paused" ? "Retomar fluxo" : "Ativar fluxo";
  const togglePower = () => (f.status === "active"
    ? act("pause", {}, "Fluxo pausado: nada mais é enviado até retomar.")
    : problems.length ? (setProbOpen(true), say(false, "Corrija as pendências antes de ativar.")) : act("activate", {}, startFlowNode && triggersOf(startFlowNode.data).length ? "Fluxo ativo: o gatilho está ouvindo as mensagens e o robô já responde." : "Fluxo ativo: respostas e prazos voltam a ser processados."));

  return (
    <FlowUiContext.Provider value={ui}>
      <div className={`flow-page${sideMin ? " side-min" : ""}`}>
        <AutomationsSidebar rows={rows} currentId={id} canEdit={canEdit} onNew={() => setModal("new")} onOpen={(fid) => fid !== id && go(`/fluxos/${fid}`)} collapsed={sideMin} setCollapsed={setSideMin} />
        <section className={`flow-stage${selFlowNode && canEdit ? " with-panel" : ""}${showPhone ? " with-phone" : ""}${runsOpen ? " runs" : ""}`} ref={stage}>
          <ReactFlow
            className="flow-rf"
            nodes={nodes} edges={edgesView} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
            onBeforeDelete={onBeforeDelete} onSelectionChange={onSelectionChange}
            onPaneClick={() => { setPicker(null); setMore(false); setProbOpen(false); }}
            onPaneContextMenu={(e) => { if (!canEdit) return; e.preventDefault(); openPicker({ x: e.clientX, y: e.clientY }); }}
            nodesDraggable={canEdit && !locked} nodesConnectable={canEdit && !locked} elementsSelectable connectOnClick={false}
            minZoom={0.15} maxZoom={1.6} colorMode="light" deleteKeyCode={canEdit && !locked ? ["Backspace", "Delete"] : null}
            defaultEdgeOptions={{ type: "flow" }} connectionLineStyle={{ strokeDasharray: "6 5", strokeWidth: 1.8 }}
            proOptions={{ hideAttribution: true }} panOnScroll={false} zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} />
          </ReactFlow>

          <header className="flow-top">
            <div className="flow-title">
              <button type="button" className="flow-side-btn" onClick={() => setSideMin(!sideMin)} aria-label="Automações" data-tip="Automações"><FIcon name="sidebar" size={18} /></button>
              <div className="flow-title-txt">
                <h1 title={name}>{name || "Sem nome"}</h1>
                <div className="flow-sub">
                  <span className={`pill ${FLOW_TONE[f.status]}`}><i aria-hidden />{FLOW_STATUS[f.status]}</span>
                  <span className="flow-sub-t">{subtitle}{f.waba_name ? ` · ${f.waba_name}` : ""}</span>
                  {problems.length > 0 && <button type="button" className="flow-prob" onClick={() => setProbOpen(!probOpen)}><FIcon name="alert" size={13} stroke={2.2} />{problems.length} pendência{problems.length > 1 ? "s" : ""}</button>}
                  {dirty && <span className="flow-dirty">não salvo</span>}
                </div>
              </div>
              {probOpen && problems.length > 0 && (
                <div className="flow-pop prob" role="dialog" aria-label="Pendências">
                  <b>Antes de ativar ou iniciar</b>
                  <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
            <div className="flow-bar" role="toolbar" aria-label="Ações do fluxo">
              {canEdit && <button type="button" className={`fbtn power ${f.status}`} onClick={togglePower} disabled={busy !== null} data-tip={powerTip} aria-label={powerTip}><FIcon name="power" size={19} stroke={2} /></button>}
              {canEdit && <button type="button" className={`fbtn save${dirty ? " on" : ""}`} onClick={save} disabled={busy !== null || !dirty} data-tip={dirty ? "Salvar (Ctrl+S)" : "Tudo salvo"} aria-label="Salvar"><FIcon name="save" size={19} /></button>}
              {canEdit && <button type="button" className="fbtn" onClick={() => setModal("meta")} data-tip="Renomear e descrever" aria-label="Renomear"><FIcon name="pencil" size={19} /></button>}
              {canEdit && <button type="button" className="fbtn" onClick={async () => { try { const j = await act("duplicate"); if (j?.id) router.push(`/fluxos/${j.id}`); } catch { /* aviso já mostrado */ } }} disabled={busy !== null} data-tip="Duplicar fluxo" aria-label="Duplicar fluxo"><FIcon name="duplicate" size={19} /></button>}
              <button type="button" className="fbtn" onClick={exportJson} data-tip="Baixar o fluxo (.json)" aria-label="Baixar"><FIcon name="download" size={19} /></button>
              <button type="button" className={`fbtn${runsOpen ? " on" : ""}`} onClick={() => { const o = !runsOpen; setRunsOpen(o); if (o) load(true); }} data-tip="Acompanhamento" aria-label="Acompanhamento"><FIcon name="chart" size={19} />{activeRuns > 0 && <em className="fbtn-badge">{activeRuns > 99 ? "99+" : activeRuns}</em>}</button>
              {canEdit && <button type="button" className="fbtn danger" onClick={() => setConfirm(f.status === "active"
                ? { title: "Pause antes de excluir", text: "Este fluxo está ativo. Pause-o no botão de ligar/desligar e depois exclua.", ok: "", run: () => {} }
                : { title: "Excluir este fluxo?", text: "O fluxo e todo o histórico de execuções serão apagados. Não dá para desfazer.", ok: "Excluir", danger: true, run: () => { act("delete", {}, "Fluxo excluído.").then(() => router.push("/fluxos")).catch(() => {}); } })} data-tip="Excluir fluxo" aria-label="Excluir fluxo"><FIcon name="trash" size={19} /></button>}
              {canEdit && <>
                <span className="fbar-sep" />
                <button type="button" className="fbtn" onClick={pickerFromToolbar} data-tip="Adicionar bloco" aria-label="Adicionar bloco"><FIcon name="plus" size={19} stroke={2} /></button>
                <button type="button" className="fbtn" onClick={() => setModal("test")} disabled={busy !== null} data-tip="Testar no seu WhatsApp" aria-label="Testar"><FIcon name="send" size={18} /></button>
                <button type="button" className="fbtn-go" onClick={() => setModal("start")} disabled={busy !== null}><FIcon name="play" size={14} stroke={2.4} />Iniciar</button>
              </>}
              <span className="fbar-more">
                <button type="button" className={`fbtn${more ? " on" : ""}`} onClick={() => setMore(!more)} data-tip="Mais" aria-label="Mais opções" aria-expanded={more}><FIcon name="chevronRight" size={18} stroke={2} /></button>
                {more && (
                  <div className="flow-pop menu" role="menu" onMouseLeave={() => setMore(false)}>
                    {canEdit && <button type="button" onClick={() => { setMore(false); setModal("add"); }}><FIcon name="plusList" size={17} />Adicionar números à fila</button>}
                    {canEdit && clip && <button type="button" onClick={() => { setMore(false); pasteAt(); }}><FIcon name="paste" size={17} />Colar bloco copiado</button>}
                    <button type="button" onClick={() => { setMore(false); setModal("help"); }}><FIcon name="help" size={17} />Como montar o fluxo</button>
                    <button type="button" onClick={() => { setMore(false); go("/fluxos"); }}><FIcon name="flow" size={17} />Todas as automações</button>
                    {canEdit && <button type="button" className="danger" onClick={() => { setMore(false); setConfirm({ title: "Arquivar este fluxo?", text: "As execuções em andamento são canceladas e o fluxo sai da lista.", ok: "Arquivar", danger: true, run: () => act("archive", {}, "Fluxo arquivado.").then(() => router.push("/fluxos")).catch(() => {}) }); }}><FIcon name="archive" size={17} />Arquivar fluxo</button>}
                  </div>
                )}
              </span>
            </div>
          </header>

          {selFlowNode && canEdit && !runsOpen && (
            <aside className="fpanel-wrap" key={selFlowNode.id}>
              <Panel node={selFlowNode} ctx={ctx} flow={{ id: f.id, waba_id: f.waba_id, phone_number_id: f.phone_number_id, status: f.status }} update={(p) => updateData(selFlowNode.id, p)} incoming={incoming} start={startFlowNode} audience={audience}
                sub={sub && sub.node === selFlowNode.id ? sub : null} onSub={(key) => setSub(key ? { node: selFlowNode.id, key, n: Date.now() } : null)}
                onClose={() => { setSub(null); setSelected(null); setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); }}
                onDelete={selFlowNode.type !== "start" ? () => removeNode(selFlowNode.id) : undefined} />
              {showPhone && <div className="fp-phone-inline"><NodePreview node={selFlowNode} ctx={ctx} business={business} sample={sample} sampleOptions={audience?.sample || []} onSample={setSample} /></div>}
            </aside>
          )}
          {showPhone && selFlowNode && !runsOpen && (
            <div className="fphone-dock" key={`ph-${selFlowNode.id}`}>
              <NodePreview node={selFlowNode} ctx={ctx} business={business} sample={sample} sampleOptions={audience?.sample || []} onSample={setSample} />
            </div>
          )}

          <div className="flow-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => rf.zoomIn({ duration: 180 })} aria-label="Aproximar" data-tip="Aproximar"><FIcon name="plus" size={17} stroke={2} /></button>
            <button type="button" onClick={() => rf.zoomOut({ duration: 180 })} aria-label="Afastar" data-tip="Afastar"><FIcon name="minus" size={17} stroke={2} /></button>
            <button type="button" onClick={() => rf.fitView({ padding: 0.18, maxZoom: 0.95, duration: 260 })} aria-label="Ver tudo" data-tip="Ver o fluxo inteiro"><FIcon name="fit" size={17} stroke={2} /></button>
            {canEdit && <button type="button" className={locked ? "on" : ""} onClick={() => setLocked(!locked)} aria-label={locked ? "Destravar edição" : "Travar edição"} data-tip={locked ? "Destravar" : "Travar (só navegar)"}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d={locked ? "M8 10.5V7.5a4 4 0 0 1 8 0v3" : "M8 10.5V7.5a4 4 0 0 1 7.6-1.7"} /></svg></button>}
          </div>
          {canEdit && (
            <div className="flow-history" role="group" aria-label="Desfazer e refazer">
              <button type="button" onClick={undo} disabled={!hist.current.past.length} aria-label="Desfazer" data-tip="Desfazer (Ctrl+Z)"><FIcon name="arrowLeft" size={17} stroke={2} /></button>
              <button type="button" onClick={redo} disabled={!hist.current.future.length} aria-label="Refazer" data-tip="Refazer (Ctrl+Shift+Z)"><FIcon name="arrowRight" size={17} stroke={2} /></button>
            </div>
          )}

          {picker && (
            <>
              <div className="fpick-back" onClick={() => setPicker(null)} onContextMenu={(e) => { e.preventDefault(); setPicker(null); }} />
              <div className="fpick" style={{ left: picker.x, top: picker.y }} role="menu" aria-label="Adicionar bloco">
                <div className="fpick-h">{picker.source ? "Próximo bloco" : "Adicionar bloco"}</div>
                {PICKER.map((t) => (
                  <button key={t} type="button" role="menuitem" onClick={() => addNodeAt(t, picker.flow, picker.source)}>
                    <span className="fpick-ico" style={{ color: BLOCK[t].color }}><FIcon name={BLOCK[t].icon} size={17} stroke={2} /></span>{BLOCK[t].label}
                  </button>
                ))}
                {clip && <button type="button" role="menuitem" className="paste" onClick={() => pasteAt(picker.flow, picker.source)}><span className="fpick-ico"><FIcon name="paste" size={17} /></span>Colar: {BLOCK[clip.type]?.label}</button>}
              </div>
            </>
          )}

          {nodes.length <= 1 && canEdit && !selected && !picker && (
            <div className="flow-hint"><FIcon name="arrowRight" size={16} stroke={2} />Arraste da bolinha azul do <b>Início</b> e solte no espaço vazio para escolher o próximo bloco.</div>
          )}

          {runsOpen && (
            <div className="flow-runs">
              <div className="flow-runs-head">
                <h2>Acompanhamento</h2>
                <span className="muted">{fmtInt(activeRuns)} em andamento · {fmtInt(counts.done || 0)} concluídos</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn close" onClick={() => setRunsOpen(false)} aria-label="Fechar acompanhamento"><FIcon name="close" size={16} stroke={2.2} /></button>
              </div>
              <RunsPanel id={id} loaded={loaded} reload={() => load(true)} canEdit={canEdit} act={act} graph={graph} ctx={ctx} start={startFlowNode} />
            </div>
          )}

          {toast && <div className={`flow-toast${toast.ok ? "" : " err"}`} role="status" onClick={() => setToast(null)}><FIcon name={toast.ok ? "check" : "alert"} size={16} stroke={2.2} />{toast.text}</div>}
        </section>
      </div>

      {modal === "start" && <StartModal flow={f} graph={graph} problems={problems} onClose={() => setModal(null)} onStart={async (when, opt) => { const j = await act("start", { scheduled_at: when, ...opt }); setModal(null); const m = queueMsg(j.result, when); say(m.ok, m.text); setRunsOpen(true); load(true); }} />}
      {modal === "test" && <TestModal problems={problems} onClose={() => setModal(null)} onTest={async (phone) => { const j = await act("test", { phone }); const r = j.run; say(r?.status !== "failed", r?.status === "failed" ? `Teste falhou: ${r.last_error}` : r?.status === "waiting_reply" ? `Teste enviado para ${fmtPhone(phone.replace(/\D/g, ""))}: aguardando a resposta no WhatsApp${f.status !== "active" ? " (ative o fluxo para a resposta avançar)" : ""}.` : `Teste executado (${RUN_STATUS[r?.status] || r?.status}).`); setModal(null); }} />}
      {modal === "add" && <AddModal onClose={() => setModal(null)} onAdd={async (phones, resend) => { const j = await act("add_contacts", { phones, resend_done: resend }); const m = queueMsg(j.result, null); say(m.ok, `${m.text}${j.inactive && m.ok ? " O fluxo está pausado/rascunho: ative para começar." : ""}`); setModal(null); setRunsOpen(true); }} />}
      {modal === "new" && catalog && <NewFlowModal catalog={catalog} presetWaba={f.waba_id} onClose={() => setModal(null)} onCreated={(nid) => { setModal(null); reloadRows(); go(`/fluxos/${nid}`); }} />}
      {modal === "meta" && <MetaModal name={name} desc={desc} onClose={() => setModal(null)} onSave={(n, d) => { setName(n); setDesc(d); setModal(null); }} />}
      {modal === "help" && <HelpModal onClose={() => setModal(null)} />}
      {confirm && <ConfirmSheet {...confirm} onClose={() => setConfirm(null)} />}
    </FlowUiContext.Provider>
  );
}

function MetaModal({ name, desc, onClose, onSave }: { name: string; desc: string; onClose: () => void; onSave: (n: string, d: string) => void }) {
  const [n, setN] = useState(name);
  const [d, setD] = useState(desc);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Nome e descrição</h2><button className="btn icon" onClick={onClose} aria-label="Fechar">×</button></div>
        <label className="field"><span>Nome do fluxo</span><input value={n} onChange={(e) => setN(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && n.trim()) onSave(n.trim(), d.trim()); }} /></label>
        <label className="field"><span>Descrição (aparece no cartão da automação)</span><input value={d} onChange={(e) => setD(e.target.value)} maxLength={240} placeholder="ex.: Mensagem inicial para os leads do formulário" /></label>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Depois de confirmar, clique em Salvar na barra do fluxo.</p>
        <div className="wizard-foot"><button className="btn" onClick={onClose}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={!n.trim()} onClick={() => onSave(n.trim(), d.trim())}>Confirmar</button></div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Como montar o fluxo</h2><button className="btn icon" onClick={onClose} aria-label="Fechar">×</button></div>
        <ol className="steps">
          <li>Clique no <b>Início</b> e escolha quem entra (lista, tags ou números) e de qual número sai.</li>
          <li>Arraste da bolinha azul de uma saída e solte no espaço vazio: aparece o menu para escolher o próximo bloco.</li>
          <li>No <b>Template do WhatsApp</b>, preencha as variáveis — o iPhone ao lado mostra como o lead recebe.</li>
          <li>Use <b>Aguardar resposta</b> para criar uma saída por botão, <b>Condição</b> para filtrar e o <b>Randomizador</b> para dividir em porcentagens.</li>
          <li><b>Salvar</b> → <b>Testar</b> com o seu número → <b>Iniciar</b> para o público.</li>
        </ol>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Atalhos: Ctrl+S salva · Ctrl+Z desfaz · Ctrl+C/Ctrl+V copia e cola blocos (até entre fluxos) · Ctrl+D duplica · Delete apaga o selecionado · botão direito no canvas abre o menu de blocos.</p>
        <div className="wizard-foot"><span style={{ flex: 1 }} /><button className="btn primary" onClick={onClose}>Entendi</button></div>
      </div>
    </div>
  );
}

/** Confirmação no estilo de alerta do iOS. */
function ConfirmSheet({ title, text, ok, danger, run, onClose }: { title: string; text: string; ok: string; danger?: boolean; run: () => void; onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="ios-alert" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ios-alert-body"><b>{title}</b><p>{text}</p></div>
        <div className={`ios-alert-btns${ok ? "" : " one"}`}>
          {ok ? <button type="button" onClick={onClose}>Cancelar</button> : null}
          {ok ? <button type="button" className={danger ? "danger" : "strong"} onClick={() => { onClose(); run(); }}>{ok}</button> : <button type="button" className="strong" onClick={onClose}>OK</button>}
        </div>
      </div>
    </div>
  );
}
