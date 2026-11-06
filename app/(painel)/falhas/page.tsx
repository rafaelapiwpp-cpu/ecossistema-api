import Header from "@/components/Header";
import { getView, sum, type SP } from "@/lib/view";
import { fmtDateTime, fmtInt, fmtPct } from "@/lib/format";
import { META_ERROR_HINT } from "@/lib/meta-errors";

export const dynamic = "force-dynamic";

const HINT = META_ERROR_HINT;

export default async function Falhas({ searchParams }: { searchParams: SP }) {
  const { all, cur } = await getView(searchParams);
  const sent = sum(cur.messages, (r) => r.sent);
  const fails = cur.failures;
  const byCode = new Map<number, { title: string; n: number }>();
  for (const f of fails) {
    const k = f.error_code || 0;
    const x = byCode.get(k) || { title: f.error_title || "Erro", n: 0 };
    x.n++; byCode.set(k, x);
  }
  const codes = [...byCode.entries()].sort((a, b) => b[1].n - a[1].n);
  const max = Math.max(1, ...codes.map(([, x]) => x.n));
  const wname = (id: string | null) => all.wabas.find((w) => w.id === id)?.name || id || "—";
  const mask = (n: string | null) => (n ? `${n.slice(0, 4)}•••••${n.slice(-4)}` : "—");

  return (
    <>
      <Header title="Falhas de envio" subtitle={`${fmtInt(fails.length)} falhas · ${sent ? fmtPct(fails.length / sent) : "—"} das mensagens enviadas`} all={all} />
      {!all.demo && !fails.length && (
        <div className="banner">As falhas chegam pelo <b>webhook</b>. Se este quadro estiver sempre vazio, confira se o webhook está configurado no app da Meta com o campo <b>messages</b> assinado.</div>
      )}
      <div className="grid two">
        <div className="card">
          <h2>Motivos mais comuns</h2>
          <p className="sub">Código de erro informado pela Meta</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Motivo e o que fazer</th><th className="r">Falhas</th></tr></thead>
              <tbody>
                {codes.map(([code, x]) => (
                  <tr key={code}>
                    <td className="num"><b>{code || "—"}</b></td>
                    <td>{x.title}{HINT[code] && <div className="muted" style={{ fontSize: 12 }}>{HINT[code]}</div>}</td>
                    <td className="r num"><div className="bar-cell">{fmtInt(x.n)}<div className="bar-track"><div className="bar-fill" style={{ width: `${(x.n / max) * 100}%`, background: "var(--series-2)" }} /></div></div></td>
                  </tr>
                ))}
                {!codes.length && <tr><td colSpan={3} className="empty">Nenhuma falha no período</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Últimas falhas</h2>
          <p className="sub">Até 20 mais recentes</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Conta</th><th>Contato</th><th>Código</th></tr></thead>
              <tbody>
                {fails.slice(0, 20).map((f) => (
                  <tr key={f.wamid}>
                    <td className="num">{fmtDateTime(f.ts)}</td>
                    <td>{wname(f.waba_id)}</td>
                    <td className="num">{mask(f.recipient)}</td>
                    <td className="num" title={f.error_details || f.error_title || ""}>{f.error_code}</td>
                  </tr>
                ))}
                {!fails.length && <tr><td colSpan={4} className="empty">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
