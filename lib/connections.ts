// Conexões: cada BM (portfólio) entra no HUB com o seu próprio token de usuário do sistema.
// Toda chamada à Graph API usa o token da conexão dona da conta (WABA) ou do número.
import { query } from "./db";
import { Graph, MetaError } from "./meta";
import type { Settings } from "./settings";

export type Visibility = "private" | "team";
export type Connection = {
  id: number; name: string; kind: string; business_id: string | null; business_name: string | null;
  token: string; app_id: string | null; app_secret: string | null; waba_ids: string | null;
  visibility: Visibility; active: boolean; status: string | null; last_error: string | null;
  last_sync_at: string | null; created_by: number | null; created_at: string; updated_at: string;
  /** Texto livre do Master para identificar do que se trata esta BM (aparece na Visão geral). */
  description?: string | null;
  /** Conexão de Equipe criada a partir de contas compartilhadas: usa (uma cópia d)o token desta conexão de origem. */
  source_connection_id?: number | null;
};

export const VISIBILITY_LABEL: Record<Visibility, string> = { private: "Só Master", team: "Equipe" };

export async function listConnections(): Promise<Connection[]> {
  try {
    return await query<Connection>("select * from connections order by visibility = 'private' desc, lower(name), id");
  } catch (e: any) {
    if (e?.code === "42P01") return []; // antes da migração
    throw e;
  }
}

export async function getConnection(id: number): Promise<Connection | null> {
  const [c] = await query<Connection>("select * from connections where id = $1", [id]);
  return c || null;
}

// cache curto (por instância) para não consultar o banco a cada envio
type Cached = { at: number; conn: Connection | null };
const TTL = 30_000;
const byPhone = new Map<string, Cached>();
const byWaba = new Map<string, Cached>();
export function forgetConnectionCache() { byPhone.clear(); byWaba.clear(); }

async function cached(map: Map<string, Cached>, key: string, load: () => Promise<Connection | null>) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.conn;
  const conn = await load().catch(() => null);
  map.set(key, { at: Date.now(), conn });
  return conn;
}

export function connectionForWaba(wabaId: string) {
  return cached(byWaba, wabaId, async () =>
    (await query<Connection>("select c.* from wabas w join connections c on c.id = w.connection_id where w.id = $1", [wabaId]))[0] || null);
}

export function connectionForPhone(phoneNumberId: string) {
  return cached(byPhone, phoneNumberId, async () =>
    (await query<Connection>("select c.* from phone_numbers p join wabas w on w.id = p.waba_id join connections c on c.id = w.connection_id where p.id = $1", [phoneNumberId]))[0] || null);
}

/** Graph com o token da conexão (ou o token antigo das Configurações, para contas ainda sem conexão). */
export function graphOf(s: Settings, conn: Connection | null, opts: { send?: boolean } = {}) {
  if (conn && !conn.active && opts.send) throw new MetaError(`A conexão "${conn.name}" está desligada no Ecossistema (Conexões).`);
  const token = conn?.token || s.meta_token;
  if (!token) throw new MetaError("Nenhum token configurado para esta conta. Cadastre a BM em Conexões.");
  return new Graph(token, s.graph_version || "v26.0");
}

export async function graphForPhone(s: Settings, phoneNumberId: string, opts: { send?: boolean } = {}) {
  return graphOf(s, await connectionForPhone(phoneNumberId), opts);
}

export async function graphForWaba(s: Settings, wabaId: string, opts: { send?: boolean } = {}) {
  return graphOf(s, await connectionForWaba(wabaId), opts);
}

/** App usado pelo token da conta (upload de exemplo de mídia dos templates precisa do mesmo app do token). */
export async function appIdForWaba(s: Settings, wabaId: string) {
  return (await connectionForWaba(wabaId))?.app_id || s.meta_app_id || null;
}
export async function appIdForPhone(s: Settings, phoneNumberId: string) {
  return (await connectionForPhone(phoneNumberId))?.app_id || s.meta_app_id || null;
}

/** Chaves secretas aceitas na assinatura do webhook: a do app principal e as dos apps próprios das conexões. */
export async function appSecrets(s: Settings): Promise<string[]> {
  const out = new Set<string>();
  if (s.meta_app_secret) out.add(s.meta_app_secret);
  try {
    for (const r of await query<{ app_secret: string }>("select distinct app_secret from connections where coalesce(app_secret, '') <> ''")) out.add(r.app_secret);
  } catch { /* tabela ainda não existe */ }
  return [...out];
}

/**
 * Conexões derivadas (criadas a partir de contas compartilhadas) acompanham as credenciais da conexão de origem:
 * o token e o app a que ele pertence (um token só funciona com o app em que foi gerado — upload de mídia e webhook).
 */
export async function propagateToken(sourceId: number) {
  const [src] = await query<{ token: string; app_id: string | null; app_secret: string | null }>("select token, app_id, app_secret from connections where id = $1", [sourceId]);
  if (!src?.token) return 0;
  const rows = await query<{ id: number }>(
    `update connections set token = $2, app_id = $3, app_secret = $4, updated_at = now()
     where source_connection_id = $1 and (token <> $2 or app_id is distinct from $3 or app_secret is distinct from $4) returning id`,
    [sourceId, src.token, src.app_id, src.app_secret],
  );
  if (rows.length) forgetConnectionCache();
  return rows.length;
}

/** Contas (WABA) de uma conexão: as que estão com ela no HUB mais as listadas em "Limitar contas". */
export async function wabaIdsOf(conn: Pick<Connection, "id" | "waba_ids">) {
  const rows = await query<{ id: string }>("select id from wabas where connection_id = $1", [conn.id]);
  return [...new Set([...rows.map((r) => r.id), ...(conn.waba_ids || "").split(",").map((x) => x.trim()).filter(Boolean)])];
}

/** "EAAG…a1b2" — nunca devolver o token inteiro para a tela. */
export const maskSecret = (v: string | null | undefined) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : "");
