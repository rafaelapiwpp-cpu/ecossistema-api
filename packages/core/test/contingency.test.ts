import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assinaturaValida, avaliar, escolherNumero, sinalDeQualidadeConsultada, tetoRampa, traduzirWebhook } from "../src/contingency";

const tipos = (acoes: { tipo: string }[]) => acoes.map((a) => a.tipo);

test("qualidade Baixa para o número e pausa marketing; repetir não realerta", () => {
  const a = avaliar({ tipo: "qualidade", numero: { id: "n" }, para: "RED" }, { qualidadeAtual: "YELLOW" });
  assert.equal(a.severidade, "critico");
  assert.deepEqual(tipos(a.acoes), ["atualizar_qualidade_numero", "abrir_disjuntor", "pausar_campanhas_marketing"]);
  const igual = avaliar({ tipo: "qualidade", numero: { id: "n" }, para: "RED" }, { qualidadeAtual: "RED" });
  assert.deepEqual(tipos(igual.acoes), ["atualizar_qualidade_numero"]);
});

test("qualidade voltar a Alta NÃO retoma envio sozinho", () => {
  const a = avaliar({ tipo: "qualidade", numero: { id: "n" }, para: "GREEN" }, { qualidadeAtual: "RED" });
  assert.ok(!tipos(a.acoes).some((t) => t.includes("disjuntor") && t !== "abrir_disjuntor"));
  assert.deepEqual(tipos(a.acoes), ["atualizar_qualidade_numero"]);
});

test("131048 só abre o disjuntor ao atingir o limite por hora; 368 abre na hora", () => {
  assert.deepEqual(avaliar({ tipo: "erro", numero: { id: "n" }, codigo: 131048 }, { errosMesmoCodigoUltimaHora: 2 }).acoes, []);
  assert.equal(avaliar({ tipo: "erro", numero: { id: "n" }, codigo: 131048 }, { errosMesmoCodigoUltimaHora: 4 }).acoes[0]?.tipo, "abrir_disjuntor");
  assert.equal(avaliar({ tipo: "erro", numero: { id: "n" }, codigo: 368 }).acoes[0]?.tipo, "abrir_disjuntor");
  assert.deepEqual(avaliar({ tipo: "erro", numero: { id: "n" }, codigo: 131049 }).acoes, []);
});

test("template pausado pausa campanhas; conta banida para a BM; reinstate não retoma números", () => {
  assert.deepEqual(tipos(avaliar({ tipo: "template_status", template: { id: "t" }, evento: "PAUSED" }).acoes), ["atualizar_status_template", "pausar_campanhas_template"]);
  const ban = avaliar({ tipo: "conta", bm: { id: "b" }, evento: "DISABLE" });
  assert.equal(ban.acoes[0]?.tipo, "parar_bm");
  assert.match(ban.texto, /Não migrar/);
  assert.deepEqual(tipos(avaliar({ tipo: "conta", bm: { id: "b" }, evento: "REINSTATE" }).acoes), ["reativar_status_bm"]);
});

test("limite do portfólio vira nível do schema (ilimitado = 0)", () => {
  assert.deepEqual(avaliar({ tipo: "limite", bm: { id: "b" }, tier: "TIER_2K" }).acoes, [{ tipo: "atualizar_limite_bm", nivel: 2000 }]);
  assert.deepEqual(avaliar({ tipo: "limite", bm: { id: "b" }, tier: "TIER_UNLIMITED" }).acoes, [{ tipo: "atualizar_limite_bm", nivel: 0 }]);
  assert.deepEqual(avaliar({ tipo: "limite", bm: { id: "b" }, tier: "TIER_NOT_SET" }).acoes, []);
});

test("assinatura do webhook: aceita só HMAC correto do corpo bruto", () => {
  const corpo = '{"object":"whatsapp_business_account","entry":[]}';
  const sig = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(assinaturaValida(corpo, sig, "segredo"), true);
  assert.equal(assinaturaValida(corpo + " ", sig, "segredo"), false);
  assert.equal(assinaturaValida(corpo, sig, "outro"), false);
  assert.equal(assinaturaValida(corpo, null, "segredo"), false);
  assert.equal(assinaturaValida(corpo, "sha256=abc", "segredo"), false);
});

const wh = (field: string, value: unknown, id = "102290129340398") => ({
  object: "whatsapp_business_account",
  entry: [{ id, time: 1, changes: [{ field, value }] }],
});

