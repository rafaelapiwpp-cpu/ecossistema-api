import "./flow.css";
import FocusNav from "@/components/flow/FocusNav";

/** Fluxos ocupam a tela inteira: o menu do HUB vira a faixa de ícones enquanto você está aqui. */
export default function FluxosLayout({ children }: { children: React.ReactNode }) {
  return <><FocusNav />{children}</>;
}
