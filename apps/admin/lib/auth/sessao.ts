import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  PLATFORM_ROLE_LABEL,
  isPlatformRole,
  platformPermissions,
  type Permission,
  type PlatformPermission,
  type PlatformRole,
} from "@eco/core/security";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COOKIE_SESSAO } from "./cookie";

export { COOKIE_SESSAO };

/**
 * Sessão do operador (doc 04 §1), versão 1:
 * - token aleatório de 256 bits no cookie; no banco só o SHA-256 dele (vazamento do
 *   banco não vira sessão válida);
 * - cookie `__Host-` (Secure, Path=/, sem Domain), HttpOnly, SameSite=Lax;
 * - expira após 12 h sem uso e, no máximo, 7 dias após o login;
 * - `permVersion` do operador ≠ da sessão → sessão cai (trocar senha/papel desloga tudo).
 * Próximo passo do doc 04: TOTP obrigatório para escopo PLATFORM.
 */
const OCIOSA_MS = 12 * 60 * 60 * 1000;
const ABSOLUTA_MS = 7 * 24 * 60 * 60 * 1000;
const RENOVAR_APOS_MS = 5 * 60 * 1000;

export interface OperadorAtual {
  id: string;
  login: string;
  nome: string;
  papel: PlatformRole;
  papelRotulo: string;
  permissoes: Set<Permission>;
  precisaTrocarSenha: boolean;
  sessaoId: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers();
  // Na Vercel, x-forwarded-for é definido pela borda (o primeiro IP é o do cliente).
  const xff = h.get("x-forwarded-for");
  return (xff?.split(",")[0]?.trim() || h.get("x-real-ip")) ?? null;
}

export async function auditar(acao: string, extra: { operadorId?: string | null; alvo?: string | null; clienteId?: string | null; detalhes?: Record<string, unknown> } = {}) {
  await prisma.auditLog.create({
    data: {
      escopo: "PLATFORM",
      acao,
      operadorId: extra.operadorId ?? null,
      alvo: extra.alvo ?? null,
      clienteId: extra.clienteId ?? null,
      ip: await ipDaRequisicao(),
      detalhes: (extra.detalhes ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Cria a sessão e grava o cookie. Só pode ser chamada em Server Action ou Route Handler. */
export async function criarSessao(operadorId: string, permVersion: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await prisma.sessao.create({
    data: {
      id: hashToken(token),
      operadorId,
      permVersion,
      expiraEm: new Date(Date.now() + OCIOSA_MS),
      ip: await ipDaRequisicao(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTA_MS / 1000,
  });
}

/** Lê e valida a sessão da requisição atual (memoizado por requisição). */
export const operadorAtual = cache(async (): Promise<OperadorAtual | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token || token.length > 100) return null;

  const id = hashToken(token);
  const sessao = await prisma.sessao.findUnique({ where: { id }, include: { operador: true } });
  if (!sessao) return null;

  const agora = Date.now();
  const op = sessao.operador;
  const valida =
    sessao.expiraEm.getTime() > agora &&
    sessao.criadaEm.getTime() + ABSOLUTA_MS > agora &&
    op.ativo &&
    op.permVersion === sessao.permVersion &&
    isPlatformRole(op.papel);
  if (!valida) {
    await prisma.sessao.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  if (agora - sessao.ultimoUsoEm.getTime() > RENOVAR_APOS_MS) {
    await prisma.sessao.update({ where: { id }, data: { ultimoUsoEm: new Date(agora), expiraEm: new Date(agora + OCIOSA_MS) } });
  }

  const papel = op.papel as PlatformRole;
  return {
    id: op.id,
    login: op.login,
    nome: op.nome,
    papel,
    papelRotulo: PLATFORM_ROLE_LABEL[papel],
    permissoes: platformPermissions(papel),
    precisaTrocarSenha: op.precisaTrocarSenha,
    sessaoId: id,
  };
});

export class SemPermissao extends Error {
  constructor(perm: string) {
    super(`Você não tem permissão para esta ação (${perm}).`);
    this.name = "SemPermissao";
  }
}

/**
 * Barreira de toda página e Server Action do painel. Sem sessão → /login.
 * Senha temporária → /conta/senha. Sem a permissão → erro (403 lógico).
 */
export async function exigirOperador(
  permissao?: PlatformPermission,
  opcoes: { permitirTrocaPendente?: boolean } = {},
): Promise<OperadorAtual> {
  const op = await operadorAtual();
  if (!op) redirect("/login");
  if (op.precisaTrocarSenha && !opcoes.permitirTrocaPendente) redirect("/conta/senha");
  if (permissao && !op.permissoes.has(permissao)) throw new SemPermissao(permissao);
  return op;
}

/** Encerra a sessão atual (banco + cookie). Server Action ou Route Handler. */
export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await prisma.sessao.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE_SESSAO);
}

/** Destino seguro após o login: só caminhos internos. */
export function destinoSeguro(de: unknown): string {
  if (typeof de !== "string" || !de.startsWith("/") || de.startsWith("//") || de.startsWith("/\\")) return "/";
  if (de.startsWith("/login") || de.startsWith("/api/")) return "/";
  return de.slice(0, 500);
}
