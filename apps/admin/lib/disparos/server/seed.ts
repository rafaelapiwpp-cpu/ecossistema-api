/**
 * Dados de demonstração do modo mock. Determinístico (mesma base sempre).
 */
import type { MemoryRepo } from './memory-repo';
import type { Contact, OptOutSource, Template } from './entities';
import { confirmationGraph, promoGraph, reactivationDraftGraph } from '../domain/flow-presets';
import type { FlowGraph } from '../domain/flow-types';

export const DEMO_TENANT = '00000000-0000-4000-8000-000000000001';
export const DEMO_BA = '00000000-0000-4000-8000-0000000000ba';
export const DEMO_PHONE_MAIN = '00000000-0000-4000-8000-0000000000a1';
export const DEMO_PHONE_ALT = '00000000-0000-4000-8000-0000000000a2';

const FIRST = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Renata', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Vinícius', 'Yasmin', 'Carlos', 'Fernanda', 'Gustavo', 'Juliana', 'Leonardo', 'Patrícia', 'Ricardo', 'Simone', 'Tatiane', 'Marcelo', 'Aline', 'Daniela', 'Eduardo', 'Letícia', 'Pedro'];
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Rocha', 'Almeida', 'Nunes', 'Mendes', 'Barbosa', 'Moraes', 'Teixeira', 'Machado', 'Kuhn', 'Schmidt', 'Becker'];
const DDD = ['51', '51', '51', '51', '54', '53', '55', '48', '11'];
const DAYS = ['seg, 3/11', 'ter, 4/11', 'qua, 5/11', 'qui, 6/11', 'sex, 7/11'];
const HOURS = ['8h30', '9h', '10h15', '11h', '13h30', '14h', '15h45', '16h30', '17h'];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedCatalog(repo: MemoryRepo, now: number) {
  const r = rng(45);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const t = DEMO_TENANT;

  repo.businessAccounts.push({ id: DEMO_BA, tenantId: t, wabaId: '102938475610293', name: 'Clínica Bem Viver', messagingLimitTier: 'TIER_2K' });
  repo.phoneNumbers.push(
    { id: DEMO_PHONE_MAIN, tenantId: t, businessAccountId: DEMO_BA, phoneNumberId: '110200300400501', displayPhoneNumber: '+55 51 3333-0000', verifiedName: 'Clínica Bem Viver', qualityRating: 'GREEN', provider: 'mock', status: 'ativo', canSend: true },
    { id: DEMO_PHONE_ALT, tenantId: t, businessAccountId: DEMO_BA, phoneNumberId: '110200300400502', displayPhoneNumber: '+55 51 3333-0001', verifiedName: 'Bem Viver Estética', qualityRating: 'YELLOW', provider: 'mock', status: 'ativo', canSend: true },
  );

  const tpl = (name: string, category: Template['category'], status: Template['status'], bodyText: string, variableExamples: string[], buttons: Template['buttons']): Template =>
    ({ id: `tpl_${name}`, tenantId: t, businessAccountId: DEMO_BA, name, language: 'pt_BR', category, status, bodyText, variableExamples, buttons });
  repo.templates.push(
    tpl('confirmacao_consulta', 'UTILITY', 'APPROVED', 'Olá {{1}}, sua consulta está marcada para {{2}}. Podemos confirmar?', ['Ana', 'ter, 4/11 às 14h'],
      [{ text: 'Confirmar' }, { text: 'Remarcar' }, { text: 'Parar mensagens', optOut: true }]),
    tpl('promo_novembro', 'MARKETING', 'APPROVED', 'Oi {{1}}! Em novembro a avaliação de clareamento sai com {{2}} de desconto. Quer saber como funciona?', ['Ana', '30%'],
      [{ text: 'Quero saber' }, { text: 'Parar promoções', optOut: true }]),
    tpl('lembrete_retorno', 'UTILITY', 'APPROVED', 'Olá {{1}}, já faz 6 meses desde a sua última visita. Responda esta mensagem para agendarmos seu retorno.', ['Ana'], []),
    tpl('pesquisa_satisfacao', 'MARKETING', 'PENDING', 'Oi {{1}}, como foi seu atendimento? Leva 1 minuto.', ['Ana'], [{ text: 'Responder' }, { text: 'Parar mensagens', optOut: true }]),
  );

  // contatos
  const contacts: Contact[] = [];
  const used = new Set<string>();
  const make = (tags: string[], i: number): Contact => {
    let phone: string;
    do phone = `+55${pick(DDD)}9${String(Math.floor(r() * 1e8)).padStart(8, '0')}`; while (used.has(phone));
    used.add(phone);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      id: `ct_${contacts.length + 1}_${i}`, tenantId: t, name, phoneE164: phone, tags,
      attributes: { data_consulta: `${pick(DAYS)} às ${pick(HOURS)}` },
      consent: 'opted_in', consentSource: 'web_form', consentAt: now - 30 * 86400_000, createdAt: now - 30 * 86400_000,
    };
  };
  for (let i = 0; i < 180; i++) contacts.push(make(['pacientes-ativos', 'consultas-semana'], i));
  for (let i = 0; i < 420; i++) contacts.push(make(['pacientes-ativos'], i));
  for (let i = 0; i < 240; i++) contacts.push(make(['retorno-6-meses'], i));
  for (let i = 0; i < 360; i++) contacts.push(make(['leads-instagram'], i));
  for (let i = 0; i < 40; i++) contacts.push(make(['vip', 'pacientes-ativos'], i));
  // números ruins vindos de importação
  contacts.push({ id: 'ct_bad_1', tenantId: t, name: 'Importação sem DDD', phoneE164: '+55999123', tags: ['leads-instagram'], attributes: {}, consent: 'opted_in', consentSource: 'import', consentAt: now, createdAt: now });
  contacts.push({ id: 'ct_bad_2', tenantId: t, name: 'Fixo antigo', phoneE164: '+5551321', tags: ['leads-instagram'], attributes: {}, consent: 'opted_in', consentSource: 'import', consentAt: now, createdAt: now });
  // leads sem consentimento registrado: ficam fora de qualquer disparo
  contacts.filter((c) => c.tags.includes('leads-instagram') && !c.id.startsWith('ct_bad')).slice(-20).forEach((c) => { c.consent = 'unknown'; c.consentSource = null; c.consentAt = null; });
  repo.contacts.push(...contacts);

  // blacklist pré-existente
  const sources: OptOutSource[] = ['keyword', 'keyword', 'button', 'button', 'meta_marketing_optout', 'manual', 'import'];
  const texts: Record<OptOutSource, string | null> = {
    keyword: 'SAIR', button: 'Parar promoções', meta_marketing_optout: null, manual: null, import: null, flow_node: null,
  };
  const reasons: Record<OptOutSource, string> = {
    keyword: 'Pediu para sair', button: 'Clicou em "Parar promoções"', meta_marketing_optout: 'Parou marketing pelo próprio WhatsApp (131050)',
    manual: 'Pediu por telefone na recepção', import: 'Lista de descadastro do sistema antigo', flow_node: 'Etapa Blacklist',
  };
  const leads = contacts.filter((c) => c.tags.includes('leads-instagram'));
  const patients = contacts.filter((c) => c.tags.includes('pacientes-ativos'));
  const victims = [...leads.slice(5, 23), ...patients.slice(200, 209)];
  victims.forEach((c, i) => {
    const source = sources[i % sources.length] ?? 'manual';
    repo.optOuts.push({
      id: `oo_${i}`, tenantId: t, phoneE164: c.phoneE164, contactId: c.id, contactName: c.name, source,
      reason: reasons[source], triggerText: texts[source], campaignId: null, flowRunId: null, waMessageId: null,
      createdAt: now - (i + 1) * 37 * 3600_000, revokedAt: null, revokeReason: null,
    });
    c.consent = 'opted_out';
  });
}

