"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auditar, exigirOperador } from "@/lib/auth/sessao";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}

export async function saveBm(formData: FormData) {
  const op = await exigirOperador("bms:gerenciar");
  const id = str(formData.get("id"));
  const nome = str(formData.get("nome"));
  if (!nome) throw new Error("O nome da BM é obrigatório.");

  const data = {
    nome,
    clienteId: orNull(formData.get("clienteId")),
    status: str(formData.get("status")) || "em_verificacao",
    verificacao: str(formData.get("verificacao")) || "pendente",
    nivelLimite: Number(formData.get("nivelLimite") ?? 250) || 0,
    metaBmId: orNull(formData.get("metaBmId")),
    notas: orNull(formData.get("notas")),
  };

  if (id) {
    await prisma.bm.update({ where: { id }, data });
    await auditar("bm.editar", { operadorId: op.id, alvo: id, detalhes: data });
  } else {
    const novo = await prisma.bm.create({ data });
    await auditar("bm.criar", { operadorId: op.id, alvo: novo.id, detalhes: data });
  }

  revalidatePath("/bms");
  redirect("/bms");
}

export async function deleteBm(formData: FormData) {
  const op = await exigirOperador("bms:gerenciar");
  const id = str(formData.get("id"));
  if (id) {
    await prisma.bm.delete({ where: { id } });
    await auditar("bm.excluir", { operadorId: op.id, alvo: id });
    revalidatePath("/bms");
  }
  redirect("/bms");
}
