import test from "node:test";
import assert from "node:assert/strict";
import healthHandler from "../../api/health.js";
import authHandler from "../../api/auth.js";
import catalogHandler from "../../api/catalog.js";
import adminHandler from "../../api/admin.js";

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  payload: null,
  setHeader(key, value) {
    this.headers[key] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  }
});

const withoutDatabase = async (callback) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  try {
    return await callback();
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalPostgresUrl;
  }
};

test("health bazasız rejimi açıq bildirir", async () => withoutDatabase(async () => {
  const response = createResponse();
  await healthHandler({ method: "GET", headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.database, "not_configured");
  assert.equal(response.payload.ok, true);
}));

test("sessiya endpoint-i cookiesiz anonim cavab verir", async () => withoutDatabase(async () => {
  const response = createResponse();
  await authHandler({ method: "GET", headers: {}, query: { action: "session" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.authenticated, false);
  assert.equal(response.payload.user, null);
}));

test("kataloq endpoint-i baza qoşulmayanda idarə olunan 503 qaytarır", async () => withoutDatabase(async () => {
  const response = createResponse();
  await catalogHandler({ method: "GET", headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error.code, "database_not_configured");
}));

test("idarəetmə gateway-i marşrutları bir funksiyada təhlükəsiz yönləndirir", async () => {
  const protectedResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "analytics" } }, protectedResponse);
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedResponse.payload.error.code, "authentication_required");

  const missingResponse = createResponse();
  await adminHandler({ method: "GET", headers: {}, query: { __route: "unknown" } }, missingResponse);
  assert.equal(missingResponse.statusCode, 404);
  assert.equal(missingResponse.payload.error.code, "admin_route_not_found");
});
