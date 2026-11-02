import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCanGrant, effectivePermissions, maskPhone, PLAN_ENTITLEMENTS, platformPermissions, type Session } from "../src/security";

const operador: Session = {
  scope: "TENANT", userId: "u", tenantId: "t", role: "TENANT_OPERADOR",
  grants: ["leads:exportar"], denies: ["campanhas:disparar"], permVersion: 1, tenantPermVersion: 1,
};

test("tenant: (papel ∪ grants) ∩ entitlements − denies", () => {
  const p = effectivePermissions(operador, PLAN_ENTITLEMENTS.starter);
  assert.ok(!p.has("campanhas:disparar"), "deny vence o papel");
  assert.ok(!p.has("leads:exportar"), "grant fora do teto do cliente é cortado");
  assert.ok(p.has("campanhas:criar"));
  assert.ok(!p.has("contingencia:ver"), "tenant nunca recebe permissão de plataforma");
});

test("admin do tenant não concede o que o plano não tem", () => {
  const admin: Session = { ...operador, role: "TENANT_ADMIN", grants: [], denies: [] };
  assert.throws(() => assertCanGrant(effectivePermissions(admin, PLAN_ENTITLEMENTS.pro), ["api:gerenciar"]));
});

test("plataforma: papel desconhecido não tem nada; suporte não gerencia BMs", () => {
  assert.equal(platformPermissions("ADMIN").size, 0);
  assert.ok(!platformPermissions("PLATFORM_SUPORTE").has("bms:gerenciar"));
  assert.ok(platformPermissions("PLATFORM_OWNER").has("bms:gerenciar"));
  assert.ok(!platformPermissions("PLATFORM_OWNER", [], ["bms:gerenciar"]).has("bms:gerenciar"));
});

test("máscara de telefone (LGPD)", () => {
  assert.equal(maskPhone("+5551998124410"), "+55 51 9****-4410");
});
