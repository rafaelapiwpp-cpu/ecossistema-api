import type { ReactNode, TextareaHTMLAttributes } from "react";
import { Glyph, type GlyphName } from "./glyph";
import { Tick, type MessageStatus } from "./status";
import { buttonClass } from "./actions";
import { cx } from "./cx";

/**
 * Caixa de entrada (Portal → Atendimento). Uma conversa é:
 *   <Thread> com <DaySeparator>, <MessageBubble> e <ThreadEvent>
 *   + <Composer> no rodapé, cujo estado vem da janela de 24 h e do consentimento.
 */

export function Thread({ children, label = "Mensagens da conversa" }: { children: ReactNode; label?: string }) {
  return (
    <div className="eco-thread" role="log" aria-label={label} aria-live="polite">
      {children}
    </div>
  );
}

/** "Hoje", "Ontem", "12 mar 2026". */
export function DaySeparator({ children }: { children: ReactNode }) {
  return (
    <div className="eco-day" role="separator">
      <span>{children}</span>
    </div>
  );
}

export interface MessageBubbleProps {
  /** `in` = contato · `out` = empresa (atendente, fluxo ou campanha). */
  direction: "in" | "out";
  /** Hora curta "14:32" (a data completa vai no `title`). */
  time: string;
  /** Data e hora completas para o tooltip. */
  timestamp?: string;
  /** Só em `out`. */
  status?: MessageStatus;
  /** Quem enviou, em `out`: "Ana", "Fluxo · Boas-vindas", "Campanha · Black Friday". */
  author?: string;
  /** Mensagem enviada a partir de um template aprovado. */
  template?: string;
  /** Mídia: mostra um quadro com o tipo e o nome do arquivo. */
  media?: { kind: "image" | "video" | "document" | "audio"; name?: string };
  /** Motivo da falha (erro da Meta já traduzido). */
  failedReason?: string;
  /** Mensagem seguida do mesmo lado: esconde autor e junta ao balão anterior. */
  grouped?: boolean;
  children?: ReactNode;
}

const MEDIA: Record<NonNullable<MessageBubbleProps["media"]>["kind"], { icon: GlyphName; label: string }> = {
  image: { icon: "image", label: "Imagem" },
  video: { icon: "video", label: "Vídeo" },
  document: { icon: "file", label: "Documento" },
  audio: { icon: "file", label: "Áudio" },
};

export function MessageBubble({ direction, time, timestamp, status, author, template, media, failedReason, grouped, children }: MessageBubbleProps) {
  const failed = status === "failed";
  return (
    <div className={cx("eco-msg", `eco-msg--${direction}`, grouped && "eco-msg--grouped", failed && "eco-msg--failed")}>
      {author && !grouped && <span className="eco-msg__author">{author}</span>}
      <div className="eco-bubble">
        {template && (
          <span className="eco-bubble__tag">
            <Glyph name="template" />
            Template · {template}
          </span>
        )}
        {media && (
          <span className="eco-bubble__media">
            <Glyph name={MEDIA[media.kind].icon} />
            {media.name ?? MEDIA[media.kind].label}
          </span>
        )}
        {children && <span>{children}</span>}
        <span className="eco-bubble__meta" title={timestamp}>
          {time}
          {direction === "out" && status && <Tick status={status} />}
        </span>
      </div>
      {failed && failedReason && (
        <span className="eco-msg__error">
          <Glyph name="alert" />
          {failedReason}
        </span>
      )}
    </div>
  );
}

/**
 * Evento do sistema no meio da conversa (sem balão): opt-out, atribuição,
 * janela fechada, conversa encerrada. `intent` colore só o ícone.
 */
export function ThreadEvent({
  icon = "info",
  intent,
  time,
  children,
}: {
  icon?: GlyphName;
  intent?: "danger" | "warning" | "success";
  time?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("eco-event", intent && `eco-event--${intent}`)} role="note">
      <Glyph name={icon} />
      <span>
        {children}
        {time && <span className="eco-muted"> · {time}</span>}
      </span>
    </div>
  );
}

