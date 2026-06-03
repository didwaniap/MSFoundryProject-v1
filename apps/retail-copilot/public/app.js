const messages = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const usage = document.querySelector("#usage");
const sessionId = crypto.randomUUID();

function addMessage(role, content, meta = "") {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  item.innerHTML = `
    <div class="message-role">${role === "user" ? "You" : "Copilot"}</div>
    <div class="message-text">${escapeHtml(content)}</div>
    ${meta ? `<div class="message-meta">${meta}</div>` : ""}
  `;
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSources(sources = [], followUps = []) {
  const sourceHtml = sources
    .map(
      (source) => `
        <div class="source">
          <strong>${escapeHtml(source.title)}</strong>
          <ul>${source.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
        </div>
      `
    )
    .join("");
  const followUpHtml = followUps.length
    ? `<div class="followups"><strong>Follow-ups</strong><ul>${followUps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";
  return `${sourceHtml}${followUpHtml}`;
}

async function sendMessage(message) {
  addMessage("user", message);
  input.value = "";
  input.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sessionId })
    });
    const body = await response.json();
    if (!response.ok) {
      addMessage("assistant", body.message || "The request was blocked by a guardrail.");
      return;
    }
    addMessage("assistant", body.answer, renderSources(body.sources, body.followUps));
    usage.textContent = `${body.usage.totalTokens} / ${body.usage.tokenLimitPerSession} est. tokens`;
  } catch (error) {
    addMessage("assistant", `Local chat request failed: ${error.message}`);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (message) {
    sendMessage(message);
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    input.focus();
  });
});

addMessage(
  "assistant",
  "Hi, I can help recommend Contoso outdoor products using local mock product data. Try a family tent question or ask me to compare options."
);
