"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auditar, exigirOperador } from "@/lib/auth/sessao";
import { QUALIDADE_META, processarSinal, retomarNumero } from "@/lib/contingencia-motor";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}

export async function saveNumero(formData: FormData) {
  const op = await exigirOperador("contingencia:operar");
  const id = str(formData.get("id"));
  const telefone = str(formData.get("telefone"));
  if (!telefone) throw new Error("O telefone é obrigatório.");

  const bmId = orNull(formData.get("bmId"));
  // Deriva o cliente a partir da BM (1 BM por cliente).
  let clienteId: string | null = null;
  if (bmId) {
    const bm = await prisma.bm.findUnique({ where: { id: bmId }, select: { clienteId: true } });
    clienteId = bm?.clienteId ?? null;
  }

  const data = {
    telefone,
    bmId,
    clienteId,
    status: str(formData.get("status")) || "pendente",
    qualidade: str(formData.get("qualidade")) || "sem_avaliacao",
    limiteDiario: Number(formData.get("limiteDiario") ?? 0) || 0,
    enviadasHoje: Number(formData.get("enviadasHoje") ?? 0) || 0,
    metaPhoneId: orNull(formData.get("metaPhoneId")),
    notas: orNull(formData.get("notas")),
  };

  if (id) {
    // Mudança de qualidade passa pelo motor de contingência (pode parar o envio),
    // igual a um sinal da Meta; o resto do formulário é gravado direto.
    const anterior = await prisma.numero.findUnique({ where: { id }, select: { qualidade: true } });
    const mudouQualidade = Boolean(anterior && anterior.qualidade !== data.qualidade && QUALIDADE_META[data.qualidade]);
    await prisma.numero.update({ where: { id }, data: mudouQualidade && anterior ? { ...data, qualidade: anterior.qualidade } : data });
    await auditar("numero.editar", { operadorId: op.id, alvo: id, detalhes: data });
    if (mudouQualidade && anterior) {
      await processarSinal(
        { tipo: "qualidade", numero: { id }, para: QUALIDADE_META[data.qualidade]!, de: QUALIDADE_META[anterior.qualidade] },
        "manual",
        op.id,
      );
    }
  } else {
    const novo = await prisma.numero.create({ data });
    await auditar("numero.criar", { operadorId: op.id, alvo: novo.id, detalhes: data });
  }

  revalidatePath("/numeros");
  redirect("/numeros");
}

export async function deleteNumero(formData: FormData) {
  const op = await exigirOperador("contingencia:operar");
  const id = str(formData.get("id"));
  if (id) {
    await prisma.numero.delete({ where: { id } });
    await auditar("numero.excluir", { operadorId: op.id, alvo: id });
    revalidatePath("/numeros");
  }
  redirect("/numeros");
}

/** Retomada manual de um número parado pelo motor (doc 04 §4.3): exige motivo. */
export async function retomarEnvio(formData: FormData) {
  const op = await exigirOperador("contingencia:operar");
  const id = str(formData.get("id"));
  const modo = str(formData.get("modo")) === "meio_aberto" ? "meio_aberto" : "fechado";
  const motivo = str(formData.get("motivo")).slice(0, 500);
  if (!id) redirect("/numeros");
  if (motivo.length < 10) redirect(`/numeros/${id}?erro=${encodeURIComponent("Explique em pelo menos 10 caracteres o que mudou para retomar o envio.")}`);
  try {
    await retomarNumero(id, modo, motivo, op.id);
  } catch (err) {
    redirect(`/numeros/${id}?erro=${encodeURIComponent(err instanceof Error ? err.message : "Não foi possível retomar.")}`);
  }
  revalidatePath("/numeros");
  redirect(`/numeros/${id}?retomado=1`);
}
