// Dados de demonstração (usados quando o Supabase ainda não está configurado).
import type { Dataset, DailyCost, DailyMessages, MessageEvent, Phone, Template, TemplateDaily, Waba } from "./types";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function demoDataset(): Dataset {
  const r = rng(42);
  const wabas: Waba[] = [
    { id: "100000000000001", name: "Cliente A · Imobiliária", currency: "BRL", timezone_id: "America/Sao_Paulo", ownership: "owned" },
    { id: "100000000000002", name: "Cliente B · Frigorífico", currency: "BRL", timezone_id: "America/Sao_Paulo", ownership: "owned" },
    { id: "100000000000003", name: "Cliente C · Clínica", currency: "BRL", timezone_id: "America/Sao_Paulo", ownership: "owned" },
    { id: "100000000000004", name: "Agência (interno)", currency: "BRL", timezone_id: "America/Sao_Paulo", ownership: "owned" },
  ];
  const phones: Phone[] = [
    { id: "200000000000001", waba_id: wabas[0].id, display_phone_number: "+55 11 90000-0001", phone_digits: "5511900000001", verified_name: "Cliente A", quality_rating: "GREEN", messaging_limit: "TIER_10K", status: "CONNECTED", name_status: "APPROVED" },
    { id: "200000000000002", waba_id: wabas[1].id, display_phone_number: "+55 11 90000-0002", phone_digits: "5511900000002", verified_name: "Cliente B", quality_rating: "YELLOW", messaging_limit: "TIER_10K", status: "CONNECTED", name_status: "APPROVED" },
  ];
  const names = [
    "oferta_semana", "lancamento_loteamento", "convite_visita", "promo_picanha", "cupom_desconto",
    "lembrete_consulta", "confirmacao_agendamento", "boas_vindas", "pesquisa_satisfacao", "codigo_acesso",
    "reengajamento_30d", "black_friday_previa", "status_pedido", "catalogo_novo", "aniversario_cliente", "feirao_fds",
  ];
  const cats = ["MARKETING", "MARKETING", "MARKETING", "MARKETING", "MARKETING", "UTILITY", "UTILITY", "MARKETING", "UTILITY", "AUTHENTICATION", "MARKETING", "MARKETING", "UTILITY", "MARKETING", "MARKETING", "MARKETING"];
  const owner = [0, 0, 0, 1, 1, 2, 2, 3, 2, 3, 1, 1, 1, 0, 2, 0];
  const statuses = ["APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "PAUSED", "PENDING", "APPROVED", "REJECTED", "APPROVED", "APPROVED"];
  const templates: Template[] = names.map((n, i) => ({
    id: String(300000000000000 + i), waba_id: wabas[owner[i]].id, name: n, language: "pt_BR",
    category: cats[i], status: statuses[i],
    quality_score: statuses[i] === "APPROVED" ? (i % 5 === 3 ? "YELLOW" : "GREEN") : statuses[i] === "PAUSED" ? "RED" : "UNKNOWN",
    rejected_reason: statuses[i] === "REJECTED" ? "INVALID_FORMAT" : null,
  }));

  const price: Record<string, number> = { MARKETING: 0.35, UTILITY: 0.044, AUTHENTICATION: 0.175, SERVICE: 0 };
  const messages: DailyMessages[] = [];
  const costs: DailyCost[] = [];
  const templateDaily: TemplateDaily[] = [];
  const today = new Date();
  for (let d = 179; d >= 0; d--) {
    const day = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    const dow = new Date(day).getUTCDay();
    const campaign = dow === 2 || dow === 4; // disparos às terças e quintas
    for (const [wi, w] of wabas.entries()) {
      const scale = [1, 0.8, 0.35, 0.12][wi] * (1 + (179 - d) / 300);
      const mk = campaign ? Math.round((900 + r() * 700) * scale) : Math.round(r() * 60 * scale);
      const ut = Math.round((80 + r() * 60) * scale);
      const au = wi === 3 ? Math.round(10 + r() * 15) : 0;
      const sv = Math.round((30 + r() * 50) * scale);
      const phone = phones[wi]?.phone_digits || phones[0].phone_digits!;
      const sent = mk + ut + au + sv;
      messages.push({ waba_id: w.id, phone_digits: phone, day, sent, delivered: Math.round(sent * (0.9 + r() * 0.07)) });
      for (const [cat, vol] of [["MARKETING", mk], ["UTILITY", ut], ["AUTHENTICATION", au], ["SERVICE", sv]] as const) {
        if (!vol) continue;
        const freeUt = cat === "UTILITY" ? Math.round(vol * 0.4) : 0;
        const paid = cat === "SERVICE" ? 0 : vol - freeUt;
        if (paid) costs.push({ waba_id: w.id, day, pricing_category: cat, pricing_type: "REGULAR", country: "BR", volume: paid, cost: +(paid * price[cat]).toFixed(2) });
        const free = cat === "SERVICE" ? vol : freeUt;
        if (free) costs.push({ waba_id: w.id, day, pricing_category: cat, pricing_type: "FREE_CUSTOMER_SERVICE", country: "BR", volume: free, cost: 0 });
      }
      if (d < 90) {
        const own = templates.filter((t) => t.waba_id === w.id && t.status === "APPROVED");
        for (const t of own) {
          const isMk = t.category === "MARKETING";
          const s = isMk ? (campaign ? Math.round((mk / Math.max(1, own.filter((o) => o.category === "MARKETING").length)) * (0.6 + r() * 0.8)) : 0) : Math.round(ut / 2 * (0.5 + r()));
          if (!s) continue;
          const del = Math.round(s * (0.88 + r() * 0.1));
          const rd = Math.round(del * (isMk ? 0.45 + r() * 0.3 : 0.7 + r() * 0.2));
          templateDaily.push({
            template_id: t.id, waba_id: w.id, day, sent: s, delivered: del, read: rd,
            clicks: isMk ? Math.round(rd * (0.04 + r() * 0.12)) : 0, cost: +(del * (price[t.category || "MARKETING"] || 0)).toFixed(2),
          });
        }
      }
    }
  }

  const errs = [
    [131049, "Mensagem não entregue para manter um bom engajamento do ecossistema"],
    [131026, "Mensagem não entregável"],
    [131047, "Reengajamento necessário (janela de 24h fechada)"],
    [131050, "Usuário optou por não receber marketing"],
    [130472, "Número do usuário faz parte de um experimento"],
  ] as const;
  const failures: MessageEvent[] = [];
  for (let i = 0; i < 160; i++) {
    const e = errs[Math.min(errs.length - 1, Math.floor(Math.pow(r(), 1.8) * errs.length))];
    const w = wabas[Math.floor(Math.pow(r(), 1.5) * 3)];
    failures.push({
      wamid: `wamid.DEMO${i}`, status: "failed", waba_id: w.id, phone_number_id: phones[0].id,
      recipient: `55119${String(Math.floor(r() * 1e8)).padStart(8, "0")}`, pricing_category: "MARKETING", pricing_type: null,
      billable: false, error_code: e[0], error_title: e[1], error_details: null,
      ts: new Date(today.getTime() - r() * 60 * 86400000).toISOString(),
    });
  }
  failures.sort((a, b) => b.ts.localeCompare(a.ts));

  return {
    demo: true, wabas, phones, templates, messages, costs, templateDaily, failures,
    lastSync: { id: 0, started_at: new Date(today.getTime() - 3 * 3600000).toISOString(), finished_at: new Date(today.getTime() - 3 * 3600000 + 42000).toISOString(), ok: true, details: null },
  };
}
