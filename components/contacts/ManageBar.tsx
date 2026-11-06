"use client";
// Barra "Gerenciar selecionados": escolhe o que fazer (tag, lista, departamento, opt-out, excluir), o alvo — ou cria um
// novo na hora — e aplica de uma vez nos contatos marcados ou em todos os do filtro.
import { useEffect, useState } from "react";
import { api, nf, type Catalog } from "./shared";

type Need = "tag" | "list" | "department";
type Act = { k: string; label: string; done: string; need?: Need; portal?: boolean; manager?: boolean; danger?: boolean };
const ACTIONS: Act[] = [
  { k: "add_tag", label: "Adicionar tag", done: "Tag adicionada", need: "tag", portal: true },
  { k: "remove_tag", label: "Tirar tag", done: "Tag retirada", need: "tag", portal: true },
  { k: "add_list", label: "Adicionar à lista", done: "Adicionados à lista", need: "list" },
  { k: "remove_list", label: "Tirar da lista", done: "Retirados da lista", need: "list" },
  { k: "department", label: "Mudar departamento", done: "Departamento alterado", need: "department", portal: true },
  { k: "optout_on", label: "Marcar opt-out (não receber disparos)", done: "Marcados como opt-out", portal: true },
  { k: "optout_off", label: "Tirar opt-out", done: "Opt-out retirado", portal: true },
  { k: "delete", label: "Excluir contatos (só quem nunca conversou)", done: "Excluídos", manager: true, danger: true },
];
const NOUN: Record<Need, string> = { tag: "tag", list: "lista", department: "departamento" };

export default function ManageBar({ catalog, client, count, total, all, defaultWaba, onRun, onCreated }: {
  catalog: Catalog; client: boolean; count: number; total: number; all: boolean; defaultWaba: string;
  onRun: (action: string, extra: Record<string, unknown>, done: string) => Promise<void>; onCreated: () => Promise<unknown> | void;
}) {
  const manager = ["master", "admin", "gestor"].includes(catalog.me.role);
  const acts = ACTIONS.filter((a) => (!client || a.portal) && (!a.manager || (manager && !client)));
  const [k, setK] = useState(acts[0].k);
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [waba, setWaba] = useState(defaultWaba || catalog.wabas[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setValue(""); setName(""); setErr(""); }, [k]);
  useEffect(() => { if (defaultWaba) setWaba(defaultWaba); }, [defaultWaba]);
  const act = acts.find((a) => a.k === k) || acts[0];
  const need = act.need;
  const options: { id: number; name: string }[] = need === "tag" ? catalog.tags : need === "list" ? catalog.lists : need === "department" ? catalog.departments : [];
  // criar na hora: tag e lista ao adicionar; departamento só gestores da equipe
  const canCreate = (need === "tag" && k === "add_tag") || (need === "list" && k === "add_list" && !client) || (need === "department" && manager && !client);
  const creating = value === "new";
  const ready = count > 0 && !busy && (!need || (value !== "" && (!creating || name.trim().length > 0)));

  const apply = async () => {
    setErr("");
    if (act.danger && !confirm(`Excluir ${nf(count)} contato(s)? Quem já conversou é mantido. Não dá para desfazer.`)) return;
    if (!act.danger && count > 300 && !confirm(`${act.label} em ${nf(count)} contatos?`)) return;
    setBusy(true);
    try {
      let target = value;
      let targetName = need ? options.find((o) => String(o.id) === value)?.name || "" : "";
      if (creating && need) { // cria e já usa
        const body = need === "tag" ? { action: "create_tag", name: name.trim() } : need === "list" ? { action: "create_list", name: name.trim(), waba_id: waba || null } : { action: "create_department", name: name.trim() };
        const j = await api("/api/contatos", body);
        const made = j.tag || j.list || j.department;
        target = String(made.id); targetName = made.name;
        await onCreated();
      }
      const extra: Record<string, unknown> =
        need === "tag" ? { tag_id: Number(target) } : need === "list" ? { list_id: Number(target) }
          : need === "department" ? { department_id: target === "none" ? null : Number(target) }
            : k === "optout_on" ? { value: true } : k === "optout_off" ? { value: false } : {};
      const action = k === "optout_on" || k === "optout_off" ? "optout" : k;
      const done = need ? `${act.done}: ${target === "none" ? "sem departamento" : `“${targetName}”`}` : act.done;
      await onRun(action, extra, done);
      setValue(""); setName("");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className={`cm-bar${count ? " on" : ""}`}>
      <div className="cm-bar-sel">
        <b>{count ? `${nf(count)} selecionado(s)` : "Gerenciar selecionados"}</b>
        <span className="muted">{count ? (all ? `todos os ${nf(total)} do filtro` : "marque mais ou use “Selecionar todos”") : "marque os contatos na lista (ou todos do filtro) e escolha o que fazer"}</span>
      </div>
      <select value={k} onChange={(e) => setK(e.target.value)} aria-label="O que fazer">{acts.map((a) => <option key={a.k} value={a.k}>{a.label}</option>)}</select>
      {need && (
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Escolha a ${NOUN[need]}`}>
          <option value="">Escolha {need === "department" ? "o departamento" : `a ${NOUN[need]}`}…</option>
          {need === "department" && <option value="none">Sem departamento (tirar)</option>}
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {canCreate && <option value="new">+ Criar {need === "department" ? "novo departamento" : `nova ${NOUN[need]}`}…</option>}
        </select>
      )}
      {creating && <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={need === "tag" ? "Nome da tag (ex.: VIP)" : need === "list" ? "Nome da lista (ex.: Clientes Loja 7)" : "Nome do departamento"} maxLength={need === "list" ? 120 : 60} onKeyDown={(e) => { if (e.key === "Enter" && ready) apply(); }} />}
      {creating && need === "list" && (
        <select value={waba} onChange={(e) => setWaba(e.target.value)} aria-label="Conta da lista" title="Conta (cliente) da lista">
          {catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}
        </select>
      )}
      <button type="button" className={`btn ${act.danger ? "danger" : "primary"}`} onClick={apply} disabled={!ready}>{busy ? "Aplicando…" : count ? `Aplicar em ${nf(count)}` : "Aplicar"}</button>
      {err && <span className="cm-bar-err">{err}</span>}
    </div>
  );
}
