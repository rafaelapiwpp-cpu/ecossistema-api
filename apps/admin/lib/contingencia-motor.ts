import { avaliar, type Acao, type EventoTemplateMeta, type QualidadeMeta, type Sinal } from "@eco/core/contingency";
import type { Prisma } from "@prisma/client";
import { comPlataforma, type Tx } from "@/lib/db";

/**
 * Aplica no banco o que o motor de contingência (@eco/core/contingency › avaliar) decide.
 *
 * Entradas possíveis (todas chamam `processarSinal`):
 * - webhook da Meta: app/api/webhooks/whatsapp/route.ts (desligado até haver META_APP_SECRET);
 * - consulta periódica de qualidade na Graph API (sinalDeQualidadeConsultada) — a ligar com o token;
 * - operador mudando a qualidade de um número à mão (app/numeros/actions.ts).
 *
 * Cada sinal vira UMA transação: resolve o ativo pelo dado nosso (metaPhoneId,
 * metaWabaId, metaTemplateId), aplica as ações, grava evento_contingencia e auditoria.
 * Nada aqui retoma envio: isso é `retomarNumero` (manual, com motivo).
 */

export const QUALIDADE_DB: Record<QualidadeMeta, string> = { GREEN: "alta", YELLOW: "media", RED: "baixa", UNKNOWN: "sem_avaliacao" };
export const QUALIDADE_META: Record<string, QualidadeMeta> = { alta: "GREEN", media: "YELLOW", baixa: "RED", sem_avaliacao: "UNKNOWN" };

const STATUS_TEMPLATE_DB: Partial<Record<EventoTemplateMeta, string>> = {
  APPROVED: "aprovado",
  REINSTATED: "aprovado",
  PENDING: "em_analise",
  IN_APPEAL: "em_analise",
  REJECTED: "rejeitado",
  PAUSED: "pausado",
  DISABLED: "desativado",
};

type Alvo = { clienteId: string | null; bmId: string | null; numeroId: string | null; templateId: string | null; qualidadeAtual?: QualidadeMeta; bmStatus?: string };
const vazio = (): Alvo => ({ clienteId: null, bmId: null, numeroId: null, templateId: null });

async function bmPorRef(tx: Tx, ref: { id?: string; metaWabaId?: string } | undefined) {
  if (!ref) return null;
  if (ref.id) return tx.bm.findUnique({ where: { id: ref.id } });
  if (ref.metaWabaId) return tx.bm.findFirst({ where: { metaWabaId: ref.metaWabaId } });
  return null;
}

async function resolver(tx: Tx, s: Sinal): Promise<Alvo | null> {
  const a = vazio();
  if (s.tipo === "qualidade" || s.tipo === "erro" || s.tipo === "taxas_campanha") {
    const r = s.numero;
    const n = r.id
      ? await tx.numero.findUnique({ where: { id: r.id } })
      : r.metaPhoneId
        ? await tx.numero.findUnique({ where: { metaPhoneId: r.metaPhoneId } })
        : r.telefone
          ? await tx.numero.findFirst({ where: { telefone: r.telefone } })
          : null;
    if (!n) return null;
    return { ...a, numeroId: n.id, bmId: n.bmId, clienteId: n.clienteId, qualidadeAtual: QUALIDADE_META[n.qualidade] };
  }
  if (s.tipo === "template_status" || s.tipo === "template_qualidade") {
    const r = s.template;
    let t = r.id
      ? await tx.template.findUnique({ where: { id: r.id } })
      : r.metaTemplateId
        ? await tx.template.findUnique({ where: { metaTemplateId: r.metaTemplateId } })
        : null;
    if (!t && r.nome) {
      // Template cadastrado à mão, ainda sem metaTemplateId: casa por nome + idioma DENTRO do cliente da BM.
      const bm = await bmPorRef(tx, s.bm);
      if (bm?.clienteId) {
        t = await tx.template.findFirst({ where: { clienteId: bm.clienteId, nome: r.nome, ...(r.idioma ? { idioma: r.idioma } : {}) } });
        if (t && r.metaTemplateId) await tx.template.update({ where: { id: t.id }, data: { metaTemplateId: r.metaTemplateId } });
      }
    }
    if (!t) return null;
    return { ...a, templateId: t.id, clienteId: t.clienteId };
  }
  if (s.tipo === "conta" || s.tipo === "limite") {
    const bm = await bmPorRef(tx, s.bm);
    if (!bm) return null;
    return { ...a, bmId: bm.id, clienteId: bm.clienteId, bmStatus: bm.status };
  }
  return null;
}

