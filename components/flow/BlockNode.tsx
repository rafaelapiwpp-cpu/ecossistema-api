"use client";
import { createContext, memo, useContext, useEffect } from "react";
import { Handle, NodeToolbar, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { portsOf, splitBranchesOf, type NodeType } from "@/lib/flow-shared";
import { ADD_LABEL, BLOCK, blockItems, fmtCompact, portTone, type Ctx } from "./shared";
import { FIcon } from "./icons";

export type BlockData = { kind: NodeType; d: any };
export type BlockNodeType = Node<BlockData, "block">;

export type NodeStat = { entered: number; success: number; alerts: number; errors: number; waiting?: number };

// o que cada número quer dizer, por tipo de bloco (aparece ao passar o mouse)
const STAT_TIP: Partial<Record<NodeType, [string, string, string]>> = {
  template: ["Enviados e aceitos pela Meta (sem falha de entrega)", "Aceitos, mas a Meta não entregou depois (ex.: pagamento, número sem WhatsApp)", "Recusados pela Meta na hora do envio"],
  message: ["Mensagens enviadas", "Janela de 24 h fechada ou mensagem não entregue", "Recusadas pela Meta na hora do envio"],
  wait: ["Responderam", "Prazo esgotado sem resposta", "Erros"],
  start: ["Contatos que entraram (gatilho ou Iniciar)", "Alertas", "Erros"],
};
const TIP: [string, string, string] = ["Passaram por este bloco", "Alertas", "Erros"];
export type Stats = { nodes: Record<string, NodeStat>; branches: Record<string, Record<string, number>> } | null;
export type FlowUi = {
  ctx: Ctx | null; stats: Stats; canEdit: boolean; connected: Set<string>;
  onAdd: (id: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onCopy: (id: string) => void;
  /** item com chave dentro do cartão (ex.: gatilho do Início): abrir ou excluir */
  onItem?: (id: string, key: string, op: "open" | "delete") => void;
};
const noop = () => {};
export const FlowUiContext = createContext<FlowUi>({ ctx: null, stats: null, canEdit: false, connected: new Set(), onAdd: noop, onDelete: noop, onDuplicate: noop, onCopy: noop });

function BlockNodeInner({ id, data, selected }: NodeProps<BlockNodeType>) {
  const ui = useContext(FlowUiContext);
  const kind = data.kind;
  const meta = BLOCK[kind];
  const ports = portsOf({ id, type: kind, x: 0, y: 0, data: data.d });
  const update = useUpdateNodeInternals();
  const portKey = ports.map((p) => p.id).join("|");
  useEffect(() => { update(id); }, [portKey, id, update]);
  const items = blockItems(kind, data.d, ui.ctx);
  const st = ui.stats?.nodes[id];
  const counts = ui.stats?.branches[id];
  const title = String(data.d?.title || "").trim() || meta.label;
  const branches = kind === "split" ? splitBranchesOf(data.d) : [];
  const hasStats = kind !== "end";
  return (
    <div className={`fb k-${kind}${selected ? " sel" : ""}`}>
      {ui.canEdit && (
        <NodeToolbar isVisible={selected} position={Position.Top} offset={12} className="fb-tools">
          {kind !== "start" && <button type="button" onClick={() => ui.onDelete(id)} data-tip="Excluir bloco" aria-label="Excluir bloco"><FIcon name="trash" size={17} /></button>}
          {kind !== "start" && <button type="button" onClick={() => ui.onDuplicate(id)} data-tip="Duplicar bloco" aria-label="Duplicar bloco"><FIcon name="duplicate" size={17} /></button>}
          <button type="button" onClick={() => ui.onCopy(id)} data-tip="Copiar (para colar em outro fluxo)" aria-label="Copiar bloco"><FIcon name="page" size={17} /></button>
        </NodeToolbar>
      )}
      {kind !== "start" && <Handle type="target" position={Position.Left} className="fh fh-in" />}
      <div className="fb-main">
        <div className="fb-head">
          <span className="fb-ico" style={{ color: meta.color }}><FIcon name={meta.icon} size={19} stroke={2} /></span>
          <b className="fb-title" title={title}>{title}</b>
        </div>
        <p className="fb-desc">{meta.desc}</p>
        {items.map((it, i) => (
          <div key={it.key || i} className={`fb-item${it.mute ? " mute" : ""}${it.key ? " pick" : ""}`} onClick={it.key && ui.onItem ? (e) => { e.stopPropagation(); ui.onItem!(id, it.key!, "open"); } : undefined}>
            <span className="fb-item-ico"><FIcon name={it.icon} size={16} stroke={it.icon === "whatsapp" ? 1.8 : 1.9} /></span>
            <span className="fb-item-txt"><b>{it.title}</b>{it.sub ? <span>{it.sub}</span> : null}</span>
            {it.badge && <em className={`fb-badge ${it.badge.cls}`}>{it.badge.text}</em>}
            {it.key && ui.canEdit && ui.onItem && (
              <button type="button" className="fb-item-del nodrag" data-tip="Remover gatilho" aria-label="Remover gatilho" onClick={(e) => { e.stopPropagation(); ui.onItem!(id, it.key!, "delete"); }}><FIcon name="trash" size={15} /></button>
            )}
          </div>
        ))}
        {branches.map((b, i) => (
          <div key={b.id} className="fb-branch">
            <span className="fb-branch-l">{b.label}</span>
            {counts?.[b.id] != null && <span className="fb-count" title="contatos que seguiram por aqui">{fmtCompact(counts[b.id])}</span>}
            <b className="fb-branch-p">{String(b.pct).replace(".", ",")}%</b>
            <Handle type="source" position={Position.Right} id={b.id} className={`fh fh-out tone-${portTone(kind, b.id, i)}${ui.connected.has(`${id}|${b.id}`) ? " on" : ""}`} />
          </div>
        ))}
        {ui.canEdit && ADD_LABEL[kind] && (
          <button type="button" className="fb-add nodrag" onClick={(e) => { e.stopPropagation(); ui.onAdd(id); }}>
            <FIcon name="plus" size={14} stroke={2.2} />{ADD_LABEL[kind]}
          </button>
        )}
      </div>
      {kind !== "split" && ports.length > 0 && (
        <div className="fb-ports">
          {ports.map((p, i) => (
            <div key={p.id} className={`fb-port tone-${portTone(kind, p.id, i)}`}>
              {counts?.[p.id] != null && <span className="fb-count" title="contatos que seguiram por aqui">{fmtCompact(counts[p.id])}</span>}
              <span className="fb-port-l">{p.label}</span>
              <Handle type="source" position={Position.Right} id={p.id} className={`fh fh-out tone-${portTone(kind, p.id, i)}${ui.connected.has(`${id}|${p.id}`) ? " on" : ""}`} />
            </div>
          ))}
        </div>
      )}
      {hasStats && (
        <div className="fb-stats">
          <div title={(STAT_TIP[kind] || TIP)[0]}><b className="num">{fmtCompact(st?.success || 0)}</b><span>Sucessos</span></div>
          <div title={(STAT_TIP[kind] || TIP)[1]}><b className={`num${st?.alerts ? " warn" : ""}`}>{fmtCompact(st?.alerts || 0)}</b><span>Alertas</span></div>
          <div title={(STAT_TIP[kind] || TIP)[2]}><b className={`num${st?.errors ? " err" : ""}`}>{fmtCompact(st?.errors || 0)}</b><span>Erros</span></div>
        </div>
      )}
      {st?.waiting ? <div className="fb-wait">{fmtCompact(st.waiting)} {kind === "wait" ? "aguardando resposta" : "aguardando o prazo"}</div> : null}
    </div>
  );
}

export const BlockNode = memo(BlockNodeInner);
