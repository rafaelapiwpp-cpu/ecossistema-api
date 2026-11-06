// Disparos: lista, prévia do público, criação e teste.
import { NextResponse, after } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { canSee, getScope, scopeSql, whereOf } from "@/lib/access";
import { isManagerRole } from "@/lib/roles";
import { findOrCreateContact, findOrCreateConversation, sendTemplate, renderTemplatePreview } from "@/lib/chat";
import {
  COUNTS_SQL, audiencePreview, buildComponents, fieldOptions, fillRecipients, normalizePhone, placeholdersOf, selfUrl, triggerRun, unitCost,
  type Audience, type Campaign, type Mapping,
} from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: any[] = [];
  const sc = scopeSql(await getScope(r.user), "c.waba_id", params); // só disparos das BMs visíveis
  if (sc) where.push(sc);
  if (p.get("waba")) { params.push(p.get("waba")); where.push(`c.waba_id = $${params.length}`); }
  if (p.get("status")) { params.push(p.get("status")); where.push(`c.status = $${params.length}`); }
  const rows = await query(
    `select c.*, ${COUNTS_SQL} as counts, pn.display_phone_number, pn.verified_name as phone_name, w.name as waba_name, u.name as created_by_name
     from campaigns c
     left join phone_numbers pn on pn.id = c.phone_number_id
     left join wabas w on w.id = c.waba_id
     left join users u on u.id = c.created_by
     ${where.length ? "where " + where.join(" and ") : ""}
     order by c.created_at desc limit 200`,
    params,
  );
  return NextResponse.json({ rows });
}

function parseMapping(m: any): Mapping {
  const src = (x: any) => ({ key: String(x?.key ?? ""), kind: x?.kind === "text" ? "text" as const : "field" as const, value: String(x?.value ?? ""), fallback: String(x?.fallback ?? "") });
  const out: Mapping = { body: Array.isArray(m?.body) ? m.body.map(src) : [] };
  if (m?.header?.kind === "text") out.header = { kind: "text", source: src(m.header.source) };
  else if (m?.header?.media_id && ["image", "video", "document"].includes(m.header.kind)) out.header = { kind: m.header.kind, media_id: String(m.header.media_id), filename: m.header.filename || null };
  else out.header = null;
  if (Array.isArray(m?.buttons)) out.buttons = m.buttons.map((b: any) => ({ index: Number(b.index), sub_type: b.sub_type === "copy_code" ? "copy_code" as const : "url" as const, source: src(b.source) }));
  return out;
}

function parseAudience(a: any): Audience {
  const ids = (v: any) => (Array.isArray(v) ? v.map(Number).filter(Boolean) : []);
  const scope = ["lists", "tags", "all", "phones"].includes(a?.scope) ? a.scope : "lists";
  return {
    scope, list_ids: ids(a?.list_ids), tag_ids: ids(a?.tag_ids), department_id: a?.department_id ? Number(a.department_id) : null,
    waba_only: !!a?.waba_only, other_accounts: !!a?.other_accounts, exclude_tag_ids: ids(a?.exclude_tag_ids), exclude_recent_days: Math.max(0, Number(a?.exclude_recent_days || 0)),
    exclude_campaign_ids: ids(a?.exclude_campaign_ids), only_replied: !!a?.only_replied,
    phones: scope === "phones" ? String(a?.phones_text ?? (Array.isArray(a?.phones) ? a.phones.join("\n") : "")).split(/[\n\r,;]+/).map(normalizePhone).filter(Boolean) : [],
  };
}

