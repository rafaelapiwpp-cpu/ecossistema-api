"use client";
// Prévia da mensagem num iPhone com o WhatsApp, do jeito que o lead recebe.
import { useEffect, useId, useState, type ReactNode } from "react";

export type PreviewButton = { type: "reply" | "url" | "phone" | "copy" | "other"; text: string };
export type PreviewMsg = {
  header?: { kind: "image" | "video" | "document" | "text"; src?: string | null; filename?: string | null; text?: string | null } | null;
  body: string;
  footer?: string | null;
  buttons?: PreviewButton[];
  listButton?: string | null;
};

/** Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~, ```monoespaçado```, links e variáveis sem valor. */
export function waFormat(text: string, key = "f"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /```([\s\S]+?)```|(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}])|(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}])|(?<![\p{L}\p{N}~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\p{L}\p{N}])|(\{\{\s*[\w.]+\s*\}\})|(https?:\/\/[^\s]+)/gu;
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}${i++}`;
    if (m[1] != null) out.push(<code key={k}>{m[1]}</code>);
    else if (m[2] != null) out.push(<b key={k}>{waFormat(m[2], k)}</b>);
    else if (m[3] != null) out.push(<i key={k}>{waFormat(m[3], k)}</i>);
    else if (m[4] != null) out.push(<s key={k}>{waFormat(m[4], k)}</s>);
    else if (m[5] != null) out.push(<mark key={k} className="wa-var" title="Variável sem valor">{m[5]}</mark>);
    else if (m[6] != null) out.push(<span key={k} className="wa-link">{m[6]}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BTN_ICON: Record<string, ReactNode> = {
  reply: <path d="M9.5 7 5 11.5 9.5 16M5 11.5h9a5 5 0 0 1 5 5V18" />,
  url: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M17 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 6 7h4.5" /></>,
  phone: <path d="M6 4h3l1.6 4-2 1.3a10.5 10.5 0 0 0 5.1 5.1L15 12.4l4 1.6v3a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2z" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.8" /></>,
  other: <path d="M9.5 7 5 11.5 9.5 16M5 11.5h9a5 5 0 0 1 5 5V18" />,
};
const Ico = ({ d, cls }: { d: ReactNode; cls?: string }) => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

function Media({ h }: { h: NonNullable<PreviewMsg["header"]> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [h.src]);
  if (h.kind === "document") {
    return (
      <div className="wa-docbox">
        <span className="wa-docico">PDF</span>
        <span className="wa-docname">{h.filename || "documento.pdf"}</span>
      </div>
    );
  }
  const ok = h.src && !failed;
  return (
    <div className={`wa-media ${h.kind}`}>
      {ok && h.kind === "image" && <img src={h.src!} alt="" onError={() => setFailed(true)} />}
      {ok && h.kind === "video" && <video src={h.src!} muted playsInline preload="metadata" onError={() => setFailed(true)} />}
      {!ok && (
        <div className="wa-media-ph">
          <Ico d={h.kind === "video" ? <><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></> : <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>} />
          <span>{h.filename || (h.kind === "video" ? "Envie o vídeo do cabeçalho" : "Envie a imagem do cabeçalho")}</span>
        </div>
      )}
      {h.kind === "video" && <span className="wa-play"><Ico d={<path d="M9 7v10l8-5-8-5z" fill="currentColor" />} /></span>}
    </div>
  );
}

/** Papel de parede com desenhos discretos, como o do WhatsApp (cor vem do tema). */
function Wallpaper() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="wa-wall" aria-hidden>
      <defs>
        <pattern id={`wa${id}`} width="74" height="74" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <g fill="none" stroke="var(--wa-doodle)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 14a6 6 0 1 1 12 0 6 6 0 1 1-12 0z" />
            <path d="M40 8l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L31 15l6-1z" />
            <path d="M60 30c3-4 9-4 10 1 1 4-5 8-10 11-5-3-11-7-10-11 1-5 7-5 10-1z" />
            <path d="M12 44h14v10H12zM12 44l7 5 7-5" />
            <path d="M44 50c0-4 3-7 7-7M44 56c0-8 6-14 14-14" />
            <path d="M30 66a4 4 0 0 0 8 0M27 62h.01M41 62h.01" />
            <path d="M64 62l6 6M70 62l-6 6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#wa${id})`} />
    </svg>
  );
}

