// Canal de novidades da aba (um só, compartilhado por Atendimento e Início).
// Pergunta a /api/pulse "mudou algo depois do cursor X?" a cada ~1,5 s com a aba à vista (0,6 s logo depois de
// enviar algo, para os tiques de entregue/lida) e a cada 20 s com a aba escondida. Quando algo muda no que o
// usuário vê (mensagem nova, eco do celular, tique, atribuição, encerramento…), as telas buscam só o que mudou.
// Se a conexão cair, retoma do cursor — nada se perde — e avisa as telas para conferirem tudo.
export type PulseChange = { id: number; c: number | null; k: string };
export type PulseEvent = { changes: PulseChange[]; reset?: boolean; resync?: boolean };
type Listener = (e: PulseEvent) => void;

const EVERY_VISIBLE = 1500;
const EVERY_FAST = 600;
const EVERY_HIDDEN = 20000;

const listeners = new Set<Listener>();
let running = false;
let cursor: number | null = null;
const have = new Set<number>();
let fastUntil = 0;
let wake: (() => void) | null = null;

const hidden = () => typeof document !== "undefined" && document.hidden;
const every = () => (Date.now() < fastUntil ? EVERY_FAST : hidden() ? EVERY_HIDDEN : EVERY_VISIBLE);

function emit(e: PulseEvent) {
  for (const fn of [...listeners]) { try { fn(e); } catch (err) { console.error("pulse listener", err); } }
}

/** Espera o próximo ciclo — ou menos, se pulseNow() for chamado. */
function nap(ms: number) {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(t); if (wake === done) wake = null; resolve(); };
    const t = setTimeout(done, ms);
    wake = done;
  });
}

/** Confere já e fica mais atento por alguns segundos (ex.: logo depois de enviar uma mensagem). */
export function pulseNow(fastMs = 8000) {
  fastUntil = Math.max(fastUntil, Date.now() + fastMs);
  wake?.();
}

/** Inscreve uma tela; devolve a função para sair. */
export function subscribePulse(fn: Listener) {
  listeners.add(fn);
  if (!running) { running = true; void loop(); }
  return () => { listeners.delete(fn); };
}

async function loop() {
  let fails = 0;
  while (listeners.size) {
    let next = every();
    try {
      if (cursor == null) {
        const r = await fetch("/api/pulse", { cache: "no-store" });
        if (r.status === 401 || r.status === 403) { await nap(15000); continue; }
        if (!r.ok) throw new Error(`pulse ${r.status}`);
        cursor = Number((await r.json()).cursor) || 0;
      } else {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        let r: Response;
        try {
          r = await fetch("/api/pulse", {
            method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: ctl.signal,
            body: JSON.stringify({ cursor, have: [...have].slice(-2000) }),
          });
        } finally { clearTimeout(timer); }
        if (r.status === 401 || r.status === 403) { await nap(15000); continue; }
        if (!r.ok) throw new Error(`pulse ${r.status}`);
        const j = await r.json();
        const fresh: PulseChange[] = (j.changes || []).filter((c: PulseChange) => !have.has(c.id));
        for (const c of fresh) have.add(c.id);
        cursor = Number(j.cursor) || cursor;
        for (const id of [...have]) if (id <= (cursor as number)) have.delete(id);
        if (fails) emit({ changes: [], resync: true }); // voltou depois de uma falha: confere tudo
        if (j.reset) emit({ changes: [], reset: true });
        else if (fresh.length) emit({ changes: fresh });
        if (j.more) next = 0;
      }
      fails = 0;
    } catch {
      fails++;
      next = Math.min(15000, 500 * 2 ** Math.min(fails, 5));
    }
    if (next > 0) await nap(next);
  }
  running = false;
}

// voltar para a aba ou a internet voltar: confere na hora e as telas conferem tudo
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !listeners.size) return;
    emit({ changes: [], resync: true });
    wake?.();
  });
  window.addEventListener("online", () => { if (listeners.size) { emit({ changes: [], resync: true }); wake?.(); } });
}
