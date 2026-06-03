import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const envPath = path.join(__dirname, ".env");
const bootEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const port = Number(process.env.PORT || bootEnv.PORT || 4591);

const activity = [
  {
    time: new Date().toISOString(),
    level: "info",
    message: "Portal started. Waiting for platform setup actions."
  }
];
const smokeHistory = [];

const requiredProviderNames = [
  "Microsoft.Resources",
  "Microsoft.Authorization",
  "Microsoft.KeyVault",
  "Microsoft.Storage",
  "Microsoft.OperationalInsights",
  "Microsoft.Insights",
  "Microsoft.Search",
  "Microsoft.CognitiveServices",
  "Microsoft.MachineLearningServices",
  "Microsoft.Web",
  "Microsoft.App",
  "Microsoft.ContainerRegistry",
  "Microsoft.ManagedIdentity",
  "Microsoft.Consumption",
  "Microsoft.CostManagement"
];

const workloadAppCatalog = {
  "retail-copilot": {
    key: "retail-copilot",
    name: "Contoso Chat Retail Copilot",
    slug: "retail-copilot",
    type: "RAG copilot",
    targetHost: "container-apps",
    defaultBusinessUnit: "finance",
    proves: "Search-grounded conversational assistant for business data.",
    sourcePath: "apps/retail-copilot",
    templatePath: "infra/bicep/workloads/container-app/main.bicep",
    targetPort: 8080,
    testPrompts: [
      "Tell me about waterproof tents for a family camping trip and explain why you recommend them.",
      "Compare two products and cite the source snippets that influenced the answer.",
      "Ask a follow-up question when the shopper gives an incomplete requirement."
    ]
  },
  "creative-writer": {
    key: "creative-writer",
    name: "Contoso Creative Writer",
    slug: "creative-writer",
    type: "Multi-agent workflow",
    targetHost: "container-apps",
    defaultBusinessUnit: "hr",
    proves: "Coordinated author, reviewer, and compliance agent roles with prompt assets and eval gates.",
    sourcePath: "apps/creative-writer",
    templatePath: "infra/bicep/workloads/container-app/main.bicep",
    targetPort: 8080,
    testPrompts: [
      "Draft a launch article for a sustainable outdoor backpack, then improve it for clarity.",
      "Rewrite the article for an executive audience and preserve the factual claims.",
      "Run the reviewer agent and list the edits it requested."
    ]
  },
  "app-service-ai": {
    key: "app-service-ai",
    name: "Azure App Service AI Scenario",
    slug: "app-service-ai",
    type: "Tool-using agent",
    targetHost: "app-service",
    defaultBusinessUnit: "manufacturing",
    proves: "Foundry agent calling an enterprise application API as a governed tool.",
    sourcePath: "apps/app-service-ai",
    templatePath: "infra/bicep/workloads/app-service/main.bicep",
    targetPort: 8080,
    requiresAppServicePlan: true,
    testPrompts: [
      "Create three high-priority onboarding tasks and mark the policy review complete.",
      "Call the task API tool and summarize the returned status.",
      "Refuse an unsafe tool action and explain what approval is required."
    ]
  }
};

const sampleAppRuntimeCatalog = {
  "retail-copilot": {
    key: "retail-copilot",
    name: "Contoso Chat Retail Copilot",
    businessUnit: "Finance",
    localUrl: "http://127.0.0.1:4611",
    healthUrl: "http://127.0.0.1:4611/health",
    smokeUrl: "http://127.0.0.1:4611/api/chat",
    startCommand: "npm run start:retail",
    capability: "RAG-style retail assistant",
    smokePrompt: "Tell me about waterproof tents for a family camping trip and explain why you recommend them.",
    expectedSignal: "grounded retail answer with source snippets"
  },
  "creative-writer": {
    key: "creative-writer",
    name: "Contoso Creative Writer",
    businessUnit: "HR",
    localUrl: "http://127.0.0.1:4612",
    healthUrl: "http://127.0.0.1:4612/health",
    smokeUrl: "http://127.0.0.1:4612/api/write",
    startCommand: "npm run start:writer",
    capability: "Multi-agent writing workflow",
    smokePrompt: "Draft a launch article for a sustainable outdoor backpack.",
    expectedSignal: "writer, reviewer, and compliance agent outputs"
  },
  "app-service-ai": {
    key: "app-service-ai",
    name: "Azure App Service AI Scenario",
    businessUnit: "Manufacturing",
    localUrl: "http://127.0.0.1:4613",
    healthUrl: "http://127.0.0.1:4613/health",
    smokeUrl: "http://127.0.0.1:4613/api/agent",
    startCommand: "npm run start:appservice",
    capability: "Tool-using operations agent",
    smokePrompt: "Create three high-priority onboarding tasks and mark the policy review complete.",
    expectedSignal: "tool trace with approval-required decision"
  }
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function log(level, message, details = undefined) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    details
  };
  activity.unshift(entry);
  if (activity.length > 200) {
    activity.pop();
  }
  return entry;
}

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadProjectEnv() {
  if (!existsSync(envPath)) {
    return {};
  }
  return parseEnv(await readFile(envPath, "utf8"));
}

