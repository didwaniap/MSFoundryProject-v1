import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTokenGovernor, estimateTokens } from "../../app-helpers/governance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const port = Number(process.env.PORT || 4613);
const host = process.env.HOST || "0.0.0.0";
const hostingTarget = process.env.HOSTING_TARGET || "Azure App Service";
const mockMode = process.env.APP_SERVICE_AI_MOCK_MODE !== "false";
const tokenGovernor = createTokenGovernor({
  appKey: "app-service-ai",
  businessUnit: "manufacturing",
  defaults: { request: 1800, session: 7000 }
});

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const lineStatus = {
  lineA: {
    lineId: "lineA",
    name: "Assembly Line A",
    state: "running",
    outputRate: "92%",
    openRisks: ["Packaging sensor calibration due today"],
    owner: "Manufacturing BU"
  },
  lineB: {
    lineId: "lineB",
    name: "Packaging Line B",
    state: "watch",
    outputRate: "78%",
    openRisks: ["Backlog above threshold", "Shift handoff note pending"],
    owner: "Manufacturing BU"
  },
  lineC: {
    lineId: "lineC",
    name: "Quality Line C",
    state: "maintenance",
    outputRate: "0%",
    openRisks: ["Maintenance window active"],
    owner: "Manufacturing BU"
  }
};

const tasks = [
  {
    id: "task-101",
    title: "Complete policy review for maintenance workflow",
    lineId: "lineA",
    priority: "high",
    status: "open",
    requiresApproval: true
  },
  {
    id: "task-102",
    title: "Capture packaging sensor calibration evidence",
    lineId: "lineA",
    priority: "medium",
    status: "open",
    requiresApproval: false
  },
  {
    id: "task-103",
    title: "Review backlog exception for Packaging Line B",
    lineId: "lineB",
    priority: "high",
    status: "open",
    requiresApproval: false
  }
];

function getSessionId(body) {
  return String(body.sessionId || "app-service-demo-session").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
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

function addToolCall(toolCalls, name, input, output, status = "completed") {
  const call = {
    id: `tool-${String(toolCalls.length + 1).padStart(2, "0")}`,
    name,
    status,
    input,
    output
  };
  toolCalls.push(call);
  return call;
}

function getLineStatus({ lineId }) {
  return lineStatus[lineId] || lineStatus.lineA;
}

function listTasks({ lineId, status = "open" }) {
  return tasks.filter((task) => task.lineId === lineId && (status === "all" || task.status === status));
}

function createTask({ title, lineId, priority = "medium", requiresApproval = false }) {
  const task = {
    id: `task-${String(200 + tasks.length + 1)}`,
    title,
    lineId,
    priority,
    status: "open",
    requiresApproval
  };
  tasks.push(task);
  return task;
}

function completeTask({ taskId, approvalGranted }) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    return { status: "not-found", message: `Task ${taskId} was not found.` };
  }
  if (task.requiresApproval && !approvalGranted) {
    return {
      status: "approval-required",
      message: `${task.id} requires an approved operator or policy owner before it can be completed.`,
      task
    };
  }
  task.status = "completed";
  return { status: "completed", task };
}

function isUnsafePrompt(prompt) {
  return /\b(delete|disable safety|bypass safety|ignore approval|shut down|drop database|exfiltrate)\b/i.test(prompt);
}

function makeTaskTitles(prompt, lineName) {
  if (/onboard|onboarding/i.test(prompt)) {
    return [
      "Assign onboarding owner for new line operator",
      "Schedule policy review with safety lead",
      "Confirm access to work instruction portal"
    ];
  }
  if (/maintenance|repair|sensor/i.test(prompt)) {
    return [
      `Inspect sensor telemetry for ${lineName}`,
      `Create maintenance handoff notes for ${lineName}`,
      `Verify safety checklist for ${lineName}`
    ];
  }
  return [
    `Review production status for ${lineName}`,
    `Capture operator notes for ${lineName}`,
    `Prepare shift handoff summary for ${lineName}`
  ];
}

