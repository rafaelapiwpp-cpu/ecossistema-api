"use client";
// Atalho de teleentrega na caixa de mensagem: a pessoa digita o CEP, o bairro ou "3 km", vê a faixa e o valor
// e insere o texto pronto (o da empresa, em Teleentrega) na mensagem — que ainda pode ser editado antes de enviar.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Nav";
import { fmtCep, lookup, money, renderMessage, zoneLabel, type DeliverySettings, type Zone } from "@/lib/delivery";

type Data = { company: { id: number; name: string; slug: string }; zones: Zone[]; settings: DeliverySettings };
const cache = new Map<number, { at: number; data: Data }>();
const TTL = 60_000;
const num = (v: number) => String(v).replace(".", ",");

export default function DeliveryQuick({ companyId, portalSlug, disabled, onInsert }: { companyId: number; portalSlug: string | null; disabled: boolean; onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = cache.get(companyId);
    if (c && Date.now() - c.at < TTL) { setD(c.data); return; }
    setD(null); setErr("");
    fetch(`/api/teleentrega?company=${encodeURIComponent(String(companyId))}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erro ${r.status}`); cache.set(companyId, { at: Date.now(), data: j }); setD(j); })
      .catch((e) => setErr(e.message));
  }, [open, companyId]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);

  const r = d ? lookup(d.zones, d.settings, q) : null;
  const insert = (text: string) => { onInsert(text); setOpen(false); setQ(""); };
  const msg = (local: string, valor: number, extra: { cep?: string; km?: string } = {}) => renderMessage(d?.settings.message, { local, valor: money(valor), ...extra });
  const row = (key: string | number, title: string, sub: string, valor: number, text: string) => (
    <button type="button" key={key} className="at-dl-row" onClick={() => insert(text)} title="Inserir na mensagem">
      <span><b>{title}</b><small>{sub}</small></span><strong>{money(valor)}</strong>
    </button>
  );
  let body: React.ReactNode;
  if (err) body = <p className="at-dl-none">{err}</p>;
  else if (!d) body = <p className="at-dl-none">Carregando…</p>;
  else if (!d.zones.length && !d.settings.km_price) body = <p className="at-dl-none">Nenhuma faixa cadastrada ainda.{portalSlug ? <> <a href={`/${portalSlug}/teleentrega`}>Cadastrar em Tele-entrega</a>.</> : ""}</p>;
  else if (!r) {
    const first = d.zones.slice(0, 6);
    body = <>{first.map((z) => row(z.id, zoneLabel(z), z.cep_start ? `${fmtCep(z.cep_start)} a ${fmtCep(z.cep_end)}` : "faixa pelo nome", z.cost, msg(zoneLabel(z), z.cost)))}{d.zones.length > 6 && <p className="at-dl-none">… e mais {d.zones.length - 6}. Digite para filtrar.</p>}{d.settings.note && <p className="at-dl-note">{d.settings.note}</p>}</>;
  } else if (r.kind === "cep") {
    body = r.zone ? row("cep", zoneLabel(r.zone), `CEP ${fmtCep(r.cep)}`, r.zone.cost, msg(zoneLabel(r.zone), r.zone.cost, { cep: fmtCep(r.cep) })) : <p className="at-dl-none">Nenhuma faixa cobre o CEP {fmtCep(r.cep)}.{d.settings.km_price ? " Tente pela distância (ex.: 3 km)." : ""}</p>;
  } else if (r.kind === "km") {
    body = r.cost != null ? row("km", `${num(r.km)} km`, `${money(d.settings.km_price)} por km${d.settings.min_cost ? ` · mínimo ${money(d.settings.min_cost)}` : ""}`, r.cost, msg(`${num(r.km)} km de distância`, r.cost, { km: num(r.km) })) : <p className="at-dl-none">Sem valor por km cadastrado.</p>;
  } else {
    body = r.zones.length ? r.zones.map((z) => row(z.id, zoneLabel(z), z.cep_start ? `${fmtCep(z.cep_start)} a ${fmtCep(z.cep_end)}` : "faixa pelo nome", z.cost, msg(zoneLabel(z), z.cost))) : <p className="at-dl-none">Nenhum bairro com "{r.q}".</p>;
  }
  return (
    <div className="at-clip at-dl" ref={wrap}>
      <button type="button" className={`at-ibtn${open ? " on" : ""}`} title="Tele-entrega: consultar o valor por CEP, bairro ou km" aria-label="Tele-entrega" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <Icon name="delivery" size={19} className="" />
      </button>
      {open && (
        <div className="at-clip-menu at-dl-menu" role="dialog" aria-label="Tele-entrega">
          <label className="at-search"><Icon name="search" size={14} className="" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="CEP, bairro ou km (ex.: 3 km)" aria-label="CEP, bairro ou km" /></label>
          <div className="at-dl-list">{body}</div>
          <div className="at-quick-foot"><span>Clique para inserir o texto na mensagem</span></div>
        </div>
      )}
    </div>
  );
}
