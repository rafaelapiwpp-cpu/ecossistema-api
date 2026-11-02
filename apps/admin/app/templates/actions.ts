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

export async function saveTemplate(formData: FormData) {
  const id = str(formData.get("id"));
  const nome = str(formData.get("nome"));
  const corpo = str(formData.get("corpo"));
  if (!nome) throw new Error("O nome do template é obrigatório.");
  if (!corpo) throw new Error("O corpo do template é obrigatório.");

  const data = {
    nome,
    clienteId: orNull(formData.get("clienteId")),
    categoria: str(formData.get("categoria")) || "marketing",
    status: str(formData.get("status")) || "em_analise",
    idioma: str(formData.get("idioma")) || "pt_BR",
    corpo,
  };

  if (id) {
    await prisma.template.update({ where: { id }, data });
  } else {
    await prisma.template.create({ data });
  }

  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplate(formData: FormData) {
  const id = str(formData.get("id"));
  if (id) {
    await prisma.template.delete({ where: { id } });
    revalidatePath("/templates");
  }
  redirect("/templates");
}
