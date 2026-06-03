export function realModelCallsEnabled() {
  return process.env.ENABLE_REAL_MODEL_CALLS === "true";
}

export function modelDisplayName() {
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    process.env.MODEL_NAME ||
    process.env.DEMO_CHAT_MODEL ||
    process.env.DEFAULT_CHAT_MODEL ||
    "not-configured"
  );
}

export async function callChatModel({ system, user, maxTokens, temperature = 0.3 }) {
  const provider = process.env.MODEL_PROVIDER || process.env.DEFAULT_MODEL_PROVIDER || "azure-openai";
  if (provider !== "azure-openai") {
    throw new Error(`Unsupported model provider "${provider}". Configure MODEL_PROVIDER=azure-openai.`);
  }

  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || process.env.MODEL_NAME;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  const outputLimit = Number(maxTokens || process.env.AZURE_OPENAI_MAX_TOKENS || 220);

  if (!endpoint || !deployment || !apiKey) {
    throw new Error("Azure OpenAI endpoint, deployment, and API key are required for real model calls.");
  }

  const response = await fetch(
    `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: Number.isFinite(outputLimit) && outputLimit > 0 ? outputLimit : 220,
        temperature
      })
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || `Azure OpenAI request failed with HTTP ${response.status}.`);
  }

  return {
    provider,
    deployment,
    content: String(body.choices?.[0]?.message?.content || "").trim(),
    usage: body.usage || {}
  };
}
