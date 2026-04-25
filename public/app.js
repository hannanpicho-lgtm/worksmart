const contactForm = document.getElementById("contact-form");
const statusEl = document.getElementById("contact-form-status");
const debugPanel = document.getElementById("form-debug-panel");
const debugLog = document.getElementById("form-debug-log");
const turnstilePlaceholder = "REPLACE_WITH_YOUR_TURNSTILE_SITE_KEY";
const debugMode = new URLSearchParams(window.location.search).get("debugForm") === "1";
const metricsStorageKey = "worksmart_form_metrics_v1";
const dayMs = 24 * 60 * 60 * 1000;

function defaultMetrics() {
  return {
    period_start: Date.now(),
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

function loadMetrics() {
  try {
    const raw = window.localStorage.getItem(metricsStorageKey);
    const parsed = raw ? JSON.parse(raw) : defaultMetrics();
    const stale = !parsed.period_start || Date.now() - Number(parsed.period_start) > dayMs;
    return stale ? defaultMetrics() : { ...defaultMetrics(), ...parsed };
  } catch {
    return defaultMetrics();
  }
}

function saveMetrics(metrics) {
  window.__worksmartMetrics = metrics;
  try {
    window.localStorage.setItem(metricsStorageKey, JSON.stringify(metrics));
  } catch {
    // Ignore write failures (private mode/storage quotas).
  }
}

function bumpMetrics(key) {
  const metrics = loadMetrics();
  metrics[key] = Number(metrics[key] || 0) + 1;
  saveMetrics(metrics);
}

if (debugMode && debugPanel) {
  debugPanel.classList.add("is-visible");
}

function renderDebugEvents() {
  if (!debugMode || !debugLog) return;
  const events = window.__worksmartEvents || [];
  const recent = events.slice(-8).map((entry) => ({
    event_name: entry.event_name,
    has_company: entry.has_company,
    message_size: entry.message_size,
    timestamp: new Date(entry.timestamp).toISOString(),
  }));
  debugLog.textContent = recent.length > 0 ? JSON.stringify(recent, null, 2) : "No events yet.";
}

function normalizeField(value) {
  return String(value || "").trim();
}

function bucketMessageLength(text) {
  const size = normalizeField(text).length;
  if (size === 0) return "empty";
  if (size < 40) return "short";
  if (size < 200) return "medium";
  return "long";
}

function trackFormEvent(eventName, metadata = {}) {
  const payload = {
    event: "contact_form_event",
    event_name: eventName,
    timestamp: Date.now(),
    ...metadata,
  };

  // Generic analytics integrations (GTM/dataLayer style)
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(payload);
  }

  // Lightweight internal queue for debugging/inspection.
  window.__worksmartEvents = window.__worksmartEvents || [];
  window.__worksmartEvents.push(payload);
  sendAnalyticsEvent(payload);
  renderDebugEvents();
}

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-success", "is-error");
  if (type) statusEl.classList.add(type);
}

function resolveIngestUrl(raw) {
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

function sendAnalyticsEvent(payload) {
  if (!contactForm) return;
  const analyticsEndpoint = normalizeField(contactForm.dataset.analyticsEndpoint);
  if (!analyticsEndpoint) return;
  const ingestUrl = resolveIngestUrl(analyticsEndpoint);
  if (!ingestUrl) return;

  const body = JSON.stringify({
    event_name: payload.event_name,
    timestamp: payload.timestamp,
    has_company: payload.has_company,
    message_size: payload.message_size,
    page_path: window.location.pathname,
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ingestUrl, blob);
      return;
    }
  } catch {
    // Fall back to fetch below.
  }

  fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Telemetry must never block or fail UX.
  });
}

async function submitContactForm(event) {
  event.preventDefault();
  if (!contactForm) return;

  const formData = new FormData(contactForm);
  const telemetry = {
    has_company: normalizeField(formData.get("company")).length > 0,
    message_size: bucketMessageLength(formData.get("message")),
  };
  bumpMetrics("total_attempts");
  trackFormEvent("submit_attempt", telemetry);

  const endpoint = contactForm.dataset.endpoint;
  if (!endpoint || endpoint.includes("REPLACE_WITH_YOUR_FORM_ID")) {
    setStatus(
      "Contact form is not configured yet. Set a valid Formspree endpoint in index.html.",
      "is-error",
    );
    bumpMetrics("total_blocked");
    bumpMetrics("blocked_endpoint_unconfigured");
    trackFormEvent("submit_blocked_endpoint_unconfigured", telemetry);
    return;
  }

  const turnstileSiteKey = contactForm.dataset.turnstileSitekey || "";
  const turnstileToken = String(
    contactForm.querySelector('input[name="cf-turnstile-response"]')?.value || "",
  ).trim();
  if (turnstileSiteKey && !turnstileSiteKey.includes(turnstilePlaceholder)) {
    if (!turnstileToken) {
      setStatus("Please complete the security challenge before submitting.", "is-error");
      bumpMetrics("total_blocked");
      bumpMetrics("blocked_turnstile_incomplete");
      trackFormEvent("submit_blocked_turnstile_incomplete", telemetry);
      return;
    }
  } else {
    setStatus(
      "Turnstile is not configured yet. Add your Turnstile site key in index.html.",
      "is-error",
    );
    bumpMetrics("total_blocked");
    bumpMetrics("blocked_turnstile_unconfigured");
    trackFormEvent("submit_blocked_turnstile_unconfigured", telemetry);
    return;
  }

  const honeypot = String(formData.get("_gotcha") || "").trim();
  if (honeypot) {
    bumpMetrics("total_blocked");
    bumpMetrics("blocked_honeypot");
    trackFormEvent("submit_blocked_honeypot", telemetry);
    return;
  }

  const submitButton = contactForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setStatus("Submitting...");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Request rejected");
    }

    contactForm.reset();
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
    setStatus("Thanks. Your request was submitted successfully.", "is-success");
    bumpMetrics("total_success");
    trackFormEvent("submit_success", telemetry);
  } catch {
    setStatus(
      "We could not submit the form right now. Please email worksmart0226@gmail.com.",
      "is-error",
    );
    bumpMetrics("total_error");
    trackFormEvent("submit_error", telemetry);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

if (contactForm) {
  saveMetrics(loadMetrics());
  contactForm.addEventListener("submit", submitContactForm);
}