/**
 * Situação da janela de 24 h. Aberta: "fecha em 5 h 12 min". Fechando (< 1 h): em warning.
 * Fechada: "fechou há 3 h — só template aprovado".
 */
export function WindowStatus({ state, remaining, closedAgo }: { state: "open" | "closing" | "closed"; remaining?: string; closedAgo?: string }) {
  return (
    <span className={cx("eco-window", state === "closing" && "eco-window--closing")}>
      <Glyph name="clock" />
      {state === "closed" ? (
        <span>
          Janela de 24 h fechada{closedAgo && ` há ${closedAgo}`} · <b>só template aprovado</b>
        </span>
      ) : (
        <span>
          Janela de 24 h aberta · fecha em <b>{remaining ?? "—"}</b>
        </span>
      )}
    </span>
  );
}

export interface ComposerProps {
  /**
   * `open` = janela aberta, texto livre.
   * `window_closed` = só template aprovado (texto livre desabilitado).
   * `opted_out` = bloqueado: o contato pediu para não receber; nenhuma ação de envio.
   */
  state: "open" | "window_closed" | "opted_out";
  /** Tempo restante da janela, quando aberta ("5 h 12 min"). */
  windowRemaining?: string;
  /** Menos de 1 h para fechar: destaca o tempo em warning. */
  windowClosing?: boolean;
  /** Há quanto tempo a janela fechou ("3 h"). */
  windowClosedAgo?: string;
  /** Detalhe do opt-out: "em 12 mar 2026, pela palavra-chave SAIR". */
  optOutDetail?: string;
  /** Props do textarea (name, value, onChange…). */
  textarea?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  onSend?: () => void;
  onPickTemplate?: () => void;
  onAttach?: () => void;
  /** Desabilita o envio (ex.: texto vazio, enviando). */
  sendDisabled?: boolean;
}

export function Composer({
  state,
  windowRemaining,
  windowClosing,
  windowClosedAgo,
  optOutDetail,
  textarea,
  onSend,
  onPickTemplate,
  onAttach,
  sendDisabled,
}: ComposerProps) {
  if (state === "opted_out") {
    return (
      <div className="eco-composer eco-composer--blocked" role="status">
        <span className="eco-composer__lock">
          <Glyph name="lock" />
        </span>
        <span className="eco-composer__blocked-text">
          <b>Este contato pediu para não receber mensagens</b>
          <span>
            Opt-out{optOutDetail ? ` ${optOutDetail}` : ""}. Não é possível enviar mensagens nem templates para este número. Só o próprio contato pode voltar a
            receber, pedindo isso numa nova conversa.
          </span>
        </span>
      </div>
    );
  }

  const closed = state === "window_closed";
  const closing = !closed && Boolean(windowClosing);

  return (
    <div className={cx("eco-composer", closed && "eco-composer--locked")}>
      <div className="eco-composer__box">
        <textarea
          rows={1}
          aria-label="Mensagem"
          placeholder={closed ? "Janela fechada: envie um template aprovado para retomar" : "Escreva uma mensagem"}
          disabled={closed}
          {...textarea}
        />
      </div>
      <div className="eco-composer__foot">
        <WindowStatus state={closed ? "closed" : closing ? "closing" : "open"} remaining={windowRemaining} closedAgo={windowClosedAgo} />
        {!closed && (
          <button type="button" className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })} aria-label="Anexar arquivo" onClick={onAttach}>
            <Glyph name="paperclip" width={16} height={16} />
          </button>
        )}
        <button type="button" className={buttonClass({ variant: closed ? "primary" : "secondary", size: "sm" })} onClick={onPickTemplate}>
          <Glyph name="template" width={16} height={16} />
          {closed ? "Enviar template" : "Template"}
        </button>
        {!closed && (
          <button type="button" className={buttonClass({ variant: "primary", size: "sm" })} onClick={onSend} disabled={sendDisabled}>
            <Glyph name="send" width={16} height={16} />
            Enviar
          </button>
        )}
      </div>
    </div>
  );
}