export function seedFlows(repo: MemoryRepo, now: number) {
  const t = DEMO_TENANT;
  const add = (id: string, name: string, description: string, graph: FlowGraph, publish: boolean, updatedAgo: number) => {
    const versionId = `${id}_v1`;
    repo.flows.set(id, {
      id, tenantId: t, name, description, status: publish ? 'published' : 'draft', draftGraph: graph,
      publishedVersionId: publish ? versionId : null, createdAt: now - updatedAgo - 86400_000, updatedAt: now - updatedAgo,
    });
    if (publish) repo.flowVersions.set(versionId, { id: versionId, tenantId: t, flowId: id, version: 1, graph: structuredClone(graph), publishedAt: now - updatedAgo });
  };
  add('flow_confirmacao', 'Confirmação de consulta', 'Confirma, remarca ou tira da lista', confirmationGraph(), true, 5 * 86400_000);
  add('flow_promo', 'Promoção de novembro', 'Avaliação de clareamento com desconto', promoGraph(), true, 2 * 86400_000);
  add('flow_retorno', 'Lembrete de retorno', 'Uma mensagem, sem botões', {
    nodes: [
      { id: 'start', type: 'start', position: { x: 40, y: 160 }, data: { trigger: 'campaign' } },
      {
        id: 'tpl', type: 'template', position: { x: 260, y: 100 },
        data: {
          templateName: 'lembrete_retorno', language: 'pt_BR', category: 'UTILITY',
          bodyPreview: 'Olá {{1}}, já faz 6 meses desde a sua última visita. Responda esta mensagem para agendarmos seu retorno.',
          variables: ['{{nome}}'], buttons: [], timeoutSeconds: null,
        },
      },
    ],
    edges: [{ id: 'e1', source: 'start', sourceHandle: 'next', target: 'tpl' }],
  }, true, 9 * 86400_000);
  add('flow_reativacao', 'Reativação (rascunho)', 'Ainda não publicado', reactivationDraftGraph(), false, 3 * 3600_000);
}
