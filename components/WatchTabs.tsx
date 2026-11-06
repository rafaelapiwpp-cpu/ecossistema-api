"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** Abas "Acompanhando · n / Todos · N" da Visão geral (mantém período e conta na URL). */
export default function WatchTabs({ watching, total, showAll }: { watching: number; total: number; showAll: boolean }) {
  const sp = useSearchParams();
  const href = (all: boolean) => {
    const q = new URLSearchParams(sp.toString());
    if (all) q.set("n", "todos"); else q.delete("n");
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  return (
    <div className="watch-tabs">
      <nav className="seg" aria-label="Números mostrados">
        <Link href={href(false)} className={!showAll ? "on" : ""} prefetch={false}>Acompanhando · {watching}</Link>
        <Link href={href(true)} className={showAll ? "on" : ""} prefetch={false}>Todos · {total}</Link>
      </nav>
      <Link className="btn small" href="/conexoes" prefetch={false}>Escolher o que ver</Link>
    </div>
  );
}
