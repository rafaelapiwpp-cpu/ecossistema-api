// Templates: criação, exclusão e upload do exemplo de mídia (a Meta analisa e aprova em minutos a horas).
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { enableTemplateInsights } from "@/lib/sync";
import { canSee, getScope, scopeSql, whereOf } from "@/lib/access";
import { appIdForWaba, graphForWaba, graphOf } from "@/lib/connections";
import { isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAME_RE = /^[a-z0-9_]{1,512}$/;

export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const { s, user } = r;
  if (user.role === "atendente") return NextResponse.json({ error: "Apenas administradores e gestores" }, { status: 403 });
  const scope = await getScope(user);
  const denied = () => NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      // exemplo de mídia do cabeçalho
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
      if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Arquivo acima de 15 MB" }, { status: 400 });
      // o exemplo precisa subir com o token (e o app) da BM onde o template será criado
      const wabaId = String(fd.get("waba_id") || "") || (scope.all ? "" : scope.wabas[0] || "");
      if (wabaId && !canSee(scope, wabaId)) return denied();
      const appId = wabaId ? await appIdForWaba(s, wabaId) : s.meta_app_id;
      if (!appId) return NextResponse.json({ error: "ID do app da Meta não configurado (Configurações)" }, { status: 400 });
      const g = wabaId ? await graphForWaba(s, wabaId) : graphOf(s, null);
      const handle = await g.uploadHandle(appId, await file.arrayBuffer(), file.type || "application/octet-stream", file.name);
      return NextResponse.json({ handle, filename: file.name });
    }

    const b = await req.json().catch(() => ({}));
    if (b.action === "enable_insights") {
      // métricas da Meta por template (envios, entregas, leituras, cliques, custo) — a Meta não permite desligar depois
      if (!isAdminRole(user.role)) return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });
      await query("update settings set insights_enabled = true, updated_at = now() where id = 1");
      const args: any[] = [];
      const wabas = await query<{ id: string }>(`select id from wabas ${whereOf(["coalesce(insights, false) = false", scopeSql(scope, "id", args)])}`, args);
      const log = await enableTemplateInsights(s, wabas.map((w) => w.id), 90);
      return NextResponse.json({ ok: log.every((l) => l.ok), log });
    }
    if (b.action === "refresh_metrics") {
      const args: any[] = [];
      const wabas = await query<{ id: string }>(`select id from wabas ${whereOf([scopeSql(scope, "id", args)])}`, args);
      const log = await enableTemplateInsights(s, wabas.map((w) => w.id), 90);
      return NextResponse.json({ ok: log.every((l) => l.ok), log });
    }
    if (b.action === "create") {
      const name = String(b.name || "").trim().toLowerCase();
      if (!NAME_RE.test(name)) return NextResponse.json({ error: "Nome inválido: use só letras minúsculas, números e _ (ex.: promo_outubro)" }, { status: 400 });
      const wabaId = String(b.waba_id || "");
      const [w] = await query("select id from wabas where id = $1", [wabaId]);
      if (!w || !canSee(scope, wabaId)) return denied();
      const g = await graphForWaba(s, wabaId);
      const category = ["MARKETING", "UTILITY"].includes(b.category) ? b.category : "MARKETING";
      const language = String(b.language || "pt_BR");
      const components = Array.isArray(b.components) ? b.components : [];
      const body = components.find((c: any) => c?.type === "BODY");
      if (!body?.text?.trim()) return NextResponse.json({ error: "O corpo da mensagem é obrigatório" }, { status: 400 });
      const payload: any = { name, language, category, components };
      if (b.allow_category_change) payload.allow_category_change = true;
      const out = await g.json<{ id: string; status: string; category: string }>(`${wabaId}/message_templates`, payload);
      await query(
        `insert into templates (id, waba_id, name, language, category, status, components, updated_at) values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (id) do update set status = excluded.status, category = excluded.category, components = excluded.components, updated_at = now()`,
        [String(out.id), wabaId, name, language, out.category || category, out.status || "PENDING", components],
      );
      return NextResponse.json({ ok: true, id: out.id, status: out.status, category: out.category });
    }

    if (b.action === "delete") {
      const name = String(b.name || "");
      const wabaId = String(b.waba_id || "");
      if (!NAME_RE.test(name) || !wabaId) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
      if (!canSee(scope, wabaId)) return denied();
      const g = await graphForWaba(s, wabaId);
      const inUse = await query("select count(*)::int as n from campaigns where waba_id = $1 and template_name = $2 and status in ('draft', 'scheduled', 'running', 'paused')", [wabaId, name]);
      if (inUse[0]?.n) return NextResponse.json({ error: "Há disparos pendentes usando este template" }, { status: 400 });
      await g.delete(`${wabaId}/message_templates`, { name });
      await query("delete from templates where waba_id = $1 and name = $2", [wabaId, name]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro", details: e.details }, { status: e.code ? 502 : 500 });
  }
}
