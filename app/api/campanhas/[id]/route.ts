// Um disparo: detalhe, destinatários, exportação e ações (iniciar, pausar, retomar, cancelar, duplicar, excluir).
import { NextResponse, after } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { canSee, getScope } from "@/lib/access";
import { COUNTS_SQL, RECIPIENT_STATUS, fillRecipients, placeholdersOf, selfUrl, triggerRun, unitCost, type Campaign } from "@/lib/campaigns";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function load(id: number, user: { role: string }) {
  const [c] = await query<Campaign & { counts: any; display_phone_number: string | null; phone_name: string | null; waba_name: string | null; created_by_name: string | null }>(
    `select c.*, ${COUNTS_SQL} as counts, pn.display_phone_number, pn.verified_name as phone_name, w.name as waba_name, u.name as created_by_name
     from campaigns c left join phone_numbers pn on pn.id = c.phone_number_id left join wabas w on w.id = c.waba_id left join users u on u.id = c.created_by
     where c.id = $1`, [id]);
  return c && canSee(await getScope(user), c.waba_id) ? c : null; // disparo de BM que o usuário não vê = não existe
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const id = Number((await params).id);
  const c = await load(id, r.user);
  if (!c) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  const p = new URL(req.url).searchParams;

  if (p.get("export")) {
    const rows = await query<any>("select phone, name, status, replied, error_code, error_title, sent_at, params from campaign_recipients where campaign_id = $1 order by id", [id]);
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["telefone;nome;status;respondeu;erro;enviado_em;variaveis", ...rows.map((x) => [x.phone, x.name, RECIPIENT_STATUS[x.status] || x.status, x.replied ? "sim" : "não", x.error_title ? `${x.error_code ?? ""} ${x.error_title}`.trim() : "", x.sent_at ? fmtDateTime(x.sent_at) : "", x.params ? Object.values(x.params).join(" | ") : ""].map(esc).join(";"))];
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="disparo-${id}.csv"` } });
  }

  const page = Math.max(1, Number(p.get("page") || 1));
  const limit = 100;
  const where: string[] = ["r.campaign_id = $1"];
  const qp: any[] = [id];
  if (p.get("rstatus")) { qp.push(p.get("rstatus")); where.push(`r.status = $${qp.length}`); }
  if (p.get("replied")) where.push("r.replied");
  if (p.get("q")) { qp.push(`%${p.get("q")}%`); where.push(`(r.phone ilike $${qp.length} or r.name ilike $${qp.length})`); }
  const [recipients, [{ n: total }], failures, tpl] = await Promise.all([
    query(`select r.id, r.phone, r.name, r.status, r.replied, r.error_code, r.error_title, r.sent_at, r.conversation_id, r.params from campaign_recipients r where ${where.join(" and ")} order by r.id limit ${limit} offset ${(page - 1) * limit}`, qp),
    query<{ n: number }>(`select count(*)::int as n from campaign_recipients r where ${where.join(" and ")}`, qp),
    query("select error_code, coalesce(error_title, 'Sem detalhe') as error_title, count(*)::int as n from campaign_recipients where campaign_id = $1 and status in ('failed', 'skipped') group by 1, 2 order by n desc limit 20", [id]),
    query<{ components: any[] | null }>("select components from templates where id = $1", [c.template_id]),
  ]);
  const unit = await unitCost(c.waba_id, c.template_category);
  // se a campanha deveria estar rodando e ninguém está processando, dá um empurrão
  if (c.status === "running" && (!c.lock_until || new Date(c.lock_until) < new Date()) && (c.counts.pending > 0 || c.counts.sending > 0)) {
    const base = selfUrl(req);
    after(() => triggerRun(r.s, base, id));
  }
  return NextResponse.json({ campaign: c, recipients, total, page, limit, failures, template: tpl[0] || null, placeholders: placeholdersOf(tpl[0]?.components), unit_cost: unit });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const { s, user } = r;
  if (user.role === "atendente") return NextResponse.json({ error: "Apenas administradores e gestores" }, { status: 403 });
  const id = Number((await params).id);
  const c = await load(id, user);
  if (!c) return NextResponse.json({ error: "Disparo não encontrado" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const base = selfUrl(req);
  const kick = () => after(() => triggerRun(s, base, id));

  switch (b.action) {
    case "start": {
      if (!["draft", "scheduled", "paused"].includes(c.status)) return NextResponse.json({ error: "Este disparo não pode ser iniciado" }, { status: 400 });
      await query("update campaigns set status = 'running', scheduled_at = null, last_error = null, updated_at = now() where id = $1", [id]);
      kick();
      break;
    }
    case "schedule": {
      const when = new Date(b.scheduled_at);
      if (isNaN(when.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
      if (!["draft", "scheduled", "paused"].includes(c.status)) return NextResponse.json({ error: "Este disparo não pode ser agendado" }, { status: 400 });
      await query("update campaigns set status = 'scheduled', scheduled_at = $2, last_error = null, updated_at = now() where id = $1", [id, when.toISOString()]);
      break;
    }
    case "pause":
      if (!["running", "scheduled"].includes(c.status)) return NextResponse.json({ error: "Só é possível pausar um disparo em andamento ou agendado" }, { status: 400 });
      await query("update campaigns set status = 'paused', updated_at = now() where id = $1", [id]);
      break;
    case "cancel":
      if (["done", "cancelled"].includes(c.status)) return NextResponse.json({ error: "Disparo já encerrado" }, { status: 400 });
      await query("update campaigns set status = 'cancelled', finished_at = now(), updated_at = now() where id = $1", [id]);
      await query("update campaign_recipients set status = 'skipped', error_title = 'Disparo cancelado', updated_at = now() where campaign_id = $1 and status in ('pending', 'sending')", [id]);
      break;
    case "retry_failed": {
      if (!c.counts.failed) return NextResponse.json({ error: "Não há falhas para reenviar" }, { status: 400 });
      await query("update campaign_recipients set status = 'pending', attempts = 0, error_code = null, error_title = null, updated_at = now() where campaign_id = $1 and status = 'failed'", [id]);
      await query("update campaigns set status = 'running', finished_at = null, last_error = null, updated_at = now() where id = $1", [id]);
      kick();
      break;
    }
    case "duplicate": {
      const [n] = await query<Campaign>(
        `insert into campaigns (name, waba_id, phone_number_id, template_id, template_name, template_language, template_category, mapping, audience, status, rate_per_minute, created_by)
         select name || ' (cópia)', waba_id, phone_number_id, template_id, template_name, template_language, template_category, mapping, audience, 'draft', rate_per_minute, $2 from campaigns where id = $1 returning *`,
        [id, user.id],
      );
      const total = await fillRecipients(n);
      return NextResponse.json({ ok: true, id: n.id, total });
    }
    case "delete":
      if (c.status === "running") return NextResponse.json({ error: "Pause ou cancele antes de excluir" }, { status: 400 });
      await query("delete from campaign_recipients where campaign_id = $1", [id]);
      await query("delete from campaigns where id = $1", [id]);
      return NextResponse.json({ ok: true, deleted: true });
    case "rename":
      await query("update campaigns set name = $2, updated_at = now() where id = $1", [id, String(b.name || c.name).trim() || c.name]);
      break;
    case "rate":
      await query("update campaigns set rate_per_minute = $2, updated_at = now() where id = $1", [id, Math.max(10, Math.min(1200, Number(b.rate_per_minute || 120)))]);
      break;
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, campaign: await load(id, user) });
}
