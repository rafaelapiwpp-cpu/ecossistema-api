"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClass, Card, Field, Form, FormActions, Select, Tag, Textarea, TemplatePreview, TextInput } from "@eco/ui";
import { saveTemplate } from "./actions";
import { TEMPLATE_CATEGORIA, TEMPLATE_CATEGORIA_MAP, TEMPLATE_STATUS } from "@/lib/contingencia";

export interface TemplateDefaults {
  id?: string;
  nome?: string;
  clienteId?: string | null;
  categoria?: string;
  status?: string;
  idioma?: string;
  corpo?: string;
}

/** Categoria do schema v1 (pt-BR) → categoria da Meta, para as regras da prévia. */
const META_CATEGORY: Record<string, string> = { marketing: "marketing", utilidade: "utility", autenticacao: "authentication" };

export function TemplateForm({ template, clientes }: { template?: TemplateDefaults; clientes: { id: string; nome: string }[] }) {
  const [corpo, setCorpo] = useState(template?.corpo ?? "");
  const [categoria, setCategoria] = useState(template?.categoria ?? "marketing");
  const [idioma, setIdioma] = useState(template?.idioma ?? "pt_BR");
  const [clienteId, setClienteId] = useState(template?.clienteId ?? "");
  const cliente = clientes.find((c) => c.id === clienteId)?.nome;

  return (
    <div className="eco-form-layout">
      <Card flush>
        <Form action={saveTemplate}>
          {template?.id && <input type="hidden" name="id" value={template.id} />}

          <Field label="Nome do template" htmlFor="nome" help="Como está na Meta: minúsculas e _.">
            <TextInput id="nome" name="nome" required defaultValue={template?.nome ?? ""} placeholder="lembrete_compromisso" mono hasHelp />
          </Field>

          <Field label="Cliente" htmlFor="clienteId">
            <Select id="clienteId" name="clienteId" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sem cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Categoria" htmlFor="categoria">
            <Select id="categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {TEMPLATE_CATEGORIA.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status na Meta" htmlFor="status">
            <Select id="status" name="status" defaultValue={template?.status ?? "em_analise"}>
              {TEMPLATE_STATUS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Idioma" htmlFor="idioma">
            <TextInput id="idioma" name="idioma" value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="pt_BR" mono />
          </Field>

          <Field
            label="Corpo da mensagem"
            htmlFor="corpo"
            wide
            help={
              <>
                Variáveis como {"{{1}}"}, {"{{2}}"}. Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~. Templates de marketing exigem botão de descadastro.
              </>
            }
          >
            <Textarea id="corpo" name="corpo" required value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Olá {{1}}, seu horário está confirmado para {{2}}." rows={6} hasHelp />
          </Field>

          <FormActions
            start={
              <Link href="/templates" className={buttonClass({ variant: "ghost" })}>
                Cancelar
              </Link>
            }
          >
            <button type="submit" className={buttonClass({ variant: "primary" })}>
              {template?.id ? "Salvar alterações" : "Cadastrar template"}
            </button>
          </FormActions>
        </Form>
      </Card>

      <aside className="eco-form__aside" aria-label="Prévia">
        <TemplatePreview
          body={corpo}
          category={META_CATEGORY[categoria]}
          businessName={cliente}
          meta={
            <>
              <span>Como o contato vê</span>
              <Tag>{TEMPLATE_CATEGORIA_MAP[categoria] ?? categoria}</Tag>
              <Tag>{idioma || "—"}</Tag>
            </>
          }
        />
      </aside>
    </div>
  );
}
