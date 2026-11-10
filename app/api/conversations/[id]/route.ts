import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { canSee, canSeePhone, getScope, type Scope } from "@/lib/access";
import { isPreview } from "@/lib/companies";
import { logEvent, markRead, sendMedia, sendTemplate, sendText, renderTemplatePreview, type Conversation, type Contact } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: number, user: { id: number; role: string; company_id?: number | null }) {
  const [conv] = await query<Conversation & { display_phone_number: string | null; phone_name: string | null }>(
    `select c.*, ph.display_phone_number, ph.verified_name as phone_name from conversations c left join phone_numbers ph on ph.id = c.phone_number_id where c.id = $1`, [id]);
  if (!conv) return null;
  const scope = await getScope(user);
  // conversa de uma BM (ou, no portal, de um número) que este usuário não vê = não existe
  if (!canSee(scope, conv.waba_id) || !canSeePhone(scope, conv.phone_number_id)) return null;
  const [contact] = await query<Contact>("select * from contacts where id = $1", [conv.contact_id]);
  const tags = await query("select t.id, t.name, t.color from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = $1 order by t.name", [conv.contact_id]);
  const lists = await query("select l.id, l.name from list_contacts lc join lists l on l.id = lc.list_id where lc.contact_id = $1 order by l.name", [conv.contact_id]);
  return { conv, contact: { ...contact, tags, lists }, scope };
}

/** Portal: só pessoas, departamentos e etiquetas da própria empresa podem ser usados. */
async function ownedBy(scope: Scope, table: "users" | "departments" | "tags", id: number | null) {
  if (!scope.company || id == null) return true;
  const [row] = await query<{ ok: boolean }>(`select company_id = $2 as ok from ${table} where id = $1`, [id, scope.company.id]);
  return !!row?.ok;
}

/** Conversa + contato + mensagens (?after=<id> devolve só as novas). */
export async function GET(req: Request, { params }: Ctx) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const id = Number((await params).id);
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  const data = await load(id, r.user);
  if (!data) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  // quem enviou: atendente, disparo ou fluxo (para o rótulo acima do balão)
  // media_w/media_h: tamanho da imagem guardada (a tela reserva o espaço antes de a imagem carregar)
  const MSG = `select m.*, u.name as sent_by_name, ca.name as campaign_name, f.name as flow_name, mf.width as media_w, mf.height as media_h
    from messages m left join users u on u.id = m.sent_by_user_id left join campaigns ca on ca.id = m.campaign_id
    left join flow_runs fr on fr.id = m.flow_run_id left join flows f on f.id = fr.flow_id
    left join media_files mf on mf.media_id = m.media_id`;
  const messages = after
    ? await query(`${MSG} where m.conversation_id = $1 and m.id > $2 order by m.ts, m.id`, [id, after])
    : await query(`select * from (${MSG} where m.conversation_id = $1 order by m.ts desc, m.id desc limit 300) x order by ts, id`, [id]);
  // mensagens enviadas recentes: status (entregue/lida) para os ícones e conteúdo (o eco do celular troca a linha "outra ferramenta" pelo texto)
  const statuses = after
    ? await query(`select id, status, error_code, error_title, type, body, media_id, media_mime, media_filename, payload from messages
                   where conversation_id = $1 and direction = 'out' and id <= $2 order by id desc limit 50`, [id, after])
    : [];
  const { scope: _scope, ...pub } = data;
  if (after) return NextResponse.json({ ...pub, messages, statuses });
  const cid = data.contact.id;
  const [notes, events, campaigns, flows, others] = await Promise.all([
    query("select n.*, u.name as user_name from conversation_notes n left join users u on u.id = n.user_id where n.conversation_id = $1 order by n.created_at", [id]),
    // eventos da conversa (atribuição, departamento, encerramento…) com os nomes já resolvidos
    query(`select e.id, e.type, e.data, e.created_at, u.name as user_name,
             (select name from users where id = nullif(e.data->>'user_id', '')::int) as target_name,
             (select name from departments where id = nullif(e.data->>'department_id', '')::int) as department_name
           from conversation_events e left join users u on u.id = e.user_id where e.conversation_id = $1 order by e.created_at, e.id`, [id]),
    // histórico do contato (o contato é da mesma conta da conversa)
    query(`select c.id, c.name, r.status, coalesce(r.sent_at, r.updated_at) as ts from campaign_recipients r join campaigns c on c.id = r.campaign_id
           where r.contact_id = $1 order by ts desc nulls last limit 20`, [cid]),
    query(`select f.id, f.name, fr.status, coalesce(fr.started_at, fr.created_at) as ts from flow_runs fr join flows f on f.id = fr.flow_id
           where fr.contact_id = $1 and not fr.is_test order by ts desc nulls last limit 20`, [cid]),
    query(`select c.id, c.status, c.last_message_at, c.created_at, ph.display_phone_number, ph.label from conversations c left join phone_numbers ph on ph.id = c.phone_number_id
           where c.contact_id = $1 and c.id <> $2 order by c.last_message_at desc nulls last limit 10`, [cid, id]),
  ]);
  return NextResponse.json({ ...pub, messages, statuses, notes, events, history: { campaigns, flows, others } });
}

