// Perfil comercial dos números (foto, descrição, endereço, e-mail, site) — lido e gravado direto na Meta.
// Também: marcar/desmarcar um número (conta) como importante — a estrela fixada na Visão geral.
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/guard";
import { query } from "@/lib/db";
import { canSee, getScope } from "@/lib/access";
import { isAdminRole } from "@/lib/roles";
import { appIdForPhone, graphForPhone } from "@/lib/connections";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";
const VERTICALS = ["UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ"];

/** O número existe e é de uma conta que este usuário pode ver. */
async function allowed(user: { role: string }, pnid: string) {
  const [p] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pnid]);
  return !!p && canSee(await getScope(user), p.waba_id);
}

export async function GET(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const pnid = new URL(req.url).searchParams.get("phone_number_id") || "";
  if (!(await allowed(r.user, pnid))) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
  try {
    const g = await graphForPhone(r.s, pnid);
    const out = await g.get<{ data: any[] }>(`${pnid}/whatsapp_business_profile`, { fields: FIELDS });
    const profile = out.data?.[0] || {};
    // aproveita para guardar a foto (o Início dos portais usa a cópia do banco)
    await query("update phone_numbers set profile_picture_url = $2, profile_picture_at = now() where id = $1", [pnid, profile.profile_picture_url || null]).catch(() => {});
    return NextResponse.json({ profile });
  } catch (e: any) { return NextResponse.json({ error: e.message, details: e.details }, { status: 502 }); }
}

export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  if (r.user.role === "atendente") return NextResponse.json({ error: "Apenas administradores e gestores" }, { status: 403 });
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      // foto de perfil: upload retomável → handle → perfil
      const fd = await req.formData();
      const file = fd.get("file");
      const pnid = String(fd.get("phone_number_id") || "");
      if (!(file instanceof File) || !(await allowed(r.user, pnid))) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
      if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Foto acima de 5 MB" }, { status: 400 });
      const appId = await appIdForPhone(r.s, pnid);
      if (!appId) return NextResponse.json({ error: "ID do app da Meta não configurado" }, { status: 400 });
      const g = await graphForPhone(r.s, pnid);
      const handle = await g.uploadHandle(appId, await file.arrayBuffer(), file.type || "image/jpeg", file.name);
      await g.json(`${pnid}/whatsapp_business_profile`, { messaging_product: "whatsapp", profile_picture_handle: handle });
      await query("update phone_numbers set profile_picture_at = null where id = $1", [pnid]).catch(() => {}); // foto nova: o Início busca de novo
      return NextResponse.json({ ok: true });
    }
    const b = await req.json().catch(() => ({}));

    // ---- acompanhar na Visão geral: lista pessoal de quem acessa Conexões (gestor+), números do próprio escopo ----
    if (b.action === "watch") {
      const id = String(b.id || b.phone_number_id || "");
      if (!id || !(await allowed(r.user, id))) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
      if (b.watched) await query("insert into user_watch_phones (user_id, phone_number_id) values ($1, $2) on conflict do nothing", [r.user.id, id]);
      else await query("delete from user_watch_phones where user_id = $1 and phone_number_id = $2", [r.user.id, id]);
      return NextResponse.json({ ok: true, watched: Boolean(b.watched) });
    }

    // ---- estrela: marcar/desmarcar número importante (só Master/Admin; só números do próprio escopo) ----
    if (b.action === "featured") {
      if (!isAdminRole(r.user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      const id = String(b.id || b.phone_number_id || "");
      if (!id || !(await allowed(r.user, id))) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
      const featured = Boolean(b.featured);
      await query("update phone_numbers set featured = $2 where id = $1", [id, featured]);
      return NextResponse.json({ ok: true, featured });
    }

    // ---- perfil comercial (texto) ----
    const pnid = String(b.phone_number_id || "");
    if (!(await allowed(r.user, pnid))) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
    const g = await graphForPhone(r.s, pnid);
    const payload: any = { messaging_product: "whatsapp" };
    for (const k of ["about", "address", "description", "email"]) if (typeof b[k] === "string") payload[k] = b[k].trim();
    if (Array.isArray(b.websites)) payload.websites = b.websites.map((w: any) => String(w).trim()).filter(Boolean).slice(0, 2);
    if (VERTICALS.includes(b.vertical)) payload.vertical = b.vertical;
    if (payload.about && payload.about.length > 139) return NextResponse.json({ error: "Recado (about): até 139 caracteres" }, { status: 400 });
    if (payload.description && payload.description.length > 512) return NextResponse.json({ error: "Descrição: até 512 caracteres" }, { status: 400 });
    await g.json(`${pnid}/whatsapp_business_profile`, payload);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message, details: e.details }, { status: e.code ? 502 : 500 }); }
}