async function readRequestJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function firstValue(env, keys) {
  for (const key of keys) {
    if (env[key]) return env[key];
  }
  return "";
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "configured";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function toEnvKeyPart(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getWorkloadImageConfig(env, app) {
  const appKeyPart = toEnvKeyPart(app.key);
  const candidates = [
    `WORKLOAD_IMAGE_${appKeyPart}`,
    `WORKLOAD_${appKeyPart}_IMAGE_REFERENCE`,
    "WORKLOAD_IMAGE_REFERENCE",
    "WORKLOAD_DEMO_IMAGE"
  ];

  for (const key of candidates) {
    if (env[key]) {
      return {
        configured: true,
        source: key,
        reference: env[key]
      };
    }
  }

  return {
    configured: false,
    source: "",
    reference: ""
  };
}

function getWorkloadImageConfigs(env) {
  return Object.values(workloadAppCatalog).map((app) => ({
    appKey: app.key,
    appName: app.name,
    ...getWorkloadImageConfig(env, app)
  }));
}

function toSafeConfig(env) {
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const tenantId = firstValue(env, ["AZURE_TENANT_ID", "ARM_TENANT_ID"]);
  const clientId = firstValue(env, ["AZURE_CLIENT_ID", "ARM_CLIENT_ID"]);
  const clientSecret = firstValue(env, ["AZURE_CLIENT_SECRET", "ARM_CLIENT_SECRET"]);
  const workloadImageConfigs = getWorkloadImageConfigs(env);
  const workloadImageConfiguredCount = workloadImageConfigs.filter((item) => item.configured).length;

  return {
    azure: {
      subscriptionId,
      tenantId,
      clientId: mask(clientId),
      clientSecretConfigured: Boolean(clientSecret),
      location: env.AZURE_LOCATION || "eastus2",
      resourcePrefix: env.RESOURCE_PREFIX || "msfoundryv1"
    },
    foundry: {
      hubName: env.FOUNDRY_HUB_NAME || "msfoundry-hub",
      projectName: env.FOUNDRY_PROJECT_NAME || "msfoundry-platform",
      defaultModelProvider: env.DEFAULT_MODEL_PROVIDER || "github-models",
      defaultChatModel: env.DEFAULT_CHAT_MODEL || "",
      defaultEmbeddingModel: env.DEFAULT_EMBEDDING_MODEL || ""
    },
    businessUnits: [
      { key: "finance", name: "Finance", enabled: env.ENABLE_FINANCE_BU !== "false" },
      { key: "hr", name: "HR", enabled: env.ENABLE_HR_BU !== "false" },
      {
        key: "manufacturing",
        name: "Manufacturing",
        enabled: env.ENABLE_MANUFACTURING_BU !== "false"
      }
    ],
    environments: [
      { key: "dev", name: "Dev", enabled: env.ENABLE_DEV_ENV !== "false" },
      { key: "test", name: "Test", enabled: env.ENABLE_TEST_ENV !== "false" },
      { key: "prod", name: "Prod", enabled: env.ENABLE_PROD_ENV !== "false" }
    ],
    cicd: {
      githubOrg: env.GITHUB_ORG || "",
      githubRepo: env.GITHUB_REPO || "",
      githubTokenConfigured: Boolean(env.GITHUB_TOKEN),
      imageRegistryStrategy: env.IMAGE_REGISTRY_STRATEGY || "ghcr",
      localImageArchivePath: env.LOCAL_IMAGE_ARCHIVE_PATH || "",
      localImageArchiveConfigured: Boolean(env.LOCAL_IMAGE_ARCHIVE_PATH),
      workloadRegistryServer: env.WORKLOAD_REGISTRY_SERVER || "",
      workloadImageConfigured: workloadImageConfiguredCount > 0,
      workloadAppImagesConfigured: `${workloadImageConfiguredCount}/${workloadImageConfigs.length}`,
      workloadDeploymentEnabled: env.ENABLE_WORKLOAD_DEPLOYMENT === "true"
    },
    modelConfig: {
      realModelCallsEnabled: env.ENABLE_REAL_MODEL_CALLS === "true",
      provider: env.DEFAULT_MODEL_PROVIDER || "github-models",
      chatModel: env.DEMO_CHAT_MODEL || env.DEFAULT_CHAT_MODEL || "",
      fallbackModel: env.DEMO_FALLBACK_MODEL || "",
      embeddingModel: env.DEFAULT_EMBEDDING_MODEL || "",
      note:
        env.ENABLE_REAL_MODEL_CALLS === "true"
          ? "Real model calls are enabled by configuration. Verify token and budget controls before demo use."
          : "Mock mode is active by default. Real model calls stay disabled until ENABLE_REAL_MODEL_CALLS=true."
    },
    governance: {
      monthlyBudgetAmount: env.MONTHLY_BUDGET_AMOUNT || "250",
      budgetAlertEmails: env.BUDGET_ALERT_EMAILS || "",
      tokenLimitPerRequest: env.TOKEN_LIMIT_PER_REQUEST || "8000",
      tokenLimitPerSession: env.TOKEN_LIMIT_PER_SESSION || "20000",
      tokenLimitPerUserDaily: env.TOKEN_LIMIT_PER_USER_DAILY || "100000",
      tokenLimitPerAppDaily: env.TOKEN_LIMIT_PER_APP_DAILY || "500000",
      tokenLimitPerBusinessUnitDaily: env.TOKEN_LIMIT_PER_BU_DAILY || "1000000",
      budgetAlertThresholds: env.BUDGET_ALERT_THRESHOLDS || "50,80,90,100",
      logAnalyticsDailyCapGb: env.LOG_ANALYTICS_DAILY_CAP_GB || "1"
    }
  };
}

function getEnabledEnvironments(env) {
  return [
    { key: "dev", name: "Dev", enabled: env.ENABLE_DEV_ENV !== "false" },
    { key: "test", name: "Test", enabled: env.ENABLE_TEST_ENV !== "false" },
    { key: "prod", name: "Prod", enabled: env.ENABLE_PROD_ENV !== "false" }
  ].filter((item) => item.enabled);
}

function getEnabledBusinessUnits(env) {
  return [
    {
      key: "finance",
      name: "Finance",
      costCenter: env.FINANCE_COST_CENTER || "FIN-DEMO",
      enabled: env.ENABLE_FINANCE_BU !== "false"
    },
    {
      key: "hr",
      name: "HR",
      costCenter: env.HR_COST_CENTER || "HR-DEMO",
      enabled: env.ENABLE_HR_BU !== "false"
    },
    {
      key: "manufacturing",
      name: "Manufacturing",
      costCenter: env.MANUFACTURING_COST_CENTER || "MFG-DEMO",
      enabled: env.ENABLE_MANUFACTURING_BU !== "false"
    }
  ].filter((item) => item.enabled);
}

function buildFoundationPlan(env) {
  const prefix = env.RESOURCE_PREFIX || "msfoundryv1";
  const location = env.AZURE_LOCATION || "eastus2";
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const environments = getEnabledEnvironments(env);
  const businessUnits = getEnabledBusinessUnits(env);
  const commonTags = {
    Project: "MSFoundryProject-v1",
    Workload: "Microsoft Foundry Leadership Demo",
    ManagedBy: "MSFoundryProject-v1 Portal",
    ResourcePrefix: prefix,
    Demo: "true"
  };

  const opsResourceGroup = {
    name: `${prefix}-ops-rg`,
    scope: "operations",
    environment: "shared",
    businessUnit: "platform",
    purpose: "Central logs, dashboards, automation state, and teardown reports.",
    tags: {
      ...commonTags,
      Environment: "shared",
      BusinessUnit: "platform",
      Purpose: "operations"
    }
  };

  const platformResourceGroups = environments.map((environment) => ({
    name: `${prefix}-platform-${environment.key}-rg`,
    scope: "platform",
    environment: environment.key,
    businessUnit: "platform",
    purpose: `Shared Foundry platform services for ${environment.name}.`,
    tags: {
      ...commonTags,
      Environment: environment.key,
      BusinessUnit: "platform",
      Purpose: "platform"
    }
  }));

  const businessUnitResourceGroups = environments.flatMap((environment) =>
    businessUnits.map((businessUnit) => ({
      name: `${prefix}-${businessUnit.key}-${environment.key}-rg`,
      scope: "business-unit",
      environment: environment.key,
      businessUnit: businessUnit.key,
      purpose: `${businessUnit.name} app, data, and agent resources for ${environment.name}.`,
      tags: {
        ...commonTags,
        Environment: environment.key,
        BusinessUnit: businessUnit.name,
        CostCenter: businessUnit.costCenter,
        Purpose: "agentic-apps"
      }
    }))
  );

  const resourceGroups = [
    opsResourceGroup,
    ...platformResourceGroups,
    ...businessUnitResourceGroups
  ];

  return {
    status: "ready",
    subscriptionId,
    location,
    resourcePrefix: prefix,
    deploymentName: `${prefix}-foundation`,
    templatePath: "infra/bicep/foundation/main.bicep",
    parametersPath: "infra/bicep/foundation/main.parameters.json",
    command: `az deployment sub create --name ${prefix}-foundation --location ${location} --template-file infra/bicep/foundation/main.bicep --parameters infra/bicep/foundation/main.parameters.json`,
    totals: {
      resourceGroups: resourceGroups.length,
      environments: environments.length,
      businessUnits: businessUnits.length
    },
    resourceGroups
  };
}

function getDeterministicSuffix(value) {
  const compact = String(value || "demo").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return (compact || "demo000").slice(0, 6).padEnd(6, "0");
}

function toAzureNamePart(value, maxLength = 16) {
  const compact = String(value || "msfoundry")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (compact || "msfoundry").slice(0, maxLength);
}

function toAzureHyphenName(value, maxLength = 48) {
  const compact = String(value || "msfoundry")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (compact || "msfoundry").slice(0, maxLength).replace(/-$/g, "");
}

function buildPlatformCorePlan(env, environmentKey = "dev") {
  const prefix = env.RESOURCE_PREFIX || "msfoundryv1";
  const prefixPart = toAzureNamePart(prefix, 10);
  const hyphenPrefix = toAzureHyphenName(prefix, 22);
  const location = env.AZURE_LOCATION || "eastus2";
  const searchLocation = env.AZURE_SEARCH_LOCATION || env.SEARCH_LOCATION || location;
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const tenantId = firstValue(env, ["AZURE_TENANT_ID", "ARM_TENANT_ID"]);
  const suffix = getDeterministicSuffix(subscriptionId);
  const environment = environmentKey.toLowerCase();
  const environmentName = environment.charAt(0).toUpperCase() + environment.slice(1);
  const keyVaultPrefixPart = toAzureNamePart(prefix, Math.max(6, 13 - environment.length));
  const enableAppServicePlan = env.ENABLE_APP_SERVICE_PLAN === "true";
  const resourceGroupName = `${prefix}-platform-${environment}-rg`;
  const commonTags = {
    Project: "MSFoundryProject-v1",
    Workload: "Microsoft Foundry Leadership Demo",
    ManagedBy: "MSFoundryProject-v1 Portal",
    ResourcePrefix: prefix,
    Environment: environment,
    BusinessUnit: "platform",
    Demo: "true"
  };

  const names = {
    managedIdentity: `id-${hyphenPrefix}-${environment}`,
    logAnalytics: `${hyphenPrefix}-${environment}-law`,
    appInsights: `${hyphenPrefix}-${environment}-appi`,
    keyVault: `kv-${keyVaultPrefixPart}-${environment}-${suffix}`,
    storage: `st${prefixPart}${environment}${suffix}`.slice(0, 24),
    search: `srch-${hyphenPrefix}-${environment}-${suffix}`,
    containerAppsEnvironment: `cae-${hyphenPrefix}-${environment}`,
    appServicePlan: `asp-${hyphenPrefix}-${environment}`,
    foundryAccount: `aif-${hyphenPrefix}-${environment}-${suffix}`,
    foundryProject: `proj-${hyphenPrefix}-${environment}`
  };

  const resources = [
    {
      key: "managedIdentity",
      name: names.managedIdentity,
      type: "Microsoft.ManagedIdentity/userAssignedIdentities",
      purpose: "Shared managed identity for platform services and future app workloads.",
      sku: "N/A",
      cost: "No direct cost"
    },
    {
      key: "logAnalytics",
      name: names.logAnalytics,
      type: "Microsoft.OperationalInsights/workspaces",
      purpose: `Central ${environmentName} platform logs for Container Apps, apps, and diagnostics.`,
      sku: "PerGB2018",
      cost: "Usage-based"
    },
    {
      key: "appInsights",
      name: names.appInsights,
      type: "Microsoft.Insights/components",
      purpose: "Application telemetry and demo observability.",
      sku: "Workspace-based",
      cost: "Usage-based"
    },
    {
      key: "keyVault",
      name: names.keyVault,
      type: "Microsoft.KeyVault/vaults",
      purpose: "Secrets, keys, model endpoint config, and app credentials.",
      sku: "standard",
      cost: "Low usage-based"
    },
    {
      key: "storage",
      name: names.storage,
      type: "Microsoft.Storage/storageAccounts",
      purpose: "Shared artifacts, app state, evaluation files, and ingestion staging.",
      sku: "Standard_LRS",
      cost: "Usage-based"
    },
    {
      key: "search",
      name: names.search,
      type: "Microsoft.Search/searchServices",
      purpose: "Vector/text search foundation for RAG sample apps.",
      sku: "free",
      cost: "Free tier if subscription has one available",
      location: searchLocation
    },
    {
      key: "containerAppsEnvironment",
      name: names.containerAppsEnvironment,
      type: "Microsoft.App/managedEnvironments",
      purpose: "Default hosting environment for containerized agentic apps.",
      sku: "Consumption",
      cost: "Consumption-based"
    },
    {
      key: "foundryAccount",
      name: names.foundryAccount,
      type: "Microsoft.CognitiveServices/accounts",
      purpose: "Microsoft Foundry resource for model access and project management.",
      sku: "S0",
      cost: "Usage-based"
    },
    {
      key: "foundryProject",
      name: names.foundryProject,
      type: "Microsoft.CognitiveServices/accounts/projects",
      purpose: `Default ${environmentName} Foundry project container for shared model and agent experiments.`,
      sku: "N/A",
      cost: "No direct cost"
    }
  ];

  if (enableAppServicePlan) {
    resources.splice(7, 0, {
      key: "appServicePlan",
      name: names.appServicePlan,
      type: "Microsoft.Web/serverfarms",
      purpose: "Hosting plan for App Service AI sample and simple web/API apps.",
      sku: "B1",
      cost: "Low-cost Basic tier"
    });
  }

  const deferredResources = enableAppServicePlan
    ? []
    : [
        {
          key: "appServicePlan",
          name: names.appServicePlan,
          type: "Microsoft.Web/serverfarms",
          reason:
            "Deferred because this subscription currently reports Total VMs quota 0 for App Service Plan creation in the selected region.",
          nextStep: "Request App Service quota or set ENABLE_APP_SERVICE_PLAN=true after quota is available."
        }
      ];

  return {
    status: "ready",
    subscriptionId,
    tenantId,
    location,
    searchLocation,
    environment,
    environmentName,
    resourcePrefix: prefix,
    resourceGroupName,
    deploymentName: `${prefix}-platform-core-${environment}`,
    templatePath: `infra/bicep/platform-core/${environment}/main.bicep`,
    parametersPath: `infra/bicep/platform-core/${environment}/main.parameters.json`,
    command: `az deployment group create --resource-group ${resourceGroupName} --name ${prefix}-platform-core-${environment} --template-file infra/bicep/platform-core/${environment}/main.bicep --parameters infra/bicep/platform-core/${environment}/main.parameters.json`,
    totals: {
      resources: resources.length,
      deferredResources: deferredResources.length
    },
    names,
    tags: commonTags,
    enableAppServicePlan,
    deferredResources,
    resources
  };
}

function getCatalogItem(items, key, label) {
  const item = items.find((candidate) => candidate.key === key);
  if (!item) {
    throw new Error(`Unknown ${label} "${key}".`);
  }
  return item;
}

function buildWorkloadPlan(env, options = {}) {
  const prefix = env.RESOURCE_PREFIX || "msfoundryv1";
  const hyphenPrefix = toAzureHyphenName(prefix, 20);
  const location = env.AZURE_LOCATION || "eastus2";
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const suffix = getDeterministicSuffix(subscriptionId);
  const environments = getEnabledEnvironments(env);
  const businessUnits = getEnabledBusinessUnits(env);
  const environmentKey = String(options.environment || "dev").toLowerCase();
  const businessUnitKey = String(options.businessUnit || "finance").toLowerCase();
  const appKey = String(options.app || "retail-copilot").toLowerCase();
  const environment = getCatalogItem(environments, environmentKey, "environment");
  const businessUnit = getCatalogItem(businessUnits, businessUnitKey, "business unit");
  const app = workloadAppCatalog[appKey];

  if (!app) {
    throw new Error(`Unknown workload app "${appKey}".`);
  }

  const platformPlan = buildPlatformCorePlan(env, environmentKey);
  const appName = toAzureHyphenName(`${hyphenPrefix}-${businessUnit.key}-${app.slug}-${environment.key}`, 32);
  const managedIdentityName = toAzureHyphenName(`id-${hyphenPrefix}-${businessUnit.key}-${app.slug}-${environment.key}`, 64);
  const imageName = `${toAzureNamePart(prefix, 18)}/${businessUnit.key}/${app.slug}`;
  const imageTag = `${environment.key}-v1`;
  const configuredImage = getWorkloadImageConfig(env, app);
  const imageReference = configuredImage.reference || `ghcr.io/contoso/${imageName}:${imageTag}`;
  const resourceGroupName = `${prefix}-${businessUnit.key}-${environment.key}-rg`;
  const appServicePlanRequired = Boolean(app.requiresAppServicePlan);
  const appServicePlanEnabled = env.ENABLE_APP_SERVICE_PLAN === "true";
  const hostingStatus = appServicePlanRequired && !appServicePlanEnabled ? "deferred" : "ready";
  const modelProvider = env.DEFAULT_MODEL_PROVIDER || "azure-ai-foundry";
  const preferredModel =
    env.DEMO_CHAT_MODEL ||
    env.DEFAULT_CHAT_MODEL ||
    "Configure DEMO_CHAT_MODEL or DEFAULT_CHAT_MODEL in .env";
  const fallbackModel =
    env.DEMO_FALLBACK_MODEL ||
    "Map to an available free-tier, trial, or open model in the Foundry model catalog";
  const templatePath = appServicePlanRequired ? "infra/bicep/workloads/app-service/main.bicep" : app.templatePath;
  const explicitImageConfigured = configuredImage.configured;
  const realModelCallsEnabled = env.ENABLE_REAL_MODEL_CALLS === "true";
  const deployPreflightChecks = [
    {
      check: "Dev Platform Core",
      status: environment.key === "dev" ? "ready-to-check" : "not-applicable",
      detail:
        environment.key === "dev"
          ? "Run Dev Core status before workload deployment to confirm Foundry, telemetry, Search, and Container Apps are ready."
          : "This preflight focuses on the first Dev workload deployment."
    },
    {
      check: "Container image",
      status: explicitImageConfigured ? "passed" : "missing",
      detail: explicitImageConfigured
        ? `${imageReference} (${configuredImage.source})`
        : "Set WORKLOAD_IMAGE_REFERENCE to a registry image that Azure can pull. Local images are not enough for Azure deployment."
    },
    {
      check: "Workload deployment switch",
      status: env.ENABLE_WORKLOAD_DEPLOYMENT === "true" ? "passed" : "missing",
      detail:
        env.ENABLE_WORKLOAD_DEPLOYMENT === "true"
          ? "ENABLE_WORKLOAD_DEPLOYMENT=true"
          : "Keep false until image, budget, and teardown readiness are confirmed."
    },
    {
      check: "Model call mode",
      status: realModelCallsEnabled ? "warning" : "passed",
      detail: realModelCallsEnabled
        ? "Real model calls can incur inference charges. Confirm token limits and selected model pricing."
        : "Mock mode remains active; no model inference charges from the sample app."
    },
    {
      check: "Hosting quota",
      status: appServicePlanRequired && !appServicePlanEnabled ? "deferred" : "passed",
      detail:
        appServicePlanRequired && !appServicePlanEnabled
          ? "App Service AI remains deferred until ENABLE_APP_SERVICE_PLAN=true and App Service quota is available."
          : "Selected hosting template can be evaluated for deployment."
    },
    {
      check: "Billing acknowledgement",
      status: "required-at-deploy",
      detail: "The portal deploy button still requires explicit acknowledgement because Azure hosting and telemetry can incur charges."
    }
  ];
  const blockingPreflight = deployPreflightChecks.filter((item) => ["missing", "deferred"].includes(item.status));
  const commonTags = {
    Project: "MSFoundryProject-v1",
    Workload: app.name,
    ManagedBy: "MSFoundryProject-v1 Portal",
    ResourcePrefix: prefix,
    Environment: environment.key,
    BusinessUnit: businessUnit.name,
    CostCenter: businessUnit.costCenter,
    Demo: "true"
  };
  const resources = [
    {
      key: "managedIdentity",
      name: managedIdentityName,
      type: "Microsoft.ManagedIdentity/userAssignedIdentities",
      purpose: "Workload identity for app-to-platform access without storing Azure credentials.",
      sku: "N/A",
      cost: "No direct cost"
    }
  ];

  if (appServicePlanRequired) {
    resources.push(
      {
        key: "appServicePlan",
        name: `asp-${appName}`,
        type: "Microsoft.Web/serverfarms",
        purpose: "Linux App Service hosting plan for the App Service AI scenario.",
        sku: "B1",
        cost: appServicePlanEnabled ? "Low-cost Basic tier" : "Deferred until App Service quota is available"
      },
      {
        key: "webApp",
        name: appName,
        type: "Microsoft.Web/sites",
        purpose: "Tool-using AI web app connected to the Foundry project.",
        sku: "Runs on App Service plan",
        cost: appServicePlanEnabled ? "Covered by App Service plan and usage" : "Deferred"
      }
    );
  } else {
    resources.push({
      key: "containerApp",
      name: appName,
      type: "Microsoft.App/containerApps",
      purpose: "Containerized agentic app deployed into the shared Container Apps environment.",
      sku: "Consumption",
      cost: "Consumption-based"
    });
  }

  resources.push(
    {
      key: "foundryReference",
      name: platformPlan.names.foundryProject,
      type: "Microsoft.CognitiveServices/accounts/projects",
      purpose: "Shared Foundry project reference for model access, tracing, prompt assets, and agent experiments.",
      sku: "Inherited",
      cost: "Model inference may be metered by selected model and endpoint"
    },
    {
      key: "observabilityReference",
      name: platformPlan.names.appInsights,
      type: "Microsoft.Insights/components",
      purpose: "Shared telemetry destination for app logs, traces, eval results, and leadership demo dashboards.",
      sku: "Workspace-based",
      cost: "Usage-based telemetry ingestion"
    }
  );

  const artifacts = [
    {
      name: "Source package",
      path: app.sourcePath,
      purpose: "App code, Dockerfile, local settings, and README for the team template."
    },
    {
      name: "Container image",
      path: imageReference,
      purpose: "Immutable app artifact promoted from Dev to Test to Prod by digest."
    },
    {
      name: "Prompt pack",
      path: `${app.sourcePath}/prompts`,
      purpose: "Versioned system prompts, agent instructions, and safety guidance."
    },
    {
      name: "Evaluation suite",
      path: `${app.sourcePath}/evals`,
      purpose: "Smoke prompts, grounding checks, refusal checks, and regression scoring."
    },
    {
      name: "IaC template",
      path: templatePath,
      purpose: "Azure workload deployment template for the selected hosting pattern."
    },
    {
      name: "Release manifest",
      path: `artifacts/releases/${app.key}/${environment.key}/manifest.json`,
      purpose: "Signed deployment input containing image digest, prompt version, model policy, and approvals."
    }
  ];

  const pipeline = [
    {
      stage: "Build",
      gate: "Compile, lint, unit test, container build, SBOM, and image scan.",
      owner: "App team"
    },
    {
      stage: "Package",
      gate: "Publish immutable image, prompt pack, eval suite, and release manifest.",
      owner: "CI"
    },
    {
      stage: "Deploy Dev",
      gate: "Deploy to Dev and run smoke prompts against the configured demo model.",
      owner: "Platform pipeline"
    },
    {
      stage: "Promote Test",
      gate: "Reuse the same image digest; run evals, policy checks, and BU validation.",
      owner: "Release approver"
    },
    {
      stage: "Promote Prod",
      gate: "Manual approval, monitoring check, rollback package, and demo readiness signoff.",
      owner: "Business and platform owners"
    }
  ];

  return {
    status: hostingStatus,
    asOf: new Date().toISOString(),
    subscriptionId,
    location,
    resourcePrefix: prefix,
    environment,
    businessUnit,
    app: {
      key: app.key,
      name: app.name,
      slug: app.slug,
      type: app.type,
      proves: app.proves,
      targetHost: app.targetHost,
      targetPort: app.targetPort,
      requiresAppServicePlan: Boolean(app.requiresAppServicePlan)
    },
    resourceGroupName,
    deploymentName: `${prefix}-${businessUnit.key}-${app.slug}-${environment.key}`,
    templatePath,
    parametersPath: `infra/bicep/workloads/${app.key}/${environment.key}.parameters.json`,
    command: `az deployment group create --resource-group ${resourceGroupName} --name ${prefix}-${businessUnit.key}-${app.slug}-${environment.key} --template-file ${templatePath}`,
    hosting: {
      status: hostingStatus,
      target:
        app.targetHost === "app-service"
          ? "Azure App Service"
          : "Azure Container Apps",
      targetResourceName: appServicePlanRequired ? appName : appName,
      sharedEnvironmentName: platformPlan.names.containerAppsEnvironment,
      note:
        appServicePlanRequired && !appServicePlanEnabled
          ? "App Service Plan deployment remains deferred because ENABLE_APP_SERVICE_PLAN is not true. Use Container Apps for the live demo until quota is available."
          : "Ready for workload what-if/deployment once Platform Core exists."
    },
    deployment: {
      enabled: env.ENABLE_WORKLOAD_DEPLOYMENT === "true",
      imageReference,
      imageSource: configuredImage.source || "generated-default",
      readiness:
        env.ENABLE_WORKLOAD_DEPLOYMENT === "true"
          ? "Deployment endpoints are enabled by configuration."
          : "Deployment endpoints are guarded until ENABLE_WORKLOAD_DEPLOYMENT=true and a real workload image is configured.",
      preflight: {
        status: blockingPreflight.length ? "blocked" : "ready-with-billing-ack",
        summary: blockingPreflight.length
          ? `${blockingPreflight.length} deployment prerequisite(s) need attention before Dev deployment.`
          : "Technical prerequisites are present. Billing acknowledgement and typed confirmation are still required at deploy time.",
        checks: deployPreflightChecks
      }
    },
    modelPolicy: {
      provider: modelProvider,
      preferredModel,
      fallbackModel,
      routing: "Use Foundry model deployment or model inference endpoint selected by environment.",
      costNote:
        "Free-tier, trial, and open-model availability can change. Verify current Foundry model pricing before live deployment."
    },
    platformDependencies: {
      foundryAccount: platformPlan.names.foundryAccount,
      foundryProject: platformPlan.names.foundryProject,
      appInsights: platformPlan.names.appInsights,
      keyVault: platformPlan.names.keyVault,
      search: platformPlan.names.search,
      containerAppsEnvironment: platformPlan.names.containerAppsEnvironment
    },
    environmentVariables: [
      { name: "APP_ENVIRONMENT", value: environment.key },
      { name: "BUSINESS_UNIT", value: businessUnit.key },
      { name: "FOUNDRY_ACCOUNT_NAME", value: platformPlan.names.foundryAccount },
      { name: "FOUNDRY_PROJECT_NAME", value: platformPlan.names.foundryProject },
      { name: "MODEL_PROVIDER", value: modelProvider },
      { name: "MODEL_NAME", value: preferredModel },
      { name: "APPLICATIONINSIGHTS_CONNECTION_STRING", value: "Resolved from Platform Core deployment output" }
    ],
    billingWarning:
      "Deploying this workload may create usage-based hosting resources and can generate model inference, telemetry, and storage charges until teardown.",
    tags: commonTags,
    resources,
    artifacts,
    pipeline,
    testGuide: {
      urlPattern:
        app.targetHost === "app-service"
          ? `https://${appName}.azurewebsites.net`
          : `https://${appName}.<container-apps-domain>`,
      prompts: app.testPrompts,
      expectedSignals: [
        "App returns a grounded answer or a safe clarification question.",
        "Telemetry appears in Application Insights with environment, BU, app, and model tags.",
        "The activity log records the deployment/test action for demo traceability."
      ]
    }
  };
}

function getWorkloadManagedResources(plan) {
  return plan.resources.filter(
    (resource) => !["foundryReference", "observabilityReference"].includes(resource.key)
  );
}

function getWorkloadResourceApiVersion(resource) {
  const versions = {
    "Microsoft.ManagedIdentity/userAssignedIdentities": "2023-01-31",
    "Microsoft.App/containerApps": "2024-03-01",
    "Microsoft.Web/serverfarms": "2023-12-01",
    "Microsoft.Web/sites": "2023-12-01"
  };
  return versions[resource.type] || "2021-04-01";
}

function getWorkloadResourceId(plan, resource) {
  return `/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourceGroupName}/providers/${resource.type}/${resource.name}`;
}

function buildWorkloadArmTemplate(plan) {
  const managedIdentity = getWorkloadManagedResources(plan).find(
    (resource) => resource.key === "managedIdentity"
  );
  const managedIdentityId = `[resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', '${managedIdentity.name}')]`;
  const environmentVariables = plan.environmentVariables.map((item) => ({
    name: item.name,
    value: item.value
  }));

  if (plan.app.targetHost === "app-service") {
    const appServicePlan = getWorkloadManagedResources(plan).find(
      (resource) => resource.key === "appServicePlan"
    );
    const webApp = getWorkloadManagedResources(plan).find((resource) => resource.key === "webApp");
    return {
      $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
      contentVersion: "1.0.0.0",
      resources: [
        {
          type: "Microsoft.ManagedIdentity/userAssignedIdentities",
          apiVersion: "2023-01-31",
          name: managedIdentity.name,
          location: plan.location,
          tags: plan.tags
        },
        {
          type: "Microsoft.Web/serverfarms",
          apiVersion: "2023-12-01",
          name: appServicePlan.name,
          location: plan.location,
          kind: "linux",
          tags: plan.tags,
          sku: {
            name: "B1",
            tier: "Basic",
            size: "B1",
            capacity: 1
          },
          properties: {
            reserved: true
          }
        },
        {
          type: "Microsoft.Web/sites",
          apiVersion: "2023-12-01",
          name: webApp.name,
          location: plan.location,
          kind: "app,linux,container",
          tags: plan.tags,
          identity: {
            type: "UserAssigned",
            userAssignedIdentities: {
              [managedIdentityId]: {}
            }
          },
          dependsOn: [
            `[resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', '${managedIdentity.name}')]`,
            `[resourceId('Microsoft.Web/serverfarms', '${appServicePlan.name}')]`
          ],
          properties: {
            serverFarmId: `[resourceId('Microsoft.Web/serverfarms', '${appServicePlan.name}')]`,
            httpsOnly: true,
            siteConfig: {
              linuxFxVersion: `DOCKER|${plan.deployment.imageReference}`,
              alwaysOn: false,
              ftpsState: "Disabled",
              minTlsVersion: "1.2",
              appSettings: environmentVariables.map((item) => ({
                name: item.name,
                value: item.value
              }))
            }
          }
        }
      ]
    };
  }

  const containerApp = getWorkloadManagedResources(plan).find(
    (resource) => resource.key === "containerApp"
  );
  const containerAppsEnvironmentId = `/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourcePrefix}-platform-${plan.environment.key}-rg/providers/Microsoft.App/managedEnvironments/${plan.platformDependencies.containerAppsEnvironment}`;

  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    resources: [
      {
        type: "Microsoft.ManagedIdentity/userAssignedIdentities",
        apiVersion: "2023-01-31",
        name: managedIdentity.name,
        location: plan.location,
        tags: plan.tags
      },
      {
        type: "Microsoft.App/containerApps",
        apiVersion: "2024-03-01",
        name: containerApp.name,
        location: plan.location,
        tags: plan.tags,
        identity: {
          type: "UserAssigned",
          userAssignedIdentities: {
            [managedIdentityId]: {}
          }
        },
        dependsOn: [
          `[resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', '${managedIdentity.name}')]`
        ],
        properties: {
          managedEnvironmentId: containerAppsEnvironmentId,
          configuration: {
            activeRevisionsMode: "Single",
            ingress: {
              external: true,
              targetPort: plan.app.targetPort || 8080,
              transport: "auto"
            }
          },
          template: {
            containers: [
              {
                name: "app",
                image: plan.deployment.imageReference,
                env: environmentVariables,
                resources: {
                  cpu: 0.5,
                  memory: "1Gi"
                }
              }
            ],
            scale: {
              minReplicas: 0,
              maxReplicas: 3
            }
          }
        }
      }
    ]
  };
}

function parseNumberEnv(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseCsvNumbers(value, fallback) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? parsed : fallback;
}

function buildGovernancePlan(env) {
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const prefix = env.RESOURCE_PREFIX || "msfoundryv1";
  const monthlyBudgetAmount = parseNumberEnv(env, "MONTHLY_BUDGET_AMOUNT", 250);
  const tokenLimitPerRequest = parseNumberEnv(env, "TOKEN_LIMIT_PER_REQUEST", 8000);
  const tokenLimitPerSession = parseNumberEnv(env, "TOKEN_LIMIT_PER_SESSION", 20000);
  const tokenLimitPerUserDaily = parseNumberEnv(env, "TOKEN_LIMIT_PER_USER_DAILY", 100000);
  const tokenLimitPerAppDaily = parseNumberEnv(env, "TOKEN_LIMIT_PER_APP_DAILY", 500000);
  const tokenLimitPerBusinessUnitDaily = parseNumberEnv(env, "TOKEN_LIMIT_PER_BU_DAILY", 1000000);
  const logAnalyticsDailyCapGb = parseNumberEnv(env, "LOG_ANALYTICS_DAILY_CAP_GB", 1);
  const alertThresholds = parseCsvNumbers(env.BUDGET_ALERT_THRESHOLDS, [50, 80, 90, 100]);
  const tokenWarningThreshold = parseNumberEnv(env, "TOKEN_WARNING_THRESHOLD_PERCENT", 80);
  const businessUnits = getEnabledBusinessUnits(env);
  const environments = getEnabledEnvironments(env);

  const tokenLimits = [
    {
      scope: "Request",
      limit: tokenLimitPerRequest,
      window: "single model call",
      enforcement: "Reject or summarize oversized prompts before calling the model.",
      actionAtLimit: "Return a concise limit message and write an activity/telemetry event."
    },
    {
      scope: "Session",
      limit: tokenLimitPerSession,
      window: "browser/app session",
      enforcement: "Track cumulative input and output tokens in session state.",
      actionAtLimit: "Disable additional model calls for the session unless an admin resets it."
    },
    {
      scope: "User",
      limit: tokenLimitPerUserDaily,
      window: "calendar day",
      enforcement: "Persist usage by user ID and date in the app usage ledger.",
      actionAtLimit: "Block model calls for that user until the next window."
    },
    {
      scope: "App",
      limit: tokenLimitPerAppDaily,
      window: "calendar day",
      enforcement: "Persist usage by app key and environment.",
      actionAtLimit: "Pause the app's model gateway route or put the app in read-only demo mode."
    },
    {
      scope: "Business Unit",
      limit: tokenLimitPerBusinessUnitDaily,
      window: "calendar day",
      enforcement: "Aggregate usage across all BU apps and environments.",
      actionAtLimit: "Disable BU model calls and notify the BU owner/platform team."
    }
  ];

  const budgetControls = alertThresholds.map((threshold) => ({
    threshold,
    estimatedAmount: Number((monthlyBudgetAmount * threshold) / 100).toFixed(2),
    action:
      threshold >= 100
        ? "Disable workload deploy actions and optionally trigger demo teardown approval."
        : threshold >= 90
          ? "Disable new app deployments and alert platform owners."
          : threshold >= 80
            ? "Warn in portal, alert owners, and recommend pausing tests."
            : "Notify owners and record budget trend in the activity log."
  }));

  const enforcementLayers = [
    {
      layer: "Application middleware",
      status: "Planned",
      responsibility: "Estimate prompt tokens, cap output tokens, persist token ledger, and enforce user/session/app/BU limits."
    },
    {
      layer: "AI gateway / API Management",
      status: "Recommended",
      responsibility: "Apply token-per-minute and quota-window controls before requests reach Foundry model endpoints."
    },
    {
      layer: "Foundry model quota",
      status: "Provider-managed",
      responsibility: "Use model deployment quota, TPM/RPM limits, and environment-specific deployment capacity."
    },
    {
      layer: "Azure Cost Management budget",
      status: env.BUDGET_ALERT_EMAILS ? "Configurable" : "Needs alert email",
      responsibility: "Alert at configured thresholds and trigger action-group automation."
    },
    {
      layer: "Log Analytics daily cap",
      status: "Planned",
      responsibility: "Limit telemetry ingestion spikes while preserving enough logs for demo observability."
    },
    {
      layer: "Portal kill switch",
      status: "Planned",
      responsibility: "Disable deploy/test/model-call buttons when budget or token limits are exceeded."
    }
  ];

  const businessUnitPolicies = businessUnits.map((businessUnit, index) => ({
    businessUnit: businessUnit.name,
    costCenter: businessUnit.costCenter,
    dailyTokenLimit: tokenLimitPerBusinessUnitDaily,
    defaultModelPolicy:
      index === 0
        ? "Prefer lowest-cost demo model; require grounding for finance answers."
        : index === 1
          ? "Prefer lightweight model for policy drafting; require sensitive-data checks."
          : "Prefer model with strong tool-use reliability; require human approval for operational actions.",
    ownerAction: "BU owner receives alert at warning threshold and hard-limit event."
  }));

  const environmentPolicies = environments.map((environment) => ({
    environment: environment.name,
    tokenMultiplier: environment.key === "prod" ? 1 : environment.key === "test" ? 0.5 : 0.25,
    deploymentGate:
      environment.key === "prod"
        ? "Manual approval plus budget and eval checks."
        : environment.key === "test"
          ? "Eval pass and BU validation."
          : "Smoke test and owner acknowledgement.",
    spendPosture:
      environment.key === "prod"
        ? "Highest visibility; no automatic teardown unless explicitly enabled."
        : "Demo-safe; eligible for automatic pause or teardown workflow."
  }));

  return {
    status: "ready",
    asOf: new Date().toISOString(),
    subscriptionId,
    resourcePrefix: prefix,
    monthlyBudget: {
      amount: monthlyBudgetAmount,
      currency: "USD",
      alertEmails: env.BUDGET_ALERT_EMAILS || "",
      thresholds: alertThresholds,
      note:
        "Azure budgets are alert and automation guardrails, not a guaranteed real-time hard stop for every charge."
    },
    tokenWarningThreshold,
    logAnalyticsDailyCapGb,
    tokenLimits,
    budgetControls,
    enforcementLayers,
    businessUnitPolicies,
    environmentPolicies,
    implementationSteps: [
      "Add token estimator and ledger middleware to each sample app.",
      "Persist usage by user, session, app, BU, environment, model, and day.",
      "Add AI gateway/API Management token-limit policy for shared model access.",
      "Create Azure budget and action group automation for warnings and deploy lockouts.",
      "Set Log Analytics daily cap and tag telemetry by app, BU, environment, and model.",
      "Expose limit hits and budget alerts in the portal activity log."
    ]
  };
}

function buildFoundationArmTemplate(plan) {
  return {
    $schema:
      "https://schema.management.azure.com/schemas/2018-05-01/subscriptionDeploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    resources: plan.resourceGroups.map((resourceGroup) => ({
      type: "Microsoft.Resources/resourceGroups",
      apiVersion: "2024-03-01",
      name: resourceGroup.name,
      location: plan.location,
      tags: resourceGroup.tags
    })),
    outputs: {
      allResourceGroups: {
        type: "array",
        value: plan.resourceGroups.map((resourceGroup) => resourceGroup.name)
      }
    }
  };
}