/** Aplica uma ação. Devolve se foi aplicada (ações de campanha aguardam o módulo Disparos). */
async function aplicar(tx: Tx, acao: Acao, alvo: Alvo): Promise<{ aplicado: boolean; nota?: string }> {
  switch (acao.tipo) {
    case "atualizar_qualidade_numero":
      if (!alvo.numeroId) return { aplicado: false };
      await tx.numero.update({ where: { id: alvo.numeroId }, data: { qualidade: QUALIDADE_DB[acao.qualidade] } });
      return { aplicado: true };
    case "abrir_disjuntor":
      if (!alvo.numeroId) return { aplicado: false };
      await tx.numero.update({ where: { id: alvo.numeroId }, data: { disjuntor: "aberto", motivoPausa: acao.motivo } });
      return { aplicado: true };
    case "atualizar_status_template": {
      const status = STATUS_TEMPLATE_DB[acao.evento];
      if (!alvo.templateId || !status) return { aplicado: false, nota: status ? undefined : "evento sem status equivalente" };
      await tx.template.update({ where: { id: alvo.templateId }, data: { status } });
      return { aplicado: true };
    }
    case "atualizar_qualidade_template":
      if (!alvo.templateId) return { aplicado: false };
      await tx.template.update({ where: { id: alvo.templateId }, data: { qualidade: QUALIDADE_DB[acao.qualidade] } });
      return { aplicado: true };
    case "parar_bm":
      if (!alvo.bmId) return { aplicado: false };
      await tx.bm.update({ where: { id: alvo.bmId }, data: { status: acao.status } });
      await tx.numero.updateMany({ where: { bmId: alvo.bmId }, data: { disjuntor: "aberto", motivoPausa: acao.motivo } });
      return { aplicado: true };
    case "reativar_status_bm":
      if (!alvo.bmId || (alvo.bmStatus !== "banida" && alvo.bmStatus !== "restrita")) return { aplicado: false, nota: "BM não estava parada" };
      await tx.bm.update({ where: { id: alvo.bmId }, data: { status: "ativa" } });
      return { aplicado: true, nota: "números seguem parados até retomada manual" };
    case "atualizar_limite_bm":
      if (!alvo.bmId) return { aplicado: false };
      await tx.bm.update({ where: { id: alvo.bmId }, data: { nivelLimite: acao.nivel } });
      return { aplicado: true };
    case "pausar_campanhas_marketing":
    case "pausar_campanhas_template":
    case "pausar_campanha":
      // Campanhas ainda não estão neste banco (módulo Disparos). O evento fica registrado
      // e o Disparos deve consultar evento_contingencia / disjuntor antes de enviar.
      return { aplicado: false, nota: "aguarda módulo Disparos no banco" };
    case "alertar":
      return { aplicado: true };
  }
}

export type Origem = "webhook" | "manual" | "consulta";

export type Resultado = { eventoId: string; severidade: string; texto: string; ativoEncontrado: boolean };

