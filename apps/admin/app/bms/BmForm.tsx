"use client";

import Link from "next/link";
import { buttonClass, Card, Field, Form, FormActions, Select, Textarea, TextInput } from "@eco/ui";
import { saveBm } from "./actions";
import { BM_STATUS, BM_VERIFICACAO, NIVEL_LIMITE } from "@/lib/contingencia";

export interface BmDefaults {
  id?: string;
  nome?: string;
  clienteId?: string | null;
  status?: string;
  verificacao?: string;
  nivelLimite?: number;
  metaBmId?: string | null;
  notas?: string | null;
}

export function BmForm({ bm, clientes }: { bm?: BmDefaults; clientes: { id: string; nome: string }[] }) {
  return (
    <Card flush>
      <Form action={saveBm}>
        {bm?.id && <input type="hidden" name="id" value={bm.id} />}

        <Field label="Nome da BM" htmlFor="nome" wide>
          <TextInput id="nome" name="nome" required defaultValue={bm?.nome ?? ""} placeholder="Ex.: BM Imobiliária Horizonte" />
        </Field>

        <Field label="Cliente" htmlFor="clienteId" help="Cada cliente tem o próprio portfólio. Pode deixar em branco por enquanto.">
          <Select id="clienteId" name="clienteId" defaultValue={bm?.clienteId ?? ""} hasHelp>
            <option value="">Sem cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Limite de 24 h" htmlFor="nivelLimite" help="Contatos únicos por dia, compartilhados por todos os números da BM.">
          <Select id="nivelLimite" name="nivelLimite" defaultValue={String(bm?.nivelLimite ?? 250)} hasHelp>
            {NIVEL_LIMITE.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={bm?.status ?? "em_verificacao"}>
            {BM_STATUS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Verificação de negócio" htmlFor="verificacao">
          <Select id="verificacao" name="verificacao" defaultValue={bm?.verificacao ?? "pendente"}>
            {BM_VERIFICACAO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ID do portfólio na Meta" htmlFor="metaBmId" optional wide help="Preenchido ao conectar pelo app da Meta.">
          <TextInput id="metaBmId" name="metaBmId" defaultValue={bm?.metaBmId ?? ""} placeholder="Ex.: 104829301928374" mono hasHelp />
        </Field>

        <Field label="Notas" htmlFor="notas" optional wide>
          <Textarea id="notas" name="notas" defaultValue={bm?.notas ?? ""} placeholder="Observações internas sobre esta BM" />
        </Field>

        <FormActions
          start={
            <Link href="/bms" className={buttonClass({ variant: "ghost" })}>
              Cancelar
            </Link>
          }
        >
          <button type="submit" className={buttonClass({ variant: "primary" })}>
            {bm?.id ? "Salvar alterações" : "Cadastrar BM"}
          </button>
        </FormActions>
      </Form>
    </Card>
  );
}
