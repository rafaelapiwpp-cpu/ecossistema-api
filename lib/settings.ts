import { hasDb, query } from "./db";
import { migrateOnce } from "./schema";
import { isSealed, seal, secretsEnabled, unseal } from "./secrets";

export type Settings = {
  id: number;
  password_hash: string;
  session_secret: string;
  meta_token: string;
  meta_app_secret: string;
  meta_business_id: string;
  meta_app_id: string | null;
  meta_waba_ids: string | null;
  webhook_verify_token: string;
  cron_secret: string;
  graph_version: string;
  insights_enabled: boolean;
  schema_version: number;
  optout_keywords: string;
  optin_keywords: string;
  optout_reply: string;
  autoclose_days: number;
  meta_business_name: string | null;
  mail_from?: string | null;
  mail_user?: string | null;
  mail_pass?: string | null;
  mail_host?: string | null;
  mail_port?: number | null;
  created_at: string;
  updated_at: string;
};

// Sem BM/app pré-preenchidos: cada instalação informa o próprio portfólio e o próprio app da Meta no /setup.
export const DEFAULTS = { meta_business_id: "", meta_app_id: "", graph_version: "v26.0" };

/** null = banco vazio (primeira abertura) ou sem banco. */
export async function getSettings(): Promise<Settings | null> {
  if (!hasDb()) return null;
  try {
    await migrateOnce();
    await encryptAtRestOnce();
    const rows = await query<Settings>("select * from settings where id = 1");
    const s = rows[0];
    if (!s) return null;
    return { ...s, meta_token: unseal(s.meta_token), meta_app_secret: unseal(s.meta_app_secret), mail_pass: unseal(s.mail_pass) };
  } catch (e: any) {
    if (e?.code === "42P01") return null; // tabela ainda não existe
    throw e;
  }
}

export const keywordList = (s: string | null | undefined) =>
  (s || "").split(",").map((k) => k.trim().toUpperCase()).filter(Boolean);

let sealing: Promise<void> | null = null;
/**
 * Com SECRETS_KEY definida, cifra no banco os segredos que ainda estão em texto puro (instalações antigas ou
 * gravados antes da chave existir). Roda uma vez por instância; falha não derruba a tela (tenta de novo depois).
 */
function encryptAtRestOnce() {
  if (!secretsEnabled()) return Promise.resolve();
  if (!sealing) {
    sealing = (async () => {
      const [s] = await query<{ meta_token: string | null; meta_app_secret: string | null; mail_pass: string | null }>(
        "select meta_token, meta_app_secret, mail_pass from settings where id = 1");
      if (s && [s.meta_token, s.meta_app_secret, s.mail_pass].some((v) => v && !isSealed(v))) {
        await query("update settings set meta_token = $1, meta_app_secret = $2, mail_pass = $3 where id = 1",
          [seal(s.meta_token), seal(s.meta_app_secret), seal(s.mail_pass)]);
      }
      const rows = await query<{ id: number; token: string | null; app_secret: string | null }>(
        "select id, token, app_secret from connections where token not like 'enc:v1:%' or (coalesce(app_secret, '') <> '' and app_secret not like 'enc:v1:%')");
      for (const r of rows) await query("update connections set token = $2, app_secret = $3 where id = $1", [r.id, seal(r.token), seal(r.app_secret)]);
    })().catch((e) => {
      sealing = null;
      if (e?.code !== "42P01") console.error("[segredos] não consegui cifrar os tokens antigos:", e?.message || e);
    });
  }
  return sealing;
}
