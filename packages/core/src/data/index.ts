import type { DataSource } from "./datasource";
import { createMockDataSource } from "./mock/mock-datasource";
import { createPostgresDataSource } from "./postgres/postgres-datasource";
import type { ContingencyStore } from "./postgres/rows";

export * from "./datasource";
export { createMockDataSource } from "./mock/mock-datasource";
export { MOCK_NOW } from "./mock/world";
export { PLAN_SPECS, PLAN_CODE_ALIASES } from "./plans";
export { createPostgresDataSource } from "./postgres/postgres-datasource";
export * as postgresMappers from "./postgres/mappers";
export type { BmRow, ClienteRow, ContingencyStore, NumeroRow, TemplateRow } from "./postgres/rows";

export type DataSourceKind = DataSource["kind"];

let instance: DataSource | null = null;
let postgresStore: (() => ContingencyStore) | null = null;
let defaultKind: DataSourceKind = "mock";

/**
 * Chamado UMA vez pelo app que tem banco (apps/admin/lib/datasource.ts).
 * O núcleo não importa Prisma: o app entrega um `ContingencyStore`.
 * `defaultKind` vale quando DATA_SOURCE não está definida.
 */
export function configureDataSource(options: { postgres?: () => ContingencyStore; defaultKind?: DataSourceKind }): void {
  if (options.postgres) postgresStore = options.postgres;
  if (options.defaultKind) defaultKind = options.defaultKind;
  instance = null;
}

/**
 * Ponto único de acesso aos dados. Escolha por variável de ambiente:
 *   DATA_SOURCE=mock      -> dados simulados em memória
 *   DATA_SOURCE=postgres  -> Postgres via o store registrado em configureDataSource()
 *   (sem variável)        -> defaultKind do app (o admin usa postgres quando há DATABASE_URL)
 */
export function getDataSource(): DataSource {
  if (instance) return instance;
  const kind = process.env.DATA_SOURCE ?? defaultKind;
  if (kind === "mock") {
    instance = createMockDataSource();
    return instance;
  }
  if (kind === "postgres") {
    if (!postgresStore) {
      throw new Error("DATA_SOURCE=postgres, mas nenhum store foi registrado. Chame configureDataSource({ postgres }) no app antes de getDataSource().");
    }
    instance = createPostgresDataSource(postgresStore());
    return instance;
  }
  throw new Error(`DATA_SOURCE desconhecido: "${kind}". Use "mock" ou "postgres".`);
}
