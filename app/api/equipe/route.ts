import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { ASSIGNABLE_ROLES, isAdminRole, isManagerRole, isMaster } from "@/lib/roles";
import { canSee, getScope } from "@/lib/access";
import { isEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** Administração: usuários, departamentos, tags, listas e respostas rápidas. */
export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const admin = isAdminRole(r.user.role);
  const manager = isManagerRole(r.user.role);
  const master = isMaster(r.user.role);
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  // o Master é o dono do sistema: só ele mesmo altera o próprio cadastro, e ninguém vira Master por aqui
  const target = async (id: number) => (await query<{ id: number; role: string }>("select id, role from users where id = $1", [id]))[0] || null;
  const listOk = async (id: number) => {
    const [l] = await query<{ waba_id: string | null }>("select waba_id from lists where id = $1", [id]);
    return !!l && (!l.waba_id || canSee(await getScope(r.user), l.waba_id));
  };

  try {
    switch (b.action) {
      // ---- usuários (admin) ----
      case "user_save": {
        if (!admin) return bad("Apenas administradores", 403);
        const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase();
        let role: string = (ASSIGNABLE_ROLES as string[]).includes(b.role) ? b.role : "atendente";
        const dep = b.department_id ? Number(b.department_id) : null;
        const recovery = String(b.recovery_email || "").trim().toLowerCase() || null;
        if (!name || !email) return bad("Nome e e-mail são obrigatórios");
        if (recovery && !isEmail(recovery)) return bad("E-mail de recuperação inválido");
        if (b.id) {
          const t0 = await target(Number(b.id));
          if (!t0) return bad("Usuário não encontrado", 404);
          if (isMaster(t0.role)) {
            if (!master) return bad("O usuário Master só pode ser alterado por ele mesmo", 403);
            role = "master"; // o Master não perde o próprio papel
          }
          if (Number(b.id) === r.user.id && !isMaster(t0.role) && !isAdminRole(role)) return bad("Você não pode tirar o seu próprio acesso de administrador");
          await query("update users set name = $2, email = $3, role = $4, department_id = $5, recovery_email = $6 where id = $1", [Number(b.id), name, email, role, dep, recovery]);
          if (b.password) {
            if (String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
            await query("update users set password_hash = $2 where id = $1", [Number(b.id), hashPassword(String(b.password))]);
          }
          return NextResponse.json({ ok: true });
        }
        if (!b.password || String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
        const [u] = await query("insert into users (name, email, password_hash, role, department_id, recovery_email) values ($1, $2, $3, $4, $5, $6) returning id", [name, email, hashPassword(String(b.password)), role, dep, recovery]);
        return NextResponse.json({ ok: true, id: u.id });
      }
      case "user_active": {
        if (!admin) return bad("Apenas administradores", 403);
        if (Number(b.id) === r.user.id) return bad("Você não pode desativar a si mesmo");
        const t1 = await target(Number(b.id));
        if (!t1) return bad("Usuário não encontrado", 404);
        if (isMaster(t1.role)) return bad("O usuário Master não pode ser desativado", 403);
        await query("update users set active = $2 where id = $1", [Number(b.id), Boolean(b.active)]);
        return NextResponse.json({ ok: true });
      }
      case "my_password": {
        if (!b.password || String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
        await query("update users set password_hash = $2 where id = $1", [r.user.id, hashPassword(String(b.password))]);
        return NextResponse.json({ ok: true, relogin: true });
      }
      // ---- departamentos (gestor+) ----
      case "department_save": {
        if (!manager) return bad("Sem permissão", 403);
        const name = String(b.name || "").trim(); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update departments set name = $2, color = $3 where id = $1", [Number(b.id), name, b.color || null]);
        else await query("insert into departments (name, color) values ($1, $2) on conflict do nothing", [name, b.color || null]);
        return NextResponse.json({ ok: true });
      }
      case "department_delete": {
        if (!manager) return bad("Sem permissão", 403);
        await query("update conversations set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update contacts set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update users set department_id = null where department_id = $1", [Number(b.id)]);
        await query("delete from departments where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      // ---- tags ----
      case "tag_save": {
        const name = String(b.name || "").trim(); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update tags set name = $2, color = $3 where id = $1", [Number(b.id), name, b.color || null]);
        else await query("insert into tags (name, color) values ($1, $2) on conflict do nothing", [name, b.color || null]);
        return NextResponse.json({ ok: true });
      }
      case "tag_delete": {
        if (!manager) return bad("Sem permissão", 403);
        await query("delete from contact_tags where tag_id = $1", [Number(b.id)]);
        await query("delete from tags where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      // ---- listas ----
      case "list_save": {
        const name = String(b.name || "").trim(); if (!name) return bad("Nome obrigatório");
        if (b.id && !(await listOk(Number(b.id)))) return bad("Lista não encontrada", 404);
        if (!b.id && b.waba_id && !canSee(await getScope(r.user), String(b.waba_id))) return bad("Conta não encontrada", 404);
        if (b.id) await query("update lists set name = $2, description = $3 where id = $1", [Number(b.id), name, b.description || null]);
        else await query("insert into lists (name, description, waba_id) values ($1, $2, $3)", [name, b.description || null, b.waba_id || null]);
        return NextResponse.json({ ok: true });
      }
      case "list_delete": {
        if (!manager) return bad("Sem permissão", 403);
        if (!(await listOk(Number(b.id)))) return bad("Lista não encontrada", 404);
        await query("delete from list_contacts where list_id = $1", [Number(b.id)]);
        await query("delete from lists where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      // ---- respostas rápidas ----
      case "quick_save": {
        const title = String(b.title || "").trim(), body = String(b.body || "").trim();
        if (!title || !body) return bad("Título e texto são obrigatórios");
        const dep = b.department_id ? Number(b.department_id) : null;
        const shortcut = String(b.shortcut || "").trim().toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_-]/g, "").slice(0, 24) || null;
        if (b.id) await query("update quick_replies set title = $2, body = $3, department_id = $4, shortcut = $5 where id = $1 and company_id is null", [Number(b.id), title, body, dep, shortcut]);
        else await query("insert into quick_replies (title, body, department_id, shortcut) values ($1, $2, $3, $4)", [title, body, dep, shortcut]);
        return NextResponse.json({ ok: true });
      }
      case "quick_delete":
        await query("delete from quick_replies where id = $1 and company_id is null", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      default:
        return bad("Ação inválida");
    }
  } catch (e: any) {
    if (e?.code === "23505") return bad("Já existe um registro com esse nome/e-mail");
    return bad(e.message || "Falha", 500);
  }
}
