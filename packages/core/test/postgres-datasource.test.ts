import assert from "node:assert/strict";
import { test } from "node:test";
import { configureDataSource, createPostgresDataSource, getAdminOverview, getDataSource, postgresMappers, type ContingencyStore } from "../src";

const d = (s: string) => new Date(s);
const NOW = d("2026-11-02T12:00:00.000Z");

function fakeStore(overrides: Partial<{ [K in keyof ContingencyStore]: Awaited<ReturnType<ContingencyStore[K]>> }> = {}, pingFails = false): ContingencyStore & { calls: number } {
  const store = {
    calls: 0,
    clientes: async () => (store.calls++, overrides.clientes ?? [
      { id: "c1", nome: "Imobiliária Teste", slug: "imob", plano: "pro", status: "ativo", notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
      { id: "c2", nome: "Loja Atrasada", slug: "loja", plano: "starter", status: "inadimplente", notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
    ]),
    bms: async () => overrides.bms ?? [
      { id: "b1", nome: "BM Imob", clienteId: "c1", status: "ativa", verificacao: "verificada", nivelLimite: 1000, metaBmId: "123", notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
      { id: "b2", nome: "BM Loja", clienteId: "c2", status: "restrita", verificacao: "pendente", nivelLimite: 250, metaBmId: null, notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
    ],
    numeros: async () => overrides.numeros ?? [
      { id: "n1", telefone: "(51) 99999-0001", bmId: "b1", clienteId: null, status: "ativo", qualidade: "alta", enviadasHoje: 1700, limiteDiario: 0, metaPhoneId: null, notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
      { id: "n2", telefone: "+55 51 99999-0002", bmId: "b1", clienteId: "c1", status: "aquecendo", qualidade: "baixa", enviadasHoje: 100, limiteDiario: 0, metaPhoneId: null, notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
      { id: "n3", telefone: "51999990003", bmId: null, clienteId: null, status: "desconectado", qualidade: "sem_avaliacao", enviadasHoje: 0, limiteDiario: 0, metaPhoneId: null, notas: null, criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-02") },
    ],
    templates: async () => overrides.templates ?? [
      { id: "t1", nome: "boas_vindas", clienteId: "c1", categoria: "marketing", status: "pausado", idioma: "pt_BR", corpo: "Oi {{1}}, veja {{2}} e {{1}}", criadoEm: d("2026-10-01"), atualizadoEm: d("2026-10-30") },
    ],
    ping: async () => {
      if (pingFails) throw new Error("conexão recusada");
    },
  };
  return store;
}

const clock = { now: () => NOW };

test("mapeia estados pt-BR do doc 04 para o domínio", async () => {
  const ds = createPostgresDataSource(fakeStore(), { clock });
  assert.equal(ds.kind, "postgres");

  const tenants = await ds.tenants.list();
  const imob = tenants.find((t) => t.id === "c1")!;
  assert.equal(imob.status, "active");
  assert.equal(imob.planId, "pln_growth"); // "pro" do formulário = Growth
  const loja = tenants.find((t) => t.id === "c2")!;
  assert.equal(loja.status, "past_due");
  assert.equal(loja.billingStatus, "overdue");

  const bms = await ds.businessManagers.list();
  const b1 = bms.find((b) => b.id === "b1")!;
  assert.equal(b1.messagingLimitTier, "TIER_2K");
  assert.equal(b1.verificationStatus, "verified");
  assert.equal(bms.find((b) => b.id === "b2")!.accountStatus, "restricted");

  const numbers = await ds.phoneNumbers.list();
  const n1 = numbers.find((n) => n.id === "n1")!;
  assert.equal(n1.tenantId, "c1", "número sem cliente herda o cliente da BM");
  assert.equal(n1.displayPhoneNumber, "+5551999990001");
  assert.equal(numbers.find((n) => n.id === "n2")!.status, "CONNECTED", "aquecendo é rampa nossa, não estado da Meta");
  assert.equal(numbers.find((n) => n.id === "n2")!.qualityRating, "RED");

  const [tpl] = await ds.templates.list();
  assert.equal(tpl!.status, "PAUSED");
  assert.equal(tpl!.category, "MARKETING");
  assert.equal(tpl!.variableCount, 2);
});

test("número sem BM e sem cliente não some: vai para tenant e BM sintéticos", async () => {
  const ds = createPostgresDataSource(fakeStore(), { clock });
  const n3 = (await ds.phoneNumbers.list()).find((n) => n.id === "n3")!;
  assert.equal(n3.tenantId, postgresMappers.UNASSIGNED_TENANT_ID);
  assert.ok(postgresMappers.isSyntheticBm(n3.businessManagerId));
  assert.ok((await ds.tenants.list()).some((t) => t.id === postgresMappers.UNASSIGNED_TENANT_ID));
});

test("sem órfãos, não aparece tenant sintético", async () => {
  const ds = createPostgresDataSource(fakeStore({ numeros: [], templates: [] }), { clock });
  assert.ok(!(await ds.tenants.list()).some((t) => t.id === postgresMappers.UNASSIGNED_TENANT_ID));
});

test("o que não existe no banco volta vazio, nunca inventado", async () => {
  const ds = createPostgresDataSource(fakeStore(), { clock });
  assert.deepEqual(await ds.campaigns.list(), []);
  assert.deepEqual(await ds.leads.countByConsent(), []);
  assert.deepEqual(await ds.metrics.hourlyByNumber({ from: NOW, to: NOW }), []);
  assert.deepEqual(await ds.wabas.list(), []);
});

test("uso do limite 24 h da BM soma enviadasHoje dos números", async () => {
  const ds = createPostgresDataSource(fakeStore(), { clock });
  const usage = await ds.metrics.portfolioUsage(NOW);
  const b1 = usage.find((u) => u.businessManagerId === "b1")!;
  assert.equal(b1.uniqueRecipients, 1800);
  assert.equal(b1.limit, 2000);
});

test("alertas saem das mesmas regras do mock", async () => {
  const ds = createPostgresDataSource(fakeStore(), { clock });
  const alerts = await ds.alerts.listOpen();
  const kinds = alerts.map((a) => `${a.kind}:${a.subject.id}`);
  assert.ok(kinds.includes("bm_restricted:b2"), "BM restrita gera alerta crítico");
  assert.ok(kinds.includes("number_quality_drop:n2"), "qualidade baixa gera alerta");
  assert.ok(kinds.includes("template_paused:t1"));
  assert.ok(kinds.includes("bm_limit_near:b1"), "90% do limite");
  assert.ok(kinds.includes("billing_overdue:c2"));
  assert.ok(!kinds.some((k) => k.includes(postgresMappers.UNASSIGNED_BM_PREFIX)), "BM sintética não gera alerta");
  assert.equal(alerts.find((a) => a.kind === "bm_restricted")!.severity, "critical");
  assert.deepEqual(
    (await ds.alerts.listOpen({ tenantId: "c2" as never })).map((a) => a.tenantId).filter((t) => t !== "c2"),
    [],
  );
});

test("banco fora do ar aparece como serviço down, não derruba a tela", async () => {
  const ds = createPostgresDataSource(fakeStore({}, true), { clock });
  const [db] = await ds.infra.services();
  assert.equal(db!.status, "down");
  assert.match(db!.detail ?? "", /conexão recusada/);
});

test("uma leitura do banco atende a tela inteira (snapshot compartilhado)", async () => {
  const store = fakeStore();
  const ds = createPostgresDataSource(store, { clock });
  await getAdminOverview(ds);
  assert.equal(store.calls, 1);
});

test("getAdminOverview roda de ponta a ponta sobre o Postgres", async () => {
  const overview = await getAdminOverview(createPostgresDataSource(fakeStore(), { clock }));
  assert.equal(overview.dataSource, "postgres");
  assert.equal(overview.kpis.tenants.total, 2, "tenant sintético não conta como cliente");
  assert.equal(overview.kpis.businessManagers.total, 2, "BM sintética não conta");
  assert.ok(overview.fleet.some((f) => f.tenantId === postgresMappers.UNASSIGNED_TENANT_ID), "órfãos seguem visíveis na frota");
  assert.equal(overview.kpis.phoneNumbers.total, 3);
  assert.equal(overview.kpis.messages24h.sent, 0);
  assert.ok(overview.attention.tenants.some((t) => t.id === "c2"));
});

test("getDataSource escolhe postgres quando configurado e DATA_SOURCE não manda o contrário", () => {
  const prev = process.env.DATA_SOURCE;
  delete process.env.DATA_SOURCE;
  configureDataSource({ postgres: () => fakeStore(), defaultKind: "postgres" });
  assert.equal(getDataSource().kind, "postgres");
  process.env.DATA_SOURCE = "mock";
  configureDataSource({});
  assert.equal(getDataSource().kind, "mock");
  if (prev === undefined) delete process.env.DATA_SOURCE;
  else process.env.DATA_SOURCE = prev;
  configureDataSource({ defaultKind: "mock" });
});