function buildPlatformCoreArmTemplate(plan) {
  const tags = plan.tags;
  const workspaceResourceId = `[resourceId('Microsoft.OperationalInsights/workspaces', '${plan.names.logAnalytics}')]`;
  const workspaceCustomerId = `[reference(resourceId('Microsoft.OperationalInsights/workspaces', '${plan.names.logAnalytics}'), '2023-09-01').customerId]`;
  const workspaceSharedKey = `[listKeys(resourceId('Microsoft.OperationalInsights/workspaces', '${plan.names.logAnalytics}'), '2023-09-01').primarySharedKey]`;

  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    resources: [
      {
        type: "Microsoft.ManagedIdentity/userAssignedIdentities",
        apiVersion: "2023-01-31",
        name: plan.names.managedIdentity,
        location: plan.location,
        tags
      },
      {
        type: "Microsoft.OperationalInsights/workspaces",
        apiVersion: "2023-09-01",
        name: plan.names.logAnalytics,
        location: plan.location,
        tags,
        properties: {
          sku: {
            name: "PerGB2018"
          },
          retentionInDays: 30,
          features: {
            enableLogAccessUsingOnlyResourcePermissions: true
          },
          publicNetworkAccessForIngestion: "Enabled",
          publicNetworkAccessForQuery: "Enabled"
        }
      },
      {
        type: "Microsoft.Insights/components",
        apiVersion: "2020-02-02",
        name: plan.names.appInsights,
        location: plan.location,
        tags,
        kind: "web",
        dependsOn: [
          `[resourceId('Microsoft.OperationalInsights/workspaces', '${plan.names.logAnalytics}')]`
        ],
        properties: {
          Application_Type: "web",
          WorkspaceResourceId: workspaceResourceId,
          IngestionMode: "LogAnalytics",
          RetentionInDays: 30,
          publicNetworkAccessForIngestion: "Enabled",
          publicNetworkAccessForQuery: "Enabled"
        }
      },
      {
        type: "Microsoft.KeyVault/vaults",
        apiVersion: "2023-07-01",
        name: plan.names.keyVault,
        location: plan.location,
        tags,
        properties: {
          tenantId: plan.tenantId,
          sku: {
            family: "A",
            name: "standard"
          },
          enableRbacAuthorization: true,
          enabledForDeployment: false,
          enabledForDiskEncryption: false,
          enabledForTemplateDeployment: true,
          enableSoftDelete: true,
          softDeleteRetentionInDays: 7,
          publicNetworkAccess: "Enabled",
          accessPolicies: []
        }
      },
      {
        type: "Microsoft.Storage/storageAccounts",
        apiVersion: "2023-05-01",
        name: plan.names.storage,
        location: plan.location,
        tags,
        sku: {
          name: "Standard_LRS"
        },
        kind: "StorageV2",
        properties: {
          accessTier: "Hot",
          allowBlobPublicAccess: false,
          allowSharedKeyAccess: false,
          defaultToOAuthAuthentication: true,
          minimumTlsVersion: "TLS1_2",
          supportsHttpsTrafficOnly: true,
          publicNetworkAccess: "Enabled"
        }
      },
      {
        type: "Microsoft.Search/searchServices",
        apiVersion: "2025-05-01",
        name: plan.names.search,
        location: plan.searchLocation || plan.location,
        tags,
        sku: {
          name: "free"
        },
        properties: {
          replicaCount: 1,
          partitionCount: 1,
          hostingMode: "default",
          publicNetworkAccess: "Enabled",
          disableLocalAuth: false,
          authOptions: {
            aadOrApiKey: {
              aadAuthFailureMode: "http401WithBearerChallenge"
            }
          }
        }
      },
      {
        type: "Microsoft.App/managedEnvironments",
        apiVersion: "2024-03-01",
        name: plan.names.containerAppsEnvironment,
        location: plan.location,
        tags,
        dependsOn: [
          `[resourceId('Microsoft.OperationalInsights/workspaces', '${plan.names.logAnalytics}')]`
        ],
        properties: {
          appLogsConfiguration: {
            destination: "log-analytics",
            logAnalyticsConfiguration: {
              customerId: workspaceCustomerId,
              sharedKey: workspaceSharedKey
            }
          },
          zoneRedundant: false
        }
      },
      ...(plan.enableAppServicePlan
        ? [
            {
              type: "Microsoft.Web/serverfarms",
              apiVersion: "2023-12-01",
              name: plan.names.appServicePlan,
              location: plan.location,
              tags,
              kind: "linux",
              sku: {
                name: "B1",
                tier: "Basic",
                size: "B1",
                capacity: 1
              },
              properties: {
                reserved: true
              }
            }
          ]
        : []),
      {
        type: "Microsoft.CognitiveServices/accounts",
        apiVersion: "2026-03-01",
        name: plan.names.foundryAccount,
        location: plan.location,
        tags,
        kind: "AIServices",
        identity: {
          type: "SystemAssigned"
        },
        sku: {
          name: "S0"
        },
        properties: {
          customSubDomainName: plan.names.foundryAccount,
          publicNetworkAccess: "Enabled",
          disableLocalAuth: false,
          allowProjectManagement: true
        }
      },
      {
        type: "Microsoft.CognitiveServices/accounts/projects",
        apiVersion: "2025-06-01",
        name: `${plan.names.foundryAccount}/${plan.names.foundryProject}`,
        location: plan.location,
        tags,
        identity: {
          type: "SystemAssigned"
        },
        dependsOn: [
          `[resourceId('Microsoft.CognitiveServices/accounts', '${plan.names.foundryAccount}')]`
        ],
        properties: {
          displayName: `${plan.environmentName} Foundry Project`,
          description: `Default ${plan.environmentName} project for the Microsoft Foundry leadership demo platform.`
        }
      }
    ],
    outputs: {
      resourceNames: {
        type: "array",
        value: plan.resources.map((resource) => resource.name)
      },
      foundryAccountName: {
        type: "string",
        value: plan.names.foundryAccount
      },
      foundryProjectName: {
        type: "string",
        value: plan.names.foundryProject
      }
    }
  };
}