/** Ações: enviar, encerrar, reabrir, atribuir, departamento, tags, nota, marcar lida, editar contato. */
export async function POST(req: Request, { params }: Ctx) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const { s, user } = r;
  const id = Number((await params).id);
  const data = await load(id, user);
  if (!data) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  const { conv, contact, scope } = data;
  // portal em prévia de treinamento: o cliente só visualiza (nada sai para a Meta nem muda a conversa)
  if (scope.client && isPreview(scope.company)) {
    return NextResponse.json({ error: "Esta é uma prévia de treinamento: o atendimento está disponível só para visualização." }, { status: 403 });
  }
  const notMine = () => NextResponse.json({ error: "Não encontrado na sua empresa" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const ctx = { phoneNumberId: conv.phone_number_id, to: contact.phone, conversationId: conv.id, contactId: contact.id, wabaId: conv.waba_id, userId: user.id };

  try {
    switch (b.action) {
      case "send": {
        if (contact.opt_out && b.type === "template") return NextResponse.json({ error: "Contato pediu para não receber mensagens (opt-out)." }, { status: 400 });
        if (b.type === "text") {
          const body = String(b.body || "").trim();
          if (!body) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
          return NextResponse.json({ message: await sendText(s, { ...ctx, body }) });
        }
        if (b.type === "media") {
          return NextResponse.json({ message: await sendMedia(s, { ...ctx, kind: b.kind, mediaId: String(b.media_id), mime: b.mime, caption: b.caption, filename: b.filename }) });
        }
        if (b.type === "template") {
          const [t] = await query<{ components: any[] | null; language: string }>("select components, language from templates where id = $1", [String(b.template_id)]);
          const params: string[] = (b.params || []).map((x: any) => String(x ?? ""));
          const components: any[] = [];
          if (params.length) components.push({ type: "body", parameters: params.map((text) => ({ type: "text", text })) });
          if (b.header_media_id) components.unshift({ type: "header", parameters: [{ type: b.header_kind || "image", [b.header_kind || "image"]: { id: b.header_media_id } }] });
          else if (b.header_text) components.unshift({ type: "header", parameters: [{ type: "text", text: String(b.header_text) }] });
          // final do link dos botões de URL dinâmica ({{1}} no endereço)
          for (const bp of Array.isArray(b.button_params) ? b.button_params : []) {
            if (bp && String(bp.text ?? "").trim()) components.push({ type: "button", sub_type: "url", index: String(Number(bp.index) || 0), parameters: [{ type: "text", text: String(bp.text) }] });
          }
          const preview = renderTemplatePreview(t?.components, params);
          return NextResponse.json({ message: await sendTemplate(s, { ...ctx, template: { name: b.name, language: b.language || t?.language || "pt_BR", components, preview } }) });
        }
        return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
      }
      case "read": {
        await query("update conversations set unread_count = 0 where id = $1", [id]);
        const [last] = await query<{ wamid: string }>("select wamid from messages where conversation_id = $1 and direction = 'in' order by ts desc limit 1", [id]);
        if (last?.wamid && !last.wamid.startsWith("local.")) markRead(s, conv.phone_number_id, last.wamid);
        return NextResponse.json({ ok: true });
      }
      case "close":
        await query("update conversations set status = 'closed', closed_at = now(), unread_count = 0 where id = $1", [id]);
        await logEvent(id, "closed", user.id);
        return NextResponse.json({ ok: true });
      case "reopen":
        await query("update conversations set status = 'open', closed_at = null where id = $1", [id]);
        await logEvent(id, "reopened", user.id);
        return NextResponse.json({ ok: true });
      case "assign": {
        const uid = b.user_id ? Number(b.user_id) : null;
        if (!(await ownedBy(scope, "users", uid))) return notMine();
        await query("update conversations set assigned_user_id = $2 where id = $1", [id, uid]);
        await logEvent(id, "assigned", user.id, { user_id: uid });
        return NextResponse.json({ ok: true });
      }
      case "department": {
        const did = b.department_id ? Number(b.department_id) : null;
        if (!(await ownedBy(scope, "departments", did))) return notMine();
        await query("update conversations set department_id = $2 where id = $1", [id, did]);
        await logEvent(id, "department", user.id, { department_id: did });
        return NextResponse.json({ ok: true });
      }
      case "tags": {
        const ids: number[] = (b.tag_ids || []).map(Number).filter(Number.isInteger);
        for (const t of ids) if (!(await ownedBy(scope, "tags", t))) return notMine();
        if (scope.company) await query("delete from contact_tags where contact_id = $1 and tag_id in (select id from tags where company_id = $2)", [contact.id, scope.company.id]);
        else await query("delete from contact_tags where contact_id = $1", [contact.id]);
        for (const t of ids) await query("insert into contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing", [contact.id, t]);
        return NextResponse.json({ ok: true });
      }
      case "note": {
        const body = String(b.body || "").trim();
        if (!body) return NextResponse.json({ error: "Nota vazia" }, { status: 400 });
        const [note] = await query("insert into conversation_notes (conversation_id, user_id, body) values ($1, $2, $3) returning *", [id, user.id, body]);
        return NextResponse.json({ note: { ...note, user_name: user.name } });
      }
      case "contact": {
        // só muda o que veio no pedido (ex.: ligar o opt-out não apaga e-mail nem departamento)
        const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
        if (has("department_id") && !(await ownedBy(scope, "departments", b.department_id ? Number(b.department_id) : null))) return notMine();
        await query(
          `update contacts set
             name = case when $2 then nullif(trim($3), '') else name end,
             email = case when $4 then nullif(trim($5), '') else email end,
             fields = case when $6 then coalesce($7::jsonb, '{}'::jsonb) else fields end,
             department_id = case when $8 then $9::int else department_id end,
             opt_out = coalesce($10::boolean, opt_out),
             opt_out_at = case when $10::boolean = true and not opt_out then now() when $10::boolean = false then null else opt_out_at end,
             notes = case when $11 then $12 else notes end,
             updated_at = now()
           where id = $1`,
          [contact.id, has("name"), b.name ?? "", has("email"), b.email ?? "", has("fields"), b.fields ?? null,
            has("department_id"), b.department_id ? Number(b.department_id) : null, typeof b.opt_out === "boolean" ? b.opt_out : null, has("notes"), b.notes ?? null],
        );
        if (typeof b.opt_out === "boolean" && b.opt_out !== contact.opt_out) await logEvent(id, b.opt_out ? "opt_out" : "opt_in", user.id, { by: "atendente" });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha", details: e.details }, { status: 502 });
  }
}
