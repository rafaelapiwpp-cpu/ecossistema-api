import type { DataSource } from "./datasource";
import { createMockDataSource } from "./mock/mock-datasource";

export * from "./datasource";
export { createMockDataSource } from "./mock/mock-datasource";
export { MOCK_NOW } from "./mock/world";

let instance: DataSource | null = null;

/**
 * Ponto único de acesso aos dados. Troca de implementação por variável de ambiente:
 *   DATA_SOURCE=mock      (padrão)  -> dados simulados em memória
 *   DATA_SOURCE=postgres            -> PostgresDataSource (a implementar, mesma interface)
 */
export function getDataSource(): DataSource {
  if (instance) return instance;
  const kind = process.env.DATA_SOURCE ?? "mock";
  if (kind === "mock") {
    instance = createMockDataSource();
    return instance;
  }
  if (kind === "postgres") {
    throw new Error("DATA_SOURCE=postgres ainda não foi implementado. Veja docs/data-model.md para o mapeamento de tabelas.");
  }
  throw new Error(`DATA_SOURCE desconhecido: "${kind}". Use "mock" ou "postgres".`);
}
