/**
 * WorkSmart contact-form telemetry ingest (no PII).
 * Deploy: npm run worker:form-analytics:deploy
 */

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MESSAGE_SIZE_VALUES = new Set(["empty", "short", "medium", "long"]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function parseAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env);
  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : "";

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

function verifyIngestAuth(request, env) {
  const secret = String(env.ANALYTICS_INGEST_SECRET || "").trim();
  if (!secret) return true;
  const header = request.headers.get("Authorization") || "";
  const expected = `Bearer ${secret}`;
  return header === expected;
}

function verifyReadAuth(url, env) {
  const secret = String(env.ANALYTICS_INGEST_SECRET || "").trim();
  if (!secret) return false;
  const token = String(url.searchParams.get("token") || "").trim();
  return token === secret;
}

function normalizePayload(body) {
  const event_name = String(body.event_name || "").trim().toLowerCase();
  if (!EVENT_NAME_PATTERN.test(event_name)) return null;

  const timestamp = Number(body.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  const has_company = Boolean(body.has_company);
  const message_size = String(body.message_size || "").trim().toLowerCase();
  if (!MESSAGE_SIZE_VALUES.has(message_size)) return null;

  const page_path = String(body.page_path || "/").trim() || "/";
  if (page_path.length > 256) return null;

  return { event_name, timestamp, has_company, message_size, page_path };
}

async function readJsonBody(request) {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    const text = await request.text();
    if (text.length > 4096) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function utcDayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function bumpKv(env, eventName, timestamp) {
  if (!env.METRICS) return;
  const day = utcDayKey(timestamp);
  const key = `form:${day}:${eventName}`;
  const current = Number.parseInt((await env.METRICS.get(key)) || "0", 10) || 0;
  await env.METRICS.put(key, String(current + 1));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      if (!cors["Access-Control-Allow-Origin"]) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return json({ ok: true, service: "worksmart-form-analytics" }, 200, cors);
    }

    if (request.method === "GET" && path === "/metrics") {
      const metricsSecret = String(env.ANALYTICS_INGEST_SECRET || "").trim();
      if (!metricsSecret) {
        return json({ ok: false, error: "metrics_requires_ANALYTICS_INGEST_SECRET" }, 403, cors);
      }
      if (!verifyReadAuth(url, env)) {
        return unauthorized();
      }
      if (!env.METRICS) {
        return json({ ok: true, metrics: {}, note: "METRICS KV binding not configured" }, 200, cors);
      }
      const day = utcDayKey(Date.now());
      const prefix = `form:${day}:`;
      const list = await env.METRICS.list({ prefix });
      const metrics = {};
      for (const key of list.keys) {
        const value = await env.METRICS.get(key.name);
        metrics[key.name.slice(prefix.length)] = Number.parseInt(value || "0", 10) || 0;
      }
      return json({ ok: true, day, metrics }, 200, cors);
    }

    if (request.method !== "POST" || path !== "/ingest") {
      return json({ ok: false, error: "not_found" }, 404, cors);
    }

    if (!cors["Access-Control-Allow-Origin"]) {
      return new Response(null, { status: 403 });
    }

    if (!verifyIngestAuth(request, env)) {
      return unauthorized();
    }

    const raw = await readJsonBody(request);
    if (!raw || typeof raw !== "object") {
      return json({ ok: false, error: "invalid_body" }, 400, cors);
    }

    const payload = normalizePayload(raw);
    if (!payload) {
      return json({ ok: false, error: "invalid_payload" }, 400, cors);
    }

    ctx.waitUntil(
      bumpKv(env, payload.event_name, payload.timestamp).catch((err) => {
        console.error("kv_bump_failed", err && err.message ? err.message : err);
      }),
    );

    const logLine = JSON.stringify({
      type: "form_telemetry",
      ...payload,
      received_at: Date.now(),
    });
    console.log(logLine);

    return new Response(null, { status: 204, headers: cors });
  },
};
