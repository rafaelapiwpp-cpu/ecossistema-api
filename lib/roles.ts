// Papéis de acesso (sem dependências de servidor: pode ser usado nas telas).
// Master > Administrador > Gestor > Atendente. O Master é o dono do sistema: é o único que vê as conexões
// marcadas como "Só Master", cria/edita conexões e tokens e não pode ser alterado por ninguém.
// "Cliente" é o usuário de uma empresa atendida pela operação (portal de clientes): entra pelo endereço da empresa dele
// e só vê o CRM de atendimento dos números dessa empresa — nunca o painel interno.
export type Role = "master" | "admin" | "gestor" | "atendente" | "cliente";

export const ROLE_LABEL: Record<string, string> = { master: "Master", admin: "Administrador", gestor: "Gestor", atendente: "Atendente", cliente: "Cliente" };

/** Papéis que podem ser dados pela tela Equipe (o Master não é atribuível; clientes nascem em Configurações → Empresas). */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "gestor", "atendente"];

export const isMaster = (role: string | null | undefined) => role === "master";
/** Master ou administrador. */
export const isAdminRole = (role: string | null | undefined) => role === "master" || role === "admin";
/** Master, administrador ou gestor. */
export const isManagerRole = (role: string | null | undefined) => role === "master" || role === "admin" || role === "gestor";
/** Usuário de uma empresa cliente (portal). */
export const isClient = (role: string | null | undefined) => role === "cliente";
