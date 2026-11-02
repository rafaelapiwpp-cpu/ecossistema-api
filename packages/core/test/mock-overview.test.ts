import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockDataSource, getAdminOverview } from "../src";

test("mock continua produzindo a Visão geral completa", async () => {
  const o = await getAdminOverview(createMockDataSource());
  assert.equal(o.dataSource, "mock");
  assert.equal(o.kpis.tenants.total, 12);
  assert.equal(o.kpis.businessManagers.total, 17);
  assert.equal(o.kpis.phoneNumbers.total, 37);
  assert.ok(o.alerts.length > 0);
  assert.equal(o.volume.length, 14);
});
