"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Barra compacta translúcida que aparece quando o título grande da página sai da tela (como no iOS). */
export default function ScrollTitle() {
  const path = usePathname();
  const [title, setTitle] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    const h = document.querySelector(".main .title h1");
    if (!h) { setTitle(""); return; }
    setTitle(h.textContent || "");
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(h);
    return () => io.disconnect();
  }, [path]);
  if (!title) return null;
  return <div className={`navbar-compact ${show ? "show" : ""}`} aria-hidden={!show}><span>{title}</span></div>;
}