export function PhonePreview({ msg, business, caption }: { msg: PreviewMsg; business: string; caption?: ReactNode }) {
  const [time, setTime] = useState("");
  useEffect(() => { const f = () => setTime(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date())); f(); const t = setInterval(f, 30000); return () => clearInterval(t); }, []);
  const initials = business.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "W";
  const buttons = msg.buttons || [];
  return (
    <figure className="phone-wrap">
      <div className="iphone" role="img" aria-label="Prévia da mensagem no WhatsApp">
        <span className="iphone-btn a" /><span className="iphone-btn b" /><span className="iphone-btn c" />
        <div className="iphone-screen">
          <div className="ios-status">
            <span className="ios-time">{time || "9:41"}</span>
            <span className="ios-island" />
            <span className="ios-ind">
              <svg viewBox="0 0 18 12" aria-hidden><rect x="0" y="8" width="3" height="4" rx=".8" /><rect x="5" y="5.5" width="3" height="6.5" rx=".8" /><rect x="10" y="3" width="3" height="9" rx=".8" /><rect x="15" y="0" width="3" height="12" rx=".8" /></svg>
              <svg viewBox="0 0 16 12" aria-hidden><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5zM3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.1 1.1a5 5 0 0 0-7 0L3.4 6.8zM1.1 4.5a9.7 9.7 0 0 1 13.8 0l-1.1 1.1a8.2 8.2 0 0 0-11.6 0L1.1 4.5z" /></svg>
              <span className="ios-batt"><i /></span>
            </span>
          </div>
          <div className="wa-bar">
            <span className="wa-back"><Ico d={<path d="M14.5 5.5 8 12l6.5 6.5" />} /></span>
            <span className="wa-avatar">{initials}</span>
            <span className="wa-who"><b>{business}</b><small>Conta comercial</small></span>
            <span className="wa-acts"><Ico d={<><rect x="3" y="6.5" width="12" height="11" rx="2.5" /><path d="m15 10.5 5.5-3v9L15 13.5" /></>} /><Ico d={BTN_ICON.phone} /></span>
          </div>
          <div className="wa-chat">
            <Wallpaper />
            <div className="wa-day">Hoje</div>
            <div className="wa-sys">Esta empresa usa um serviço seguro da Meta para gerenciar esta conversa.</div>
            <div className="wa-msg">
              <div className={`wa-bubble${buttons.length || msg.listButton ? " has-btns" : ""}`}>
                {msg.header && msg.header.kind !== "text" && <Media h={msg.header} />}
                {msg.header?.kind === "text" && msg.header.text ? <div className="wa-htext">{waFormat(msg.header.text, "h")}</div> : null}
                {msg.body ? <div className="wa-text">{waFormat(msg.body)}</div> : <div className="wa-text wa-empty">Escreva a mensagem…</div>}
                {msg.footer ? <div className="wa-foot">{msg.footer}</div> : null}
                <span className="wa-time">{time}</span>
                {msg.listButton ? <div className="wa-listbtn"><Ico d={BTN_ICON.list} />{msg.listButton}</div> : null}
              </div>
              {buttons.length > 0 && (
                <div className="wa-btns">
                  {buttons.map((b, i) => <div key={i} className="wa-btn"><Ico d={BTN_ICON[b.type] || BTN_ICON.reply} />{b.text || "Botão"}</div>)}
                </div>
              )}
            </div>
          </div>
          <div className="wa-input">
            <Ico d={<path d="M12 5v14M5 12h14" />} />
            <span className="wa-field">Mensagem</span>
            <Ico d={<><rect x="3.5" y="6.5" width="17" height="13" rx="3" /><circle cx="12" cy="13" r="3.4" /><path d="M8.5 6.5 10 4h4l1.5 2.5" /></>} />
            <Ico d={<><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>} />
          </div>
          <span className="ios-home" />
        </div>
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Monta a prévia de um template (componentes da Meta) com os valores já resolvidos. */
export function templatePreview(components: any[] | null | undefined, opts: { body: string; headerText?: string | null; headerSrc?: string | null; headerFile?: string | null }): PreviewMsg {
  const comps = components || [];
  const header = comps.find((c: any) => c?.type === "HEADER");
  const footer = comps.find((c: any) => c?.type === "FOOTER")?.text || null;
  const btns = ((comps.find((c: any) => c?.type === "BUTTONS")?.buttons || []) as any[]).map((b): PreviewButton => ({
    type: b.type === "QUICK_REPLY" ? "reply" : b.type === "URL" ? "url" : b.type === "PHONE_NUMBER" ? "phone" : b.type === "COPY_CODE" ? "copy" : "other",
    text: b.type === "COPY_CODE" ? "Copiar código" : String(b.text || ""),
  }));
  const fmt = header ? String(header.format || "TEXT").toLowerCase() : null;
  return {
    header: fmt === "image" || fmt === "video" || fmt === "document" ? { kind: fmt, src: opts.headerSrc || null, filename: opts.headerFile || null } : fmt === "text" ? { kind: "text", text: opts.headerText ?? header?.text ?? "" } : null,
    body: opts.body, footer, buttons: btns,
  };
}