export async function processarSinal(sinal: Sinal, origem: Origem, operadorId: string | null = null): Promise<Resultado> {
  return comPlataforma(async (tx) => {
    const alvo = await resolver(tx, sinal);
    const sinalJson = sinal as unknown as Prisma.InputJsonValue;

    if (!alvo) {
      const ev = await tx.eventoContingencia.create({
        data: { origem, tipo: sinal.tipo, severidade: "aviso", texto: "Sinal da Meta para um ativo que não está cadastrado no painel (confira metaPhoneId / WABA ID / id do template).", sinal: sinalJson },
      });
      return { eventoId: ev.id, severidade: "aviso", texto: ev.texto, ativoEncontrado: false };
    }

    let errosMesmoCodigoUltimaHora = 0;
    if (sinal.tipo === "erro" && alvo.numeroId) {
      errosMesmoCodigoUltimaHora = await tx.eventoContingencia.count({
        where: { numeroId: alvo.numeroId, tipo: "erro", em: { gte: new Date(Date.now() - 60 * 60 * 1000) }, sinal: { path: ["codigo"], equals: sinal.codigo } },
      });
    }

    const av = avaliar(sinal, { qualidadeAtual: alvo.qualidadeAtual, errosMesmoCodigoUltimaHora });
    const acoes: (Acao & { aplicado: boolean; nota?: string })[] = [];
    for (const acao of av.acoes) acoes.push({ ...acao, ...(await aplicar(tx, acao, alvo)) });

    const ev = await tx.eventoContingencia.create({
      data: {
        origem,
        tipo: sinal.tipo,
        severidade: av.severidade,
        texto: av.texto,
        clienteId: alvo.clienteId,
        bmId: alvo.bmId,
        numeroId: alvo.numeroId,
        templateId: alvo.templateId,
        sinal: sinalJson,
        acoes: acoes as unknown as Prisma.InputJsonValue,
      },
    });
    if (acoes.some((a) => a.aplicado && a.tipo !== "alertar")) {
      await tx.auditLog.create({
        data: {
          escopo: operadorId ? "PLATFORM" : "SISTEMA",
          operadorId,
          clienteId: alvo.clienteId,
          acao: `contingencia.${sinal.tipo}`,
          alvo: alvo.numeroId ?? alvo.templateId ?? alvo.bmId,
          detalhes: { evento: ev.id, origem, acoes: acoes.filter((a) => a.aplicado).map((a) => a.tipo) },
        },
      });
    }
    return { eventoId: ev.id, severidade: av.severidade, texto: av.texto, ativoEncontrado: true };
  });
}

/**
 * Retomada MANUAL de um número parado (doc 04 §4.3). `meio_aberto` = volta em teste.
 * Exige motivo; grava evento e auditoria. Quem chama já checou contingencia:operar.
 */
export async function retomarNumero(numeroId: string, modo: "fechado" | "meio_aberto", motivo: string, operadorId: string): Promise<void> {
  await comPlataforma(async (tx) => {
    const n = await tx.numero.findUnique({ where: { id: numeroId }, include: { bm: { select: { status: true } } } });
    if (!n) throw new Error("Número não encontrado.");
    if (n.bm && (n.bm.status === "banida" || n.bm.status === "restrita")) {
      throw new Error("A BM deste número está banida ou restrita na Meta. Resolva a conta antes de retomar o envio.");
    }
    if (n.qualidade === "baixa" && modo === "fechado") {
      throw new Error("Com qualidade Baixa o número só pode voltar em teste (meio aberto).");
    }
    await tx.numero.update({ where: { id: numeroId }, data: { disjuntor: modo, motivoPausa: null } });
    await tx.eventoContingencia.create({
      data: {
        origem: "manual",
        tipo: "retomada",
        severidade: "info",
        texto: `Envio retomado ${modo === "meio_aberto" ? "em teste" : "normalmente"}: ${motivo}`,
        clienteId: n.clienteId,
        bmId: n.bmId,
        numeroId,
        sinal: { tipo: "retomada", modo, motivo },
      },
    });
    await tx.auditLog.create({
      data: { escopo: "PLATFORM", operadorId, clienteId: n.clienteId, acao: "contingencia.retomar", alvo: numeroId, detalhes: { modo, motivo, motivoAnterior: n.motivoPausa } },
    });
  });
}
