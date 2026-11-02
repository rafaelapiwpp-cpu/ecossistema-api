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

export async function saveBm(formData: FormData) {
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
  } else {
    await prisma.bm.create({ data });
  }

  revalidatePath("/bms");
  redirect("/bms");
}

export async function deleteBm(formData: FormData) {
  const id = str(formData.get("id"));
  if (id) {
    await prisma.bm.delete({ where: { id } });
    revalidatePath("/bms");
  }
  redirect("/bms");
}
