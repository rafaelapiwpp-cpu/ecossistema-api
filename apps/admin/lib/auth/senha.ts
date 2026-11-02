import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash de senha com scrypt (nativo do Node, sem dependência que precise compilar
 * na Vercel). Formato versionado para permitir trocar parâmetros ou migrar para
 * argon2id depois sem invalidar senhas: `scrypt$N$r$p$sal(b64)$hash(b64)`.
 * N=2^15, r=8 → ~32 MB e ~100 ms por verificação.
 */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

function scrypt(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: MAXMEM };
  return new Promise((resolve, reject) =>
    scryptCb(senha.normalize("NFKC"), sal, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const key = await scrypt(senha, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${key.toString("base64")}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salB64, hashB64] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hashB64, "base64");
  const obtido = await scrypt(senha, Buffer.from(salB64, "base64"), Number(n), Number(r), Number(p));
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

/** Hash de uma senha aleatória: usado quando o login não existe, para o tempo de resposta não denunciar isso. */
let hashFalso: Promise<string> | undefined;
export function hashParaUsuarioInexistente(): Promise<string> {
  hashFalso ??= hashSenha(randomBytes(24).toString("base64"));
  return hashFalso;
}

/** Regras mínimas (NIST 800-63B): comprimento, não igual ao login, não trivial. */
export function problemaNaSenha(senha: string, login: string): string | null {
  if (senha.length < 12) return "Use pelo menos 12 caracteres.";
  if (senha.length > 200) return "Use no máximo 200 caracteres.";
  if (senha.toLowerCase().includes(login.toLowerCase().split("@")[0] ?? "")) return "A senha não pode conter o seu login.";
  if (new Set(senha).size < 5) return "A senha é repetitiva demais.";
  return null;
}
