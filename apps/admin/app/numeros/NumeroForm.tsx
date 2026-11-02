"use client";

import Link from "next/link";
import { buttonClass, Card, Field, Form, FormActions, FormSection, Select, Textarea, TextInput } from "@eco/ui";
import { saveNumero } from "./actions";
import { NUMERO_STATUS, QUALIDADE } from "@/lib/contingencia";

export interface NumeroDefaults {
  id?: string;
  telefone?: string;
  bmId?: string | null;
  status?: string;
  qualidade?: string;
  limiteDiario?: number;
  enviadasHoje?: number;
  metaPhoneId?: string | null;
  notas?: string | null;
}

export function NumeroForm({ numero, bms }: { numero?: NumeroDefaults; bms: { id: string; nome: string }[] }) {
  return (
    <Card flush>
      <Form action={saveNumero}>
        {numero?.id && <input type="hidden" name="id" value={numero.id} />}

        <Field label="Telefone" htmlFor="telefone" help="Com DDI e DDD, como no WhatsApp.">
          <TextInput id="telefone" name="telefone" required inputMode="tel" defaultValue={numero?.telefone ?? ""} placeholder="+55 18 99200-5351" hasHelp />
        </Field>

        <Field label="Business Manager" htmlFor="bmId" help="O cliente vem da BM.">
          <Select id="bmId" name="bmId" defaultValue={numero?.bmId ?? ""} hasHelp>
            <option value="">Sem BM</option>
            {bms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={numero?.status ?? "pendente"}>
            {NUMERO_STATUS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Qualidade na Meta" htmlFor="qualidade">
          <Select id="qualidade" name="qualidade" defaultValue={numero?.qualidade ?? "sem_avaliacao"}>
            {QUALIDADE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <FormSection title="Uso de hoje" description="Até a sincronização com a Meta, preencha à mão." />

        <Field label="Limite diário" htmlFor="limiteDiario" help="0 = sem limite definido.">
          <TextInput id="limiteDiario" name="limiteDiario" type="number" min="0" defaultValue={numero?.limiteDiario ?? 0} hasHelp />
        </Field>

        <Field label="Enviadas hoje" htmlFor="enviadasHoje">
          <TextInput id="enviadasHoje" name="enviadasHoje" type="number" min="0" defaultValue={numero?.enviadasHoje ?? 0} />
        </Field>

        <Field label="phone_number_id da Meta" htmlFor="metaPhoneId" optional wide help="Preenchido ao conectar pelo app da Meta.">
          <TextInput id="metaPhoneId" name="metaPhoneId" defaultValue={numero?.metaPhoneId ?? ""} placeholder="Ex.: 109283746501928" mono hasHelp />
        </Field>

        <Field label="Notas" htmlFor="notas" optional wide>
          <Textarea id="notas" name="notas" defaultValue={numero?.notas ?? ""} placeholder="Observações internas sobre este número" />
        </Field>

        <FormActions
          start={
            <Link href="/numeros" className={buttonClass({ variant: "ghost" })}>
              Cancelar
            </Link>
          }
        >
          <button type="submit" className={buttonClass({ variant: "primary" })}>
            {numero?.id ? "Salvar alterações" : "Cadastrar número"}
          </button>
        </FormActions>
      </Form>
    </Card>
  );
}
