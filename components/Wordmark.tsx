import { BRAND } from "@/lib/brand";

/**
 * Logo por extenso do Ecossistema API: a marca (E) + o nome em texto, na fonte do sistema.
 * Texto em vez de imagem: fica nítido em qualquer tamanho e muda junto com BRAND.name.
 * Marca provisória — quando a identidade visual definitiva sair, troca-se /logo-icon.webp e este componente.
 */
export default function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const [first, ...rest] = BRAND.name.split(" ");
  return (
    <span className={`wordmark wordmark-${size}`} role="img" aria-label={BRAND.name}>
      <img src="/logo-icon.webp" alt="" aria-hidden />
      <span className="wordmark-text">
        <b>{first}</b>
        {rest.length > 0 && <span>{rest.join(" ")}</span>}
      </span>
    </span>
  );
}
