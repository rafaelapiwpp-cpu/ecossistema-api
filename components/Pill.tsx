import { QUALITY_LABEL, STATUS_LABEL } from "@/lib/format";

export function Pill({ tone, children }: { tone: "good" | "warning" | "serious" | "critical" | "neutral"; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}><i aria-hidden />{children}</span>;
}

export function QualityPill({ q }: { q: string | null }) {
  const tone = q === "GREEN" ? "good" : q === "YELLOW" ? "warning" : q === "RED" ? "critical" : "neutral";
  return <Pill tone={tone}>{QUALITY_LABEL[q || "UNKNOWN"] || q}</Pill>;
}

export function StatusPill({ s }: { s: string | null }) {
  const tone = s === "APPROVED" ? "good" : s === "PENDING" || s === "IN_APPEAL" ? "warning" : s === "PAUSED" ? "serious" : s === "REJECTED" || s === "DISABLED" ? "critical" : "neutral";
  return <Pill tone={tone}>{STATUS_LABEL[s || ""] || s || "—"}</Pill>;
}
