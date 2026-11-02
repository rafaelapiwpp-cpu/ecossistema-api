/**
 * Ecossistema API — modelo de permissões.
 *
 * Permissão efetiva de um usuário de TENANT:
 *     (papel ∪ grants do usuário) ∩ entitlements do tenant − denies do usuário
 * - entitlements: o teto que o DONO define por cliente (o que aquele cliente pode fazer).
 * - papel: o pacote padrão (TENANT_ADMIN, TENANT_OPERADOR...).
 * - grants/denies: ajustes por pessoa. Deny sempre vence.
 * Usuário de PLATAFORMA: papel ∪ grants − denies (sem teto de tenant).
 *
 * Checagem SEMPRE no servidor (route handler / server action / RSC loader).
 * O front só usa `can()` para esconder botões — nunca como barreira.
 */

export const TENANT_PERMISSIONS = [
  "dashboard:ver",
  "conversas:ver", "conversas:responder",
  "campanhas:ver", "campanhas:criar", "campanhas:disparar", "campanhas:pausar",
  "templates:ver", "templates:solicitar",
  "fluxos:ver", "fluxos:editar",
  "leads:ver", "leads:editar", "leads:exportar",
  "leads:ver_telefone",        // sem isto, telefone aparece mascarado (+55 51 9****-4410)
  "optout:ver",                // não existe "optout:remover": só o titular sai da lista
  "numeros:ver", "numeros:conectar",
  "relatorios:ver", "relatorios:exportar",
  "usuarios:gerenciar",        // gerencia usuários do PRÓPRIO tenant, dentro dos entitlements
  "api:gerenciar", "webhooks:gerenciar",
  "auditoria:ver",             // trilha do próprio tenant, inclusive acessos da plataforma
] as const;

