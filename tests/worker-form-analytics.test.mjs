import test from "node:test";
import assert from "node:assert/strict";

import worker from "../workers/form-analytics/src/index.js";

function makeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };
}

function makeKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async list({ prefix }) {
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

async function call(url, init = {}, env = {}) {
  const request = new Request(url, init);
  const ctx = makeCtx();
  const response = await worker.fetch(request, env, ctx);
  await Promise.all(ctx.pending);
  return response;
}

test("health endpoint returns ok", async () => {
  const res = await call("https://worker.example/health", { method: "GET" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
});

test("ingest rejects invalid payload", async () => {
  const res = await call(
    "https://worker.example/ingest",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_name: "bad event name" }),
    },
    {},
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "invalid_payload");
});

test("ingest accepts valid payload and bumps KV counters", async () => {
  const kv = makeKv();
  const now = Date.now();
  const res = await call(
    "https://worker.example/ingest",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://worksmart-188.pages.dev",
      },
      body: JSON.stringify({
        event_name: "submit_success",
        timestamp: now,
        has_company: false,
        message_size: "short",
        page_path: "/",
      }),
    },
    {
      ALLOWED_ORIGINS: "https://worksmart-188.pages.dev",
      METRICS: kv,
    },
  );
  assert.equal(res.status, 204);
  const day = new Date(now).toISOString().slice(0, 10);
  const value = await kv.get(`form:${day}:submit_success`);
  assert.equal(value, "1");
});

test("cors blocks disallowed origins", async () => {
  const preflight = await call(
    "https://worker.example/ingest",
    {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    },
    {
      ALLOWED_ORIGINS: "https://worksmart-188.pages.dev",
    },
  );
  assert.equal(preflight.status, 403);

  const post = await call(
    "https://worker.example/ingest",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({
        event_name: "submit_attempt",
        timestamp: Date.now(),
        has_company: false,
        message_size: "short",
        page_path: "/",
      }),
    },
    {
      ALLOWED_ORIGINS: "https://worksmart-188.pages.dev",
    },
  );
  assert.equal(post.status, 403);
});

test("metrics endpoint requires secret and returns counters when authorized", async () => {
  const kv = makeKv();
  const day = new Date().toISOString().slice(0, 10);
  await kv.put(`form:${day}:submit_attempt`, "3");

  const denied = await call(
    "https://worker.example/metrics",
    { method: "GET" },
    { METRICS: kv },
  );
  assert.equal(denied.status, 403);

  const ok = await call(
    "https://worker.example/metrics?token=secret-123",
    { method: "GET" },
    {
      ANALYTICS_INGEST_SECRET: "secret-123",
      METRICS: kv,
    },
  );
  assert.equal(ok.status, 200);
  const json = await ok.json();
  assert.equal(json.ok, true);
  assert.equal(json.metrics.submit_attempt, 3);
});
