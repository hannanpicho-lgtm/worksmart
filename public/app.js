const contactForm = document.getElementById("contact-form");
const statusEl = document.getElementById("contact-form-status");
const turnstilePlaceholder = "REPLACE_WITH_YOUR_TURNSTILE_SITE_KEY";

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-success", "is-error");
  if (type) statusEl.classList.add(type);
}

async function submitContactForm(event) {
  event.preventDefault();
  if (!contactForm) return;

  const endpoint = contactForm.dataset.endpoint;
  if (!endpoint || endpoint.includes("REPLACE_WITH_YOUR_FORM_ID")) {
    setStatus(
      "Contact form is not configured yet. Set a valid Formspree endpoint in index.html.",
      "is-error",
    );
    return;
  }

  const turnstileSiteKey = contactForm.dataset.turnstileSitekey || "";
  const turnstileToken = String(
    contactForm.querySelector('input[name="cf-turnstile-response"]')?.value || "",
  ).trim();
  if (turnstileSiteKey && !turnstileSiteKey.includes(turnstilePlaceholder)) {
    if (!turnstileToken) {
      setStatus("Please complete the security challenge before submitting.", "is-error");
      return;
    }
  } else {
    setStatus(
      "Turnstile is not configured yet. Add your Turnstile site key in index.html.",
      "is-error",
    );
    return;
  }

  const formData = new FormData(contactForm);
  const honeypot = String(formData.get("_gotcha") || "").trim();
  if (honeypot) return;

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
  } catch {
    setStatus(
      "We could not submit the form right now. Please email worksmart0226@gmail.com.",
      "is-error",
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

if (contactForm) {
  contactForm.addEventListener("submit", submitContactForm);
}
