export const metricsStorageKey = "worksmart_form_metrics_v1";
export const dayMs = 24 * 60 * 60 * 1000;

export function normalizeField(value) {
  return String(value || "").trim();
}

export function bucketMessageLength(text) {
  const size = normalizeField(text).length;
  if (size === 0) return "empty";
  if (size < 40) return "short";
  if (size < 200) return "medium";
  return "long";
}

export function defaultMetrics(now = Date.now()) {
  return {
    period_start: now,
    total_attempts: 0,
    total_success: 0,
    total_error: 0,
    total_blocked: 0,
    blocked_endpoint_unconfigured: 0,
    blocked_turnstile_incomplete: 0,
    blocked_turnstile_unconfigured: 0,
    blocked_honeypot: 0,
  };
}

export function metricsAreStale(periodStart, now = Date.now()) {
  if (!periodStart) return true;
  const start = Number(periodStart);
  if (!Number.isFinite(start)) return true;
  return now - start > dayMs;
}

export function mergeMetrics(raw, now = Date.now()) {
  const baseline = defaultMetrics(now);
  if (!raw || metricsAreStale(raw.period_start, now)) return baseline;
  return { ...baseline, ...raw };
}

export function resolveIngestUrl(raw) {
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/ingest" || path.endsWith("/ingest")) {
      return url.toString();
    }
    if (path === "/") {
      url.pathname = "/ingest";
      return url.toString();
    }
    return url.toString();
  } catch {
    return "";
  }
}