test("traduz os campos que o motor assina", () => {
  assert.deepEqual(traduzirWebhook(wh("phone_number_quality_update", { display_phone_number: "1555", event: "THROUGHPUT_UPGRADE", current_limit: "TIER_10K", max_daily_conversations_per_business: "TIER_100K" })).sinais, [
    { tipo: "limite", bm: { metaWabaId: "102290129340398" }, tier: "TIER_100K" },
  ]);
  assert.deepEqual(traduzirWebhook(wh("account_update", { event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "DISABLE", waba_ban_date: "April 17, 2025" } })).sinais[0], {
    tipo: "conta", bm: { metaWabaId: "102290129340398" }, evento: "DISABLE", detalhe: "April 17, 2025",
  });
  const restr = traduzirWebhook(wh("account_update", { event: "ACCOUNT_RESTRICTION", restriction_info: [{ restriction_type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expiration: 1 }] })).sinais[0];
  assert.equal(restr?.tipo === "conta" && restr.evento, "RESTRICTION");
  const soLigacao = traduzirWebhook(wh("account_update", { event: "ACCOUNT_RESTRICTION", restriction_info: [{ restriction_type: "RESTRICTED_USER_INITIATED_CALLING" }] })).sinais[0];
  assert.equal(soLigacao?.tipo === "conta" && soLigacao.evento, "VIOLATION", "restrição só de ligação não para mensagens");
  const tpl = traduzirWebhook(wh("message_template_status_update", { event: "PAUSED", message_template_id: 594425479261596, message_template_name: "promo", message_template_language: "pt_BR", reason: "NONE" })).sinais[0];
  assert.deepEqual(tpl, { tipo: "template_status", template: { metaTemplateId: "594425479261596", nome: "promo", idioma: "pt_BR" }, bm: { metaWabaId: "102290129340398" }, evento: "PAUSED", motivo: undefined });
  const q = traduzirWebhook(wh("message_template_quality_update", { previous_quality_score: "GREEN", new_quality_score: "RED", message_template_id: 1, message_template_name: "x", message_template_language: "pt_BR" })).sinais[0];
  assert.equal(q?.tipo === "template_qualidade" && q.para, "RED");
});

test("messages: só falhas com código conhecido viram sinal; mensagens recebidas ficam para Disparos", () => {
  const t = traduzirWebhook(wh("messages", {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "1555", phone_number_id: "PNID1" },
    statuses: [
      { id: "wamid.1", status: "failed", errors: [{ code: 131048, title: "Spam rate limit hit" }] },
      { id: "wamid.2", status: "failed", errors: [{ code: 999999 }] },
      { id: "wamid.3", status: "delivered" },
    ],
    messages: [{ from: "5551", id: "wamid.in", type: "text", text: { body: "oi" } }],
  }));
  assert.deepEqual(t.sinais, [{ tipo: "erro", numero: { metaPhoneId: "PNID1" }, codigo: 131048, wamid: "wamid.1" }]);
});

test("payload estranho ou de outro objeto não gera sinal nem lança", () => {
  assert.deepEqual(traduzirWebhook(null).sinais, []);
  assert.deepEqual(traduzirWebhook({ object: "page", entry: [] }).sinais, []);
  assert.deepEqual(traduzirWebhook(wh("account_update", { event: "PARTNER_ADDED" })).sinais, []);
  assert.equal(traduzirWebhook(wh("algo_novo", {})).ignorados, 1);
  assert.deepEqual(traduzirWebhook({ object: "whatsapp_business_account", entry: [{ changes: "x" }] }).sinais, []);
});

test("qualidade consultada na Graph API vira sinal", () => {
  assert.deepEqual(sinalDeQualidadeConsultada("P", { quality_rating: "YELLOW", id: "P" }), { tipo: "qualidade", numero: { metaPhoneId: "P" }, para: "YELLOW" });
  assert.equal(sinalDeQualidadeConsultada("P", { quality_rating: "PURPLE" }), null);
});

test("rampa e roteamento: respeitam portfólio, qualidade, sticky e uma BM só", () => {
  assert.equal(tetoRampa(0, 250, "GREEN"), 50);
  assert.equal(tetoRampa(10, 2000, "GREEN"), 2000);
  assert.equal(tetoRampa(3, 2000, "RED"), 0);
  assert.equal(tetoRampa(10, 0, "GREEN"), 3000, "portfólio ilimitado");
  const b = { bmId: "b1", status: "ativo", qualidade: "GREEN" as const, disjuntor: "fechado" as const, tetoDiario: 1000 };
  assert.equal(escolherNumero(null, [{ ...b, id: "a", enviadosHoje: 900 }, { ...b, id: "c", enviadosHoje: 100 }]), "c");
  assert.equal(escolherNumero("a", [{ ...b, id: "a", enviadosHoje: 0, qualidade: "RED" }, { ...b, id: "c", enviadosHoje: 0 }]), null);
  assert.throws(() => escolherNumero(null, [{ ...b, id: "a", enviadosHoje: 0 }, { ...b, id: "x", bmId: "b2", enviadosHoje: 0 }]));
});