export const PLATFORM_PERMISSIONS = [
  "plataforma:tenants",        // criar/suspender clientes
  "plataforma:entitlements",   // definir o que cada cliente pode fazer + cotas
  "plataforma:usuarios",       // usuários da plataforma
  "contingencia:ver",
  "contingencia:operar",       // pausar número, abrir/fechar disjuntor, ajustar rampa
  "bms:gerenciar",             // cadastrar BM, rotacionar token
  "gateways:gerenciar",        // IPs fixos de saída
  "templates:moderar",         // revisão interna antes de enviar à Meta
  "auditoria:global",
  "suporte:breakglass",        // acesso temporário e auditado a PII de um tenant
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type Permission = TenantPermission | PlatformPermission;

export type TenantRole = "TENANT_ADMIN" | "TENANT_OPERADOR" | "TENANT_ATENDENTE" | "TENANT_LEITURA";
export type PlatformRole = "PLATFORM_OWNER" | "PLATFORM_CONTINGENCIA" | "PLATFORM_SUPORTE";

const ALL_TENANT = [...TENANT_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<TenantRole | PlatformRole, readonly Permission[]> = {
  // ---- Tenant ----
  TENANT_ADMIN: ALL_TENANT,
  TENANT_OPERADOR: [
    "dashboard:ver", "conversas:ver", "conversas:responder",
    "campanhas:ver", "campanhas:criar", "campanhas:disparar", "campanhas:pausar",
    "templates:ver", "templates:solicitar", "fluxos:ver", "fluxos:editar",
    "leads:ver", "leads:editar", "optout:ver", "numeros:ver", "relatorios:ver",
  ],
  TENANT_ATENDENTE: ["conversas:ver", "conversas:responder", "leads:ver", "leads:editar", "templates:ver"],
  TENANT_LEITURA: ["dashboard:ver", "campanhas:ver", "templates:ver", "leads:ver", "relatorios:ver"],
  // ---- Plataforma ----
  PLATFORM_OWNER: [...PLATFORM_PERMISSIONS],
  PLATFORM_CONTINGENCIA: ["contingencia:ver", "contingencia:operar", "bms:gerenciar", "gateways:gerenciar", "templates:moderar"],
  PLATFORM_SUPORTE: ["contingencia:ver", "suporte:breakglass", "plataforma:tenants"],
};

/** Entitlements padrão por plano; o dono ajusta por cliente depois. */
export const PLAN_ENTITLEMENTS: Record<"starter" | "pro" | "enterprise", readonly TenantPermission[]> = {
  starter: ["dashboard:ver", "conversas:ver", "conversas:responder", "campanhas:ver", "campanhas:criar",
    "campanhas:disparar", "campanhas:pausar", "templates:ver", "leads:ver", "leads:editar", "optout:ver",
    "numeros:ver", "relatorios:ver", "usuarios:gerenciar", "auditoria:ver"],
  pro: ALL_TENANT.filter((p) => p !== "api:gerenciar" && p !== "webhooks:gerenciar"),
  enterprise: ALL_TENANT,
};

export type TenantLimits = {
  maxUsuarios: number;
  maxNumeros: number;
  maxContatosDia: number;   // teto interno, sempre <= limite do portfólio na Meta
  exportMaxLinhas: number;
};

export type Session =
  | { scope: "PLATFORM"; userId: string; role: PlatformRole; grants: Permission[]; denies: Permission[];
      permVersion: number; mfa: true; breakglass?: { tenantId: string; expiresAt: Date; readOnly: boolean } }
  | { scope: "TENANT"; userId: string; tenantId: string; role: TenantRole; grants: TenantPermission[];
      denies: TenantPermission[]; permVersion: number; tenantPermVersion: number };

export function effectivePermissions(s: Session, tenantEntitlements: readonly TenantPermission[] = []): Set<Permission> {
  const base = new Set<Permission>([...ROLE_PERMISSIONS[s.role], ...s.grants]);
  if (s.scope === "TENANT") {
    const ceiling = new Set<Permission>(tenantEntitlements);
    for (const p of base) if (!ceiling.has(p) || !TENANT_PERMISSIONS.includes(p as TenantPermission)) base.delete(p);
  }
  for (const d of s.denies) base.delete(d);
  return base;
}

export class Forbidden extends Error { status = 403 as const; }
export class NotFound extends Error { status = 404 as const; }

/** Lança 403 se faltar a permissão. Use no topo de cada handler. */
export function assertCan(perms: Set<Permission>, p: Permission): void {
  if (!perms.has(p)) throw new Forbidden(`sem permissão: ${p}`);
}

/**
 * Um TENANT_ADMIN só concede o que o próprio tenant tem e o que ele mesmo tem.
 * Impede escalada: ninguém dá a outro uma permissão que não possui.
 */
export function assertCanGrant(granter: Set<Permission>, requested: readonly Permission[]): void {
  assertCan(granter, "usuarios:gerenciar");
  const extra = requested.filter((p) => !granter.has(p));
  if (extra.length) throw new Forbidden(`não pode conceder: ${extra.join(", ")}`);
}

/** Máscara de telefone para quem não tem leads:ver_telefone (LGPD: minimização). */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length < 8) return "****";
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 5)}****-${d.slice(-4)}`;
}

export const PLATFORM_ROLES: readonly PlatformRole[] = ["PLATFORM_OWNER", "PLATFORM_CONTINGENCIA", "PLATFORM_SUPORTE"];

export function isPlatformRole(v: string): v is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(v);
}

/** Permissões de um operador da plataforma: papel ∪ grants − denies. Papel desconhecido = nada. */
export function platformPermissions(role: string, grants: readonly Permission[] = [], denies: readonly Permission[] = []): Set<Permission> {
  if (!isPlatformRole(role)) return new Set();
  const out = new Set<Permission>([...ROLE_PERMISSIONS[role], ...grants]);
  for (const d of denies) out.delete(d);
  return out;
}

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  PLATFORM_OWNER: "Dono da plataforma",
  PLATFORM_CONTINGENCIA: "Operador de contingência",
  PLATFORM_SUPORTE: "Suporte",
};
