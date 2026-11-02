/**
 * Linhas das tabelas de contingência, como o Prisma devolve
 * (schema único em apps/admin/prisma/schema.prisma).
 *
 * O núcleo não importa o cliente Prisma gerado: o app injeta um
 * `ContingencyStore` que devolve estas linhas. Assim o @eco/core continua
 * sem dependência de runtime e o schema continua sendo um só.
 *
 * Os valores de status são os do doc 04 (pt-BR), gravados pelas telas de
 * contingência. A tradução para os enums do domínio fica em ./mappers.ts.
 */

export interface ClienteRow {
  id: string;
  nome: string;
  slug: string;
  /** starter | pro | scale | enterprise */
  plano: string;
  /** ativo | trial | suspenso | inadimplente | cancelado */
  status: string;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface BmRow {
  id: string;
  nome: string;
  clienteId: string | null;
  /** em_verificacao | escalonando | ativa | restrita | banida */
  status: string;
  /** pendente | verificada | recusada */
  verificacao: string;
  /** 250 | 1000 | 10000 | 100000 | 0 (= ilimitado) */
  nivelLimite: number;
  metaBmId: string | null;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface NumeroRow {
  id: string;
  telefone: string;
  bmId: string | null;
  clienteId: string | null;
  /** pendente | aquecendo | ativo | limitado | restrito | banido | desconectado */
  status: string;
  /** alta | media | baixa | sem_avaliacao */
  qualidade: string;
  enviadasHoje: number;
  limiteDiario: number;
  metaPhoneId: string | null;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface TemplateRow {
  id: string;
  nome: string;
  clienteId: string | null;
  /** marketing | utilidade | autenticacao */
  categoria: string;
  /** aprovado | em_analise | rejeitado | pausado | desativado */
  status: string;
  idioma: string;
  corpo: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

/** O que o app precisa entregar ao núcleo. Com Prisma é uma linha por método (ver apps/admin/lib/datasource.ts). */
export interface ContingencyStore {
  clientes(): Promise<ClienteRow[]>;
  bms(): Promise<BmRow[]>;
  numeros(): Promise<NumeroRow[]>;
  templates(): Promise<TemplateRow[]>;
  /** Consulta trivial (SELECT 1) para medir o banco. Deve lançar se indisponível. */
  ping(): Promise<void>;
}
