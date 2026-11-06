"use client";
import { useEffect, useRef, useState } from "react";

const VERTICAL_LABEL: Record<string, string> = {
  UNDEFINED: "Não informado", OTHER: "Outro", AUTO: "Automotivo", BEAUTY: "Beleza, spa e salão", APPAREL: "Roupas e acessórios", EDU: "Educação", ENTERTAIN: "Entretenimento",
  EVENT_PLAN: "Eventos", FINANCE: "Finanças e bancos", GROCERY: "Mercado e alimentos", GOVT: "Serviço público", HOTEL: "Hotel e hospedagem", HEALTH: "Saúde e medicina",
  NONPROFIT: "Organização sem fins lucrativos", PROF_SERVICES: "Serviços profissionais", RETAIL: "Varejo e compras", TRAVEL: "Viagens e transporte", RESTAURANT: "Restaurante", NOT_A_BIZ: "Não é empresa",
};
type Profile = { about?: string; address?: string; description?: string; email?: string; profile_picture_url?: string; websites?: string[]; vertical?: string };

export default function PhoneProfileButton({ phoneNumberId, label, canEdit }: { phoneNumberId: string; label: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setOpen(true)}>Perfil</button>
      {open && <ProfileModal phoneNumberId={phoneNumberId} label={label} canEdit={canEdit} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileModal({ phoneNumberId, label, canEdit, onClose }: { phoneNumberId: string; label: string; canEdit: boolean; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => fetch(`/api/numeros?phone_number_id=${phoneNumberId}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); setP({ websites: [], ...j.profile }); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!p) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/numeros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number_id: phoneNumberId, about: p.about || "", address: p.address || "", description: p.description || "", email: p.email || "", websites: p.websites || [], vertical: p.vertical || "UNDEFINED" }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ? `${j.error}${j.details ? ` — ${j.details}` : ""}` : "Erro");
      setMsg("Perfil salvo na Meta. Pode levar alguns minutos para aparecer no WhatsApp dos clientes.");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const photo = async (file: File) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("phone_number_id", phoneNumberId);
      const r = await fetch("/api/numeros", { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro no upload");
      setMsg("Foto enviada. A Meta atualiza a imagem em alguns minutos."); setTimeout(load, 2000);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const web = (i: number, v: string) => setP((x) => { const w = [...(x?.websites || [])]; w[i] = v; return { ...x!, websites: w }; });

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Perfil do número · {label}</h2><button className="btn icon" onClick={onClose}>×</button></div>
        {err && <div className="banner err">{err}</div>}
        {msg && <div className="banner">{msg}</div>}
        {!p ? <p className="muted">Carregando o perfil na Meta…</p> : (
          <div className="grid" style={{ gap: 10 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {p.profile_picture_url ? <img src={p.profile_picture_url} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} /> : <span className="avatar" style={{ width: 64, height: 64, fontSize: 20 }}>{label.slice(0, 2).toUpperCase()}</span>}
              {canEdit && <label className="field" style={{ flex: 1 }}><span>Foto de perfil (JPG/PNG quadrada, até 5 MB)</span><input ref={fileRef} type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(e) => e.target.files?.[0] && photo(e.target.files[0])} /></label>}
            </div>
            <label className="field"><span>Recado (about) · até 139</span><input value={p.about || ""} onChange={(e) => setP({ ...p, about: e.target.value })} disabled={!canEdit} /></label>
            <label className="field"><span>Descrição da empresa · até 512</span><textarea rows={3} value={p.description || ""} onChange={(e) => setP({ ...p, description: e.target.value })} disabled={!canEdit} style={{ fontFamily: "inherit", fontSize: 14 }} /></label>
            <div className="kv-row">
              <label className="field"><span>Endereço</span><input value={p.address || ""} onChange={(e) => setP({ ...p, address: e.target.value })} disabled={!canEdit} /></label>
              <label className="field"><span>E-mail</span><input value={p.email || ""} onChange={(e) => setP({ ...p, email: e.target.value })} disabled={!canEdit} /></label>
            </div>
            <div className="kv-row">
              <label className="field"><span>Site 1</span><input value={p.websites?.[0] || ""} onChange={(e) => web(0, e.target.value)} disabled={!canEdit} placeholder="https://" /></label>
              <label className="field"><span>Site 2</span><input value={p.websites?.[1] || ""} onChange={(e) => web(1, e.target.value)} disabled={!canEdit} placeholder="https://" /></label>
            </div>
            <label className="field"><span>Segmento</span><select value={p.vertical || "UNDEFINED"} onChange={(e) => setP({ ...p, vertical: e.target.value })} disabled={!canEdit}>{Object.entries(VERTICAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {canEdit && <div className="wizard-foot"><button className="btn" onClick={onClose}>Fechar</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar na Meta"}</button></div>}
          </div>
        )}
      </div>
    </div>
  );
}
