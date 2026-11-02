"use client";

import Link from "next/link";
import { saveNumero } from "./actions";
import { NUMERO_STATUS, QUALIDADE } from "@/lib/contingencia";
import s from "@/components/ui/crud.module.css";

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

export function NumeroForm({
  numero,
  bms,
}: {
  numero?: NumeroDefaults;
  bms: { id: string; nome: string }[];
}) {
  return (
    <form action={saveNumero} className={s.form}>
      {numero?.id && <input type="hidden" name="id" value={numero.id} />}

      <div className={s.field}>
        <label className={s.label} htmlFor="telefone">Telefone</label>
        <input id="telefone" name="telefone" required defaultValue={numero?.telefone ?? ""} placeholder="+55 18 99200-5351" className={s.input} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="bmId">Business Manager</label>
        <select id="bmId" name="bmId" defaultValue={numero?.bmId ?? ""} className={s.select}>
          <option value="">— sem BM —</option>
          {bms.map((b) => (
            <option key={b.id} value={b.id}>{b.nome}</option>
          ))}
        </select>
        <span className={s.hint}>O cliente é herdado da BM.</span>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={numero?.status ?? "pendente"} className={s.select}>
          {NUMERO_STATUS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="qualidade">Qualidade (Meta)</label>
        <select id="qualidade" name="qualidade" defaultValue={numero?.qualidade ?? "sem_avaliacao"} className={s.select}>
          {QUALIDADE.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="limiteDiario">Limite diário</label>
        <input id="limiteDiario" name="limiteDiario" type="number" min="0" defaultValue={numero?.limiteDiario ?? 0} className={s.input} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="enviadasHoje">Enviadas hoje</label>
        <input id="enviadasHoje" name="enviadasHoje" type="number" min="0" defaultValue={numero?.enviadasHoje ?? 0} className={s.input} />
      </div>

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="metaPhoneId">phone_number_id da Meta (opcional)</label>
        <input id="metaPhoneId" name="metaPhoneId" defaultValue={numero?.metaPhoneId ?? ""} placeholder="Preencher ao conectar via app" className={s.input} />
      </div>

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="notas">Notas</label>
        <textarea id="notas" name="notas" defaultValue={numero?.notas ?? ""} placeholder="Observações internas sobre este número" className={s.textarea} />
      </div>

      <div className={s.formActions}>
        <Link href="/numeros" className={s.btn}>Cancelar</Link>
        <div className={s.formActionsRight}>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>
            {numero?.id ? "Salvar alterações" : "Cadastrar número"}
          </button>
        </div>
      </div>
    </form>
  );
}