function parseWhatIfChanges(result) {
  const changes = result.properties?.changes || result.changes || [];
  const summary = changes.reduce(
    (accumulator, change) => {
      const changeType = change.changeType || "Unknown";
      accumulator[changeType] = (accumulator[changeType] || 0) + 1;
      return accumulator;
    },
    {}
  );

  return {
    changes: changes.map((change) => ({
      changeType: change.changeType || "Unknown",
      resourceId: change.resourceId || change.before?.id || change.after?.id || "",
      resourceType: change.after?.type || change.before?.type || "",
      resourceName:
        change.after?.name ||
        change.before?.name ||
        String(change.resourceId || "").split("/").filter(Boolean).at(-1) ||
        "unknown"
    })),
    summary
  };
}

function parseDeploymentChanges(result) {
  const parsed = parseWhatIfChanges(result);
  return {
    ...parsed,
    changes: parsed.changes.map((change) => ({
      ...change,
      resourceName: change.resourceName || String(change.resourceId || "").split("/").filter(Boolean).at(-1)
    }))
  };
}

async function pollWhatIfOperation(pollUrl, token) {
  let lastBody = {};
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(attempt === 0 ? 1000 : 2000);
    const { response, body } = await requestJson(pollUrl, {
      headers: { authorization: `Bearer ${token}` }
    });
    lastBody = body;

    if (!response.ok) {
      throw new Error(
        `What-if polling failed: HTTP ${response.status} ${body.error?.message || ""}`.trim()
      );
    }

    if (body.properties?.changes || body.changes) {
      return body;
    }

    const status = String(body.status || body.properties?.provisioningState || "").toLowerCase();
    if (status === "succeeded") {
      return body;
    }
    if (["failed", "canceled", "cancelled"].includes(status)) {
      const detail =
        body.error?.message ||
        body.properties?.error?.message ||
        JSON.stringify(body.error || body.properties?.error || body).slice(0, 2000);
      throw new Error(`What-if operation ended with status ${body.status || status}. ${detail}`);
    }
  }

  throw new Error(`What-if operation did not finish in time. Last response: ${JSON.stringify(lastBody)}`);
}

async function runGroupWhatIf({ token, subscriptionId, resourceGroupName, deploymentName, location, template }) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${deploymentName}/whatIf?api-version=2025-04-01`;
  const requestBody = {
    properties: {
      mode: "Incremental",
      template,
      parameters: {},
      whatIfSettings: {
        resultFormat: "FullResourcePayloads"
      }
    }
  };

  const { response, body } = await requestJson(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (response.status === 202) {
    const pollUrl = response.headers.get("location") || response.headers.get("azure-asyncoperation");
    if (!pollUrl) {
      throw new Error("Azure accepted the what-if request but did not return a polling URL.");
    }
    return pollWhatIfOperation(pollUrl, token);
  }

  if (!response.ok) {
    throw new Error(`What-if failed: HTTP ${response.status} ${body.error?.message || ""}`.trim());
  }

  return body;
}

async function runFoundationWhatIf() {
  const env = await loadProjectEnv();
  const plan = buildFoundationPlan(env);
  const token = await getAzureToken(env);
  const url = `https://management.azure.com/subscriptions/${plan.subscriptionId}/providers/Microsoft.Resources/deployments/${plan.deploymentName}-whatif/whatIf?api-version=2025-04-01`;
  const template = buildFoundationArmTemplate(plan);
  const requestBody = {
    location: plan.location,
    properties: {
      mode: "Incremental",
      template,
      parameters: {},
      whatIfSettings: {
        resultFormat: "FullResourcePayloads"
      }
    }
  };

  log("info", `Starting foundation what-if for ${plan.totals.resourceGroups} resource groups.`);
  const { response, body } = await requestJson(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  let resultBody = body;
  if (response.status === 202) {
    const pollUrl = response.headers.get("location") || response.headers.get("azure-asyncoperation");
    if (!pollUrl) {
      throw new Error("Azure accepted the what-if request but did not return a polling URL.");
    }
    resultBody = await pollWhatIfOperation(pollUrl, token);
  } else if (!response.ok) {
    throw new Error(`Foundation what-if failed: HTTP ${response.status} ${body.error?.message || ""}`.trim());
  }

  const parsed = parseWhatIfChanges(resultBody);
  const result = {
    status: "succeeded",
    asOf: new Date().toISOString(),
    deploymentName: `${plan.deploymentName}-whatif`,
    location: plan.location,
    templateResourceCount: plan.resourceGroups.length,
    summary: parsed.summary,
    changes: parsed.changes,
    rawStatus: resultBody.status || resultBody.properties?.provisioningState || "Succeeded"
  };

  log(
    "success",
    `Foundation what-if completed with ${result.changes.length} reported change(s).`
  );

  return result;
}

async function getResourceGroupState(token, subscriptionId, resourceGroupName) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2024-03-01`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status === 404) {
    return {
      name: resourceGroupName,
      status: "Missing",
      location: "",
      tags: {},
      resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`
    };
  }

  if (!response.ok) {
    return {
      name: resourceGroupName,
      status: "Unknown",
      location: "",
      tags: {},
      detail: `HTTP ${response.status}: ${body.error?.message || ""}`,
      resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`
    };
  }

  return {
    name: resourceGroupName,
    status: "Created",
    location: body.location || "",
    tags: body.tags || {},
    resourceId: body.id || `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`
  };
}

async function checkFoundationStatus() {
  const env = await loadProjectEnv();
  const plan = buildFoundationPlan(env);
  const token = await getAzureToken(env);
  const resourceGroups = [];

  log("info", `Checking status for ${plan.totals.resourceGroups} foundation resource groups.`);
  for (const resourceGroup of plan.resourceGroups) {
    const state = await getResourceGroupState(token, plan.subscriptionId, resourceGroup.name);
    resourceGroups.push({
      ...resourceGroup,
      ...state,
      expectedLocation: plan.location,
      expectedTags: resourceGroup.tags,
      tagStatus:
        state.status === "Created" &&
        Object.entries(resourceGroup.tags).every(([key, value]) => state.tags?.[key] === value)
          ? "TagsMatch"
          : state.status === "Created"
            ? "TagDrift"
            : "NotChecked"
    });
  }

  const summary = resourceGroups.reduce(
    (accumulator, resourceGroup) => {
      accumulator[resourceGroup.status] = (accumulator[resourceGroup.status] || 0) + 1;
      return accumulator;
    },
    {}
  );

  const tagDrift = resourceGroups.filter((resourceGroup) => resourceGroup.tagStatus === "TagDrift").length;
  const status = summary.Missing || summary.Unknown || tagDrift ? "warning" : "ready";
  log(
    status === "ready" ? "success" : "warn",
    `Foundation status check completed. Created: ${summary.Created || 0}, missing: ${summary.Missing || 0}, tag drift: ${tagDrift}.`
  );

  return {
    status,
    asOf: new Date().toISOString(),
    summary: {
      ...summary,
      TagDrift: tagDrift
    },
    resourceGroups
  };
}

async function runPlatformCoreWhatIf(environmentKey = "dev") {
  const env = await loadProjectEnv();
  const plan = buildPlatformCorePlan(env, environmentKey);
  const token = await getAzureToken(env);
  const template = buildPlatformCoreArmTemplate(plan);

  log(
    "info",
    `Starting ${plan.environment} platform core what-if for ${plan.totals.resources} resources.`
  );
  const resultBody = await runGroupWhatIf({
    token,
    subscriptionId: plan.subscriptionId,
    resourceGroupName: plan.resourceGroupName,
    deploymentName: `${plan.deploymentName}-whatif`,
    location: plan.location,
    template
  });

  const parsed = parseDeploymentChanges(resultBody);
  const result = {
    status: "succeeded",
    asOf: new Date().toISOString(),
    deploymentName: `${plan.deploymentName}-whatif`,
    environment: plan.environment,
    resourceGroupName: plan.resourceGroupName,
    location: plan.location,
    templateResourceCount: plan.resources.length,
    summary: parsed.summary,
    changes: parsed.changes,
    rawStatus: resultBody.status || resultBody.properties?.provisioningState || "Succeeded"
  };

  log(
    "success",
    `${plan.environment} platform core what-if completed with ${result.changes.length} reported change(s).`
  );

  return result;
}

function getPlatformCoreResourceApiVersion(resource) {
  const versions = {
    "Microsoft.ManagedIdentity/userAssignedIdentities": "2023-01-31",
    "Microsoft.OperationalInsights/workspaces": "2023-09-01",
    "Microsoft.Insights/components": "2020-02-02",
    "Microsoft.KeyVault/vaults": "2023-07-01",
    "Microsoft.Storage/storageAccounts": "2023-05-01",
    "Microsoft.Search/searchServices": "2025-05-01",
    "Microsoft.App/managedEnvironments": "2024-03-01",
    "Microsoft.Web/serverfarms": "2023-12-01",
    "Microsoft.CognitiveServices/accounts": "2026-03-01",
    "Microsoft.CognitiveServices/accounts/projects": "2025-06-01"
  };
  return versions[resource.type] || "2021-04-01";
}

function getPlatformCoreResourceId(plan, resource) {
  if (resource.key === "foundryProject") {
    return `/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourceGroupName}/providers/Microsoft.CognitiveServices/accounts/${plan.names.foundryAccount}/projects/${resource.name}`;
  }
  return `/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourceGroupName}/providers/${resource.type}/${resource.name}`;
}

async function getPlatformCoreResourceState(token, plan, resource) {
  const resourceId = getPlatformCoreResourceId(plan, resource);
  const apiVersion = getPlatformCoreResourceApiVersion(resource);
  const url = `https://management.azure.com${resourceId}?api-version=${apiVersion}`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status === 404) {
    return {
      ...resource,
      resourceId,
      status: "Missing",
      location: "",
      provisioningState: ""
    };
  }

  if (!response.ok) {
    return {
      ...resource,
      resourceId,
      status: "Unknown",
      location: "",
      provisioningState: "",
      detail: `HTTP ${response.status}: ${body.error?.message || ""}`
    };
  }

  return {
    ...resource,
    resourceId: body.id || resourceId,
    status: "Created",
    location: body.location || "",
    provisioningState: body.properties?.provisioningState || "Unknown"
  };
}

