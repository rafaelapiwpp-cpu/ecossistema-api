"use client";
// Atendimento: menu do clipe (fotos e vídeos, documento, áudio, câmera), prévia dos anexos antes de enviar e
// aviso de "solte para anexar" ao arrastar arquivos.
import { useEffect, useRef, useState } from "react";
import { KIND_LABEL, type MediaKind } from "@/lib/media-types";
import { fmtSize, type Staged } from "./attach";
import { Icon } from "../Nav";

const ICON: Record<MediaKind, string> = { image: "image", video: "video", audio: "audio", document: "doc" };

/** Clipe com as opções de envio. Cada opção abre o seletor já filtrado e aceita vários arquivos. */
export function ClipMenu({ disabled, onPick }: { disabled: boolean; onPick: (files: File[], asDoc: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLInputElement>(null), doc = useRef<HTMLInputElement>(null), audio = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  useEffect(() => { setTouch(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches); }, []);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  const take = (asDoc: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []); e.target.value = ""; setOpen(false);
    if (fs.length) onPick(fs, asDoc);
  };
  const opt = (icon: string, label: string, sub: string, input: React.RefObject<HTMLInputElement | null>) => (
    <button type="button" role="menuitem" onClick={() => input.current?.click()}>
      <span className={`at-clip-ico i-${icon}`}><Icon name={icon} size={18} className="" /></span>
      <span className="at-clip-txt"><b>{label}</b><small>{sub}</small></span>
    </button>
  );
  return (
    <div className="at-clip" ref={wrap}>
      <button type="button" className={`at-ibtn${open ? " on" : ""}`} title="Anexar fotos, vídeos, documentos ou áudios" aria-label="Anexar" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <Icon name="paperclip" size={19} className="" />
      </button>
      {open && (
        <div className="at-clip-menu" role="menu" aria-label="Anexar">
          {opt("image", "Fotos e vídeos", "JPG, PNG e MP4 · vários de uma vez", media)}
          {opt("doc", "Documento", "PDF, Word, Excel, PowerPoint, TXT", doc)}
          {opt("audio", "Áudio", "MP3, M4A, OGG, AAC ou AMR", audio)}
          {touch && opt("camera", "Câmera", "Tirar uma foto agora", cam)}
          <p className="at-clip-tip">Dica: cole uma imagem (Ctrl+V) ou arraste arquivos para a conversa.</p>
        </div>
      )}
      <input ref={media} type="file" hidden multiple accept="image/*,video/*" onChange={take(false)} />
      <input ref={doc} type="file" hidden multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,video/*,audio/*" onChange={take(true)} />
      <input ref={audio} type="file" hidden multiple accept="audio/*,.mp3,.m4a,.ogg,.opus,.aac,.amr" onChange={take(false)} />
      <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={take(false)} />
    </div>
  );
}

/** Prévia dos anexos: um por vez em destaque, legenda por arquivo, miniaturas, remover, adicionar mais e enviar. */
export function AttachTray({ items, to, onCaption, onRemove, onAdd, onSend, onCancel }: {
  items: Staged[]; to: string; onCaption: (id: string, caption: string) => void; onRemove: (id: string) => void;
  onAdd: (files: File[]) => void; onSend: () => void; onCancel: () => void;
}) {
  const [active, setActive] = useState(0);
  const cap = useRef<HTMLTextAreaElement>(null);
  const more = useRef<HTMLInputElement>(null);
  const i = Math.min(active, items.length - 1);
  const cur = items[i];
  const ok = items.filter((x) => !x.error).length;
  useEffect(() => { if (active > items.length - 1) setActive(Math.max(0, items.length - 1)); }, [items.length, active]);
  useEffect(() => { cap.current?.focus(); }, [cur?.id]);
  if (!cur) return null;
  const noCaption = !!cur.error || cur.kind === "audio";
  return (
    <div className="at-tray" role="dialog" aria-label="Enviar arquivos" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <div className="at-tray-head">
        <button type="button" className="at-ibtn" onClick={onCancel} aria-label="Cancelar" title="Cancelar (Esc)"><Icon name="close" size={19} className="" /></button>
        <b>{items.length === 1 ? "Enviar arquivo" : `Enviar ${items.length} arquivos`}<small>para {to}</small></b>
      </div>
      <div className="at-tray-view">
        {cur.kind === "image" && !cur.error ? <img src={cur.url} alt={cur.name} />
          : cur.kind === "video" && !cur.error ? <video key={cur.id} src={cur.url} controls preload="metadata" />
          : (
            <div className="at-tray-file">
              <span className={`at-tray-fico k-${cur.error ? "err" : cur.kind}`}><Icon name={cur.error ? "alert" : ICON[cur.kind]} size={34} className="" /></span>
              <b title={cur.name}>{cur.name}</b>
              <small>{KIND_LABEL[cur.kind]} · {fmtSize(cur.size)}</small>
              {cur.kind === "audio" && !cur.error && <audio key={cur.id} src={cur.url} controls preload="metadata" />}
            </div>
          )}
      </div>
      <div className={`at-tray-info${cur.error ? " err" : ""}`}>
        <Icon name={cur.error ? "alert" : ICON[cur.kind]} size={15} className="" />
        <span>{cur.error || <>Vai como <b>{KIND_LABEL[cur.kind].toLowerCase()}</b> · {fmtSize(cur.size)}{cur.note ? ` · ${cur.note}` : ""}</>}</span>
      </div>
      <div className="at-tray-cap">
        <textarea ref={cap} rows={1} value={cur.caption} maxLength={1024} disabled={noCaption}
          placeholder={cur.error ? "Este arquivo não será enviado" : cur.kind === "audio" ? "Áudio vai sem legenda" : "Adicione uma legenda (opcional)…"}
          onChange={(e) => onCaption(cur.id, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ok) onSend(); } }} />
      </div>
      <div className="at-tray-foot">
        <div className="at-tray-thumbs">
          {items.map((it, k) => (
            <div key={it.id} className={`at-thumb${k === i ? " on" : ""}${it.error ? " err" : ""}`}>
              <button type="button" className="at-thumb-btn" onClick={() => setActive(k)} title={`${it.name} · ${it.error ? "não será enviado" : KIND_LABEL[it.kind]}`} aria-label={`Ver ${it.name}`}>
                {it.kind === "image" && !it.error ? <img src={it.url} alt="" />
                  : it.kind === "video" && !it.error ? <><video src={it.url} muted preload="metadata" /><em><Icon name="video" size={11} className="" /></em></>
                  : <Icon name={it.error ? "alert" : ICON[it.kind]} size={20} className="" />}
              </button>
              <button type="button" className="at-thumb-x" onClick={() => onRemove(it.id)} aria-label={`Tirar ${it.name}`} title="Tirar da lista">×</button>
            </div>
          ))}
          <button type="button" className="at-thumb-add" onClick={() => more.current?.click()} title="Adicionar mais arquivos" aria-label="Adicionar mais arquivos"><Icon name="plus" size={20} className="" /></button>
          <input ref={more} type="file" hidden multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) onAdd(fs); }} />
        </div>
        <button type="button" className="at-tray-send" onClick={onSend} disabled={!ok} aria-label={ok > 1 ? `Enviar ${ok} arquivos` : "Enviar"} title={ok < items.length ? `${items.length - ok} arquivo(s) com problema ficam de fora` : "Enviar (Enter)"}>
          <Icon name="send" size={21} className="" />{ok > 1 && <i>{ok}</i>}
        </button>
      </div>
      {ok < items.length && <p className="at-tray-skip"><Icon name="alert" size={13} className="" />{items.length - ok === 1 ? "1 arquivo não pode ser enviado" : `${items.length - ok} arquivos não podem ser enviados`} — veja o aviso em vermelho ou tire da lista.</p>}
    </div>
  );
}

/** Aviso ao arrastar arquivos sobre a conversa. */
export function DropOverlay({ closed }: { closed: boolean }) {
  return (
    <div className={`at-drop${closed ? " closed" : ""}`}>
      <div>
        <Icon name={closed ? "alert" : "paperclip"} size={30} className="" />
        <b>{closed ? "Janela de 24 h fechada" : "Solte para anexar"}</b>
        <span>{closed ? "Anexos só depois que o cliente escrever (ou envie um template)." : "Fotos, vídeos, áudios e documentos — você confere antes de enviar."}</span>
      </div>
    </div>
  );
}
