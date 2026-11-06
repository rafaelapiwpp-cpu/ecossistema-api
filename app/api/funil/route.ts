// Funil (quadro de etapas) do portal de clientes: cartões = contatos da empresa, uma etapa por funil.
// Usuário-cliente: só os funis da empresa dele (e, se tiver funis marcados, só esses). Equipe interna: os funis de qualquer empresa.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { getScope, type Scope } from "@/lib/access";
import { applyCompanyDefaults, findOrCreateConversation } from "@/lib/chat";
import { onlyDigits } from "@/lib/meta";
import { isManagerRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

type Pipe = { id: number; company_id: number; name: string; position: number; auto_add: boolean };

/** Funis que este usuário pode ver na empresa indicada. */
async function visiblePipelines(scope: Scope, userId: number, companyId: number): Promise<Pipe[]> {
  const all = await query<Pipe>("select * from pipelines where company_id = $1 order by position, id", [companyId]);
  if (!scope.client) return all;
  const mine = (await query<{ pipeline_id: number }>("select pipeline_id from user_pipelines where user_id = $1", [userId])).map((p) => p.pipeline_id);
  return mine.length ? all.filter((p) => mine.includes(p.id)) : all;
}

/** Empresa em que o pedido acontece: a do cliente, ou (equipe) a do ?company=slug / do contato. */
async function resolveCompany(scope: Scope, user: { role: string }, slug: string | null, contactId: number | null): Promise<number | null> {
  if (scope.company) return scope.company.id;
  if (!isManagerRole(user.role)) return null;
  if (slug) {
    const [c] = await query<{ id: number }>("select id from companies where slug = $1", [slug]);
    return c?.id ?? null;
  }
  if (contactId) {
    const [k] = await query<{ company_id: number | null }>("select company_id from contacts where id = $1", [contactId]);
    return k?.company_id ?? null;
  }
  return null;
}

const contactOk = async (companyId: number, contactId: number) =>
  (await query("select 1 from contacts where id = $1 and company_id = $2", [contactId, companyId])).length > 0;

export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const scope = await getScope(r.user);
  const contactId = p.get("contact") ? Number(p.get("contact")) : null;
  const companyId = await resolveCompany(scope, r.user, p.get("company"), contactId);
  if (!companyId) return NextResponse.json({ pipelines: [], contact: null });
  const pipelines = await visiblePipelines(scope, r.user.id, companyId);
  const pids = pipelines.map((x) => x.id);
  const stages = pids.length ? await query("select * from pipeline_stages where pipeline_id = any($1::int[]) order by position, id", [pids]) : [];

  if (contactId) { // só a posição deste contato em cada funil (painel do contato no Atendimento)
    if (!(await contactOk(companyId, contactId))) return NextResponse.json({ pipelines: [], contact: null });
    const cards = pids.length ? await query("select pipeline_id, stage_id, value, note from pipeline_cards where contact_id = $1 and pipeline_id = any($2::int[])", [contactId, pids]) : [];
    return NextResponse.json({
      pipelines: pipelines.map((x) => ({ ...x, stages: stages.filter((s: any) => s.pipeline_id === x.id), card: cards.find((c: any) => c.pipeline_id === x.id) || null })),
      contact: contactId,
    });
  }

  // quadro completo: cartões com os dados do contato e da conversa mais recente
  const cards = pids.length ? await query(
    `select pc.pipeline_id, pc.stage_id, pc.position, pc.value, pc.note, pc.moved_at, pc.created_at,
            k.id as contact_id, k.name, k.phone, k.opt_out,
            cv.id as conversation_id, cv.status as conversation_status, cv.last_message_at, cv.last_preview, cv.unread_count,
            coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = k.id), '[]'::json) as tags
     from pipeline_cards pc
     join contacts k on k.id = pc.contact_id
     left join lateral (select c.* from conversations c where c.contact_id = k.id order by c.last_message_at desc nulls last limit 1) cv on true
     where pc.pipeline_id = any($1::int[]) and k.company_id = $2
     order by pc.position, pc.moved_at desc`, [pids, companyId]) : [];
  return NextResponse.json({
    pipelines: pipelines.map((x) => ({ ...x, stages: stages.filter((s: any) => s.pipeline_id === x.id), cards: cards.filter((c: any) => c.pipeline_id === x.id) })),
    contact: null,
  });
}

