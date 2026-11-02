/**
 * Provider simulado. Aceita envios como a Cloud API e, com o passar do tempo,
 * devolve webhooks NO FORMATO DA META (sent/delivered/read/failed/played e
 * respostas de botão/texto). O service processa esses webhooks pelo mesmo
 * caminho que vai processar os reais.
 *
 * O comportamento de cada contato é determinístico (hash do telefone), então a
 * mesma base gera os mesmos números entre execuções.
 */
import {
  MetaInboundMessage, MetaWebhookPayload, buildInboundWebhook, buildStatusWebhook,
} from './meta-webhook';
import { SendRequest, SendResult, WhatsAppProvider, toWaId } from './types';

export interface Clock { now(): number }

/** Relógio com velocidade ajustável (1× = tempo real). Só no mock. */
export class SimulatedClock implements Clock {
  private anchorReal: number;
  private anchorVirtual: number;
  constructor(start: number, public speed = 1, private readonly realNow: () => number = () => Date.now()) {
    this.anchorReal = realNow();
    this.anchorVirtual = start;
  }
  now() { return this.anchorVirtual + (this.realNow() - this.anchorReal) * this.speed; }
  setSpeed(speed: number) {
    this.anchorVirtual = this.now();
    this.anchorReal = this.realNow();
    this.speed = speed;
  }
  advanceBy(ms: number) { this.anchorVirtual += ms; }
}

export interface MockOptions {
  clock: Clock;
  displayPhone: (metaPhoneNumberId: string) => string;
  /** Fallback quando a mensagem não traz `meta` (modelos enviados fora do fluxo). */
  templateInfo?: (name: string) => { category: string; buttons: { text: string; optOut?: boolean }[] } | undefined;
  /** Multiplica as probabilidades de resposta (útil para demo). */
  engagement?: number;
  /** Multiplica os atrasos simulados (0,25 = 4× mais rápido). */
  timeScale?: number;
  /** Onde ficam os webhooks agendados. Padrão: memória. Em serverless use o banco. */
  queue?: SimQueue;
}

/** Fila de webhooks simulados com horário de entrega. */
export interface SimQueue {
  push(items: { at: number; payload: MetaWebhookPayload }[]): Promise<void>;
  /** Remove e devolve os vencidos, em ordem de horário. */
  takeDue(now: number, limit: number): Promise<MetaWebhookPayload[]>;
  size(): Promise<number>;
}

interface Queued { at: number; seq: number; payload: MetaWebhookPayload }

