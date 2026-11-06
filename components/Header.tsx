import Filters from "./Filters";
import SyncButton from "./SyncButton";
import { fmtDateTime } from "@/lib/format";
import type { Dataset } from "@/lib/types";

export default function Header({ title, subtitle, all, showPeriod = true }: { title: string; subtitle?: string; all: Dataset; showPeriod?: boolean }) {
  const last = all.lastSync;
  return (
    <>
      {all.demo && (
        <div className="banner">
          <b>Modo demonstração.</b> Os números abaixo são fictícios. Assim que o banco estiver conectado e a primeira configuração for feita, o painel passa a mostrar os dados reais das suas contas.
        </div>
      )}
      <div className="topbar">
        <div className="title">
          <h1>{title}</h1>
          <p>
            {subtitle}
            {last && <> · Última sincronização {fmtDateTime(last.finished_at || last.started_at)}{last.ok === false && <> (<a href="/conexoes" style={{ textDecoration: "underline" }}>com erros</a>)</>}</>}
          </p>
        </div>
        <div className="controls">
          <Filters wabas={all.wabas} showPeriod={showPeriod} />
          <SyncButton demo={all.demo} />
        </div>
      </div>
    </>
  );
}
