"use client";
// Gatilhos do bloco Início: lista ("+ Adicionar gatilho") e o painel do gatilho "Mensagem recebida".
import { useState } from "react";
import { MATCH_LABEL, SESSION_LABEL, triggersOf, type MsgTrigger, type TriggerMatch, type TriggerSession } from "@/lib/flow-shared";
import { triggerBadge, triggerSummary, uid } from "./shared";
import { FIcon } from "./icons";
import type { PanelProps } from "./panels";

const SESSION_HINT: Record<TriggerSession, string> = {
  always: "Toda mensagem que bater inicia de novo (se o contato já estiver nesta automação, recomeça). Mensagens seguidas em menos de 30 s contam como uma.",
  not_in_flow: "Enquanto o contato estiver nesta automação, novas mensagens não reiniciam. Depois que terminar, pode iniciar de novo.",
  daily: "Bom para boas-vindas: o contato recebe a automação no máximo uma vez por dia, mesmo mandando várias mensagens.",
  once: "Cada contato passa por esta automação uma única vez (inclui quem já entrou pelo botão Iniciar).",
};

export function newTrigger(phoneId: string): MsgTrigger {
  return { id: uid("t"), type: "message", phone_number_id: phoneId || "", match: "contains", keywords: [], session: "daily", skip_team: true };
}

/** Lista de gatilhos no painel do Início. */
export function TriggerList({ node, ctx, flow, update, onSub }: PanelProps) {
  const trig = triggersOf(node.data);
  const add = () => { const t = newTrigger(flow.phone_number_id); update({ triggers: [...trig, t] }); onSub?.(t.id); };
  return (
    <div className="fp-group">
      <div className="fp-group-head"><b>Gatilhos <small>iniciam a automação sozinhos</small></b></div>
      {trig.map((t, i) => (
        <button key={t.id} type="button" className="fp-trig" onClick={() => onSub?.(t.id)}>
          <span className="fp-trig-ico"><FIcon name="bubble" size={17} /></span>
          <span className="fp-trig-txt"><b>Mensagem recebida</b><small>{triggerSummary(t, ctx.catalog)}</small></span>
          <em className="fb-badge trig">{triggerBadge(i)}</em>
        </button>
      ))}
      <button type="button" className="fp-trig-add" onClick={add}><FIcon name="plus" size={14} stroke={2.2} />Adicionar gatilho</button>
      {trig.length > 0 && flow.status !== "active" && <p className="fp-note warn">O fluxo precisa estar <b>ativo</b> (botão ligar, no topo) para o gatilho ouvir as mensagens.</p>}
    </div>
  );
}

/** Painel do gatilho "Mensagem recebida" (abre no lugar do painel do Início). */
export function TriggerForm({ node, ctx, flow, update, sub, onSub }: PanelProps) {
  const trig = triggersOf(node.data);
  const i = trig.findIndex((t) => t.id === sub?.key);
  const t = trig[i];
  if (!t) return null;
  const set = (patch: Partial<MsgTrigger>) => update({ triggers: trig.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) });
  const phones = ctx.catalog.phones.filter((p) => p.waba_id === flow.waba_id);
  const session: TriggerSession = t.session || "daily";
  const remove = () => { if (!window.confirm("Remover este gatilho? O fluxo deixa de iniciar sozinho por ele.")) return; update({ triggers: trig.filter((x) => x.id !== t.id) }); onSub?.(null); };
  return (
    <>
      <div className="fp-field"><label>Qual número vai ouvir as mensagens e iniciar a automação?</label>
        <select value={t.phone_number_id || ""} onChange={(e) => set({ phone_number_id: e.target.value })}>
          <option value="">Qualquer número desta conta</option>
          {phones.map((p) => <option key={p.id} value={p.id}>{p.display_phone_number}{p.label ? ` · ${p.label}` : ""}{p.verified_name ? ` — ${p.verified_name}` : ""}</option>)}
        </select>
      </div>
      <div className="fp-field"><label>Tipo da comparação das palavras-chave</label>
        <select value={t.match || "contains"} onChange={(e) => set({ match: e.target.value as TriggerMatch })}>
          {(Object.keys(MATCH_LABEL) as TriggerMatch[]).map((k) => <option key={k} value={k}>{MATCH_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="fp-field"><label>Palavras-chave para iniciar a automação. Deixe em branco para iniciar com qualquer mensagem.</label>
        <KeywordInput value={t.keywords || []} onChange={(keywords) => set({ keywords })} />
        <small className="fp-hint">Maiúsculas e acentos não importam; a palavra precisa aparecer inteira (“oi” não pega “noite”).</small>
      </div>
      <div className="fp-field"><label>Condição para iniciar uma nova sessão na automação</label>
        <select value={session} onChange={(e) => set({ session: e.target.value as TriggerSession })}>
          {(Object.keys(SESSION_LABEL) as TriggerSession[]).map((k) => <option key={k} value={k}>{SESSION_LABEL[k]}</option>)}
        </select>
        <small className="fp-hint">{SESSION_HINT[session]}</small>
      </div>
      <label className="check"><input type="checkbox" checked={t.skip_team !== false} onChange={(e) => set({ skip_team: e.target.checked })} /> Não iniciar se a conversa já estiver com a equipe (Aguardando ou Andamento nas últimas 24 h)</label>
      <div className="fp-field"><label>Dados da mensagem</label>
        <div><span className="fp-src">{triggerBadge(i)}</span></div>
        <small className="fp-hint">Nos blocos seguintes, use <code>{"{{mensagem}}"}</code> para o que o cliente escreveu e <code>{"{{palavra}}"}</code> para a palavra-chave que bateu. Condições de “Resposta” também olham esta mensagem.</small>
      </div>
      <p className="fp-note">Enquanto o robô conversa, a conversa fica na fila do robô no Atendimento e vai para Aguardando no bloco <b>Atendimento humano</b>. Se um atendente responder, o robô para.</p>
      {flow.status !== "active" && <p className="fp-note warn">Ative o fluxo (botão ligar, no topo) para o gatilho começar a ouvir.</p>}
      <button type="button" className="fp-link danger" onClick={remove}><FIcon name="trash" size={15} />Remover gatilho</button>
    </>
  );
}

/** Palavras-chave como etiquetas: Enter ou vírgula adiciona; × remove. */
function KeywordInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const push = (raw: string) => {
    const add = raw.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    if (!add.length) return;
    const seen = new Set(value.map((x) => x.toLowerCase()));
    onChange([...value, ...add.filter((x) => !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true))]);
    setText("");
  };
  return (
    <div className="fp-kw">
      {value.map((k) => <span key={k} className="fp-kw-chip">{k}<button type="button" aria-label={`Remover ${k}`} onClick={() => onChange(value.filter((x) => x !== k))}>×</button></span>)}
      <input value={text} placeholder={value.length ? "Mais uma…" : "Ex.: cupom, promoção"} onChange={(e) => { const v = e.target.value; if (/[,;]/.test(v)) push(v); else setText(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); push(text); } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => push(text)} />
    </div>
  );
}
