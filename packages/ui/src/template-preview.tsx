import type { ReactNode } from "react";
import { Glyph, type GlyphName } from "./glyph";

export type TemplateHeader =
  | { type: "text"; text: string }
  | { type: "image" | "video" | "document"; name?: string };

export type TemplateButton = {
  type: "quick_reply" | "url" | "phone" | "copy_code" | "opt_out";
  text: string;
};

export interface TemplatePreviewProps {
  /** Corpo como cadastrado na Meta: `{{1}}`, `{{2}}` e formatação do WhatsApp (*negrito*, _itálico_, ~riscado~). */
  body: string;
  header?: TemplateHeader;
  footer?: string;
  /** Botões abaixo do balão. Passe `[]` para conferir a regra de descadastro mesmo sem botões. */
  buttons?: TemplateButton[];
  /**
   * Valores de exemplo das variáveis, por número (`{ "1": "Ana" }`) ou em ordem (`["Ana"]`).
   * Sem valor, a variável aparece como `{{n}}` em warning e a prévia avisa (só quando `variables` é passado).
   */
  variables?: Record<string, string> | string[];
  /** Destaca as variáveis preenchidas (para quem edita). `false` mostra exatamente o texto final. */
  highlightVariables?: boolean;
  /** Nome exibido do remetente, acima do balão. */
  businessName?: string;
  /** Categoria e idioma, acima da prévia. */
  meta?: ReactNode;
  time?: string;
  /** Com `marketing`, avisa se faltar o botão de descadastro. */
  category?: "marketing" | "utility" | "authentication" | (string & {});
}

const BUTTON_ICON: Record<TemplateButton["type"], GlyphName> = {
  quick_reply: "reply",
  url: "external",
  phone: "phone",
  copy_code: "copy",
  opt_out: "log-out",
};

const MEDIA_ICON: Record<"image" | "video" | "document", { icon: GlyphName; label: string }> = {
  image: { icon: "image", label: "Imagem" },
  video: { icon: "video", label: "Vídeo" },
  document: { icon: "file", label: "Documento" },
};

function variableValue(variables: TemplatePreviewProps["variables"], n: string): string | undefined {
  if (!variables) return undefined;
  if (Array.isArray(variables)) return variables[Number(n) - 1] || undefined;
  return variables[n] || undefined;
}

/** Aplica variáveis e a formatação do WhatsApp. Não interpreta HTML: tudo vira texto. */
function renderBody(body: string, variables: TemplatePreviewProps["variables"], highlight: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\{\{\s*(\d+)\s*\}\}|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(body.slice(last, m.index));
    if (m[1] !== undefined) {
      const v = variableValue(variables, m[1]);
      out.push(
        v === undefined ? (
          <span key={k++} className="eco-var eco-var--missing" title={`Variável {{${m[1]}}} sem exemplo`}>
            {`{{${m[1]}}}`}
          </span>
        ) : highlight ? (
          <span key={k++} className="eco-var" title={`Variável {{${m[1]}}}`}>
            {v}
          </span>
        ) : (
          v
        ),
      );
    } else if (m[2] !== undefined) out.push(<strong key={k++}>{renderBody(m[2], variables, highlight)}</strong>);
    else if (m[3] !== undefined) out.push(<em key={k++}>{renderBody(m[3], variables, highlight)}</em>);
    else if (m[4] !== undefined) out.push(<s key={k++}>{renderBody(m[4], variables, highlight)}</s>);
    last = re.lastIndex;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

/**
 * Prévia do template como o contato vê no WhatsApp: cabeçalho, corpo com variáveis,
 * rodapé e botões abaixo do balão. Avisa quando falta exemplo de variável e quando um
 * template de marketing não tem botão de descadastro.
 */
export function TemplatePreview({
  body,
  header,
  footer,
  buttons,
  variables,
  highlightVariables = true,
  businessName,
  meta,
  time = "09:41",
  category,
}: TemplatePreviewProps) {
  // Avisos só quando o dado existe: sem `variables` não há exemplos para conferir; sem `buttons`, não há botões para conferir.
  const missing = variables
    ? [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]!))].filter((n) => variableValue(variables, n) === undefined)
    : [];
  const needsOptOut = buttons !== undefined && category === "marketing" && !buttons.some((b) => b.type === "opt_out");

  return (
    <div className="eco-tpl">
      {meta && <div className="eco-tpl__meta">{meta}</div>}
      <div className="eco-tpl__stage" aria-label="Prévia como o contato vê">
        {businessName && <span className="eco-tpl__from">{businessName}</span>}
        <div className="eco-msg eco-msg--in">
          <div className="eco-bubble">
            {header?.type === "text" && <span className="eco-tpl__header">{renderBody(header.text, variables, highlightVariables)}</span>}
            {header && header.type !== "text" && (
              <span className="eco-bubble__media">
                <Glyph name={MEDIA_ICON[header.type].icon} />
                {header.name ?? MEDIA_ICON[header.type].label}
              </span>
            )}
            <span>{body.trim() ? renderBody(body, variables, highlightVariables) : <span className="eco-muted">O corpo da mensagem aparece aqui.</span>}</span>
            {footer && <span className="eco-tpl__footer">{footer}</span>}
            <span className="eco-bubble__meta">{time}</span>
          </div>
          {buttons && buttons.length > 0 && (
            <div className="eco-tpl__buttons">
              {buttons.map((b, i) => (
                <span key={i} className="eco-tpl__button">
                  <Glyph name={BUTTON_ICON[b.type]} />
                  {b.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {missing.length > 0 && (
        <span className="eco-tpl__note">
          <Glyph name="alert" />
          {missing.length === 1 ? `A variável {{${missing[0]}}} está sem exemplo.` : `As variáveis ${missing.map((n) => `{{${n}}}`).join(", ")} estão sem exemplo.`} A Meta
          pede um exemplo para cada variável na revisão.
        </span>
      )}
      {needsOptOut && (
        <span className="eco-tpl__note">
          <Glyph name="alert" />
          Template de marketing sem botão de descadastro. A Meta exige um botão para o contato parar de receber.
        </span>
      )}
    </div>
  );
}
