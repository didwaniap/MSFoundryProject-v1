const form = document.querySelector("#writer-form");
const result = document.querySelector("#result");
const agents = document.querySelector("#agents");
const usage = document.querySelector("#usage");
const sessionId = crypto.randomUUID();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAgents(items) {
  agents.innerHTML = items
    .map(
      (agent) => `
        <article class="agent">
          <div class="agent-header">
            <h3>${escapeHtml(agent.role)}</h3>
            <span class="pill ${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</span>
          </div>
          <p>${escapeHtml(agent.output)}</p>
          <ul>${agent.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
        </article>
      `
    )
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Running...";
  result.textContent = "Running writer, reviewer, and compliance agents...";
  agents.innerHTML = "";

  try {
    const response = await fetch("/api/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        topic: document.querySelector("#topic").value,
        audience: document.querySelector("#audience").value,
        tone: document.querySelector("#tone").value,
        regulatedTerms: document.querySelector("#regulatedTerms").value
      })
    });
    const body = await response.json();
    if (!response.ok) {
      result.textContent = body.message || "The workflow was blocked by a guardrail.";
      return;
    }
    result.textContent = body.finalDraft;
    usage.textContent = `${body.usage.totalTokens} / ${body.usage.tokenLimitPerSession} est. tokens`;
    renderAgents(body.agents);
  } catch (error) {
    result.textContent = `Workflow failed: ${error.message}`;
  } finally {
    submit.disabled = false;
    submit.textContent = "Run Agents";
  }
});
