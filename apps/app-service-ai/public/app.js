const form = document.querySelector("#agent-form");
const answer = document.querySelector("#answer");
const toolCalls = document.querySelector("#toolCalls");
const governance = document.querySelector("#governance");
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

function renderToolCalls(calls) {
  toolCalls.innerHTML = calls
    .map(
      (call) => `
        <article class="tool ${escapeHtml(call.status)}">
          <div class="tool-header">
            <strong>${escapeHtml(call.name)}</strong>
            <span class="pill ${escapeHtml(call.status)}">${escapeHtml(call.status)}</span>
          </div>
          <pre>${escapeHtml(JSON.stringify(call.output, null, 2))}</pre>
        </article>
      `
    )
    .join("");
}

function renderGovernance(policy) {
  const status = policy.approvalRequired ? "Approval required" : "No approval required";
  const blocked = policy.blockedActions?.length ? policy.blockedActions.join(", ") : "none";
  governance.innerHTML = `
    <div class="metric">
      <span>Status</span>
      <strong>${escapeHtml(status)}</strong>
    </div>
    <div class="metric">
      <span>Blocked actions</span>
      <strong>${escapeHtml(blocked)}</strong>
    </div>
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Running...";
  answer.textContent = "Calling agent and tools...";
  toolCalls.innerHTML = "";
  governance.textContent = "Evaluating request policy...";

  try {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        prompt: document.querySelector("#prompt").value,
        lineId: document.querySelector("#lineId").value,
        priority: document.querySelector("#priority").value,
        approvalGranted: document.querySelector("#approvalGranted").checked
      })
    });
    const body = await response.json();
    if (!response.ok) {
      answer.textContent = body.message || "The request was blocked.";
      governance.textContent = "Guardrail blocked the request.";
      return;
    }
    answer.textContent = body.answer;
    usage.textContent = `${body.usage.totalTokens} / ${body.usage.tokenLimitPerSession} est. tokens`;
    renderToolCalls(body.toolCalls);
    renderGovernance(body.governance);
  } catch (error) {
    answer.textContent = `Agent run failed: ${error.message}`;
  } finally {
    submit.disabled = false;
    submit.textContent = "Run Agent";
  }
});
