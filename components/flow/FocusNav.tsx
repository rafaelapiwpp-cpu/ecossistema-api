"use client";
import { useEffect } from "react";

/** Recolhe o menu lateral para a faixa de ícones enquanto a pessoa está em Fluxos (sem mudar a preferência salva). */
export default function FocusNav() {
  useEffect(() => {
    const html = document.documentElement;
    if (html.classList.contains("nav-min")) return;
    html.classList.add("nav-min");
    html.dataset.autoMin = "1";
    return () => {
      if (html.dataset.autoMin === "1") { html.classList.remove("nav-min"); delete html.dataset.autoMin; }
    };
  }, []);
  return null;
}
