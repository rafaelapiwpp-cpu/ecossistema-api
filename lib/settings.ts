import { hasDb, query } from "./db";
import { migrateOnce } from "./schema";

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
    const rows = await query<Settings>("select * from settings where id = 1");
    return rows[0] || null;
  } catch (e: any) {
    if (e?.code === "42P01") return null; // tabela ainda não existe
    throw e;
  }
}

export const keywordList = (s: string | null | undefined) =>
  (s || "").split(",").map((k) => k.trim().toUpperCase()).filter(Boolean);
