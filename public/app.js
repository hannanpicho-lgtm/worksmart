const contactForm = document.getElementById("contact-form");
const statusEl = document.getElementById("contact-form-status");
const turnstilePlaceholder = "REPLACE_WITH_YOUR_TURNSTILE_SITE_KEY";

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
}

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-success", "is-error");
  if (type) statusEl.classList.add(type);
}

async function submitContactForm(event) {
  event.preventDefault();
  if (!contactForm) return;

  const formData = new FormData(contactForm);
  const telemetry = {
    has_company: normalizeField(formData.get("company")).length > 0,
    message_size: bucketMessageLength(formData.get("message")),
  };
  trackFormEvent("submit_attempt", telemetry);

  const endpoint = contactForm.dataset.endpoint;
  if (!endpoint || endpoint.includes("REPLACE_WITH_YOUR_FORM_ID")) {
    setStatus(
      "Contact form is not configured yet. Set a valid Formspree endpoint in index.html.",
      "is-error",
    );
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
      trackFormEvent("submit_blocked_turnstile_incomplete", telemetry);
      return;
    }
  } else {
    setStatus(
      "Turnstile is not configured yet. Add your Turnstile site key in index.html.",
      "is-error",
    );
    trackFormEvent("submit_blocked_turnstile_unconfigured", telemetry);
    return;
  }

  const honeypot = String(formData.get("_gotcha") || "").trim();
  if (honeypot) {
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
    trackFormEvent("submit_success", telemetry);
  } catch {
    setStatus(
      "We could not submit the form right now. Please email worksmart0226@gmail.com.",
      "is-error",
    );
    trackFormEvent("submit_error", telemetry);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

if (contactForm) {
  contactForm.addEventListener("submit", submitContactForm);
}
