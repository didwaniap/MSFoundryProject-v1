import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTokenGovernor, estimateTokens } from "../../app-helpers/governance.js";
import { callChatModel, modelDisplayName, realModelCallsEnabled } from "../../app-helpers/llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const port = Number(process.env.PORT || 4612);
const host = process.env.HOST || "0.0.0.0";
const mockMode = !realModelCallsEnabled() || process.env.CREATIVE_WRITER_MOCK_MODE === "true";
const tokenGovernor = createTokenGovernor({
  appKey: "creative-writer",
  businessUnit: "hr",
  defaults: { request: 1600, session: 6000 }
});

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const tones = {
  executive: "clear, concise, business-ready",
  friendly: "warm, accessible, and energetic",
  editorial: "polished, vivid, and publication-ready",
  technical: "precise, structured, and practical"
};

function getSessionId(body) {
  return String(body.sessionId || "creative-demo-session").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data, null, 2));
}

function detectProduct(topic) {
  const normalized = topic.toLowerCase();
  if (normalized.includes("backpack")) return "sustainable outdoor backpack";
  if (normalized.includes("tent")) return "family camping tent";
  if (normalized.includes("jacket")) return "weatherproof travel jacket";
  return topic || "new Contoso outdoor product";
}

function writerAgent({ topic, audience, tone }) {
  const product = detectProduct(topic);
  const toneLabel = tones[tone] || tones.editorial;
  return {
    role: "Writer",
    status: "completed",
    output: `Contoso introduces its ${product}, designed for people who want reliable gear without extra complexity. Built for ${audience || "modern outdoor customers"}, the product pairs practical materials with thoughtful details that make planning, packing, and getting outside easier. The result is a ${toneLabel} launch story: dependable equipment, lighter decisions, and a better trip from the first mile.`,
    notes: [
      "Opened with the product and audience.",
      "Kept the message grounded in practical value.",
      "Avoided unsupported claims about discounts or inventory."
    ]
  };
}

function reviewerAgent(draft) {
  const edits = [
    "Lead with the customer problem before listing product value.",
    "Make the sustainability claim specific only when source data is available.",
    "Add a clearer closing sentence that can become a call to action."
  ];
  return {
    role: "Reviewer",
    status: "completed",
    output: `${draft.output} For teams preparing launch content, this version is ready for stakeholder review after source-backed product claims are attached.`,
    notes: edits
  };
}

function complianceAgent(reviewed, { regulatedTerms = "" }) {
  const flaggedTerms = String(regulatedTerms)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((term) => reviewed.output.toLowerCase().includes(term.toLowerCase()));
  return {
    role: "Compliance",
    status: flaggedTerms.length ? "needs-review" : "completed",
    output:
      flaggedTerms.length > 0
        ? `Review required before publication. Flagged terms: ${flaggedTerms.join(", ")}.`
        : "No blocked terms found in the mock compliance pass. Human review is still required before external publication.",
    notes: [
      "Checked for configured blocked or regulated terms.",
      "Confirmed unsupported claims should be linked to source material.",
      "Marked the artifact as demo-safe mock output."
    ]
  };
}

function orchestrateWorkflow(input) {
  const writer = writerAgent(input);
  const reviewer = reviewerAgent(writer);
  const compliance = complianceAgent(reviewer, input);
  const finalDraft =
    compliance.status === "needs-review"
      ? reviewer.output
      : `${reviewer.output}\n\nSuggested headline: Practical Gear For Better Days Outside`;
  return {
    finalDraft,
    agents: [writer, reviewer, compliance],
    summary: {
      status: compliance.status === "needs-review" ? "needs-review" : "ready",
      nextStep:
        compliance.status === "needs-review"
          ? "Route to human approver before publishing."
          : "Attach approved product source facts and route for business approval."
    }
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const body = await readFile(filePath);
  const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/health" && request.method === "GET") {
      sendJson(response, {
        status: "ok",
        app: "contoso-creative-writer",
        mockMode,
        model: modelDisplayName(),
        asOf: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/write" && request.method === "POST") {
      const body = await readJson(request);
      const sessionId = getSessionId(body);
      const topic = String(body.topic || "").trim();
      const audience = String(body.audience || "retail launch leaders").trim();
      const tone = String(body.tone || "editorial").trim();

      if (!topic) {
        sendJson(response, { status: "failed", message: "Topic is required." }, 400);
        return;
      }

      const promptTokens = estimateTokens(`${topic} ${audience} ${tone} ${body.regulatedTerms || ""}`);
      const requestCheck = tokenGovernor.checkRequest(promptTokens);
      if (!requestCheck.allowed) {
        sendJson(response, requestCheck, 429);
        return;
      }

      const workflow = orchestrateWorkflow({
        topic,
        audience,
        tone,
        regulatedTerms: body.regulatedTerms
      });
      let modelCall = null;

      if (!mockMode) {
        modelCall = await callChatModel({
          system:
            "You are the final editor in a Contoso multi-agent writing workflow. Improve the draft, keep it business-safe, avoid unsupported claims, and return only the final draft.",
          user: `Topic: ${topic}\nAudience: ${audience}\nTone: ${tone}\nCompliance notes: ${workflow.agents
            .map((agent) => `${agent.role}: ${agent.output}`)
            .join("\n")}\n\nDraft:\n${workflow.finalDraft}`,
          maxTokens: 220,
          temperature: 0.4
        });
        workflow.finalDraft = modelCall.content || workflow.finalDraft;
        workflow.agents.push({
          role: "LLM Final Editor",
          status: "completed",
          output: workflow.finalDraft,
          notes: [
            `Called ${modelCall.provider} deployment ${modelCall.deployment}.`,
            "Kept compliance and source-grounding constraints in the prompt."
          ]
        });
      }

      const completionTokens = modelCall?.usage?.completion_tokens || estimateTokens(
        `${workflow.finalDraft} ${workflow.agents.map((agent) => agent.output).join(" ")}`
      );
      const usageResult = tokenGovernor.recordUsage({
        sessionId,
        userId: body.userId,
        promptTokens: modelCall?.usage?.prompt_tokens || promptTokens,
        completionTokens
      });
      if (!usageResult.allowed) {
        sendJson(response, usageResult, 429);
        return;
      }

      sendJson(response, {
        status: "ok",
        mode: mockMode ? "mock" : "llm",
        sessionId,
        ...workflow,
        modelCall,
        usage: usageResult.usage,
        policy: usageResult.policy
      });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, { status: "failed", message: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Contoso Creative Writer running at http://${host}:${port}`);
});
