import { createHmac, timingSafeEqual } from "node:crypto";
import { META_ERRORS, type EventoTemplateMeta, type QualidadeMeta, type Sinal, type TierMeta } from "./health";

/**
 * Webhook da WhatsApp Cloud API → sinais do motor de contingência.
 *
 * Só lê campos que a Meta controla; nunca aceita "tenant"/"cliente" do payload.
 * O app resolve o cliente pelo dado NOSSO (metaPhoneId, metaWabaId, metaTemplateId).
 * Campos desconhecidos são ignorados (a Meta acrescenta eventos com frequência).
 */

/** Confere `X-Hub-Signature-256: sha256=<hex>` sobre o corpo BRUTO, com o App Secret. */
export function assinaturaValida(corpoBruto: string | Uint8Array, cabecalho: string | null, appSecret: string): boolean {
  if (!cabecalho || !appSecret || !cabecalho.startsWith("sha256=")) return false;
  const recebido = Buffer.from(cabecalho.slice("sha256=".length), "hex");
  const esperado = createHmac("sha256", appSecret).update(corpoBruto).digest();
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

const TIERS = new Set<TierMeta>(["TIER_50", "TIER_250", "TIER_2K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED", "TIER_NOT_SET"]);
const QUALIDADES = new Set<QualidadeMeta>(["GREEN", "YELLOW", "RED", "UNKNOWN"]);
const EVENTOS_TEMPLATE = new Set<EventoTemplateMeta>(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "FLAGGED", "REINSTATED", "PENDING_DELETION"]);

export type Traducao = { sinais: Sinal[]; campos: string[]; ignorados: number };

export function traduzirWebhook(payload: unknown): Traducao {
  const out: Traducao = { sinais: [], campos: [], ignorados: 0 };
  const raiz = obj(payload);
  if (raiz.object !== "whatsapp_business_account") return out;

  for (const entrada of arr(raiz.entry)) {
    const e = obj(entrada);
    const metaWabaId = str(e.id);
    for (const mudanca of arr(e.changes)) {
      const c = obj(mudanca);
      const campo = str(c.field) ?? "";
      const v = obj(c.value);
      if (campo && !out.campos.includes(campo)) out.campos.push(campo);
      const antes = out.sinais.length;

      switch (campo) {
        case "phone_number_quality_update": {
          // Desde out/2025 traz o limite do PORTFÓLIO; current_limit sai em fev/2026.
          const tier = str(v.max_daily_conversations_per_business) ?? str(v.current_limit);
          if (metaWabaId && tier && TIERS.has(tier as TierMeta)) out.sinais.push({ tipo: "limite", bm: { metaWabaId }, tier: tier as TierMeta });
          break;
        }
        case "account_update": {
          if (!metaWabaId) break;
          const evento = str(v.event);
          if (evento === "DISABLED_UPDATE") {
            const estado = str(obj(v.ban_info).waba_ban_state);
            if (estado === "DISABLE" || estado === "REINSTATE" || estado === "SCHEDULE_FOR_DISABLE") {
              out.sinais.push({ tipo: "conta", bm: { metaWabaId }, evento: estado, detalhe: str(obj(v.ban_info).waba_ban_date) });
            }
          } else if (evento === "ACCOUNT_RESTRICTION") {
            const tipos = arr(v.restriction_info).map((r) => str(obj(r).restriction_type)).filter(Boolean);
            // Só restrições de MENSAGEM param o envio; as de chamada/telefone viram alerta.
            const paraMensagens = tipos.some((t) => t === "RESTRICTED_BIZ_INITIATED_MESSAGING" || t === "RESTRICTED_CUSTOMER_INITIATED_MESSAGING");
            out.sinais.push(
              paraMensagens
                ? { tipo: "conta", bm: { metaWabaId }, evento: "RESTRICTION", detalhe: tipos.join(", ") }
                : { tipo: "conta", bm: { metaWabaId }, evento: "VIOLATION", detalhe: `restrição: ${tipos.join(", ")}` },
            );
          } else if (evento === "ACCOUNT_VIOLATION") {
            out.sinais.push({ tipo: "conta", bm: { metaWabaId }, evento: "VIOLATION", detalhe: str(obj(v.violation_info).violation_type) });
          }
          break;
        }
        case "message_template_status_update": {
          const evento = str(v.event);
          const metaTemplateId = str(v.message_template_id);
          if (evento && EVENTOS_TEMPLATE.has(evento as EventoTemplateMeta) && metaTemplateId) {
            out.sinais.push({
              tipo: "template_status",
              template: { metaTemplateId, nome: str(v.message_template_name), idioma: str(v.message_template_language) },
              bm: metaWabaId ? { metaWabaId } : undefined,
              evento: evento as EventoTemplateMeta,
              motivo: str(v.reason) === "NONE" ? undefined : str(v.reason),
            });
          }
          break;
        }
        case "message_template_quality_update": {
          const para = str(v.new_quality_score);
          const de = str(v.previous_quality_score);
          const metaTemplateId = str(v.message_template_id);
          if (para && QUALIDADES.has(para as QualidadeMeta) && metaTemplateId) {
            out.sinais.push({
              tipo: "template_qualidade",
              template: { metaTemplateId, nome: str(v.message_template_name), idioma: str(v.message_template_language) },
              bm: metaWabaId ? { metaWabaId } : undefined,
              para: para as QualidadeMeta,
              de: de && QUALIDADES.has(de as QualidadeMeta) ? (de as QualidadeMeta) : undefined,
            });
          }
          break;
        }
        case "messages": {
          // Mensagens recebidas são do módulo Disparos; aqui só falhas de envio que importam à contingência.
          const metaPhoneId = str(obj(v.metadata).phone_number_id);
          if (!metaPhoneId) break;
          for (const st of arr(v.statuses)) {
            const s = obj(st);
            if (s.status !== "failed") continue;
            for (const er of arr(s.errors)) {
              const codigo = Number(obj(er).code);
              if (Number.isFinite(codigo) && META_ERRORS[codigo]) {
                out.sinais.push({ tipo: "erro", numero: { metaPhoneId }, codigo, wamid: str(s.id) });
              }
            }
          }
          break;
        }
        default:
          break;
      }
      if (out.sinais.length === antes) out.ignorados++;
    }
  }
  return out;
}

/** Resposta da Graph API GET /{phone_number_id}?fields=quality_rating → sinal (consulta periódica). */
export function sinalDeQualidadeConsultada(metaPhoneId: string, resposta: unknown): Sinal | null {
  const q = str(obj(resposta).quality_rating);
  if (!q || !QUALIDADES.has(q as QualidadeMeta)) return null;
  return { tipo: "qualidade", numero: { metaPhoneId }, para: q as QualidadeMeta };
}
