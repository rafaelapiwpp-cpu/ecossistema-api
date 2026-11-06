"use client";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";

/** Ligação tracejada com cantos arredondados; selecionada, mostra o botão de remover no meio. */
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, deletable }: EdgeProps) {
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 16, offset: 28 });
  const rf = useReactFlow();
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={18} />
      {selected && deletable !== false && (
        <EdgeLabelRenderer>
          <button
            type="button" className="fe-del nodrag nopan" aria-label="Remover ligação" title="Remover ligação"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            onClick={(e) => { e.stopPropagation(); rf.deleteElements({ edges: [{ id }] }); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
