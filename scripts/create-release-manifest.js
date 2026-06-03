import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const apps = {
  "retail-copilot": {
    name: "Contoso Chat Retail Copilot",
    sourcePath: "apps/retail-copilot",
    promptPackPath: "apps/retail-copilot/prompts",
    evalSuitePath: "apps/retail-copilot/evals/smoke.json",
    defaultImage: "ghcr.io/contoso/msfoundryv1/finance/retail-copilot:dev-v1",
    businessUnit: "finance",
    hosting: "Azure Container Apps",
    mockModeEnv: "RETAIL_COPILOT_MOCK_MODE"
  },
  "creative-writer": {
    name: "Contoso Creative Writer",
    sourcePath: "apps/creative-writer",
    promptPackPath: "apps/creative-writer/prompts",
    evalSuitePath: "apps/creative-writer/evals/smoke.json",
    defaultImage: "ghcr.io/contoso/msfoundryv1/hr/creative-writer:dev-v1",
    businessUnit: "hr",
    hosting: "Azure Container Apps",
    mockModeEnv: "CREATIVE_WRITER_MOCK_MODE"
  },
  "app-service-ai": {
    name: "Azure App Service AI Scenario",
    sourcePath: "apps/app-service-ai",
    promptPackPath: "apps/app-service-ai/prompts",
    evalSuitePath: "apps/app-service-ai/evals/smoke.json",
    defaultImage: "ghcr.io/contoso/msfoundryv1/manufacturing/app-service-ai:dev-v1",
    businessUnit: "manufacturing",
    hosting: "Azure App Service",
    mockModeEnv: "APP_SERVICE_AI_MOCK_MODE"
  }
};

const [, , appKey = "retail-copilot", environment = "dev", imageOverride = ""] = process.argv;
const app = apps[appKey];

if (!app) {
  throw new Error(`Unknown app "${appKey}".`);
}

const allowedEnvironments = new Set(["dev", "test", "prod"]);
if (!allowedEnvironments.has(environment)) {
  throw new Error(`Unknown environment "${environment}". Use dev, test, or prod.`);
}

function gateForEnvironment(targetEnvironment) {
  if (targetEnvironment === "prod") {
    return "Manual business and platform approval, eval pass, rollback manifest, and budget check.";
  }
  if (targetEnvironment === "test") {
    return "Promoted immutable image digest, smoke eval pass, and BU validation.";
  }
  return "CI validation, local mock smoke checks, and owner acknowledgement.";
}

async function loadEvalIds(evalPath) {
  const raw = await readFile(evalPath, "utf8");
  const parsed = JSON.parse(raw);
  return (parsed.cases || []).map((item) => item.id);
}

const evalIds = await loadEvalIds(app.evalSuitePath);
const image = imageOverride || process.env.WORKLOAD_IMAGE_REFERENCE || app.defaultImage;
const imageDigest = process.env.WORKLOAD_IMAGE_DIGEST || "sha256:pending-ci-build";
const now = new Date().toISOString();
const manifest = {
  schemaVersion: "1.0",
  appKey,
  appName: app.name,
  businessUnit: app.businessUnit,
  environment,
  hosting: app.hosting,
  generatedAt: now,
  source: {
    path: app.sourcePath,
    commit: process.env.BUILD_SOURCEVERSION || process.env.GITHUB_SHA || "local"
  },
  image: {
    reference: image,
    digest: imageDigest,
    immutableReference: `${image}@${imageDigest}`
  },
  aiArtifacts: {
    promptPackPath: app.promptPackPath,
    evalSuitePath: app.evalSuitePath,
    evalCases: evalIds
  },
  modelPolicy: {
    provider: process.env.DEFAULT_MODEL_PROVIDER || "azure-ai-foundry",
    preferredModel: process.env.DEFAULT_CHAT_MODEL || "mock-mode",
    mode: process.env[app.mockModeEnv] === "false" ? "model-ready" : "mock"
  },
  governance: {
    tokenLimitPerRequest: Number(process.env.TOKEN_LIMIT_PER_REQUEST || 1200),
    tokenLimitPerSession: Number(process.env.TOKEN_LIMIT_PER_SESSION || 5000),
    budgetCheckRequired: true
  },
  promotion: {
    gate: gateForEnvironment(environment),
    promotesSameImageDigest: true,
    requiresWhatIf: true,
    requiresTypedConfirmation: true
  }
};

const outputPath = path.join("artifacts", "releases", appKey, environment, "manifest.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release manifest written to ${outputPath}`);