export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const scope = await getScope(r.user);
  const pipelineId = Number(b.pipeline_id || 0);
  const contactId = Number(b.contact_id || 0);
  const companyId = await resolveCompany(scope, r.user, b.company ? String(b.company) : null, contactId || null);
  if (!companyId) return bad("Empresa não encontrada", 404);
  const pipes = await visiblePipelines(scope, r.user.id, companyId);
  const pipe = pipes.find((p) => p.id === pipelineId);
  const stageOf = async (id: number) => (await query<{ id: number }>("select id from pipeline_stages where id = $1 and pipeline_id = $2", [id, pipelineId]))[0] || null;
  const firstStage = async () => (await query<{ id: number }>("select id from pipeline_stages where pipeline_id = $1 order by position, id limit 1", [pipelineId]))[0] || null;

  try {
    switch (b.action) {
      case "move": {
        if (!pipe) return bad("Funil não encontrado", 404);
        if (!(await contactOk(companyId, contactId))) return bad("Contato não encontrado", 404);
        const st = await stageOf(Number(b.stage_id)); if (!st) return bad("Etapa não encontrada", 404);
        const pos = Number.isFinite(Number(b.position)) ? Number(b.position) : 0;
        await query(
          `insert into pipeline_cards (pipeline_id, contact_id, stage_id, position) values ($1, $2, $3, $4)
           on conflict (pipeline_id, contact_id) do update set stage_id = excluded.stage_id, position = excluded.position, moved_at = now()`,
          [pipelineId, contactId, st.id, pos]);
        return NextResponse.json({ ok: true });
      }
      case "add": {
        if (!pipe) return bad("Funil não encontrado", 404);
        if (!(await contactOk(companyId, contactId))) return bad("Contato não encontrado", 404);
        const st = b.stage_id ? await stageOf(Number(b.stage_id)) : await firstStage();
        if (!st) return bad("O funil não tem etapas");
        await query(
          `insert into pipeline_cards (pipeline_id, contact_id, stage_id, position)
           values ($1, $2, $3, coalesce((select max(position) + 1 from pipeline_cards where stage_id = $3), 0))
           on conflict (pipeline_id, contact_id) do update set stage_id = excluded.stage_id, moved_at = now()`, [pipelineId, contactId, st.id]);
        return NextResponse.json({ ok: true });
      }
      case "remove": {
        if (!pipe) return bad("Funil não encontrado", 404);
        await query("delete from pipeline_cards where pipeline_id = $1 and contact_id = $2", [pipelineId, contactId]);
        return NextResponse.json({ ok: true });
      }
      case "card": {
        if (!pipe) return bad("Funil não encontrado", 404);
        if (!(await contactOk(companyId, contactId))) return bad("Contato não encontrado", 404);
        const value = b.value === "" || b.value == null ? null : Number(String(b.value).replace(",", "."));
        if (value != null && !Number.isFinite(value)) return bad("Valor inválido");
        await query("update pipeline_cards set value = $3, note = $4 where pipeline_id = $1 and contact_id = $2", [pipelineId, contactId, value, String(b.note || "").trim().slice(0, 500) || null]);
        return NextResponse.json({ ok: true });
      }
      case "new_lead": {
        if (!pipe) return bad("Funil não encontrado", 404);
        let phone = onlyDigits(String(b.phone || ""));
        if (phone.length === 10 || phone.length === 11) phone = `55${phone}`; // digitado sem o DDI: Brasil
        if (phone.length < 12) return bad("Telefone inválido (DDD + número)");
        const name = String(b.name || "").trim() || null;
        // o contato nasce na conta (WABA) do número escolhido — ou do primeiro número que o usuário atende
        const phones = scope.phones?.length ? scope.phones : (await query<{ phone_number_id: string }>("select phone_number_id from company_phones where company_id = $1", [companyId])).map((x) => x.phone_number_id);
        const pnid = b.phone_number_id && phones.includes(String(b.phone_number_id)) ? String(b.phone_number_id) : phones[0];
        if (!pnid) return bad("A empresa ainda não tem número vinculado");
        const [pn] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pnid]);
        if (!pn) return bad("Número não encontrado", 404);
        const [ex] = await query<{ id: number; company_id: number | null }>("select id, company_id from contacts where waba_id = $1 and phone = $2", [pn.waba_id, phone]);
        if (ex && ex.company_id != null && ex.company_id !== companyId) return bad("Este número já pertence a outra empresa", 409);
        const [k] = await query<{ id: number }>(
          `insert into contacts (waba_id, phone, name, source, company_id) values ($1, $2, $3, 'manual', $4)
           on conflict (waba_id, phone) do update set name = coalesce(contacts.name, excluded.name), company_id = coalesce(contacts.company_id, excluded.company_id), updated_at = now()
           returning id`, [pn.waba_id, phone, name, companyId]);
        const st = b.stage_id ? await stageOf(Number(b.stage_id)) : await firstStage();
        if (!st) return bad("O funil não tem etapas");
        await query(
          `insert into pipeline_cards (pipeline_id, contact_id, stage_id, position)
           values ($1, $2, $3, coalesce((select max(position) + 1 from pipeline_cards where stage_id = $3), 0))
           on conflict (pipeline_id, contact_id) do nothing`, [pipelineId, k.id, st.id]);
        if (!ex) await applyCompanyDefaults(companyId, k.id, null); // lead novo: departamento padrão e etiquetas automáticas da empresa
        return NextResponse.json({ ok: true, contact_id: k.id });
      }
      case "start_conversation": {
        // abre (ou acha) a conversa do contato num número da empresa, para o atendente mandar o template
        if (!(await contactOk(companyId, contactId))) return bad("Contato não encontrado", 404);
        const phones = scope.phones?.length ? scope.phones : (await query<{ phone_number_id: string }>("select phone_number_id from company_phones where company_id = $1", [companyId])).map((x) => x.phone_number_id);
        const pnid = b.phone_number_id && phones.includes(String(b.phone_number_id)) ? String(b.phone_number_id) : phones[0];
        if (!pnid) return bad("A empresa ainda não tem número vinculado");
        const [pn] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pnid]);
        if (!pn) return bad("Número não encontrado", 404);
        const conv = await findOrCreateConversation(pn.waba_id, pnid, contactId, "manual");
        return NextResponse.json({ ok: true, conversation_id: conv.id });
      }
      default:
        return bad("Ação inválida");
    }
  } catch (e: any) {
    return bad(e.message || "Falha", 500);
  }
}
