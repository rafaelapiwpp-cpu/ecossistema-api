// Teleentrega da empresa: faixas de CEP, custo por km e texto do atalho.
// GET  ?company=slug            → { company, zones, settings, canEdit } (equipe informa a empresa; cliente usa a dele)
// POST JSON { company, action } → zone_save, zone_delete, zones_clear, settings_save, import_apply { zones, mode: "replace"|"append" }
// POST multipart (company, file) → prévia da importação: { zones, km_price, min_cost, ignored, kind }
// Só funciona com o recurso "Teleentrega" ligado para a empresa (Configurações → Empresas). Quem edita: lib/delivery.canEditDelivery.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { companyBySlug, companyById, type Company } from "@/lib/access";
import { hasFeature } from "@/lib/companies";
import { canEditDelivery, cleanZone, parseMoney, DEFAULT_MESSAGE, MAX_ZONES, type DeliverySettings, type Zone } from "@/lib/delivery";
import { MAX_FILE_BYTES, parseDeliveryFile } from "@/lib/delivery-files";

export const dynamic = "force-dynamic";

const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });

/** Empresa do usuário-cliente — ou, para a equipe, a informada pelo slug (ou id, vindo do Atendimento do HUB). */
async function resolveCompany(user: { role: string; company_id?: number | null }, ref: string | null): Promise<Company | null | "off"> {
  let c: Company | null = null;
  if (user.company_id) c = await companyById(user.company_id);
  else if (ref && /^\d+$/.test(ref)) c = await companyById(Number(ref));
  else if (ref) c = await companyBySlug(ref);
  if (!c || !c.active) return null;
  return hasFeature(c, "teleentrega") ? c : "off";
}

async function load(companyId: number) {
  const [zones, s] = await Promise.all([
    query<Zone>("select id, name, cep_start, cep_end, cost::float8 as cost, position from delivery_zones where company_id = $1 order by position, id", [companyId]),
    query<DeliverySettings>("select km_price::float8 as km_price, min_cost::float8 as min_cost, note, message from delivery_settings where company_id = $1", [companyId]),
  ]);
  return { zones, settings: s[0] || { km_price: null, min_cost: null, note: null, message: null } };
}

export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const company = await resolveCompany(r.user, new URL(req.url).searchParams.get("company"));
  if (company === "off") return bad("A tele-entrega não está ligada para esta empresa", 404);
  if (!company) return bad("Empresa não encontrada", 404);
  const data = await load(company.id);
  return NextResponse.json({ company: { id: company.id, name: company.name, slug: company.slug }, ...data, canEdit: canEditDelivery(r.user.role), defaultMessage: DEFAULT_MESSAGE });
}