function runAgentWorkflow(input) {
  const prompt = String(input.prompt || "").trim();
  const lineId = String(input.lineId || "lineA");
  const priority = String(input.priority || "high");
  const approvalGranted = Boolean(input.approvalGranted);
  const selectedLine = getLineStatus({ lineId });
  const toolCalls = [];

  if (isUnsafePrompt(prompt)) {
    addToolCall(
      toolCalls,
      "approval_policy.evaluate",
      { prompt },
      {
        decision: "blocked",
        reason: "The requested action could change safety, availability, or data retention controls."
      },
      "blocked"
    );
    return {
      status: "blocked",
      answer:
        "I cannot perform that tool action in this demo. It needs explicit human approval, a change ticket, and a safe operational runbook before execution.",
      toolCalls,
      governance: {
        approvalRequired: true,
        blockedActions: ["safety-control-change", "destructive-operation"]
      }
    };
  }

  const status = getLineStatus({ lineId });
  addToolCall(toolCalls, "manufacturing.getLineStatus", { lineId }, status);

  if (/status|summarize|summary|open task|task api/i.test(prompt)) {
    const openTasks = listTasks({ lineId, status: "open" });
    addToolCall(toolCalls, "manufacturing.listTasks", { lineId, status: "open" }, { tasks: openTasks });
  }

  const createdTasks = [];
  if (/create|task|onboard|onboarding|maintenance|repair|sensor/i.test(prompt)) {
    const requestedCount = /\bthree\b|3/.test(prompt) ? 3 : 1;
    const titles = makeTaskTitles(prompt, selectedLine.name).slice(0, requestedCount);
    for (const title of titles) {
      const task = createTask({
        title,
        lineId,
        priority,
        requiresApproval: /policy review/i.test(title)
      });
      createdTasks.push(task);
    }
    addToolCall(
      toolCalls,
      "manufacturing.createTasks",
      { lineId, priority, count: createdTasks.length },
      { tasks: createdTasks }
    );
  }

  let completionResult = null;
  if (/mark.*complete|complete.*policy review|policy review complete/i.test(prompt)) {
    const policyTask = tasks.find(
      (task) => task.lineId === lineId && /policy review/i.test(task.title) && task.status !== "completed"
    );
    completionResult = completeTask({ taskId: policyTask?.id || "task-101", approvalGranted });
    addToolCall(
      toolCalls,
      "manufacturing.completeTask",
      { taskId: policyTask?.id || "task-101", approvalGranted },
      completionResult,
      completionResult.status === "approval-required" ? "approval-required" : "completed"
    );
  }

  const openTasks = listTasks({ lineId, status: "open" });
  const completedText =
    completionResult?.status === "completed"
      ? ` I also marked ${completionResult.task.id} complete.`
      : completionResult?.status === "approval-required"
        ? ` The policy review remains open because ${completionResult.message}`
        : "";
  const createdText = createdTasks.length
    ? ` I created ${createdTasks.length} ${priority}-priority task${createdTasks.length === 1 ? "" : "s"}.`
    : "";

  return {
    status: completionResult?.status === "approval-required" ? "needs-approval" : "ok",
    answer: `${selectedLine.name} is ${status.state} with output at ${status.outputRate}.${createdText}${completedText} There are now ${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} for this line.`,
    toolCalls,
    governance: {
      approvalRequired: completionResult?.status === "approval-required",
      blockedActions: []
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
        app: "azure-app-service-ai-scenario",
        mockMode,
        hostingTarget,
        asOf: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/tools/tasks" && request.method === "GET") {
      sendJson(response, {
        status: "ok",
        tasks
      });
      return;
    }

    if (url.pathname === "/api/agent" && request.method === "POST") {
      const body = await readJson(request);
      const sessionId = getSessionId(body);
      const prompt = String(body.prompt || "").trim();

      if (!prompt) {
        sendJson(response, { status: "failed", message: "Prompt is required." }, 400);
        return;
      }

      const promptTokens = estimateTokens(`${prompt} ${body.lineId || ""} ${body.priority || ""}`);
      const requestCheck = tokenGovernor.checkRequest(promptTokens);
      if (!requestCheck.allowed) {
        sendJson(response, requestCheck, 429);
        return;
      }

      const workflow = runAgentWorkflow(body);
      const completionTokens = estimateTokens(
        `${workflow.answer} ${workflow.toolCalls.map((call) => JSON.stringify(call.output)).join(" ")}`
      );
      const usageResult = tokenGovernor.recordUsage({
        sessionId,
        userId: body.userId,
        promptTokens,
        completionTokens
      });
      if (!usageResult.allowed) {
        sendJson(response, usageResult, 429);
        return;
      }

      sendJson(response, {
        mode: mockMode ? "mock" : "model-ready",
        sessionId,
        ...workflow,
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
  console.log(`Azure App Service AI Scenario running at http://${host}:${port}`);
});
