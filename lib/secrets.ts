// Cifra dos segredos guardados no banco: tokens da Meta, chaves secretas dos apps e senha do e-mail.
// AES-256-GCM com a chave em SECRETS_KEY (variável de ambiente na Vercel, FORA do banco): quem copiar o banco
// sem a chave não consegue usar os tokens.
//
// Formato gravado: "enc:v1:" + base64(iv 12 bytes | tag 16 bytes | texto cifrado).
// - Sem SECRETS_KEY: grava e lê em texto puro (como antes) e a tela Configurações avisa o Master.
// - Com SECRETS_KEY: grava cifrado; valores antigos em texto puro continuam legíveis e são cifrados
//   na primeira leitura das configurações (encryptAtRestOnce).
// - Trocar ou perder a chave: os valores cifrados viram vazios (é preciso colar os tokens de novo).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = (process.env.SECRETS_KEY || "").trim();
  if (!raw) return null;
  const b64 = Buffer.from(raw, "base64");
  // chave gerada pela tela (32 bytes em base64) ou qualquer frase longa (vira 32 bytes por SHA-256)
  return b64.length === 32 ? b64 : createHash("sha256").update(raw).digest();
}

/** A chave está configurada (os segredos passam a ser gravados cifrados). */
export const secretsEnabled = () => key() !== null;

export const isSealed = (v: string | null | undefined) => typeof v === "string" && v.startsWith(PREFIX);

/** Cifra para gravar. Vazio/nulo e valores já cifrados passam como estão; sem chave, devolve o texto puro. */
export function seal<T extends string | null | undefined>(v: T): T {
  if (!v || isSealed(v)) return v;
  const k = key();
  if (!k) return v;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(v, "utf8"), c.final()]);
  return (PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64")) as T;
}

let warned = false;
/** Decifra o que veio do banco. Texto puro (antigo) volta igual; cifrado sem a chave certa volta vazio. */
export function unseal<T extends string | null | undefined>(v: T): T {
  if (!isSealed(v)) return v;
  const k = key();
  try {
    if (!k) throw new Error("SECRETS_KEY ausente");
    const buf = Buffer.from((v as string).slice(PREFIX.length), "base64");
    const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8") as T;
  } catch (e: any) {
    if (!warned) { warned = true; console.error(`[segredos] não deu para decifrar um token guardado (${e?.message || e}). A SECRETS_KEY mudou ou sumiu?`); }
    return "" as T;
  }
}

/** Chave nova para o Master copiar para a Vercel (gerada na hora, não fica guardada em lugar nenhum). */
export const newSecretsKey = () => randomBytes(32).toString("base64");