export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  if (!canEditDelivery(r.user.role)) return bad("Só a empresa e a equipe (gestor ou acima) alteram a tele-entrega", 403);
  const multipart = (req.headers.get("content-type") || "").includes("multipart/form-data");
  let b: any = {}, file: File | null = null;
  if (multipart) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return bad("Arquivo inválido");
    b = { company: fd.get("company"), action: "import_preview" };
    const f = fd.get("file");
    file = f instanceof File ? f : null;
  } else b = await req.json().catch(() => ({}));
  const company = await resolveCompany(r.user, b.company ? String(b.company) : null);
  if (company === "off") return bad("A tele-entrega não está ligada para esta empresa", 404);
  if (!company) return bad("Empresa não encontrada", 404);
  const cid = company.id;
  try {
    switch (b.action) {
      case "zone_save": {
        const z = cleanZone({ name: b.name, cep_start: b.cep_start, cep_end: b.cep_end, cost: b.cost });
        if ("error" in z) return bad(z.error);
        if (b.id) {
          const [row] = await query("update delivery_zones set name = $3, cep_start = $4, cep_end = $5, cost = $6, updated_at = now() where id = $1 and company_id = $2 returning id", [Number(b.id), cid, z.ok.name, z.ok.cep_start, z.ok.cep_end, z.ok.cost]);
          if (!row) return bad("Faixa não encontrada", 404);
          return NextResponse.json({ ok: true, id: row.id });
        }
        const [{ n }] = await query<{ n: number }>("select count(*)::int as n from delivery_zones where company_id = $1", [cid]);
        if (n >= MAX_ZONES) return bad(`Limite de ${MAX_ZONES} faixas`);
        const [row] = await query("insert into delivery_zones (company_id, name, cep_start, cep_end, cost, position) values ($1, $2, $3, $4, $5, $6) returning id", [cid, z.ok.name, z.ok.cep_start, z.ok.cep_end, z.ok.cost, n]);
        return NextResponse.json({ ok: true, id: row.id });
      }
      case "zone_delete": {
        await query("delete from delivery_zones where id = $1 and company_id = $2", [Number(b.id), cid]);
        return NextResponse.json({ ok: true });
      }
      case "zones_clear": {
        await query("delete from delivery_zones where company_id = $1", [cid]);
        return NextResponse.json({ ok: true });
      }
      case "settings_save": {
        const km = b.km_price == null || b.km_price === "" ? null : parseMoney(b.km_price);
        const min = b.min_cost == null || b.min_cost === "" ? null : parseMoney(b.min_cost);
        if (km === null && b.km_price) return bad("Valor por km inválido (ex.: 2,50)");
        if (min === null && b.min_cost) return bad("Valor mínimo inválido (ex.: 6,00)");
        const note = String(b.note ?? "").trim().slice(0, 300) || null;
        const message = String(b.message ?? "").trim().slice(0, 300) || null;
        await query(`insert into delivery_settings (company_id, km_price, min_cost, note, message) values ($1, $2, $3, $4, $5)
          on conflict (company_id) do update set km_price = excluded.km_price, min_cost = excluded.min_cost, note = excluded.note, message = excluded.message, updated_at = now()`, [cid, km, min, note, message]);
        return NextResponse.json({ ok: true });
      }
      case "import_preview": {
        if (!file) return bad("Envie um arquivo TXT, CSV, planilha (XLSX) ou PDF");
        if (file.size > MAX_FILE_BYTES) return bad("Arquivo muito grande (máximo 3 MB)");
        const parsed = await parseDeliveryFile(file.name, Buffer.from(await file.arrayBuffer()));
        if (!parsed.zones.length && parsed.km_price == null && parsed.min_cost == null) return bad("Não encontrei faixas neste arquivo. Cada linha precisa ter o CEP inicial, o CEP final (ou o bairro) e o valor.");
        return NextResponse.json(parsed);
      }
      case "import_apply": {
        const mode = b.mode === "replace" ? "replace" : "append";
        const items = Array.isArray(b.zones) ? b.zones.slice(0, MAX_ZONES) : [];
        const clean = [];
        for (const it of items) { const z = cleanZone(it); if ("ok" in z) clean.push(z.ok); }
        if (!clean.length && b.km_price == null && b.min_cost == null) return bad("Nenhuma faixa válida para salvar");
        if (mode === "replace") await query("delete from delivery_zones where company_id = $1", [cid]);
        const [{ n }] = await query<{ n: number }>("select count(*)::int as n from delivery_zones where company_id = $1", [cid]);
        if (n + clean.length > MAX_ZONES) return bad(`Limite de ${MAX_ZONES} faixas`);
        for (let i = 0; i < clean.length; i++) {
          const z = clean[i];
          await query("insert into delivery_zones (company_id, name, cep_start, cep_end, cost, position) values ($1, $2, $3, $4, $5, $6)", [cid, z.name, z.cep_start, z.cep_end, z.cost, n + i]);
        }
        const km = b.km_price == null ? null : parseMoney(b.km_price), min = b.min_cost == null ? null : parseMoney(b.min_cost);
        if (km != null || min != null) {
          await query(`insert into delivery_settings (company_id, km_price, min_cost) values ($1, $2, $3)
            on conflict (company_id) do update set km_price = coalesce(excluded.km_price, delivery_settings.km_price), min_cost = coalesce(excluded.min_cost, delivery_settings.min_cost), updated_at = now()`, [cid, km, min]);
        }
        return NextResponse.json({ ok: true, saved: clean.length });
      }
      default: return bad("Ação desconhecida");
    }
  } catch (e: any) {
    return bad(e?.message || "Erro ao salvar", 500);
  }
}
