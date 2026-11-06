"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS } from "@/lib/period";

export default function Filters({ wabas, showPeriod = true }: { wabas: { id: string; name: string | null }[]; showPeriod?: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const period = sp.get("p") || "30d";
  const waba = sp.get("waba") || "";
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? q.set(k, v) : q.delete(k));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <>
      {showPeriod && (
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <Link key={p.key} href={href({ p: p.key })} className={period === p.key ? "on" : ""}>{p.label}</Link>
          ))}
        </div>
      )}
      <select aria-label="Conta" value={waba} onChange={(e) => router.push(href({ waba: e.target.value }))}>
        <option value="">Todas as contas</option>
        {wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}
      </select>
    </>
  );
}