export class MemorySimQueue implements SimQueue {
  private q: Queued[] = [];
  private seq = 0;
  async push(items: { at: number; payload: MetaWebhookPayload }[]) {
    for (const { at, payload } of items) {
      const item = { at, seq: ++this.seq, payload };
      let lo = 0, hi = this.q.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const x = this.q[mid]!;
        if (x.at < at || (x.at === at && x.seq < item.seq)) lo = mid + 1; else hi = mid;
      }
      this.q.splice(lo, 0, item);
    }
  }
  async takeDue(now: number, limit: number) {
    const out: MetaWebhookPayload[] = [];
    while (this.q.length && this.q[0]!.at <= now && out.length < limit) out.push(this.q.shift()!.payload);
    return out;
  }
  async size() { return this.q.length; }
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'mock' as const;
  private readonly queue: SimQueue;
  private buf: { at: number; payload: MetaWebhookPayload }[] = [];
  private msgSeq = 0;
  sentCount = 0;

  constructor(private readonly o: MockOptions) {
    this.queue = o.queue ?? new MemorySimQueue();
  }

  async send(req: SendRequest): Promise<SendResult> {
    try {
      return this.plan(req);
    } finally {
      await this.flush();
    }
  }

  private async flush() {
    const items = this.buf;
    this.buf = [];
    if (items.length) await this.queue.push(items);
  }

  /** Decide o destino da mensagem e agenda os webhooks (status e resposta). */
  private plan(req: SendRequest): SendResult {
    const now = this.o.clock.now();
    const ts = this.o.timeScale ?? 1;
    const span = (u: number, min: number, max: number) => Math.round(spanRaw(u, min, max) * ts);
    const id = `wamid.MOCK${(++this.msgSeq).toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
    this.sentCount++;
    const to = req.to;
    const h = (salt: string) => hash01(`${to}|${salt}`);
    const pn = req.phoneNumberId;
    const status = (at: number, status: 'sent' | 'delivered' | 'read' | 'failed' | 'played', error?: { code: number; title: string }, category?: string) =>
      this.push(at, buildStatusWebhook(pn, this.o.displayPhone(pn), {
        id, status, timestamp: String(Math.floor(at / 1000)), recipient_id: toWaId(to),
        biz_opaque_callback_data: req.bizOpaqueCallbackData,
        ...(category ? { pricing: { pricing_model: 'PMP', type: category === 'service' ? 'free_customer_service' : 'regular', category } } : {}),
        ...(error ? { errors: [{ code: error.code, title: error.title, message: error.title }] } : {}),
      }));

    const m = req.message;
    const tpl = m.type === 'template' ? (m.meta ?? this.o.templateInfo?.(m.name)) : undefined;
    const category = m.type === 'template' ? (tpl?.category ?? 'utility').toLowerCase() : 'service';

    // número sem WhatsApp
    if (h('reach') < 0.03) {
      status(now + span(h('f1'), 1500, 4000), 'failed', { code: 131026, title: 'Message undeliverable' });
      return { waMessageId: id };
    }
    // contato que parou marketing pelo próprio app
    if (category === 'marketing' && h('mkt') < 0.02) {
      status(now + span(h('f2'), 1000, 3000), 'failed', { code: 131050, title: 'User has stopped marketing messages' });
      return { waMessageId: id };
    }

    const sentAt = now + span(h(`s${id}`), 600, 2500);
    status(sentAt, 'sent', undefined, category);
    if (h('online') > 0.95) return { waMessageId: id };                 // celular desligado: fica em "enviada"
    const deliveredAt = sentAt + span(hash01(`${to}|d|${id}`), 1500, 45_000);
    status(deliveredAt, 'delivered');
    if (h('reader') > 0.74) return { waMessageId: id };                 // não costuma abrir
    const readAt = deliveredAt + span(hash01(`${to}|r|${id}`), 8_000, 12 * 60_000);
    status(readAt, 'read');
    if (m.type === 'audio' && m.voice && h('play') < 0.65) status(readAt + span(h('p'), 4000, 60_000), 'played');

    // respostas
    let options: { title: string; payload: string; optOut: boolean }[] = [];
    if (m.type === 'interactive_buttons') options = m.buttons.map((b) => ({ title: b.title, payload: b.id, optOut: false }));
    if (m.type === 'template' && tpl) {
      options = tpl.buttons.map((b, i) => ({ title: b.text, payload: m.quickReplyPayloads[i] ?? b.text, optOut: !!b.optOut }));
    }
    if (!options.length) return { waMessageId: id };

    const k = this.o.engagement ?? 1;
    const u = hash01(`${to}|choice|${req.bizOpaqueCallbackData ?? id}`);
    const replyAt = readAt + span(hash01(`${to}|ra|${id}`), 5_000, 5 * 60_000);
    const weights = options.map((op, i) => (op.optOut ? 0.03 : [0.56, 0.2, 0.05][i] ?? 0.03) * k);
    let acc = 0;
    for (let i = 0; i < options.length; i++) {
      acc += weights[i] ?? 0;
      if (u < acc) {
        const op = options[i]!;
        const msg: MetaInboundMessage = m.type === 'template'
          ? { from: toWaId(to), id: inboundId(), timestamp: String(Math.floor(replyAt / 1000)), type: 'button', button: { payload: op.payload, text: op.title }, context: { id } }
          : { from: toWaId(to), id: inboundId(), timestamp: String(Math.floor(replyAt / 1000)), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: op.payload, title: op.title } }, context: { id } };
        this.push(replyAt, buildInboundWebhook(pn, this.o.displayPhone(pn), msg));
        return { waMessageId: id };
      }
    }
    if (u < acc + 0.015 * k) {
      this.push(replyAt, this.textWebhook(pn, to, 'SAIR', replyAt));
    } else if (u < acc + 0.035 * k) {
      this.push(replyAt, this.textWebhook(pn, to, 'ok, obrigado', replyAt));
    }
    return { waMessageId: id };
  }

  /** Simula o contato escrevendo algo (campo "responder como o contato" da conversa). */
  async simulateInbound(metaPhoneNumberId: string, from: string, text: string, at = this.o.clock.now()) {
    this.push(at, this.textWebhook(metaPhoneNumberId, from, text, at));
    await this.flush();
  }

  /** Entrega os webhooks vencidos ao handler, em ordem. */
  async pump(now: number, handle: (p: MetaWebhookPayload) => Promise<unknown>, limit = 200) {
    const due = await this.queue.takeDue(now, limit);
    for (const p of due) await handle(p);
    return due.length;
  }

  pending() { return this.queue.size(); }

  private textWebhook(pn: string, from: string, text: string, at: number) {
    return buildInboundWebhook(pn, this.o.displayPhone(pn), {
      from: toWaId(from), id: inboundId(), timestamp: String(Math.floor(at / 1000)), type: 'text', text: { body: text },
    });
  }

  private push(at: number, payload: MetaWebhookPayload) {
    this.buf.push({ at, payload });
  }
}

let inboundSeq = 0;
const inboundId = () => `wamid.IN${(++inboundSeq).toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** FNV-1a -> [0,1) */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

const spanRaw = (u: number, min: number, max: number) => Math.round(min + u * (max - min));
