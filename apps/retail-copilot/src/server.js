import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTokenGovernor, estimateTokens } from "../../app-helpers/governance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const port = Number(process.env.PORT || 4611);
const mockMode = process.env.RETAIL_COPILOT_MOCK_MODE !== "false";
const tokenGovernor = createTokenGovernor({
  appKey: "retail-copilot",
  businessUnit: "finance",
  defaults: { request: 1200, session: 5000 }
});

const products = [
  {
    id: "tent-aurora-6",
    name: "Aurora Trail 6-Person Tent",
    category: "tent",
    price: 249,
    facts: [
      "Waterproof rainfly rated for steady rain.",
      "Sleeps six with two vestibules for gear.",
      "Color-coded poles make setup easier for new campers."
    ]
  },
  {
    id: "tent-summit-4",
    name: "Summit Ridge 4-Person Tent",
    category: "tent",
    price: 189,
    facts: [
      "Water-resistant shell for light rain.",
      "Compact footprint for smaller campsites.",
      "Best for couples or families with younger children."
    ]
  },
  {
    id: "pack-evergreen-35",
    name: "Evergreen 35L Daypack",
    category: "backpack",
    price: 89,
    facts: [
      "Recycled ripstop fabric.",
      "Hydration sleeve and padded laptop pocket.",
      "Rain cover included."
    ]
  },
  {
    id: "jacket-mistguard",
    name: "MistGuard Rain Jacket",
    category: "jacket",
    price: 129,
    facts: [
      "Waterproof breathable shell.",
      "Adjustable hood and sealed seams.",
      "Packs into its own pocket."
    ]
  }
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function getSessionId(requestBody) {
  return String(requestBody.sessionId || "demo-session").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
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

function sourceFor(product) {
  return {
    id: product.id,
    title: product.name,
    facts: product.facts
  };
}

function chooseProducts(message) {
  const normalized = message.toLowerCase();
  if (normalized.includes("tent") || normalized.includes("camp")) {
    return products.filter((product) => product.category === "tent");
  }
  if (normalized.includes("backpack") || normalized.includes("pack")) {
    return products.filter((product) => product.category === "backpack");
  }
  if (normalized.includes("jacket") || normalized.includes("rain")) {
    return products.filter((product) => product.category === "jacket");
  }
  return products.slice(0, 3);
}

function buildMockAnswer(message) {
  const matches = chooseProducts(message);
  const normalized = message.toLowerCase();

  if (normalized.includes("compare") && matches.length > 1) {
    const [first, second] = matches;
    return {
      answer: `${first.name} is the stronger family recommendation because it has a waterproof rainfly, sleeps six, and has two vestibules for gear. ${second.name} is less expensive and easier for smaller sites, but it is better for light rain and smaller groups. For a family camping trip, I would choose ${first.name} unless budget or campsite size is the main constraint.`,
      sources: [sourceFor(first), sourceFor(second)],
      followUps: [
        "How many people will sleep in the tent?",
        "Do you expect heavy rain or mostly dry weather?"
      ]
    };
  }

  if (matches.some((product) => product.category === "tent")) {
    const primary = matches[0];
    return {
      answer: `I recommend ${primary.name} for a family camping trip. It has a waterproof rainfly for steady rain, enough sleeping space for six people, and vestibules to keep gear outside the sleeping area. It is a better family choice than the smaller tent when comfort and weather protection matter more than the lowest price.`,
      sources: matches.map(sourceFor),
      followUps: [
        "How many adults and children are going?",
        "Do you need room for pets or bulky gear?"
      ]
    };
  }

  const primary = matches[0];
  return {
    answer: `${primary.name} is a solid option based on your question. The most relevant details are: ${primary.facts.join(" ")} If you tell me your budget, trip length, and weather conditions, I can narrow the recommendation.`,
    sources: matches.map(sourceFor),
    followUps: [
      "What is your target budget?",
      "Will this be used for day trips or overnight travel?"
    ]
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
        app: "contoso-chat-retail-copilot",
        mockMode,
        asOf: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/products" && request.method === "GET") {
      sendJson(response, { products });
      return;
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await readJson(request);
      const message = String(body.message || "").trim();
      const sessionId = getSessionId(body);

      if (!message) {
        sendJson(response, { status: "failed", message: "Message is required." }, 400);
        return;
      }

      const promptTokens = estimateTokens(message);
      const requestCheck = tokenGovernor.checkRequest(promptTokens);
      if (!requestCheck.allowed) {
        sendJson(response, requestCheck, 429);
        return;
      }

      const generated = buildMockAnswer(message);
      const completionTokens = estimateTokens(generated.answer);
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
        status: "ok",
        mode: mockMode ? "mock" : "model-ready",
        sessionId,
        answer: generated.answer,
        sources: generated.sources,
        followUps: generated.followUps,
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

server.listen(port, "127.0.0.1", () => {
  console.log(`Contoso Chat Retail Copilot running at http://127.0.0.1:${port}`);
});
