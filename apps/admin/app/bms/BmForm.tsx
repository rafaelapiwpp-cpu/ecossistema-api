"use client";

import Link from "next/link";
import { saveBm } from "./actions";
import { BM_STATUS, BM_VERIFICACAO, NIVEL_LIMITE } from "@/lib/contingencia";
import s from "@/components/ui/crud.module.css";

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

export function BmForm({
  bm,
  clientes,
}: {
  bm?: BmDefaults;
  clientes: { id: string; nome: string }[];
}) {
  return (
    <form action={saveBm} className={s.form}>
      {bm?.id && <input type="hidden" name="id" value={bm.id} />}

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="nome">Nome da BM</label>
        <input id="nome" name="nome" required defaultValue={bm?.nome ?? ""} placeholder="Ex.: BM MOVY 2" className={s.input} />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="clienteId">Cliente</label>
        <select id="clienteId" name="clienteId" defaultValue={bm?.clienteId ?? ""} className={s.select}>
          <option value="">— sem cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <span className={s.hint}>1 BM por cliente (pode deixar em branco por enquanto).</span>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="nivelLimite">Nível de limite (24h)</label>
        <select id="nivelLimite" name="nivelLimite" defaultValue={String(bm?.nivelLimite ?? 250)} className={s.select}>
          {NIVEL_LIMITE.map((n) => (
            <option key={n.value} value={n.value}>{n.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={bm?.status ?? "em_verificacao"} className={s.select}>
          {BM_STATUS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="verificacao">Verificação de negócio</label>
        <select id="verificacao" name="verificacao" defaultValue={bm?.verificacao ?? "pendente"} className={s.select}>
          {BM_VERIFICACAO.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="metaBmId">ID do portfólio na Meta (opcional)</label>
        <input id="metaBmId" name="metaBmId" defaultValue={bm?.metaBmId ?? ""} placeholder="Preencher ao conectar via app" className={s.input} />
      </div>

      <div className={`${s.field} ${s.fieldWide}`}>
        <label className={s.label} htmlFor="notas">Notas</label>
        <textarea id="notas" name="notas" defaultValue={bm?.notas ?? ""} placeholder="Observações internas sobre esta BM" className={s.textarea} />
      </div>

      <div className={s.formActions}>
        <Link href="/bms" className={s.btn}>Cancelar</Link>
        <div className={s.formActionsRight}>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>
            {bm?.id ? "Salvar alterações" : "Cadastrar BM"}
          </button>
        </div>
      </div>
    </form>
  );
}