async function checkPlatformCoreStatus(environmentKey = "dev") {
  const env = await loadProjectEnv();
  const plan = buildPlatformCorePlan(env, environmentKey);
  const token = await getAzureToken(env);
  const resources = [];

  log("info", `Checking ${plan.environment} platform core resource status.`);
  for (const resource of plan.resources) {
    resources.push(await getPlatformCoreResourceState(token, plan, resource));
  }

  const summary = resources.reduce(
    (accumulator, resource) => {
      accumulator[resource.status] = (accumulator[resource.status] || 0) + 1;
      return accumulator;
    },
    {}
  );
  const status = summary.Missing || summary.Unknown ? "warning" : "ready";

  log(
    status === "ready" ? "success" : "warn",
    `${plan.environment} platform core status check completed. Created: ${summary.Created || 0}, missing: ${summary.Missing || 0}.`
  );

  return {
    status,
    asOf: new Date().toISOString(),
    environment: plan.environment,
    resourceGroupName: plan.resourceGroupName,
    summary,
    deferredResources: plan.deferredResources,
    resources
  };
}

async function getAzureResourceState(token, resourceId, apiVersion, resource) {
  const url = `https://management.azure.com${resourceId}?api-version=${apiVersion}`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status === 404) {
    return {
      ...resource,
      resourceId,
      status: "Missing",
      location: "",
      provisioningState: ""
    };
  }

  if (!response.ok) {
    return {
      ...resource,
      resourceId,
      status: "Unknown",
      location: "",
      provisioningState: "",
      detail: `HTTP ${response.status}: ${body.error?.message || ""}`
    };
  }

  return {
    ...resource,
    resourceId: body.id || resourceId,
    status: "Created",
    location: body.location || "",
    provisioningState: body.properties?.provisioningState || "Unknown",
    defaultHostName: body.properties?.defaultHostName || "",
    latestRevisionFqdn: body.properties?.configuration?.ingress?.fqdn || ""
  };
}

async function checkWorkloadStatus(options = {}) {
  const env = await loadProjectEnv();
  const plan = buildWorkloadPlan(env, options);
  const token = await getAzureToken(env);
  const managedResources = getWorkloadManagedResources(plan);
  const resources = [];

  log(
    "info",
    `Checking workload status for ${plan.businessUnit.name} ${plan.app.name} in ${plan.environment.name}.`
  );

  for (const resource of managedResources) {
    resources.push(
      await getAzureResourceState(
        token,
        getWorkloadResourceId(plan, resource),
        getWorkloadResourceApiVersion(resource),
        resource
      )
    );
  }

  const summary = resources.reduce((accumulator, resource) => {
    accumulator[resource.status] = (accumulator[resource.status] || 0) + 1;
    return accumulator;
  }, {});
  const status =
    plan.status === "deferred"
      ? "deferred"
      : summary.Missing || summary.Unknown
        ? "warning"
        : "ready";

  log(
    status === "ready" ? "success" : "warn",
    `Workload status checked. Created: ${summary.Created || 0}, missing: ${summary.Missing || 0}.`
  );

  return {
    status,
    asOf: new Date().toISOString(),
    resourceGroupName: plan.resourceGroupName,
    environment: plan.environment,
    businessUnit: plan.businessUnit,
    app: plan.app,
    deployment: plan.deployment,
    hosting: plan.hosting,
    summary,
    resources
  };
}

async function runWorkloadWhatIf(options = {}) {
  const env = await loadProjectEnv();
  const plan = buildWorkloadPlan(env, options);

  if (plan.status === "deferred") {
    return {
      status: "deferred",
      asOf: new Date().toISOString(),
      resourceGroupName: plan.resourceGroupName,
      environment: plan.environment,
      businessUnit: plan.businessUnit,
      app: plan.app,
      message: plan.hosting.note,
      changes: [],
      summary: {}
    };
  }

  const token = await getAzureToken(env);
  const template = buildWorkloadArmTemplate(plan);

  log(
    "info",
    `Starting workload what-if for ${plan.businessUnit.name} ${plan.app.name} in ${plan.environment.name}.`
  );
  const resultBody = await runGroupWhatIf({
    token,
    subscriptionId: plan.subscriptionId,
    resourceGroupName: plan.resourceGroupName,
    deploymentName: `${plan.deploymentName}-whatif`,
    location: plan.location,
    template
  });

  const parsed = parseDeploymentChanges(resultBody);
  const result = {
    status: "succeeded",
    asOf: new Date().toISOString(),
    deploymentName: `${plan.deploymentName}-whatif`,
    resourceGroupName: plan.resourceGroupName,
    environment: plan.environment,
    businessUnit: plan.businessUnit,
    app: plan.app,
    templateResourceCount: getWorkloadManagedResources(plan).length,
    summary: parsed.summary,
    changes: parsed.changes,
    rawStatus: resultBody.status || resultBody.properties?.provisioningState || "Succeeded"
  };

  log("success", `Workload what-if completed with ${result.changes.length} change(s).`);
  return result;
}

function parseWorkloadDeploymentResult(result, plan) {
  return {
    status: result.properties?.provisioningState || "Unknown",
    asOf: new Date().toISOString(),
    deploymentName: result.name || plan.deploymentName,
    resourceGroupName: plan.resourceGroupName,
    environment: plan.environment,
    businessUnit: plan.businessUnit,
    app: plan.app,
    location: result.location || plan.location,
    correlationId: result.properties?.correlationId || "",
    duration: result.properties?.duration || "",
    outputs: result.properties?.outputs || {},
    resources: getWorkloadManagedResources(plan).map((resource) => ({
      ...resource,
      resourceId: getWorkloadResourceId(plan, resource)
    }))
  };
}

async function deployWorkload(options = {}, payload = {}) {
  const env = await loadProjectEnv();
  const plan = buildWorkloadPlan(env, options);
  const expectedConfirm = `DEPLOY ${plan.businessUnit.key.toUpperCase()} ${plan.app.key.toUpperCase()} ${plan.environment.key.toUpperCase()}`;

  if (payload.confirm !== expectedConfirm) {
    throw new Error(`Deployment confirmation is required. Expected confirm value "${expectedConfirm}".`);
  }
  if (payload.ackBilling !== true) {
    throw new Error("Billing acknowledgement is required before deploying this workload.");
  }
  if (plan.status === "deferred") {
    throw new Error(`Workload deployment is deferred. ${plan.hosting.note}`);
  }
  if (env.ENABLE_WORKLOAD_DEPLOYMENT !== "true") {
    throw new Error("Workload deployment is disabled. Set ENABLE_WORKLOAD_DEPLOYMENT=true after a real workload image is available.");
  }

  const token = await getAzureToken(env);
  const template = buildWorkloadArmTemplate(plan);
  const url = `https://management.azure.com/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourceGroupName}/providers/Microsoft.Resources/deployments/${plan.deploymentName}?api-version=2025-04-01`;
  const requestBody = {
    properties: {
      mode: "Incremental",
      template,
      parameters: {}
    }
  };

  log(
    "warn",
    `Starting workload deployment for ${plan.businessUnit.name} ${plan.app.name}. This can create usage-based app resources.`
  );
  const { response, body } = await requestJson(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Workload deployment failed: HTTP ${response.status} ${body.error?.message || ""}`.trim());
  }

  let resultBody = body;
  const state = String(body.properties?.provisioningState || "").toLowerCase();
  if (!["succeeded", "failed", "canceled", "cancelled"].includes(state)) {
    resultBody = await pollGroupDeployment(
      token,
      plan.subscriptionId,
      plan.resourceGroupName,
      plan.deploymentName
    );
  }

  const result = parseWorkloadDeploymentResult(resultBody, plan);
  if (String(result.status).toLowerCase() !== "succeeded") {
    throw new Error(`Workload deployment ended with state ${result.status}.`);
  }

  log("success", `Workload deployment completed for ${plan.businessUnit.name} ${plan.app.name}.`);
  return result;
}

async function teardownWorkload(options = {}, payload = {}) {
  const env = await loadProjectEnv();
  const plan = buildWorkloadPlan(env, options);
  const expectedConfirm = `DELETE ${plan.businessUnit.key.toUpperCase()} ${plan.app.key.toUpperCase()} ${plan.environment.key.toUpperCase()}`;

  if (payload.confirm !== expectedConfirm) {
    throw new Error(`Deletion confirmation is required. Expected confirm value "${expectedConfirm}".`);
  }
  if (payload.ackDelete !== true) {
    throw new Error("Deletion acknowledgement is required before tearing down this workload.");
  }

  const token = await getAzureToken(env);
  const deleteOrder = ["webApp", "containerApp", "appServicePlan", "managedIdentity"];
  const resources = getWorkloadManagedResources(plan).sort(
    (left, right) => deleteOrder.indexOf(left.key) - deleteOrder.indexOf(right.key)
  );
  const results = [];

  log("warn", `Starting workload teardown for ${plan.businessUnit.name} ${plan.app.name}.`);
  for (const resource of resources) {
    const resourceId = getWorkloadResourceId(plan, resource);
    try {
      const result = await deleteAzureResource(token, resourceId, getWorkloadResourceApiVersion(resource));
      results.push({
        ...resource,
        resourceId,
        status: result.status,
        detail: result.detail
      });
      log("success", `Workload teardown ${result.status}: ${resource.name}.`);
    } catch (error) {
      results.push({
        ...resource,
        resourceId,
        status: "Failed",
        detail: error.message
      });
      log("error", `Workload teardown failed for ${resource.name}.`, error.message);
    }
  }

  const summary = results.reduce((accumulator, result) => {
    accumulator[result.status] = (accumulator[result.status] || 0) + 1;
    return accumulator;
  }, {});

  return {
    status: summary.Failed ? "warning" : "succeeded",
    asOf: new Date().toISOString(),
    resourceGroupName: plan.resourceGroupName,
    environment: plan.environment,
    businessUnit: plan.businessUnit,
    app: plan.app,
    summary,
    resources: results
  };
}

function getPlatformCoreDeleteOrder(plan) {
  const order = [
    "foundryProject",
    "foundryAccount",
    "containerAppsEnvironment",
    "appInsights",
    "keyVault",
    "storage",
    "search",
    "logAnalytics",
    "managedIdentity"
  ];

  return [...plan.resources].sort(
    (left, right) => order.indexOf(left.key) - order.indexOf(right.key)
  );
}

async function pollDeleteOperation(pollUrl, token) {
  let lastBody = {};
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(attempt === 0 ? 1500 : 3000);
    const response = await fetch(pollUrl, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (response.status === 202 || response.status === 204) {
      continue;
    }

    const body = await response.json().catch(() => ({}));
    lastBody = body;

    if (!response.ok) {
      if (response.status === 404) {
        return { status: "Deleted" };
      }
      throw new Error(
        `Delete operation polling failed: HTTP ${response.status} ${body.error?.message || ""}`.trim()
      );
    }

    const status = String(body.status || body.properties?.provisioningState || "").toLowerCase();
    if (!status || status === "succeeded" || status === "deleted") {
      return body;
    }
    if (["failed", "canceled", "cancelled"].includes(status)) {
      throw new Error(`Delete operation ended with status ${body.status || status}.`);
    }
  }

  throw new Error(`Delete operation did not finish in time. Last response: ${JSON.stringify(lastBody)}`);
}

async function deleteAzureResource(token, resourceId, apiVersion) {
  const url = `https://management.azure.com${resourceId}?api-version=${apiVersion}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));

  if (response.status === 404) {
    return { status: "Skipped", detail: "Resource was already missing." };
  }

  if (![200, 202, 204].includes(response.status)) {
    throw new Error(`Delete failed: HTTP ${response.status} ${body.error?.message || ""}`.trim());
  }

  const pollUrl = response.headers.get("azure-asyncoperation") || response.headers.get("location");
  if (pollUrl) {
    await pollDeleteOperation(pollUrl, token);
  }

  return {
    status: response.status === 204 ? "Deleted" : "DeleteStarted",
    detail: response.status === 202 ? "Azure accepted the delete operation." : "Delete completed."
  };
}

async function teardownPlatformCore(environmentKey = "dev", payload = {}) {
  const expectedConfirm = `DELETE ${environmentKey.toUpperCase()} CORE`;
  if (payload.confirm !== expectedConfirm) {
    throw new Error(`Deletion confirmation is required. Expected confirm value "${expectedConfirm}".`);
  }
  if (payload.ackDelete !== true) {
    throw new Error(`Deletion acknowledgement is required before tearing down ${environmentKey.toUpperCase()} Platform Core.`);
  }

  const env = await loadProjectEnv();
  const plan = buildPlatformCorePlan(env, environmentKey);
  const token = await getAzureToken(env);
  const results = [];

  log(
    "warn",
    `Starting ${plan.environment} platform core teardown. This deletes billable ${plan.environmentName} Core resources but keeps the resource group.`
  );

  for (const resource of getPlatformCoreDeleteOrder(plan)) {
    const resourceId = getPlatformCoreResourceId(plan, resource);
    const apiVersion = getPlatformCoreResourceApiVersion(resource);
    try {
      const result = await deleteAzureResource(token, resourceId, apiVersion);
      results.push({
        ...resource,
        resourceId,
        status: result.status,
        detail: result.detail
      });
      log("success", `Teardown ${result.status}: ${resource.name}.`);
    } catch (error) {
      results.push({
        ...resource,
        resourceId,
        status: "Failed",
        detail: error.message
      });
      log("error", `Teardown failed for ${resource.name}.`, error.message);
    }
  }

  const summary = results.reduce(
    (accumulator, result) => {
      accumulator[result.status] = (accumulator[result.status] || 0) + 1;
      return accumulator;
    },
    {}
  );
  const status = summary.Failed ? "warning" : "succeeded";

  log(
    status === "succeeded" ? "success" : "warn",
    `${plan.environment} platform core teardown completed. Deleted/started: ${
      (summary.Deleted || 0) + (summary.DeleteStarted || 0)
    }, skipped: ${summary.Skipped || 0}, failed: ${summary.Failed || 0}.`
  );

  return {
    status,
    asOf: new Date().toISOString(),
    environment: plan.environment,
    resourceGroupName: plan.resourceGroupName,
    summary,
    resources: results,
    note:
      "Resource group was preserved. Key Vault soft-delete may retain the deleted vault name until retention or purge."
  };
}

async function getSubscriptionDeployment(token, subscriptionId, deploymentName) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2025-04-01`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(
      `Deployment lookup failed: HTTP ${response.status} ${body.error?.message || ""}`.trim()
    );
  }

  return body;
}

async function getGroupDeployment(token, subscriptionId, resourceGroupName, deploymentName) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2025-04-01`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(
      `Deployment lookup failed: HTTP ${response.status} ${body.error?.message || ""}`.trim()
    );
  }

  return body;
}

async function pollSubscriptionDeployment(token, subscriptionId, deploymentName) {
  let lastBody = {};
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(attempt === 0 ? 1500 : 3000);
    const body = await getSubscriptionDeployment(token, subscriptionId, deploymentName);
    lastBody = body;
    const state = String(body.properties?.provisioningState || "").toLowerCase();

    if (state === "succeeded") {
      return body;
    }
    if (["failed", "canceled", "cancelled"].includes(state)) {
      throw new Error(
        `Deployment ended with state ${body.properties?.provisioningState}. ${
          body.properties?.error?.message || ""
        }`.trim()
      );
    }
  }

  throw new Error(`Deployment did not finish in time. Last response: ${JSON.stringify(lastBody)}`);
}

