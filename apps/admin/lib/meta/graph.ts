/**
 * Cliente mínimo da Graph API para LEITURA da contingência (BM, WABAs, números,
 * templates) e para assinar os webhooks de uma WABA. Não envia mensagens:
 * envio é do módulo Disparos e só acontece com WHATSAPP_PROVIDER=meta.
 *
 * O token nunca sai do servidor e nunca é gravado no banco (vem de env).
 */
import { GRAPH_VERSION as DISPAROS_GRAPH_VERSION } from "@/lib/disparos/whatsapp/meta-cloud";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || DISPAROS_GRAPH_VERSION;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly httpStatus: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
  /** Token inválido/expirado/sem permissão: nada a fazer até trocar o token. */
  get isAuth() {
    return this.code === 190 || this.code === 102 || this.code === 10 || (this.code >= 200 && this.code < 300);
  }
  /** Campo pedido não existe nesta versão/objeto (ex.: health_status em conta antiga). */
  get isUnknownField() {
    return this.code === 100 && /field|nonexisting|tried accessing/i.test(this.message);
  }
}

export interface GraphClient {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  /** Segue `paging.next` até acabar (com teto, para não girar para sempre). */
  getAll<T>(path: string, params?: Record<string, string>): Promise<T[]>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<T>;
}

export function createGraphClient(opts: { token: string; fetchImpl?: typeof fetch; version?: string }): GraphClient {
  const f = opts.fetchImpl ?? fetch;
  const base = `https://graph.facebook.com/${opts.version ?? GRAPH_VERSION}`;
  const headers = { Authorization: `Bearer ${opts.token}` };

  const parse = async <T>(res: Response): Promise<T> => {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      throw new GraphError(e.message ?? `HTTP ${res.status}`, e.code ?? res.status, res.status, e.error_subcode);
    }
    return json;
  };

  const url = (path: string, params?: Record<string, string>) => {
    const u = new URL(path.startsWith("http") ? path : `${base}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
    return u.toString();
  };

  return {
    get: async (path, params) => parse(await f(url(path, params), { headers, cache: "no-store" })),
    getAll: async <T>(path: string, params?: Record<string, string>) => {
      const out: T[] = [];
      let next: string | undefined = url(path, { limit: "100", ...params });
      for (let page = 0; next && page < 50; page++) {
        const json: { data?: T[]; paging?: { next?: string } } = await parse(await f(next, { headers, cache: "no-store" }));
        out.push(...(json.data ?? []));
        next = json.paging?.next;
      }
      return out;
    },
    post: async (path, body) =>
      parse(
        await f(url(path), {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
          cache: "no-store",
        }),
      ),
  };
}

/* ---------------- Formato das respostas da Meta (só o que lemos) ---------------- */

export interface MetaHealthError {
  error_code?: number;
  error_description?: string;
  possible_solution?: string;
}
export interface MetaHealthEntity {
  entity_type?: string; // PHONE_NUMBER | WABA | BUSINESS | APP | MESSAGE_TEMPLATE
  id?: string;
  can_send_message?: string; // AVAILABLE | LIMITED | BLOCKED
  errors?: MetaHealthError[];
  additional_info?: string[];
}
export interface MetaHealthStatus {
  can_send_message?: string;
  entities?: MetaHealthEntity[];
}

export interface MetaBusiness {
  id: string;
  name?: string;
  verification_status?: string; // verified | not_verified | pending | rejected | failed…
}

export interface MetaWaba {
  id: string;
  name?: string;
  account_review_status?: string; // APPROVED | PENDING | REJECTED
  health_status?: MetaHealthStatus;
}

export interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string; // GREEN | YELLOW | RED | NA | UNKNOWN
  status?: string; // CONNECTED | PENDING | FLAGGED | RESTRICTED | RATE_LIMITED | BANNED | DISCONNECTED | DELETED | MIGRATED | UNVERIFIED
  name_status?: string;
  code_verification_status?: string;
  messaging_limit_tier?: string;
  whatsapp_business_manager_messaging_limit?: string;
  throughput?: { level?: string };
  platform_type?: string;
  is_official_business_account?: boolean;
  health_status?: MetaHealthStatus;
}

export interface MetaTemplateComponent {
  type: string; // HEADER | BODY | FOOTER | BUTTONS
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

export interface MetaTemplate {
  id: string;
  name: string;
  status?: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED | IN_APPEAL | ARCHIVED | DELETED | PENDING_DELETION | LIMIT_EXCEEDED
  category?: string; // MARKETING | UTILITY | AUTHENTICATION
  language?: string;
  quality_score?: { score?: string; date?: number };
  rejected_reason?: string;
  components?: MetaTemplateComponent[];
}

export const PHONE_FIELDS_FULL =
  "id,display_phone_number,verified_name,quality_rating,status,name_status,code_verification_status,messaging_limit_tier,whatsapp_business_manager_messaging_limit,throughput,platform_type,is_official_business_account,health_status";
/** Fallback se a versão/conta não aceitar algum campo novo. */
export const PHONE_FIELDS_BASIC = "id,display_phone_number,verified_name,quality_rating,status,name_status,messaging_limit_tier,throughput";
export const TEMPLATE_FIELDS = "id,name,status,category,language,quality_score,rejected_reason,components";
