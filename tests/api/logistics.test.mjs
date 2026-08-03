import assert from "node:assert/strict";
import test from "node:test";
import { calculateDeliveryQuoteFromZones, mapLogisticsZone } from "../../api/_lib/logistics.js";

const row = (overrides = {}) => ({
  id: "log-test",
  name: "Bakı",
  cities: ["Bakı"],
  base_fee: 10,
  per_supplier_fee: 2,
  per_unit_fee: 0,
  minimum_fee: 10,
  free_above: null,
  eta_min_days: 1,
  eta_max_days: 2,
  priority: 10,
  active: true,
  rate_status: "estimate",
  rate_source_url: null,
  rate_valid_until: null,
  ...overrides
});

test("yalnız etibarlı daşıyıcı tarifi təsdiqlənmiş kimi hesablanır", () => {
  const estimate = mapLogisticsZone(row());
  const verified = mapLogisticsZone(row({
    rate_status: "verified",
    rate_source_url: "https://carrier.example/rates",
    rate_valid_until: "2999-12-31"
  }));
  assert.equal(calculateDeliveryQuoteFromZones({ zones: [estimate], city: "Bakı" }).breakdown.tariffType, "platform_estimate");
  assert.equal(calculateDeliveryQuoteFromZones({ zones: [verified], city: "Bakı" }).breakdown.tariffType, "verified_partner_tariff");
});

test("müddəti keçmiş təsdiqli tarif avtomatik expired görünür", () => {
  const expired = mapLogisticsZone(row({
    rate_status: "verified",
    rate_source_url: "https://carrier.example/rates",
    rate_valid_until: "2000-01-01"
  }));
  assert.equal(expired.rateStatus, "expired");
});
