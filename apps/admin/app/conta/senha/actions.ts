"use server";

import { redirect } from "next/navigation";
import { comPlataforma, prisma } from "@/lib/db";
import { hashSenha, problemaNaSenha, verificarSenha } from "@/lib/auth/senha";
import { auditar, criarSessao, exigirOperador } from "@/lib/auth/sessao";

const LOGIN_VALIDO = /^[a-z0-9._@+-]{3,120}$/;

function texto(v: FormDataEntryValue | null, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Troca de login/nome/senha. Obrigatória no primeiro acesso (senha temporária).
 * Ao concluir: permVersion++ (todas as sessões abertas caem) e nova sessão para quem trocou.
 */
export async function trocarSenha(formData: FormData) {
  const op = await exigirOperador(undefined, { permitirTrocaPendente: true });
  const login = texto(formData.get("login")).toLowerCase();
  const nome = texto(formData.get("nome"), 120);
  const atual = typeof formData.get("atual") === "string" ? (formData.get("atual") as string) : "";
  const nova = typeof formData.get("nova") === "string" ? (formData.get("nova") as string) : "";
  const confirma = typeof formData.get("confirma") === "string" ? (formData.get("confirma") as string) : "";
  const voltar = (erro: string): never => redirect(`/conta/senha?erro=${encodeURIComponent(erro)}`);

  if (!LOGIN_VALIDO.test(login)) voltar("Login inválido: use 3 a 120 caracteres entre letras minúsculas, números e . _ @ + -");
  if (!nome) voltar("Informe seu nome.");
  if (nova !== confirma) voltar("A confirmação não confere com a nova senha.");
  const problema = problemaNaSenha(nova, login);
  if (problema) voltar(problema);

  const registro = await prisma.operador.findUnique({ where: { id: op.id } });
  if (!registro || !(await verificarSenha(atual, registro.senhaHash))) {
    await auditar("conta.senha_falha", { operadorId: op.id });
    voltar("Senha atual incorreta.");
    return;
  }
  if (await verificarSenha(nova, registro.senhaHash)) voltar("A nova senha precisa ser diferente da atual.");
  if (login !== registro.login && (await prisma.operador.findUnique({ where: { login } }))) voltar("Este login já está em uso.");

  const senhaHash = await hashSenha(nova);
  const atualizado = await comPlataforma(async (tx) => {
    const o = await tx.operador.update({
      where: { id: op.id },
      data: { login, nome, senhaHash, precisaTrocarSenha: false, permVersion: { increment: 1 } },
    });
    await tx.sessao.deleteMany({ where: { operadorId: op.id } });
    return o;
  });
  await criarSessao(atualizado.id, atualizado.permVersion);
  await auditar("conta.senha_trocada", { operadorId: op.id, detalhes: { loginAlterado: login !== registro.login } });
  redirect("/?senha=ok");
}
