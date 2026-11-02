"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashParaUsuarioInexistente, verificarSenha } from "@/lib/auth/senha";
import { auditar, criarSessao, destinoSeguro, encerrarSessao, ipDaRequisicao, operadorAtual } from "@/lib/auth/sessao";

/** Limites do doc 04 §1: por IP e por conta, com bloqueio progressivo. */
const JANELA_IP_MS = 15 * 60 * 1000;
const MAX_FALHAS_IP = 20;
const FALHAS_ANTES_DE_BLOQUEAR = 5;
const BLOQUEIO_BASE_MS = 15 * 60 * 1000;
const BLOQUEIO_MAX_MS = 24 * 60 * 60 * 1000;

function texto(v: FormDataEntryValue | null, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function entrar(formData: FormData) {
  const login = texto(formData.get("login")).toLowerCase();
  const senha = typeof formData.get("senha") === "string" ? (formData.get("senha") as string).slice(0, 200) : "";
  const destino = destinoSeguro(formData.get("de"));
  const voltar = (erro: string) => redirect(`/login?erro=${erro}${destino !== "/" ? `&de=${encodeURIComponent(destino)}` : ""}`);

  if (!login || !senha) voltar("vazio");

  const ip = await ipDaRequisicao();
  if (ip) {
    const falhasDoIp = await prisma.auditLog.count({
      where: { acao: "login.falha", ip, em: { gte: new Date(Date.now() - JANELA_IP_MS) } },
    });
    if (falhasDoIp >= MAX_FALHAS_IP) {
      await auditar("login.limite_ip", { detalhes: { login } });
      voltar("limite");
    }
  }

  const op = await prisma.operador.findUnique({ where: { login } });
  if (!op || !op.ativo) {
    await verificarSenha(senha, await hashParaUsuarioInexistente()); // mesmo custo de tempo
    await auditar("login.falha", { detalhes: { login, motivo: "inexistente_ou_inativo" } });
    voltar("credenciais");
    return;
  }

  if (op.bloqueadoAte && op.bloqueadoAte.getTime() > Date.now()) {
    await auditar("login.falha", { operadorId: op.id, detalhes: { motivo: "conta_bloqueada" } });
    voltar("credenciais");
  }

  const ok = await verificarSenha(senha, op.senhaHash);
  if (!ok) {
    const falhas = op.falhasLogin + 1;
    const excesso = falhas - FALHAS_ANTES_DE_BLOQUEAR;
    const bloqueadoAte = excesso >= 0 ? new Date(Date.now() + Math.min(BLOQUEIO_BASE_MS * 2 ** excesso, BLOQUEIO_MAX_MS)) : null;
    await prisma.operador.update({ where: { id: op.id }, data: { falhasLogin: falhas, bloqueadoAte } });
    await auditar("login.falha", { operadorId: op.id, detalhes: { motivo: "senha", falhas, bloqueado: Boolean(bloqueadoAte) } });
    voltar("credenciais");
  }

  await prisma.operador.update({
    where: { id: op.id },
    data: { falhasLogin: 0, bloqueadoAte: null, ultimoLoginEm: new Date() },
  });
  await criarSessao(op.id, op.permVersion);
  await auditar("login.ok", { operadorId: op.id });
  redirect(op.precisaTrocarSenha ? "/conta/senha" : destino);
}

export async function sair() {
  const op = await operadorAtual();
  await encerrarSessao();
  if (op) await auditar("logout", { operadorId: op.id });
  redirect("/login?saiu=1");
}
