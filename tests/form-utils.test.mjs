import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketMessageLength,
  defaultMetrics,
  mergeMetrics,
  metricsAreStale,
  normalizeField,
  resolveIngestUrl,
} from "../public/form-utils.mjs";

test("normalizeField trims and stringifies values", () => {
  assert.equal(normalizeField("  hello  "), "hello");
  assert.equal(normalizeField(42), "42");
  assert.equal(normalizeField(null), "");
});

test("bucketMessageLength classifies message size correctly", () => {
  assert.equal(bucketMessageLength(""), "empty");
  assert.equal(bucketMessageLength("small text"), "short");
  assert.equal(bucketMessageLength("x".repeat(80)), "medium");
  assert.equal(bucketMessageLength("x".repeat(240)), "long");
});

test("resolveIngestUrl appends /ingest for root endpoints", () => {
  assert.equal(
    resolveIngestUrl("https://example.workers.dev"),
    "https://example.workers.dev/ingest",
  );
  assert.equal(
    resolveIngestUrl("https://example.workers.dev/"),
    "https://example.workers.dev/ingest",
  );
  assert.equal(
    resolveIngestUrl("https://example.workers.dev/ingest"),
    "https://example.workers.dev/ingest",
  );
});

test("resolveIngestUrl keeps explicit non-root paths unchanged", () => {
  assert.equal(
    resolveIngestUrl("https://example.workers.dev/custom"),
    "https://example.workers.dev/custom",
  );
  assert.equal(resolveIngestUrl("not-a-url"), "");
});

test("metrics lifecycle helpers reset stale windows and merge active windows", () => {
  const now = Date.UTC(2026, 3, 25, 12, 0, 0);
  const fresh = defaultMetrics(now);
  assert.equal(fresh.total_attempts, 0);

  const active = {
    period_start: now - 1000,
    total_attempts: 2,
    total_success: 1,
  };
  const mergedActive = mergeMetrics(active, now);
  assert.equal(mergedActive.total_attempts, 2);
  assert.equal(mergedActive.total_success, 1);
  assert.equal(mergedActive.total_error, 0);

  const stale = {
    period_start: now - 2 * 24 * 60 * 60 * 1000,
    total_attempts: 99,
  };
  assert.equal(metricsAreStale(stale.period_start, now), true);
  const mergedStale = mergeMetrics(stale, now);
  assert.equal(mergedStale.total_attempts, 0);
  assert.equal(mergedStale.period_start, now);
});