export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const { s, user } = r;
  const b = await req.json().catch(() => ({}));
  const canEdit = isManagerRole(user.role);
  const scope = await getScope(user);
  const notFound = (what: string) => NextResponse.json({ error: `${what} não encontrado` }, { status: 404 });

  try {
    if (b.action === "options") {
      const ca: any[] = [];
      const [fields, campaigns] = await Promise.all([fieldOptions(), query(`select id, name, status, total from campaigns ${whereOf([scopeSql(scope, "waba_id", ca)])} order by created_at desc limit 50`, ca)]);
      return NextResponse.json({ fields, campaigns });
    }
    if (b.waba_id && !canSee(scope, String(b.waba_id))) return notFound("Conta");
    if (b.template_id) {
      const [own] = await query<{ waba_id: string }>("select waba_id from templates where id = $1", [String(b.template_id)]);
      if (own && !canSee(scope, own.waba_id)) return notFound("Template");
    }
    if (b.phone_number_id) {
      const [own] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [String(b.phone_number_id)]);
      if (own && !canSee(scope, own.waba_id)) return notFound("Número");
    }

    if (b.action === "preview") {
      const audience = parseAudience(b.audience);
      const wabaId = String(b.waba_id || "");
      const [{ total, sample }, tpl] = await Promise.all([
        audiencePreview(audience, wabaId),
        b.template_id ? query<{ category: string | null }>("select category from templates where id = $1", [String(b.template_id)]) : Promise.resolve([] as any[]),
      ]);
      const unit = await unitCost(wabaId, tpl?.[0]?.category || null);
      return NextResponse.json({ total, sample, unit_cost: unit, estimate: unit ? unit * total : null });
    }

    if (!canEdit) return NextResponse.json({ error: "Apenas administradores e gestores criam disparos" }, { status: 403 });

    if (b.action === "test") {
      const phone = normalizePhone(String(b.phone || ""));
      if (!phone) return NextResponse.json({ error: "Informe um telefone válido para o teste" }, { status: 400 });
      const [t] = await query<{ id: string; name: string; language: string; components: any[] | null; waba_id: string }>("select id, name, language, components, waba_id from templates where id = $1", [String(b.template_id)]);
      if (!t) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
      const mapping = parseMapping(b.mapping);
      const ph = placeholdersOf(t.components);
      const contact = await findOrCreateContact(t.waba_id, phone, b.name || null, "manual");
      const built = buildComponents(ph, mapping, contact);
      if (built.missing.length) return NextResponse.json({ error: `Variável sem valor para este contato: ${built.missing.join(", ")}` }, { status: 400 });
      const conv = await findOrCreateConversation(t.waba_id, String(b.phone_number_id), contact.id, "disparo");
      const preview = renderTemplatePreview(t.components, ph.body.map((k) => built.values[k] ?? ""));
      const msg = await sendTemplate(s, { phoneNumberId: String(b.phone_number_id), to: phone, conversationId: conv.id, contactId: contact.id, wabaId: t.waba_id, userId: user.id, template: { name: t.name, language: t.language, components: built.components, preview } });
      return NextResponse.json({ ok: true, wamid: msg.wamid, preview });
    }

    if (b.action === "create") {
      const name = String(b.name || "").trim();
      if (!name) return NextResponse.json({ error: "Dê um nome ao disparo" }, { status: 400 });
      const [t] = await query<{ id: string; name: string; language: string; category: string | null; components: any[] | null; waba_id: string; status: string }>("select id, name, language, category, components, waba_id, status from templates where id = $1", [String(b.template_id)]);
      if (!t) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
      if (t.status !== "APPROVED") return NextResponse.json({ error: "Só templates aprovados podem ser usados" }, { status: 400 });
      const [pn] = await query<{ id: string; waba_id: string }>("select id, waba_id from phone_numbers where id = $1", [String(b.phone_number_id)]);
      if (!pn || pn.waba_id !== t.waba_id) return NextResponse.json({ error: "O número precisa ser da mesma conta do template" }, { status: 400 });
      const mapping = parseMapping(b.mapping);
      const ph = placeholdersOf(t.components);
      const missing = [
        ...ph.body.filter((k) => !mapping.body.find((m) => m.key === k && (m.value || m.fallback))).map((k) => `{{${k}}}`),
        ...(ph.header.kind !== "none" && ph.header.kind !== "text" && !(mapping.header && mapping.header.kind !== "text") ? ["mídia do cabeçalho"] : []),
        ...ph.buttons.filter((bt) => !(mapping.buttons || []).find((m) => m.index === bt.index)).map((bt) => `botão ${bt.text}`),
      ];
      if (missing.length) return NextResponse.json({ error: `Faltou definir: ${missing.join(", ")}` }, { status: 400 });
      const audience = parseAudience(b.audience);
      const rate = Math.max(10, Math.min(1200, Number(b.rate_per_minute || 120)));
      const start = b.start === "now" ? "now" : b.start === "schedule" ? "schedule" : "draft";
      const when = start === "schedule" ? new Date(b.scheduled_at) : null;
      if (start === "schedule" && (!when || isNaN(when.getTime()))) return NextResponse.json({ error: "Data de agendamento inválida" }, { status: 400 });

      const [c] = await query<Campaign>(
        `insert into campaigns (name, waba_id, phone_number_id, template_id, template_name, template_language, template_category, mapping, audience, status, scheduled_at, rate_per_minute, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $12) returning *`,
        [name, t.waba_id, pn.id, t.id, t.name, t.language, t.category, mapping, audience, when ? when.toISOString() : null, rate, user.id],
      );
      const total = await fillRecipients(c);
      if (!total) {
        await query("delete from campaigns where id = $1", [c.id]);
        return NextResponse.json({ error: "Nenhum destinatário no público escolhido (contatos com opt-out são excluídos)" }, { status: 400 });
      }
      if (start === "now") {
        await query("update campaigns set status = 'running', updated_at = now() where id = $1", [c.id]);
        const base = selfUrl(req);
        after(() => triggerRun(s, base, c.id));
      } else if (start === "schedule") {
        await query("update campaigns set status = 'scheduled', updated_at = now() where id = $1", [c.id]);
      }
      const [row] = await query("select * from campaigns where id = $1", [c.id]);
      return NextResponse.json({ campaign: row, total });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro", details: e.details }, { status: e.code ? 502 : 500 });
  }
}
