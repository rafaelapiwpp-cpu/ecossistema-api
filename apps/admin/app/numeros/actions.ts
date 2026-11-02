"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}

export async function saveNumero(formData: FormData) {
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
    await prisma.numero.update({ where: { id }, data });
  } else {
    await prisma.numero.create({ data });
  }

  revalidatePath("/numeros");
  redirect("/numeros");
}

export async function deleteNumero(formData: FormData) {
  const id = str(formData.get("id"));
  if (id) {
    await prisma.numero.delete({ where: { id } });
    revalidatePath("/numeros");
  }
  redirect("/numeros");
}
