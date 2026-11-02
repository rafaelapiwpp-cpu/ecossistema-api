"use client";

import Link from "next/link";
import { saveTemplate } from "./actions";
import { TEMPLATE_CATEGORIA, TEMPLATE_STATUS } from "@/lib/contingencia";
import s from "@/components/ui/crud.module.css";

export interface TemplateDefaults {
  id?: string;
  nome?: string;
  clienteId?: string | null;
  categoria?: string;
  status?: string;
  idioma?: string;
  corpo?: string;
}

export function TemplateForm({
  template,
  clientes,
}: {
  template?: TemplateDefaults;
  clientes: { id: string; nome: string }[];
}) {
  return (
    <form action={saveTemplate} className={s.form}>
      {template?.id && <input type="hidden" name="id" value={template.id} />}

      <div className={s.field}>
        <label className={s.label} htmlFor="nome">Nome do template</label>
        <input id="nome" name="nome" required defaultValue={template?.nome ?? ""} placeholder="ex.: lembrete_compromisso" className={s.input} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="clienteId">Cliente</label>
        <select id="clienteId" name="clienteId" defaultValue={template?.clienteId ?? ""} className={s.select}>
          <option value="">— sem cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="categoria">Categoria</label>
        <select id="categoria" name="categoria" defaultValue={template?.categoria ?? "marketing"} className={s.select}>
          {TEMPLATE_CATEGORIA.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={template?.status ?? "em_analise"} className={s.select}>
          {TEMPLATE_STATUS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="idioma">Idioma</label>
        <input id="idioma" name="idioma" defaultValue={template?.idioma ?? "pt_BR"} placeholder="pt_BR" className={s.input} />
      </div>

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="corpo">Corpo da mensagem</label>
        <textarea id="corpo" name="corpo" required defaultValue={template?.corpo ?? ""} placeholder="Olá {{1}}, ..." className={s.textarea} style={{ minHeight: 120 }} />
        <span className={s.hint}>Use {"{{1}}"}, {"{{2}}"} para variáveis. Templates de marketing exigem botão de descadastro (Meta).</span>
      </div>

      <div className={s.formActions}>
        <Link href="/templates" className={s.btn}>Cancelar</Link>
        <div className={s.formActionsRight}>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>
            {template?.id ? "Salvar alterações" : "Cadastrar template"}
          </button>
        </div>
      </div>
    </form>
  );
}