async function pollGroupDeployment(token, subscriptionId, resourceGroupName, deploymentName) {
  let lastBody = {};
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(attempt === 0 ? 2000 : 5000);
    const body = await getGroupDeployment(token, subscriptionId, resourceGroupName, deploymentName);
    lastBody = body;
    const state = String(body.properties?.provisioningState || "").toLowerCase();

    if (state === "succeeded") {
      return body;
    }
    if (["failed", "canceled", "cancelled"].includes(state)) {
      throw new Error(
        `Deployment ended with state ${body.properties?.provisioningState}. ${
          body.properties?.error?.message || JSON.stringify(body.properties?.error || {}).slice(0, 2000)
        }`.trim()
      );
    }
  }

  throw new Error(`Deployment did not finish in time. Last response: ${JSON.stringify(lastBody)}`);
}

function parseDeploymentResult(result, plan) {
  const outputs = result.properties?.outputs || {};
  const outputResourceGroups = outputs.allResourceGroups?.value || [];

  return {
    status: result.properties?.provisioningState || "Unknown",
    asOf: new Date().toISOString(),
    deploymentName: result.name || plan.deploymentName,
    location: result.location || plan.location,
    correlationId: result.properties?.correlationId || "",
    duration: result.properties?.duration || "",
    outputs: {
      allResourceGroups: outputResourceGroups
    },
    resourceGroups: plan.resourceGroups.map((resourceGroup) => ({
      name: resourceGroup.name,
      scope: resourceGroup.scope,
      environment: resourceGroup.environment,
      businessUnit: resourceGroup.businessUnit,
      resourceId: `/subscriptions/${plan.subscriptionId}/resourceGroups/${resourceGroup.name}`
    }))
  };
}

function parsePlatformCoreDeploymentResult(result, plan) {
  const outputs = result.properties?.outputs || {};

  return {
    status: result.properties?.provisioningState || "Unknown",
    asOf: new Date().toISOString(),
    deploymentName: result.name || plan.deploymentName,
    environment: plan.environment,
    resourceGroupName: plan.resourceGroupName,
    location: result.location || plan.location,
    correlationId: result.properties?.correlationId || "",
    duration: result.properties?.duration || "",
    outputs,
    deferredResources: plan.deferredResources,
    resources: plan.resources.map((resource) => ({
      ...resource,
      resourceId: getPlatformCoreResourceId(plan, resource)
    }))
  };
}

async function deployFoundation(payload = {}) {
  if (payload.confirm !== "DEPLOY FOUNDATION") {
    throw new Error('Deployment confirmation is required. Expected confirm value "DEPLOY FOUNDATION".');
  }

  const env = await loadProjectEnv();
  const plan = buildFoundationPlan(env);
  const token = await getAzureToken(env);
  const template = buildFoundationArmTemplate(plan);
  const url = `https://management.azure.com/subscriptions/${plan.subscriptionId}/providers/Microsoft.Resources/deployments/${plan.deploymentName}?api-version=2025-04-01`;
  const requestBody = {
    location: plan.location,
    properties: {
      mode: "Incremental",
      template,
      parameters: {}
    }
  };

  log("info", `Starting foundation deployment for ${plan.totals.resourceGroups} resource groups.`);
  const { response, body } = await requestJson(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Foundation deployment failed: HTTP ${response.status} ${body.error?.message || ""}`.trim());
  }

  let resultBody = body;
  const state = String(body.properties?.provisioningState || "").toLowerCase();
  if (!["succeeded", "failed", "canceled", "cancelled"].includes(state)) {
    resultBody = await pollSubscriptionDeployment(token, plan.subscriptionId, plan.deploymentName);
  }

  const result = parseDeploymentResult(resultBody, plan);
  if (String(result.status).toLowerCase() !== "succeeded") {
    throw new Error(`Foundation deployment ended with state ${result.status}.`);
  }

  log(
    "success",
    `Foundation deployment completed. ${result.resourceGroups.length} resource group(s) are ready.`
  );

  return result;
}

async function deployPlatformCore(environmentKey = "dev", payload = {}) {
  const expectedConfirm = `DEPLOY ${environmentKey.toUpperCase()} CORE`;
  if (payload.confirm !== expectedConfirm) {
    throw new Error(`Deployment confirmation is required. Expected confirm value "${expectedConfirm}".`);
  }
  if (payload.ackBilling !== true) {
    throw new Error(`Billing acknowledgement is required before deploying ${environmentKey.toUpperCase()} Platform Core.`);
  }

  const env = await loadProjectEnv();
  const plan = buildPlatformCorePlan(env, environmentKey);
  const token = await getAzureToken(env);
  const template = buildPlatformCoreArmTemplate(plan);
  const url = `https://management.azure.com/subscriptions/${plan.subscriptionId}/resourceGroups/${plan.resourceGroupName}/providers/Microsoft.Resources/deployments/${plan.deploymentName}?api-version=2025-04-01`;
  const requestBody = {
    properties: {
      mode: "Incremental",
      template,
      parameters: {}
    }
  };

  log(
    "warn",
    `Starting ${plan.environment} platform core deployment. This creates usage-based Azure resources until they are deleted.`
  );
  const { response, body } = await requestJson(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(
      `${plan.environment} platform core deployment failed: HTTP ${response.status} ${
        body.error?.message || ""
      }`.trim()
    );
  }

  let resultBody = body;
  const state = String(body.properties?.provisioningState || "").toLowerCase();
  if (!["succeeded", "failed", "canceled", "cancelled"].includes(state)) {
    resultBody = await pollGroupDeployment(
      token,
      plan.subscriptionId,
      plan.resourceGroupName,
      plan.deploymentName
    );
  }

  const result = parsePlatformCoreDeploymentResult(resultBody, plan);
  if (String(result.status).toLowerCase() !== "succeeded") {
    throw new Error(`${plan.environment} platform core deployment ended with state ${result.status}.`);
  }

  log(
    "success",
    `${plan.environment} platform core deployment completed. ${result.resources.length} resource(s) are ready or provisioning.`
  );

  return result;
}

function hasAction(permissions, action) {
  const target = action.toLowerCase();
  return permissions.some((permission) => {
    const actions = (permission.actions || []).map((item) => item.toLowerCase());
    const notActions = (permission.notActions || []).map((item) => item.toLowerCase());
    const allowed = actions.some((item) => {
      if (item === "*" || item === target) return true;
      return item.endsWith("/*") && target.startsWith(item.slice(0, -1));
    });
    const denied = notActions.some((item) => {
      if (item === "*" || item === target) return true;
      return item.endsWith("/*") && target.startsWith(item.slice(0, -1));
    });
    return allowed && !denied;
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function getAzureToken(env) {
  const tenantId = firstValue(env, ["AZURE_TENANT_ID", "ARM_TENANT_ID"]);
  const clientId = firstValue(env, ["AZURE_CLIENT_ID", "ARM_CLIENT_ID"]);
  const clientSecret = firstValue(env, ["AZURE_CLIENT_SECRET", "ARM_CLIENT_SECRET"]);

  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://management.azure.com/.default"
  });

  const { response, body } = await requestJson(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: "POST", body: tokenBody }
  );

  if (!response.ok) {
    throw new Error(
      `Token request failed: HTTP ${response.status} ${body.error || ""} ${
        body.error_description || ""
      }`.trim()
    );
  }

  return body.access_token;
}

async function runPrerequisiteChecks() {
  const env = await loadProjectEnv();
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const tenantId = firstValue(env, ["AZURE_TENANT_ID", "ARM_TENANT_ID"]);
  const clientId = firstValue(env, ["AZURE_CLIENT_ID", "ARM_CLIENT_ID"]);
  const clientSecret = firstValue(env, ["AZURE_CLIENT_SECRET", "ARM_CLIENT_SECRET"]);
  const location = env.AZURE_LOCATION || "eastus2";

  const requiredFields = [
    ["AZURE_SUBSCRIPTION_ID", subscriptionId],
    ["AZURE_TENANT_ID", tenantId],
    ["AZURE_CLIENT_ID", clientId],
    ["AZURE_CLIENT_SECRET", clientSecret]
  ];

  const missing = requiredFields.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    return {
      status: "failed",
      checks: missing.map((key) => ({
        name: `Required setting ${key}`,
        status: "failed",
        detail: "Missing from .env"
      }))
    };
  }

  log("info", "Starting Azure prerequisite validation.");
  const token = await getAzureToken(env);
  const management = "https://management.azure.com";

  const checks = [
    {
      name: "Create resource groups",
      action: "Microsoft.Resources/subscriptions/resourceGroups/write"
    },
    { name: "Run ARM/Bicep deployments", action: "Microsoft.Resources/deployments/write" },
    {
      name: "Register Azure providers",
      action: "Microsoft.Resources/subscriptions/providers/register/action"
    },
    { name: "Create Key Vaults", action: "Microsoft.KeyVault/vaults/write" },
    { name: "Create Azure AI Search", action: "Microsoft.Search/searchServices/write" },
    {
      name: "Create Foundry/Azure AI accounts",
      action: "Microsoft.CognitiveServices/accounts/write"
    },
    {
      name: "Create Foundry workspace resources",
      action: "Microsoft.MachineLearningServices/workspaces/write"
    },
    { name: "Create App Service apps", action: "Microsoft.Web/sites/write" },
    { name: "Create Container Apps", action: "Microsoft.App/containerApps/write" },
    { name: "Assign RBAC roles", action: "Microsoft.Authorization/roleAssignments/write" },
    { name: "Create Azure budgets", action: "Microsoft.Consumption/budgets/write" },
    { name: "Query Cost Management data", action: "Microsoft.CostManagement/query/action" }
  ];

  const result = {
    status: "passed",
    subscription: null,
    checks: [],
    providers: [],
    location
  };

  const subscriptionUrl = `${management}/subscriptions/${subscriptionId}?api-version=2020-01-01`;
  const subscription = await requestJson(subscriptionUrl, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!subscription.response.ok) {
    throw new Error(
      `Subscription lookup failed: HTTP ${subscription.response.status} ${
        subscription.body.error?.message || ""
      }`
    );
  }

  result.subscription = {
    displayName: subscription.body.displayName || "unknown",
    subscriptionId: subscription.body.subscriptionId || subscriptionId,
    state: subscription.body.state || "unknown"
  };

  const permissions = await requestJson(
    `${management}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/permissions?api-version=2015-07-01`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  if (!permissions.response.ok) {
    result.status = "warning";
    result.checks.push({
      name: "Permission discovery",
      status: "warning",
      detail: `HTTP ${permissions.response.status}. ${permissions.body.error?.message || ""}`
    });
  } else {
    const permissionItems = permissions.body.value || [];
    for (const check of checks) {
      const ok = hasAction(permissionItems, check.action);
      result.checks.push({
        name: check.name,
        status: ok ? "passed" : "failed",
        detail: check.action
      });
      if (!ok) result.status = "failed";
    }
  }

  const locations = await requestJson(
    `${management}/subscriptions/${subscriptionId}/locations?api-version=2020-01-01`,
    { headers: { authorization: `Bearer ${token}` } }
  );

  if (locations.response.ok) {
    const supported = (locations.body.value || []).some(
      (item) => item.name.toLowerCase() === location.toLowerCase()
    );
    result.checks.push({
      name: `Subscription supports ${location}`,
      status: supported ? "passed" : "failed",
      detail: supported ? "Deployment region is available." : "Choose a different Azure region."
    });
    if (!supported) result.status = "failed";
  }

  for (const provider of requiredProviderNames) {
    const providerResult = await requestJson(
      `${management}/subscriptions/${subscriptionId}/providers/${provider}?api-version=2021-04-01`,
      { headers: { authorization: `Bearer ${token}` } }
    );

    if (!providerResult.response.ok) {
      result.providers.push({
        namespace: provider,
        status: "unknown",
        detail: `HTTP ${providerResult.response.status}`
      });
      if (result.status === "passed") result.status = "warning";
    } else {
      const registrationState = providerResult.body.registrationState || "Unknown";
      result.providers.push({
        namespace: provider,
        status: registrationState,
        detail:
          registrationState === "Registered"
            ? "Ready"
            : "Can be registered during setup if permissions allow."
      });
    }
  }

  log(
    result.status === "failed" ? "error" : result.status === "warning" ? "warn" : "success",
    `Azure prerequisite validation completed with status: ${result.status}.`
  );

  return result;
}

async function getProviderState(token, subscriptionId, namespace) {
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/${namespace}?api-version=2021-04-01`;
  const { response, body } = await requestJson(url, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(
      `Provider lookup failed for ${namespace}: HTTP ${response.status} ${
        body.error?.message || ""
      }`.trim()
    );
  }

  return body.registrationState || "Unknown";
}

async function registerResourceProvider(namespace) {
  if (!requiredProviderNames.includes(namespace)) {
    throw new Error(`${namespace} is not in the approved provider list for this app.`);
  }

  const env = await loadProjectEnv();
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const token = await getAzureToken(env);
  const registerUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/${namespace}/register?api-version=2021-04-01`;

  const beforeState = await getProviderState(token, subscriptionId, namespace);
  if (beforeState === "Registered") {
    log("info", `${namespace} is already registered.`);
    return {
      namespace,
      status: "Registered",
      beforeState,
      afterState: "Registered",
      asOf: new Date().toISOString(),
      message: `${namespace} was already registered.`
    };
  }

  log("info", `Registering Azure resource provider ${namespace}.`);
  const { response, body } = await requestJson(registerUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(
      `Provider registration failed for ${namespace}: HTTP ${response.status} ${
        body.error?.message || ""
      }`.trim()
    );
  }

  let afterState = body.registrationState || "Registering";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    afterState = await getProviderState(token, subscriptionId, namespace);
    if (afterState === "Registered") {
      break;
    }
    await sleep(2000);
  }

  const status = afterState === "Registered" ? "Registered" : "Registering";
  log(
    status === "Registered" ? "success" : "warn",
    `${namespace} provider registration state: ${status}.`
  );

  return {
    namespace,
    status,
    beforeState,
    afterState,
    asOf: new Date().toISOString(),
    message:
      status === "Registered"
        ? `${namespace} is registered and ready.`
        : `${namespace} registration started. Azure may take a few more minutes to complete it.`
  };
}

function parseBillingRows(queryResult) {
  const columns = queryResult.properties?.columns || [];
  const rows = queryResult.properties?.rows || [];
  const normalizedColumns = columns.map((column) => String(column.name || "").toLowerCase());
  const costIndex = normalizedColumns.findIndex((name) =>
    ["pretaxcost", "cost", "totalcost"].includes(name)
  );
  const currencyIndex = normalizedColumns.findIndex((name) => name === "currency");

  let amount = 0;
  let currency = "";

  for (const row of rows) {
    const rowAmount = Number(row[costIndex >= 0 ? costIndex : 0]);
    if (Number.isFinite(rowAmount)) {
      amount += rowAmount;
    }
    if (!currency && currencyIndex >= 0 && row[currencyIndex]) {
      currency = String(row[currencyIndex]);
    }
  }

  return {
    amount,
    currency,
    columns: columns.map((column) => column.name),
    rowCount: rows.length
  };
}

