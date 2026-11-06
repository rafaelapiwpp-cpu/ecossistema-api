// Webhook da Meta: mensagens recebidas, status de envio, templates e qualidade.
import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { hasDb, query, upsert } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { handleEchoes, handleInboundMessages, handleStateSync, handleStatuses } from "@/lib/chat";
import { dueCampaigns, kickCampaigns, selfUrl } from "@/lib/campaigns";
import { dueFlows, kickFlows } from "@/lib/flows";
import { appSecrets } from "@/lib/connections";
import { cacheFromMeta, mediaOf } from "@/lib/media-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verificação inicial (a Meta chama GET com hub.challenge)
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const s = await getSettings();
  if (s && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === s.webhook_verify_token) {
    return new Response(p.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!hasDb()) return NextResponse.json({ ok: true });
  const s = await getSettings();
  if (!s) return new Response("not configured", { status: 503 });
  // aceita a chave do app principal e a dos apps próprios de cada conexão (BMs que usam outro app)
  const sig = req.headers.get("x-hub-signature-256");
  if (!(await appSecrets(s)).some((secret) => validSignature(raw, sig, secret))) {
    // fica registrado para o diagnóstico (chave secreta errada é a causa mais comum de "nada chega")
    try { await query("insert into webhook_log (field, payload) values ('assinatura_invalida', $1)", [{ bytes: raw.length, has_header: Boolean(req.headers.get("x-hub-signature-256")) }]); } catch { /* sem banco */ }
    return new Response("invalid signature", { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const events = new Map<string, any>();
  const tasks: Promise<any>[] = [];
  const now = new Date().toISOString();
  // mídias recebidas (e enviadas pelo celular): baixadas da Meta logo depois de responder, para abrirem na hora no HUB
  const media: { id: string; pnid: string | null }[] = [];

  for (const entry of body.entry || []) {
    const wabaId = String(entry.id || "");
    for (const ch of entry.changes || []) {
      const field = ch.field;
      const v = ch.value || {};

      if (field === "messages") {
        // status de envio (tabela de eventos usada pela tela de falhas)
        for (const st of v.statuses || []) {
          const err = (st.errors || [])[0];
          events.set(`${st.id}|${st.status}`, {
            wamid: st.id, status: st.status, waba_id: wabaId,
            phone_number_id: v.metadata?.phone_number_id ?? null, recipient: st.recipient_id ?? null,
            pricing_category: st.pricing?.category ?? null, pricing_type: st.pricing?.type ?? null, billable: st.pricing?.billable ?? null,
            error_code: err?.code ?? null, error_title: err?.title ?? null, error_details: err?.error_data?.details ?? err?.message ?? null,
            ts: new Date(Number(st.timestamp) * 1000).toISOString(),
          });
        }
        if (v.statuses?.length) tasks.push(handleStatuses(wabaId, v).catch((e) => console.error("statuses", e)));
        if (v.messages?.length) tasks.push(handleInboundMessages(s, wabaId, v).catch((e) => console.error("inbound", e)));
        for (const id of mediaOf(v.messages)) media.push({ id, pnid: v.metadata?.phone_number_id ?? null });
        // resumo (sem conteúdo) para o diagnóstico do webhook
        const kinds = [...new Set((v.statuses || []).map((st: any) => st.status))].join(",");
        tasks.push(query("insert into webhook_log (field, waba_id, payload) values ($1, $2, $3)", ["messages", wabaId,
          { messages: v.messages?.length || 0, statuses: v.statuses?.length || 0, status_kinds: kinds, phone_number_id: v.metadata?.phone_number_id ?? null }]));
        continue;
      }

      // número em coexistência: o que a equipe manda pelo app do celular chega como eco
      if (field === "smb_message_echoes") {
        if (v.message_echoes?.length) tasks.push(handleEchoes(wabaId, v).catch((e) => console.error("echoes", e)));
        for (const id of mediaOf(v.message_echoes)) media.push({ id, pnid: v.metadata?.phone_number_id ?? null });
        tasks.push(query("insert into webhook_log (field, waba_id, payload) values ($1, $2, $3)", [field, wabaId,
          { echoes: v.message_echoes?.length || 0, phone_number_id: v.metadata?.phone_number_id ?? null }]));
        continue;
      }
      if (field === "smb_app_state_sync") {
        tasks.push(handleStateSync(wabaId, v).catch((e) => console.error("state sync", e)));
        tasks.push(query("insert into webhook_log (field, waba_id, payload) values ($1, $2, $3)", [field, wabaId,
          { contacts: (v.state_sync || []).length, phone_number_id: v.metadata?.phone_number_id ?? null }]));
        continue;
      }

      tasks.push(query("insert into webhook_log (field, waba_id, payload) values ($1, $2, $3)", [field, wabaId, v]));
      const tid = v.message_template_id ? String(v.message_template_id) : null;
      if (field === "message_template_status_update" && tid) {
        tasks.push(query("update templates set status = $1, rejected_reason = $2, updated_at = $3 where id = $4",
          [v.event, v.reason && v.reason !== "NONE" ? v.reason : null, now, tid]));
      }
      if (field === "message_template_quality_update" && tid) {
        tasks.push(query("update templates set quality_score = $1, updated_at = $2 where id = $3", [v.new_quality_score, now, tid]));
      }
      if (field === "template_category_update" && tid && v.new_category) {
        tasks.push(query("update templates set category = $1, updated_at = $2 where id = $3", [v.new_category, now, tid]));
      }
      if (field === "phone_number_quality_update" && v.display_phone_number) {
        const digits = String(v.display_phone_number).replace(/\D/g, "");
        tasks.push(query("update phone_numbers set quality_rating = coalesce($1, quality_rating), messaging_limit = coalesce($2, messaging_limit), updated_at = $3 where phone_digits = $4",
          [v.event === "FLAGGED" ? "RED" : v.event === "UNFLAGGED" ? "GREEN" : null, v.current_limit ?? null, now, digits]));
        if (v.event === "FLAGGED") {
          // protege o número: pausa os disparos em andamento até alguém avaliar
          tasks.push(query(`update campaigns set status = 'paused', last_error = 'Pausado automaticamente: a Meta sinalizou a qualidade deste número (FLAGGED)', updated_at = now()
            where status = 'running' and phone_number_id in (select id from phone_numbers where phone_digits = $1)`, [digits]));
        }
      }
    }
  }

  if (events.size) tasks.push(upsert("message_events", [...events.values()], ["wamid", "status"]));
  await Promise.allSettled(tasks);
  if (media.length) {
    after(async () => {
      for (const x of media) {
        try { await cacheFromMeta(s, x.id, x.pnid); } catch (e) { console.error("media cache", e); }
      }
    });
  }

  // aproveita o evento para destravar disparos parados (agendados na hora, lotes interrompidos)
  try {
    const [due, flows] = await Promise.all([dueCampaigns(), dueFlows()]);
    if (due.length || flows.length) { const base = selfUrl(req); after(async () => { if (due.length) await kickCampaigns(s, base); if (flows.length) await kickFlows(s, base); }); }
  } catch (e) { console.error("kick", e); }

  return NextResponse.json({ ok: true });
}