async function fetchMonthToDateBilling() {
  const env = await loadProjectEnv();
  const subscriptionId = firstValue(env, ["AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID"]);
  const token = await getAzureToken(env);
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2025-03-01`;
  const body = {
    type: "Usage",
    timeframe: "MonthToDate",
    dataset: {
      granularity: "None",
      aggregation: {
        totalCost: {
          name: "PreTaxCost",
          function: "Sum"
        }
      }
    }
  };

  log("info", "Fetching month-to-date Azure billing amount.");

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { response, body: responseBody } = await requestJson(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (response.status === 204) {
      const result = {
        status: "ok",
        amount: 0,
        currency: "",
        timeframe: "MonthToDate",
        asOf: new Date().toISOString(),
        note: "Azure returned no billing rows for the current month."
      };
      log("success", "Month-to-date Azure billing returned no current charges.");
      return result;
    }

    if (response.ok) {
      const parsed = parseBillingRows(responseBody);
      const result = {
        status: "ok",
        amount: parsed.amount,
        currency: parsed.currency,
        timeframe: "MonthToDate",
        asOf: new Date().toISOString(),
        rowCount: parsed.rowCount,
        columns: parsed.columns,
        source: "Azure Cost Management Query API"
      };
      log(
        "success",
        `Month-to-date Azure billing fetched: ${parsed.currency || ""} ${parsed.amount.toFixed(2)}.`
      );
      return result;
    }

    const azureMessage = responseBody.error?.message || JSON.stringify(responseBody);
    lastError = `HTTP ${response.status}: ${responseBody.error?.code || ""} ${azureMessage}`.trim();

    if (![429, 503].includes(response.status) || attempt === 4) {
      break;
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1500;
    log("warn", `Azure Cost Management throttled the billing query. Retrying attempt ${attempt + 1}.`);
    await sleep(waitMs);
  }

  throw new Error(`Month-to-date billing query failed. ${lastError}`);
}

function sendJson(response, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function publicSampleAppRuntime(app) {
  return {
    key: app.key,
    name: app.name,
    businessUnit: app.businessUnit,
    capability: app.capability,
    localUrl: app.localUrl,
    healthUrl: app.healthUrl,
    startCommand: app.startCommand
  };
}

async function checkSingleSampleAppHealth(app) {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);

  try {
    const response = await fetch(app.healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => ({}));
    const ready = response.ok && String(body.status || "").toLowerCase() === "ok";
    return {
      ...publicSampleAppRuntime(app),
      status: ready ? "ready" : "warning",
      httpStatus: response.status,
      checkedAt,
      message: ready ? "Local sample app is responding." : "Health endpoint responded without an ok status.",
      response: body
    };
  } catch (error) {
    return {
      ...publicSampleAppRuntime(app),
      status: "missing",
      checkedAt,
      message:
        error.name === "AbortError"
          ? "Timed out waiting for the local sample app."
          : "Local sample app is not reachable. Start it with the command shown in the portal.",
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkSampleAppsHealth(appKey = "") {
  const apps = appKey
    ? [sampleAppRuntimeCatalog[appKey]].filter(Boolean)
    : Object.values(sampleAppRuntimeCatalog);

  if (!apps.length) {
    throw new Error(`Unknown sample app "${appKey}".`);
  }

  const results = await Promise.all(apps.map((app) => checkSingleSampleAppHealth(app)));
  const readyCount = results.filter((item) => item.status === "ready").length;
  const status = readyCount === results.length ? "ready" : readyCount > 0 ? "warning" : "missing";

  return {
    status,
    checkedAt: new Date().toISOString(),
    readyCount,
    total: results.length,
    apps: results
  };
}

function smokeRequestForApp(appKey) {
  const sessionId = `portal-smoke-${appKey}-${Date.now()}`;
  const requests = {
    "retail-copilot": {
      url: sampleAppRuntimeCatalog["retail-copilot"].smokeUrl,
      body: {
        sessionId,
        userId: "leadership-demo-user",
        message: sampleAppRuntimeCatalog["retail-copilot"].smokePrompt
      }
    },
    "creative-writer": {
      url: sampleAppRuntimeCatalog["creative-writer"].smokeUrl,
      body: {
        sessionId,
        userId: "leadership-demo-user",
        topic: sampleAppRuntimeCatalog["creative-writer"].smokePrompt,
        audience: "HR leaders and employee communications team",
        tone: "executive",
        regulatedTerms: "guaranteed"
      }
    },
    "app-service-ai": {
      url: sampleAppRuntimeCatalog["app-service-ai"].smokeUrl,
      body: {
        sessionId,
        userId: "leadership-demo-user",
        prompt: sampleAppRuntimeCatalog["app-service-ai"].smokePrompt,
        lineId: "lineA",
        priority: "high",
        approvalGranted: false
      }
    }
  };
  return requests[appKey];
}

function evaluateSmokeResponse(appKey, body) {
  if (appKey === "retail-copilot") {
    return {
      passed: body.status === "ok" && Boolean(body.answer) && Array.isArray(body.sources) && body.sources.length > 0,
      signal: `${body.sources?.length || 0} source(s), ${body.followUps?.length || 0} follow-up(s)`
    };
  }
  if (appKey === "creative-writer") {
    return {
      passed: body.status === "ok" && Array.isArray(body.agents) && body.agents.length >= 3,
      signal: `${body.agents?.length || 0} agent pass(es), summary ${body.summary?.status || "unknown"}`
    };
  }
  if (appKey === "app-service-ai") {
    return {
      passed:
        ["ok", "needs-approval"].includes(body.status) &&
        Array.isArray(body.toolCalls) &&
        body.toolCalls.some((call) => ["approval-required", "completed"].includes(call.status)),
      signal: `${body.toolCalls?.length || 0} tool call(s), approval required: ${Boolean(body.governance?.approvalRequired)}`
    };
  }
  return { passed: false, signal: "No evaluator configured." };
}

function pushSmokeHistory(result) {
  smokeHistory.unshift(result);
  if (smokeHistory.length > 25) {
    smokeHistory.pop();
  }
}

async function runSingleSampleSmokeTest(app) {
  const startedAt = Date.now();
  const request = smokeRequestForApp(app.key);
  if (!request) {
    return {
      ...publicSampleAppRuntime(app),
      status: "failed",
      passed: false,
      message: "No smoke request configured for this sample app."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(request.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(request.body)
    });
    const body = await response.json().catch(() => ({}));
    const evaluation = evaluateSmokeResponse(app.key, body);
    return {
      ...publicSampleAppRuntime(app),
      status: response.ok && evaluation.passed ? "passed" : "failed",
      passed: response.ok && evaluation.passed,
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      prompt: app.smokePrompt,
      expectedSignal: app.expectedSignal,
      observedSignal: evaluation.signal,
      usage: body.usage || null,
      trace: {
        mode: body.mode || "unknown",
        toolCalls: body.toolCalls?.map((call) => ({ name: call.name, status: call.status })) || [],
        agents: body.agents?.map((agent) => ({ role: agent.role, status: agent.status })) || [],
        sources: body.sources?.map((source) => ({ id: source.id, title: source.title })) || []
      },
      message: response.ok ? "Smoke test completed." : body.message || "Smoke endpoint returned an error."
    };
  } catch (error) {
    return {
      ...publicSampleAppRuntime(app),
      status: "failed",
      passed: false,
      durationMs: Date.now() - startedAt,
      prompt: app.smokePrompt,
      expectedSignal: app.expectedSignal,
      observedSignal: "No response from local app.",
      message:
        error.name === "AbortError"
          ? "Timed out waiting for the local smoke endpoint."
          : `Smoke test failed: ${error.message}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSampleSmokeTests(appKey = "") {
  const apps = appKey
    ? [sampleAppRuntimeCatalog[appKey]].filter(Boolean)
    : Object.values(sampleAppRuntimeCatalog);

  if (!apps.length) {
    throw new Error(`Unknown sample app "${appKey}".`);
  }

  const results = await Promise.all(apps.map((app) => runSingleSampleSmokeTest(app)));
  const passedCount = results.filter((item) => item.passed).length;
  const result = {
    status: passedCount === results.length ? "passed" : passedCount > 0 ? "warning" : "failed",
    ranAt: new Date().toISOString(),
    passedCount,
    total: results.length,
    results
  };
  pushSmokeHistory(result);
  return result;
}

function checkDockerAvailability() {
  return new Promise((resolve) => {
    const child = execFile("docker", ["--version"], { timeout: 2500 }, (error, stdout) => {
      if (error) {
        resolve({
          status: "missing",
          detail: "Docker CLI is not available in this shell, so local image builds cannot be executed here."
        });
        return;
      }
      resolve({
        status: "passed",
        detail: stdout.trim() || "Docker CLI is available."
      });
    });
    child.on("error", () => {
      resolve({
        status: "missing",
        detail: "Docker CLI is not available in this shell, so local image builds cannot be executed here."
      });
    });
  });
}

function readinessStatusFromChecks(checks) {
  if (checks.some((check) => ["blocked", "failed", "missing"].includes(check.status))) return "blocked";
  if (checks.some((check) => ["warning", "not-run", "required-at-deploy"].includes(check.status))) return "warning";
  return "passed";
}

function readinessCheck(area, name, status, detail, action = "") {
  return { area, name, status, detail, action };
}

function summarizeReadiness(checks) {
  const blocked = checks.filter((check) => ["blocked", "failed", "missing"].includes(check.status)).length;
  const warnings = checks.filter((check) => ["warning", "not-run", "required-at-deploy"].includes(check.status)).length;
  const passed = checks.filter((check) => check.status === "passed").length;
  return { passed, warnings, blocked, total: checks.length };
}

function buildAppUrlPlaceholders(env) {
  const prefix = env.RESOURCE_PREFIX || "msfoundryv1";
  const rows = Object.values(workloadAppCatalog).map((app) => {
    const local = sampleAppRuntimeCatalog[app.key]?.localUrl || "";
    const businessUnit = app.defaultBusinessUnit;
    const baseName = toAzureHyphenName(`${toAzureHyphenName(prefix, 20)}-${businessUnit}-${app.slug}`, 28);
    const urls = {};
    for (const environment of ["dev", "test", "prod"]) {
      const resourceName = toAzureHyphenName(`${baseName}-${environment}`, 32);
      urls[environment] =
        app.targetHost === "app-service"
          ? `https://${resourceName}.azurewebsites.net`
          : `https://${resourceName}.<container-apps-domain>`;
    }
    return {
      appKey: app.key,
      appName: app.name,
      local,
      dev: urls.dev,
      test: urls.test,
      prod: urls.prod,
      note: "Azure URL becomes live only after workload deployment."
    };
  });
  return rows;
}

function buildLocalImageArchiveList(env) {
  const configuredPath = env.LOCAL_IMAGE_ARCHIVE_PATH || "";
  const defaults = [
    {
      appKey: "retail-copilot",
      path: "artifacts/images/retail-copilot/dev/contoso-retail-copilot-dev.tar"
    },
    {
      appKey: "creative-writer",
      path: "artifacts/images/creative-writer/dev/contoso-creative-writer-dev.tar"
    },
    {
      appKey: "app-service-ai",
      path: "artifacts/images/app-service-ai/dev/azure-app-service-ai-scenario-dev.tar"
    }
  ];
  const archives = defaults.map((item) => {
    const absolutePath = path.isAbsolute(item.path) ? item.path : path.join(__dirname, item.path);
    return {
      ...item,
      exists: existsSync(absolutePath),
      absolutePath
    };
  });
  if (configuredPath) {
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(__dirname, configuredPath);
    archives.unshift({
      appKey: "configured",
      path: configuredPath,
      exists: existsSync(absolutePath),
      absolutePath
    });
  }
  return archives;
}

async function safeAzureReadinessCheck(name, action) {
  try {
    const result = await action();
    return { name, status: "passed", result };
  } catch (error) {
    return { name, status: "failed", message: error.message };
  }
}

async function buildReadinessReport({ includeAzure = false } = {}) {
  const env = await loadProjectEnv();
  const safeConfig = toSafeConfig(env);
  const [sampleHealth, docker] = await Promise.all([
    checkSampleAppsHealth().catch((error) => ({
      status: "failed",
      readyCount: 0,
      total: Object.keys(sampleAppRuntimeCatalog).length,
      message: error.message,
      apps: []
    })),
    checkDockerAvailability()
  ]);
  const latestSmoke = smokeHistory[0] || null;
  const latestSmokePassed = latestSmoke?.status === "passed";
  const workloadImageConfigs = getWorkloadImageConfigs(env);
  const workloadImageConfiguredCount = workloadImageConfigs.filter((item) => item.configured).length;
  const workloadImageStatus =
    workloadImageConfiguredCount === workloadImageConfigs.length
      ? "passed"
      : workloadImageConfiguredCount > 0
        ? "warning"
        : "missing";
  const workloadImageDetail =
    workloadImageConfiguredCount > 0
      ? `${workloadImageConfiguredCount}/${workloadImageConfigs.length} workload image reference(s) configured: ${workloadImageConfigs
          .filter((item) => item.configured)
          .map((item) => `${item.appKey} via ${item.source}`)
          .join(", ")}.`
      : "No workload image references are set. Azure workload deployment needs registry images Azure can pull.";
  const localImageArchives = buildLocalImageArchiveList(env);
  const localArchiveCount = localImageArchives.filter((item) => item.exists).length;
  const workloadDeploymentEnabled = env.ENABLE_WORKLOAD_DEPLOYMENT === "true";
  const realModelCallsEnabled = env.ENABLE_REAL_MODEL_CALLS === "true";

  const checks = [
    readinessCheck(
      "Local demo",
      "Local sample app health",
      sampleHealth.status === "ready" ? "passed" : "warning",
      `${sampleHealth.readyCount || 0}/${sampleHealth.total || 3} local apps are responding.`,
      "Use Check All Local Apps if this is not current."
    ),
    readinessCheck(
      "Local demo",
      "Latest smoke tests",
      latestSmokePassed ? "passed" : "warning",
      latestSmoke ? `${latestSmoke.passedCount}/${latestSmoke.total} smoke tests passed.` : "No smoke test run has been captured since portal restart.",
      "Run All Smoke Tests from Readiness or Test Guide."
    ),
    readinessCheck(
      "Packaging",
      "Docker CLI",
      docker.status,
      docker.detail,
      "Install/start Docker Desktop before local image builds, or rely on CI image builds."
    ),
    readinessCheck(
      "Packaging",
      "Local image archive",
      localArchiveCount > 0 ? "passed" : "warning",
      localArchiveCount > 0
        ? `${localArchiveCount} local image archive(s) found under artifacts/images or LOCAL_IMAGE_ARCHIVE_PATH.`
        : "No local image archive found yet. Run npm run image:retail:save when Docker is available.",
      "Useful for local/offline packaging review only; Azure still needs a registry image reference."
    ),
    readinessCheck(
      "Packaging",
      "Registry image reference",
      workloadImageStatus,
      workloadImageDetail,
      "Push images to GHCR or ACR and set WORKLOAD_IMAGE_<APP_KEY> for each workload."
    ),
    readinessCheck(
      "Governance",
      "Token limits",
      "passed",
      `Request ${safeConfig.governance.tokenLimitPerRequest}, session ${safeConfig.governance.tokenLimitPerSession}, user/day ${safeConfig.governance.tokenLimitPerUserDaily}.`,
      "Keep limits conservative before enabling real models."
    ),
    readinessCheck(
      "Governance",
      "Model call mode",
      realModelCallsEnabled ? "warning" : "passed",
      realModelCallsEnabled
        ? "ENABLE_REAL_MODEL_CALLS=true. Real inference can incur model charges."
        : "Mock mode is active. No LLM calls are made by local sample apps.",
      "Verify current model pricing before enabling real calls."
    ),
    readinessCheck(
      "Deployment",
      "Workload deployment switch",
      workloadDeploymentEnabled ? "warning" : "missing",
      workloadDeploymentEnabled
        ? "ENABLE_WORKLOAD_DEPLOYMENT=true. Portal deploy buttons can submit Azure workload deployments after confirmation."
        : "ENABLE_WORKLOAD_DEPLOYMENT=false. Azure workload deployment remains blocked.",
      "Turn on only after image, budget, and teardown readiness are confirmed."
    ),
    readinessCheck(
      "Teardown",
      "Teardown rehearsal",
      "passed",
      "Platform Core and workload teardown flows require typed confirmation and deletion acknowledgement.",
      "Use the Teardown tab to rehearse what will be removed and what remains."
    ),
    readinessCheck(
      "Billing",
      "Billing acknowledgement",
      "required-at-deploy",
      "Any Azure workload deploy still requires explicit acknowledgement because hosting, telemetry, model inference, and storage can incur charges.",
      "Review billing and teardown before clicking deploy."
    )
  ];

  const azure = {
    included: includeAzure,
    checks: []
  };

  if (includeAzure) {
    const azureChecks = await Promise.all([
      safeAzureReadinessCheck("Azure prerequisites", runPrerequisiteChecks),
      safeAzureReadinessCheck("Foundation status", checkFoundationStatus),
      safeAzureReadinessCheck("Dev Platform Core status", () => checkPlatformCoreStatus("dev")),
      safeAzureReadinessCheck("Month-to-date billing", fetchMonthToDateBilling)
    ]);
    azure.checks = azureChecks;
    for (const item of azureChecks) {
      let status = item.status;
      let detail = item.status === "passed" ? "Read-only Azure check completed." : item.message;
      if (item.name === "Dev Platform Core status" && item.result?.status !== "ready") {
        status = "warning";
        detail = `Dev Core status is ${item.result?.status || "unknown"}.`;
      }
      if (item.name === "Foundation status" && item.result?.status !== "ready") {
        status = "warning";
        detail = `Foundation status is ${item.result?.status || "unknown"}.`;
      }
      if (item.name === "Month-to-date billing" && item.result?.status === "ok") {
        detail = `${item.result.currency || ""} ${Number(item.result.amount || 0).toFixed(2)} month-to-date.`;
      }
      checks.push(readinessCheck("Azure read-only", item.name, status, detail, "No resources are created by this check."));
    }
  } else {
    checks.push(
      readinessCheck(
        "Azure read-only",
        "Azure preflight",
        "not-run",
        "Full Azure read-only preflight has not been run in this report.",
        "Run Full Readiness Check before deploying workloads."
      )
    );
  }

  const summary = summarizeReadiness(checks);
  const status = readinessStatusFromChecks(checks);
  return {
    status,
    asOf: new Date().toISOString(),
    summary,
    verdict:
      status === "passed"
        ? "Ready for a controlled Dev workload deployment after final human approval."
        : status === "warning"
          ? "Mostly ready, but review warnings before deployment."
          : "No-Go for Azure workload deployment until blockers are cleared.",
    checks,
    azure,
    sampleHealth,
    latestSmoke,
    docker,
    urlPlaceholders: buildAppUrlPlaceholders(env),
    packaging: {
      registryStrategy: env.IMAGE_REGISTRY_STRATEGY || "ghcr",
      workloadImageReference: env.WORKLOAD_IMAGE_REFERENCE || "",
      workloadImageReferences: workloadImageConfigs,
      localImageArchives,
      buildCommands: [
        "npm run docker:retail",
        "npm run docker:writer",
        "npm run docker:appservice"
      ],
      archiveCommands: [
        "npm run image:retail:save",
        "npm run image:writer:save",
        "npm run image:appservice:save"
      ],
      manifestCommands: [
        "npm run manifest:retail:dev",
        "npm run manifest:writer:dev",
        "npm run manifest:appservice:dev"
      ]
    }
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/state" && request.method === "GET") {
      const env = await loadProjectEnv();
      sendJson(response, { config: toSafeConfig(env), activity });
      return;
    }

    if (url.pathname === "/api/iac/foundation/plan" && request.method === "GET") {
      const env = await loadProjectEnv();
      const plan = buildFoundationPlan(env);
      log(
        "info",
        `Generated foundation IaC plan with ${plan.totals.resourceGroups} resource groups.`
      );
      sendJson(response, plan);
      return;
    }

    if (url.pathname === "/api/iac/foundation/status" && request.method === "GET") {
      try {
        const result = await checkFoundationStatus();
        sendJson(response, result);
      } catch (error) {
        log("error", "Foundation status check failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 500);
      }
      return;
    }

    if (url.pathname === "/api/iac/foundation/what-if" && request.method === "POST") {
      try {
        const result = await runFoundationWhatIf();
        sendJson(response, result);
      } catch (error) {
        log("error", "Foundation what-if failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 500);
      }
      return;
    }

    if (url.pathname === "/api/iac/foundation/deploy" && request.method === "POST") {
      try {
        const payload = await readRequestJson(request);
        const result = await deployFoundation(payload);
        sendJson(response, result);
      } catch (error) {
        const missingConfirmation = error.message.includes("Deployment confirmation is required");
        log(
          missingConfirmation ? "warn" : "error",
          missingConfirmation
            ? "Foundation deployment request rejected because confirmation was missing."
            : "Foundation deployment failed.",
          error.message
        );
        sendJson(response, { status: "failed", message: error.message }, missingConfirmation ? 400 : 500);
      }
      return;
    }

    const platformCoreMatch = url.pathname.match(
      /^\/api\/iac\/platform-core\/(dev|test|prod)\/(plan|status|what-if|deploy|teardown)$/
    );
    if (platformCoreMatch) {
      const [, environmentKey, action] = platformCoreMatch;

      if (action === "plan" && request.method === "GET") {
        const env = await loadProjectEnv();
        const plan = buildPlatformCorePlan(env, environmentKey);
        log(
          "info",
          `Generated ${plan.environmentName} platform core plan with ${plan.totals.resources} resources.`
        );
        sendJson(response, plan);
        return;
      }

      if (action === "status" && request.method === "GET") {
        try {
          const result = await checkPlatformCoreStatus(environmentKey);
          sendJson(response, result);
        } catch (error) {
          log("error", `${environmentKey} platform core status check failed.`, error.message);
          sendJson(response, { status: "failed", message: error.message }, 500);
        }
        return;
      }

      if (action === "what-if" && request.method === "POST") {
        try {
          const result = await runPlatformCoreWhatIf(environmentKey);
          sendJson(response, result);
        } catch (error) {
          log("error", `${environmentKey} platform core what-if failed.`, error.message);
          sendJson(response, { status: "failed", message: error.message }, 500);
        }
        return;
      }

      if (action === "deploy" && request.method === "POST") {
        try {
          const payload = await readRequestJson(request);
          const result = await deployPlatformCore(environmentKey, payload);
          sendJson(response, result);
        } catch (error) {
          const guardrailError =
            error.message.includes("Deployment confirmation is required") ||
            error.message.includes("Billing acknowledgement is required");
          log(
            guardrailError ? "warn" : "error",
            guardrailError
              ? `${environmentKey} platform core deployment request rejected because a guardrail was missing.`
              : `${environmentKey} platform core deployment failed.`,
            error.message
          );
          sendJson(response, { status: "failed", message: error.message }, guardrailError ? 400 : 500);
        }
        return;
      }

      if (action === "teardown" && request.method === "POST") {
        try {
          const payload = await readRequestJson(request);
          const result = await teardownPlatformCore(environmentKey, payload);
          sendJson(response, result);
        } catch (error) {
          const guardrailError =
            error.message.includes("Deletion confirmation is required") ||
            error.message.includes("Deletion acknowledgement is required");
          log(
            guardrailError ? "warn" : "error",
            guardrailError
              ? `${environmentKey} platform core teardown request rejected because a guardrail was missing.`
              : `${environmentKey} platform core teardown failed.`,
            error.message
          );
          sendJson(response, { status: "failed", message: error.message }, guardrailError ? 400 : 500);
        }
        return;
      }

      sendJson(response, { status: "failed", message: "Method not allowed for platform core action." }, 405);
      return;
    }

    if (url.pathname === "/api/iac/workloads/plan" && request.method === "GET") {
      try {
        const env = await loadProjectEnv();
        const plan = buildWorkloadPlan(env, {
          environment: url.searchParams.get("environment") || "dev",
          businessUnit: url.searchParams.get("businessUnit") || "finance",
          app: url.searchParams.get("app") || "retail-copilot"
        });
        log(
          "info",
          `Generated workload plan for ${plan.businessUnit.name} ${plan.app.name} in ${plan.environment.name}.`
        );
        sendJson(response, plan);
      } catch (error) {
        log("error", "Workload plan generation failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 400);
      }
      return;
    }

    const workloadMatch = url.pathname.match(
      /^\/api\/iac\/workloads\/(dev|test|prod)\/(finance|hr|manufacturing)\/(retail-copilot|creative-writer|app-service-ai)\/(status|what-if|deploy|teardown)$/
    );
    if (workloadMatch) {
      const [, environment, businessUnit, app, action] = workloadMatch;
      const options = { environment, businessUnit, app };

      if (action === "status" && request.method === "GET") {
        try {
          const result = await checkWorkloadStatus(options);
          sendJson(response, result);
        } catch (error) {
          log("error", "Workload status check failed.", error.message);
          sendJson(response, { status: "failed", message: error.message }, 500);
        }
        return;
      }

      if (action === "what-if" && request.method === "POST") {
        try {
          const result = await runWorkloadWhatIf(options);
          sendJson(response, result);
        } catch (error) {
          log("error", "Workload what-if failed.", error.message);
          sendJson(response, { status: "failed", message: error.message }, 500);
        }
        return;
      }

      if (action === "deploy" && request.method === "POST") {
        try {
          const payload = await readRequestJson(request);
          const result = await deployWorkload(options, payload);
          sendJson(response, result);
        } catch (error) {
          const guardrailError =
            error.message.includes("Deployment confirmation is required") ||
            error.message.includes("Billing acknowledgement is required") ||
            error.message.includes("Workload deployment is disabled") ||
            error.message.includes("Workload deployment is deferred");
          log(
            guardrailError ? "warn" : "error",
            guardrailError
              ? "Workload deployment request rejected because a guardrail was missing."
              : "Workload deployment failed.",
            error.message
          );
          sendJson(response, { status: "failed", message: error.message }, guardrailError ? 400 : 500);
        }
        return;
      }

      if (action === "teardown" && request.method === "POST") {
        try {
          const payload = await readRequestJson(request);
          const result = await teardownWorkload(options, payload);
          sendJson(response, result);
        } catch (error) {
          const guardrailError =
            error.message.includes("Deletion confirmation is required") ||
            error.message.includes("Deletion acknowledgement is required");
          log(
            guardrailError ? "warn" : "error",
            guardrailError
              ? "Workload teardown request rejected because a guardrail was missing."
              : "Workload teardown failed.",
            error.message
          );
          sendJson(response, { status: "failed", message: error.message }, guardrailError ? 400 : 500);
        }
        return;
      }

      sendJson(response, { status: "failed", message: "Method not allowed for workload action." }, 405);
      return;
    }

    if (url.pathname === "/api/sample-apps/status" && request.method === "GET") {
      try {
        const appKey = url.searchParams.get("app") || "";
        const result = await checkSampleAppsHealth(appKey);
        const scope = appKey ? sampleAppRuntimeCatalog[appKey]?.name || appKey : "all local sample apps";
        log(
          result.status === "ready" ? "success" : "warn",
          `Checked local sample app health for ${scope}: ${result.readyCount}/${result.total} ready.`
        );
        sendJson(response, result);
      } catch (error) {
        log("error", "Local sample app health check failed.", error.message);
        sendJson(response, { status: "failed", message: error.message, apps: [] }, 400);
      }
      return;
    }

    if (url.pathname === "/api/sample-apps/smoke" && request.method === "POST") {
      try {
        const payload = await readRequestJson(request);
        const appKey = payload.app || "";
        const result = await runSampleSmokeTests(appKey);
        const scope = appKey ? sampleAppRuntimeCatalog[appKey]?.name || appKey : "all local sample apps";
        log(
          result.status === "passed" ? "success" : "warn",
          `Ran local smoke tests for ${scope}: ${result.passedCount}/${result.total} passed.`
        );
        sendJson(response, result);
      } catch (error) {
        log("error", "Local sample app smoke test failed.", error.message);
        sendJson(response, { status: "failed", message: error.message, results: [] }, 400);
      }
      return;
    }

    if (url.pathname === "/api/sample-apps/eval-report" && request.method === "GET") {
      sendJson(response, {
        status: smokeHistory[0]?.status || "not-run",
        generatedAt: new Date().toISOString(),
        latest: smokeHistory[0] || null,
        history: smokeHistory
      });
      return;
    }

    if (url.pathname === "/api/readiness/report" && request.method === "GET") {
      try {
        const includeAzure = url.searchParams.get("includeAzure") === "true";
        const result = await buildReadinessReport({ includeAzure });
        log(
          result.status === "blocked" ? "warn" : result.status === "passed" ? "success" : "info",
          `Generated ${includeAzure ? "full" : "local"} readiness report: ${result.verdict}`
        );
        sendJson(response, result);
      } catch (error) {
        log("error", "Readiness report failed.", error.message);
        sendJson(response, { status: "failed", message: error.message, checks: [] }, 500);
      }
      return;
    }

    if (url.pathname === "/api/governance/limits/plan" && request.method === "GET") {
      const env = await loadProjectEnv();
      const plan = buildGovernancePlan(env);
      log(
        "info",
        `Generated governance limits plan with ${plan.tokenLimits.length} token controls and ${plan.budgetControls.length} budget thresholds.`
      );
      sendJson(response, plan);
      return;
    }

    if (url.pathname === "/api/prerequisites" && request.method === "POST") {
      try {
        const result = await runPrerequisiteChecks();
        sendJson(response, result);
      } catch (error) {
        log("error", "Azure prerequisite validation failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 500);
      }
      return;
    }

    if (url.pathname === "/api/billing/mtd" && request.method === "POST") {
      try {
        const result = await fetchMonthToDateBilling();
        sendJson(response, result);
      } catch (error) {
        log("error", "Month-to-date billing query failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 500);
      }
      return;
    }

    if (url.pathname === "/api/providers/register" && request.method === "POST") {
      try {
        const payload = await readRequestJson(request);
        const result = await registerResourceProvider(payload.namespace || "Microsoft.App");
        sendJson(response, result);
      } catch (error) {
        log("error", "Azure provider registration failed.", error.message);
        sendJson(response, { status: "failed", message: error.message }, 500);
      }
      return;
    }

    if (url.pathname === "/api/activity" && request.method === "POST") {
      const payload = await readRequestJson(request);
      const entry = log(payload.level || "info", payload.message || "Activity recorded.");
      sendJson(response, entry);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    log("error", "Unhandled server error.", error.message);
    sendJson(response, { error: error.message }, 500);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`MSFoundryProject-v1 portal running at http://127.0.0.1:${port}`);
});
