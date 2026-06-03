const tabs = [
  { id: "overview", label: "Overview" },
  { id: "readiness", label: "Readiness" },
  { id: "azure", label: "Azure Setup" },
  { id: "blueprint", label: "Platform Blueprint" },
  { id: "environments", label: "Environments" },
  { id: "business-units", label: "Business Units" },
  { id: "apps", label: "Agentic Apps" },
  { id: "cicd", label: "CI/CD" },
  { id: "governance", label: "Governance" },
  { id: "activity", label: "Activity Log" },
  { id: "testing", label: "Test Guide" },
  { id: "demo-script", label: "Demo Script" },
  { id: "teardown", label: "Teardown" }
];

const appState = {
  activeTab: "overview",
  config: null,
  activity: [],
  prerequisiteResult: null,
  providerRegistrationResult: null,
  providerRegisterBusy: false,
  foundationPlan: null,
  foundationPlanBusy: false,
  foundationWhatIf: null,
  foundationWhatIfBusy: false,
  foundationDeployment: null,
  foundationDeployBusy: false,
  foundationStatus: null,
  foundationStatusBusy: false,
  platformCorePlan: null,
  platformCorePlanBusy: false,
  platformCoreWhatIf: null,
  platformCoreWhatIfBusy: false,
  platformCoreStatus: null,
  platformCoreStatusBusy: false,
  platformCoreDeployment: null,
  platformCoreDeployBusy: false,
  platformCoreTeardown: null,
  platformCoreTeardownBusy: false,
  platformCoreEnvironment: "dev",
  workloadPlan: null,
  workloadPlanBusy: false,
  workloadSelection: {
    environment: "dev",
    businessUnit: "finance",
    app: "retail-copilot"
  },
  workloadStatus: null,
  workloadStatusBusy: false,
  workloadWhatIf: null,
  workloadWhatIfBusy: false,
  workloadDeployment: null,
  workloadDeployBusy: false,
  workloadTeardown: null,
  workloadTeardownBusy: false,
  governancePlan: null,
  governancePlanBusy: false,
  sampleAppHealth: null,
  sampleAppHealthBusy: false,
  sampleSmokeResult: null,
  sampleSmokeBusy: false,
  readinessReport: null,
  readinessBusy: false,
  billingResult: null,
  billingBusy: false,
  busy: false
};

const sampleApps = [
  {
    key: "retail-copilot",
    name: "Contoso Chat Retail Copilot",
    type: "RAG copilot",
    target: "Azure Container Apps",
    defaultBusinessUnit: "finance",
    proves: "Search-grounded conversational assistant for business data.",
    localUrl: "http://127.0.0.1:4611",
    startCommand: "npm run start:retail",
    smokePrompt: "Tell me about waterproof tents for a family camping trip and explain why you recommend them.",
    expectedSignal: "Returns a grounded retail answer with product context and a practical recommendation."
  },
  {
    key: "creative-writer",
    name: "Contoso Creative Writer",
    type: "Multi-agent workflow",
    target: "Azure Container Apps",
    defaultBusinessUnit: "hr",
    proves: "Coordinated agent roles, prompt assets, review loops, and model choice.",
    localUrl: "http://127.0.0.1:4612",
    startCommand: "npm run start:writer",
    smokePrompt: "Draft a launch article for a sustainable outdoor backpack, then ask the editor agent to improve clarity.",
    expectedSignal: "Shows writer, reviewer, and compliance agent outputs with estimated token usage."
  },
  {
    key: "app-service-ai",
    name: "Azure App Service AI Scenario",
    type: "Tool-using agent",
    target: "Azure App Service",
    defaultBusinessUnit: "manufacturing",
    proves: "Foundry agent calling enterprise application APIs as tools.",
    localUrl: "http://127.0.0.1:4613",
    startCommand: "npm run start:appservice",
    smokePrompt: "Create three high-priority onboarding tasks and mark the policy review complete.",
    expectedSignal: "Displays tool trace, created tasks, and an approval-required policy decision."
  }
];

const deploymentStages = [
  {
    name: "Source",
    detail: "Team starts from golden path repo template with agent, prompts, tests, and IaC."
  },
  {
    name: "Build",
    detail: "CI builds a versioned container image and packages AI artifacts once."
  },
  {
    name: "Dev",
    detail: "Deploy to Dev, run smoke tests, prompt checks, and low-cost model validation."
  },
  {
    name: "Test",
    detail: "Promote the same artifact, run eval gates, security checks, and business review."
  },
  {
    name: "Prod",
    detail: "Manual approval deploys to Prod with monitoring, budgets, and rollback enabled."
  }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `Request failed with HTTP ${response.status}`);
  }
  return body;
}

async function loadState() {
  const state = await api("/api/state");
  appState.config = state.config;
  appState.activity = state.activity || [];
}

async function recordActivity(message, level = "info") {
  try {
    const entry = await api("/api/activity", {
      method: "POST",
      body: JSON.stringify({ message, level })
    });
    appState.activity.unshift(entry);
  } catch {
    appState.activity.unshift({
      time: new Date().toISOString(),
      level,
      message
    });
  }
}

function statusPill(status, label = status) {
  return `<span class="status ${escapeHtml(String(status).toLowerCase())}">${escapeHtml(label)}</span>`;
}

function sampleAppHealthFor(appKey) {
  return (appState.sampleAppHealth?.apps || []).find((item) => item.key === appKey);
}

function sampleAppStatus(appKey) {
  const health = sampleAppHealthFor(appKey);
  if (!health) {
    return statusPill("notchecked", "Not checked");
  }
  const label = health.status === "ready" ? "Running" : health.status === "missing" ? "Stopped" : health.status;
  return statusPill(health.status, label);
}

function platformCoreActions(environmentKey = "dev", compact = false) {
  const label = envLabel(environmentKey);
  return `
    <div class="inline-actions platform-core-actions" ${compact ? 'style="margin-top: 12px; justify-content: flex-start;"' : ""}>
      <button class="btn" data-action="load-platform-core-plan" data-env="${escapeHtml(environmentKey)}" ${appState.platformCorePlanBusy ? "disabled" : ""}>${
        appState.platformCorePlanBusy ? `Building ${label} plan...` : `Preview ${label} Core`
      }</button>
      <button class="btn primary" data-action="run-platform-core-what-if" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreWhatIfBusy ? "disabled" : ""}>${
        appState.platformCoreWhatIfBusy ? `Running ${label} what-if...` : `What-if ${label} Core`
      }</button>
      <button class="btn" data-action="check-platform-core-status" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreStatusBusy ? "disabled" : ""}>${
        appState.platformCoreStatusBusy ? "Checking..." : "Check Status"
      }</button>
      <button class="btn deploy" data-action="deploy-platform-core" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreDeployBusy ? "disabled" : ""}>${
        appState.platformCoreDeployBusy ? "Deploying..." : `Deploy ${label} Core`
      }</button>
      <button class="btn danger" data-action="teardown-platform-core" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreTeardownBusy ? "disabled" : ""}>${
        appState.platformCoreTeardownBusy ? "Deleting..." : `Teardown ${label} Core`
      }</button>
    </div>
  `;
}

function platformCoreTeardownActions(environmentKey = "dev") {
  const label = envLabel(environmentKey);
  return `
    <div class="inline-actions platform-core-actions" style="margin-top: 14px; justify-content: flex-start;">
      <button class="btn" data-action="check-platform-core-status" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreStatusBusy ? "disabled" : ""}>${
        appState.platformCoreStatusBusy ? "Checking..." : `Check ${label} Core Status`
      }</button>
      <button class="btn danger" data-action="teardown-platform-core" data-env="${escapeHtml(environmentKey)}" ${appState.platformCoreTeardownBusy ? "disabled" : ""}>${
        appState.platformCoreTeardownBusy ? "Deleting..." : `Teardown ${label} Core`
      }</button>
    </div>
  `;
}

function renderShell() {
  const cfg = appState.config;
  document.title = "MS Foundry Project v1";
  document.querySelector("#app").innerHTML = `
    <header class="topbar">
      <div class="brand-block">
        <p class="eyebrow">Enterprise AI Platform Demo</p>
        <h1>Microsoft Foundry Platform Provisioner</h1>
        <p class="subtle">Deploy, promote, observe, and clean up agentic applications across business units and environments.</p>
      </div>
      <div class="top-actions">
        <button class="btn" data-action="reload">Reload .env</button>
        <button class="btn primary" data-action="validate">Run Prerequisite Check</button>
      </div>
    </header>
    <div class="layout">
      <nav class="tabs" aria-label="Portal sections">
        ${tabs
          .map(
            (tab) => `
              <button class="tab-button ${tab.id === appState.activeTab ? "active" : ""}" data-tab="${tab.id}">
                ${escapeHtml(tab.label)}
              </button>
            `
          )
          .join("")}
      </nav>
      <main class="content">
        ${renderActivePanel(cfg)}
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.activeTab = button.dataset.tab;
      renderShell();
    });
  });

  document.querySelector('[data-action="reload"]')?.addEventListener("click", async () => {
    appState.busy = true;
    renderShell();
    await loadState();
    await recordActivity("Reloaded sanitized project configuration from .env.", "info");
    appState.busy = false;
    renderShell();
  });

  document.querySelector('[data-action="validate"]')?.addEventListener("click", runValidation);
  document.querySelector('[data-action="billing"]')?.addEventListener("click", fetchBilling);
  document
    .querySelector('[data-action="register-provider"]')
    ?.addEventListener("click", registerMicrosoftAppProvider);
  document
    .querySelector('[data-action="load-foundation-plan"]')
    ?.addEventListener("click", loadFoundationPlan);
  document
    .querySelector('[data-action="run-foundation-what-if"]')
    ?.addEventListener("click", runFoundationWhatIf);
  document
    .querySelector('[data-action="deploy-foundation"]')
    ?.addEventListener("click", deployFoundation);
  document
    .querySelector('[data-action="check-foundation-status"]')
    ?.addEventListener("click", checkFoundationStatus);
  document.querySelectorAll('[data-action="load-platform-core-plan"]').forEach((button) => {
    button.addEventListener("click", () => loadPlatformCorePlan(button.dataset.env || "dev"));
  });
  document.querySelectorAll('[data-action="run-platform-core-what-if"]').forEach((button) => {
    button.addEventListener("click", () => runPlatformCoreWhatIf(button.dataset.env || "dev"));
  });
  document.querySelectorAll('[data-action="check-platform-core-status"]').forEach((button) => {
    button.addEventListener("click", () => checkPlatformCoreStatus(button.dataset.env || "dev"));
  });
  document.querySelectorAll('[data-action="deploy-platform-core"]').forEach((button) => {
    button.addEventListener("click", () => deployPlatformCore(button.dataset.env || "dev"));
  });
  document.querySelectorAll('[data-action="teardown-platform-core"]').forEach((button) => {
    button.addEventListener("click", () => teardownPlatformCore(button.dataset.env || "dev"));
  });
  document.querySelectorAll("[data-workload-select]").forEach((select) => {
    select.addEventListener("change", () => {
      appState.workloadSelection = {
        ...appState.workloadSelection,
        [select.dataset.workloadSelect]: select.value
      };
      renderShell();
    });
  });
  document.querySelector('[data-action="load-workload-plan"]')?.addEventListener("click", () => {
    loadWorkloadPlan();
  });
  document.querySelector('[data-action="load-governance-plan"]')?.addEventListener("click", () => {
    loadGovernancePlan();
  });
  document.querySelectorAll('[data-action="quick-workload-plan"]').forEach((button) => {
    button.addEventListener("click", () => {
      loadWorkloadPlan({
        app: button.dataset.app || appState.workloadSelection.app,
        businessUnit: button.dataset.businessUnit || appState.workloadSelection.businessUnit
      });
    });
  });
  document.querySelector('[data-action="check-workload-status"]')?.addEventListener("click", () => {
    checkWorkloadStatus();
  });
  document.querySelector('[data-action="run-workload-what-if"]')?.addEventListener("click", () => {
    runWorkloadWhatIf();
  });
  document.querySelector('[data-action="deploy-workload"]')?.addEventListener("click", () => {
    deployWorkload();
  });
  document.querySelector('[data-action="teardown-workload"]')?.addEventListener("click", () => {
    teardownWorkload();
  });
  document.querySelector('[data-action="check-sample-apps"]')?.addEventListener("click", () => {
    checkSampleApps();
  });
  document.querySelectorAll('[data-action="check-sample-app"]').forEach((button) => {
    button.addEventListener("click", () => {
      checkSampleApps(button.dataset.app || "");
    });
  });
  document.querySelector('[data-action="run-sample-smoke-tests"]')?.addEventListener("click", () => {
    runSampleSmokeTests();
  });
  document.querySelectorAll('[data-action="run-sample-smoke-test"]').forEach((button) => {
    button.addEventListener("click", () => {
      runSampleSmokeTests(button.dataset.app || "");
    });
  });
  document.querySelector('[data-action="run-readiness-local"]')?.addEventListener("click", () => {
    runReadinessReport(false);
  });
  document.querySelector('[data-action="run-readiness-full"]')?.addEventListener("click", () => {
    runReadinessReport(true);
  });
}

async function runValidation() {
  appState.busy = true;
  appState.activeTab = "azure";
  renderShell();

  try {
    appState.prerequisiteResult = await api("/api/prerequisites", { method: "POST" });
    await loadState();
  } catch (error) {
    appState.prerequisiteResult = {
      status: "failed",
      message: error.message,
      checks: []
    };
    await recordActivity(`Prerequisite validation failed: ${error.message}`, "error");
  } finally {
    appState.busy = false;
    renderShell();
  }
}

async function fetchBilling() {
  appState.billingBusy = true;
  appState.activeTab = "azure";
  renderShell();

  try {
    appState.billingResult = await api("/api/billing/mtd", { method: "POST" });
    await loadState();
  } catch (error) {
    appState.billingResult = {
      status: "failed",
      message: error.message,
      asOf: new Date().toISOString()
    };
    await recordActivity(`Month-to-date billing query failed: ${error.message}`, "error");
  } finally {
    appState.billingBusy = false;
    renderShell();
  }
}

async function registerMicrosoftAppProvider() {
  appState.providerRegisterBusy = true;
  appState.activeTab = "azure";
  renderShell();

  try {
    appState.providerRegistrationResult = await api("/api/providers/register", {
      method: "POST",
      body: JSON.stringify({ namespace: "Microsoft.App" })
    });
    appState.prerequisiteResult = await api("/api/prerequisites", { method: "POST" });
    await loadState();
  } catch (error) {
    appState.providerRegistrationResult = {
      namespace: "Microsoft.App",
      status: "failed",
      message: error.message,
      asOf: new Date().toISOString()
    };
    await recordActivity(`Microsoft.App provider registration failed: ${error.message}`, "error");
  } finally {
    appState.providerRegisterBusy = false;
    renderShell();
  }
}

async function loadFoundationPlan() {
  appState.foundationPlanBusy = true;
  appState.activeTab = "blueprint";
  renderShell();

  try {
    appState.foundationPlan = await api("/api/iac/foundation/plan");
    await loadState();
  } catch (error) {
    appState.foundationPlan = {
      status: "failed",
      message: error.message,
      resourceGroups: []
    };
    await recordActivity(`Foundation IaC plan failed: ${error.message}`, "error");
  } finally {
    appState.foundationPlanBusy = false;
    renderShell();
  }
}

async function checkFoundationStatus() {
  appState.foundationStatusBusy = true;
  appState.activeTab = "blueprint";
  renderShell();

  try {
    appState.foundationStatus = await api("/api/iac/foundation/status");
    await loadState();
  } catch (error) {
    appState.foundationStatus = {
      status: "failed",
      message: error.message,
      resourceGroups: []
    };
    await recordActivity(`Foundation status check failed: ${error.message}`, "error");
  } finally {
    appState.foundationStatusBusy = false;
    renderShell();
  }
}

async function runFoundationWhatIf() {
  appState.foundationWhatIfBusy = true;
  appState.activeTab = "blueprint";
  renderShell();

  try {
    if (!appState.foundationPlan) {
      appState.foundationPlan = await api("/api/iac/foundation/plan");
    }
    appState.foundationWhatIf = await api("/api/iac/foundation/what-if", { method: "POST" });
    await loadState();
  } catch (error) {
    appState.foundationWhatIf = {
      status: "failed",
      message: error.message,
      changes: [],
      summary: {}
    };
    await recordActivity(`Foundation what-if failed: ${error.message}`, "error");
  } finally {
    appState.foundationWhatIfBusy = false;
    renderShell();
  }
}

function envLabel(environmentKey) {
  return String(environmentKey || "dev").charAt(0).toUpperCase() + String(environmentKey || "dev").slice(1);
}

async function loadPlatformCorePlan(environmentKey = "dev") {
  appState.platformCoreEnvironment = environmentKey;
  appState.platformCorePlanBusy = true;
  appState.activeTab = appState.activeTab === "environments" ? "environments" : "blueprint";
  renderShell();

  try {
    appState.platformCorePlan = await api(`/api/iac/platform-core/${environmentKey}/plan`);
    await loadState();
  } catch (error) {
    appState.platformCorePlan = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`${envLabel(environmentKey)} platform core plan failed: ${error.message}`, "error");
  } finally {
    appState.platformCorePlanBusy = false;
    renderShell();
  }
}

async function runPlatformCoreWhatIf(environmentKey = "dev") {
  appState.platformCoreEnvironment = environmentKey;
  appState.platformCoreWhatIfBusy = true;
  appState.activeTab = appState.activeTab === "environments" ? "environments" : "blueprint";
  renderShell();

  try {
    if (!appState.platformCorePlan || appState.platformCorePlan.environment !== environmentKey) {
      appState.platformCorePlan = await api(`/api/iac/platform-core/${environmentKey}/plan`);
    }
    appState.platformCoreWhatIf = await api(`/api/iac/platform-core/${environmentKey}/what-if`, {
      method: "POST"
    });
    await loadState();
  } catch (error) {
    appState.platformCoreWhatIf = {
      status: "failed",
      message: error.message,
      changes: [],
      summary: {}
    };
    await recordActivity(`${envLabel(environmentKey)} platform core what-if failed: ${error.message}`, "error");
  } finally {
    appState.platformCoreWhatIfBusy = false;
    renderShell();
  }
}

async function checkPlatformCoreStatus(environmentKey = "dev") {
  appState.platformCoreEnvironment = environmentKey;
  appState.platformCoreStatusBusy = true;
  appState.activeTab = appState.activeTab === "teardown" ? "teardown" : appState.activeTab === "environments" ? "environments" : "blueprint";
  renderShell();

  try {
    appState.platformCoreStatus = await api(`/api/iac/platform-core/${environmentKey}/status`);
    await loadState();
  } catch (error) {
    appState.platformCoreStatus = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`${envLabel(environmentKey)} platform core status check failed: ${error.message}`, "error");
  } finally {
    appState.platformCoreStatusBusy = false;
    renderShell();
  }
}

async function deployPlatformCore(environmentKey = "dev") {
  appState.platformCoreEnvironment = environmentKey;
  const label = envLabel(environmentKey);
  const confirmText = `DEPLOY ${environmentKey.toUpperCase()} CORE`;
  const targetTab = appState.activeTab === "environments" ? "environments" : "blueprint";
  const warning = [
    `Deploy ${label} Platform Core now?`,
    "",
    "This will create Azure resources that may incur billing until deleted:",
    "Log Analytics, Application Insights, Key Vault, Storage, AI Search, Container Apps Environment, Foundry AI Services, and a Foundry project.",
    "",
    "App Service Plan is deferred because this subscription currently has App Service quota 0.",
    "",
    "Use the Teardown flow later to delete these resources when the demo is complete."
  ].join("\n");

  const confirmed = window.confirm(warning);
  if (!confirmed) {
    await recordActivity(`${label} platform core deployment was cancelled before submission.`, "info");
    renderShell();
    return;
  }

  appState.platformCoreDeployBusy = true;
  appState.activeTab = targetTab;
  renderShell();

  try {
    if (!appState.platformCorePlan || appState.platformCorePlan.environment !== environmentKey) {
      appState.platformCorePlan = await api(`/api/iac/platform-core/${environmentKey}/plan`);
    }
    appState.platformCoreDeployment = await api(`/api/iac/platform-core/${environmentKey}/deploy`, {
      method: "POST",
      body: JSON.stringify({
        confirm: confirmText,
        ackBilling: true
      })
    });
    appState.platformCoreStatus = await api(`/api/iac/platform-core/${environmentKey}/status`);
    await loadState();
  } catch (error) {
    appState.platformCoreDeployment = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`${label} platform core deployment failed: ${error.message}`, "error");
  } finally {
    appState.platformCoreDeployBusy = false;
    renderShell();
  }
}

async function teardownPlatformCore(environmentKey = "dev") {
  appState.platformCoreEnvironment = environmentKey;
  const label = envLabel(environmentKey);
  const confirmText = `DELETE ${environmentKey.toUpperCase()} CORE`;
  const prefix = appState.config?.azure?.resourcePrefix || "msfoundryv1";
  const warning = [
    `Delete ${label} Platform Core resources now?`,
    "",
    `This will delete ${label} Core resources inside ${prefix}-platform-${environmentKey}-rg:`,
    "Foundry project/account, Container Apps environment, Application Insights, Key Vault, Storage, AI Search, Log Analytics, and managed identity.",
    "",
    `This is intended to stop ongoing ${label} Core billing. The resource group and foundation layout will remain.`,
    "",
    "Key Vault soft-delete may retain the vault name until retention or purge."
  ].join("\n");

  const confirmed = window.confirm(warning);
  if (!confirmed) {
    await recordActivity(`${label} platform core teardown was cancelled before submission.`, "info");
    renderShell();
    return;
  }

  appState.platformCoreTeardownBusy = true;
  appState.activeTab = "teardown";
  renderShell();

  try {
    appState.platformCoreTeardown = await api(`/api/iac/platform-core/${environmentKey}/teardown`, {
      method: "POST",
      body: JSON.stringify({
        confirm: confirmText,
        ackDelete: true
      })
    });
    appState.platformCoreStatus = await api(`/api/iac/platform-core/${environmentKey}/status`);
    await loadState();
  } catch (error) {
    appState.platformCoreTeardown = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`${label} platform core teardown failed: ${error.message}`, "error");
  } finally {
    appState.platformCoreTeardownBusy = false;
    renderShell();
  }
}

function normalizeWorkloadSelection(cfg, overrides = {}) {
  const firstEnvironment = cfg?.environments?.[0]?.key || "dev";
  const firstBusinessUnit = cfg?.businessUnits?.[0]?.key || "finance";
  const firstApp = sampleApps[0]?.key || "retail-copilot";
  const next = {
    environment:
      overrides.environment ||
      appState.workloadSelection.environment ||
      firstEnvironment,
    businessUnit:
      overrides.businessUnit ||
      appState.workloadSelection.businessUnit ||
      firstBusinessUnit,
    app: overrides.app || appState.workloadSelection.app || firstApp
  };

  if (!cfg?.environments?.some((item) => item.key === next.environment)) {
    next.environment = firstEnvironment;
  }
  if (!cfg?.businessUnits?.some((item) => item.key === next.businessUnit)) {
    next.businessUnit = firstBusinessUnit;
  }
  if (!sampleApps.some((item) => item.key === next.app)) {
    next.app = firstApp;
  }
  return next;
}

async function loadWorkloadPlan(overrides = {}) {
  const selection = normalizeWorkloadSelection(appState.config, overrides);
  appState.workloadSelection = selection;
  appState.workloadPlanBusy = true;
  appState.activeTab = "apps";
  renderShell();

  try {
    const params = new URLSearchParams({
      environment: selection.environment,
      businessUnit: selection.businessUnit,
      app: selection.app
    });
    appState.workloadPlan = await api(`/api/iac/workloads/plan?${params.toString()}`);
    await loadState();
  } catch (error) {
    appState.workloadPlan = {
      status: "failed",
      message: error.message,
      resources: [],
      artifacts: [],
      pipeline: []
    };
    await recordActivity(`Workload plan failed: ${error.message}`, "error");
  } finally {
    appState.workloadPlanBusy = false;
    renderShell();
  }
}

function workloadApiPath(action) {
  const selection = normalizeWorkloadSelection(appState.config);
  appState.workloadSelection = selection;
  return `/api/iac/workloads/${selection.environment}/${selection.businessUnit}/${selection.app}/${action}`;
}

function workloadConfirmValue(action) {
  const selection = normalizeWorkloadSelection(appState.config);
  const prefix = action === "delete" ? "DELETE" : "DEPLOY";
  return `${prefix} ${selection.businessUnit.toUpperCase()} ${selection.app.toUpperCase()} ${selection.environment.toUpperCase()}`;
}

async function checkWorkloadStatus() {
  appState.workloadStatusBusy = true;
  appState.activeTab = "apps";
  renderShell();

  try {
    appState.workloadStatus = await api(workloadApiPath("status"));
    await loadState();
  } catch (error) {
    appState.workloadStatus = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`Workload status check failed: ${error.message}`, "error");
  } finally {
    appState.workloadStatusBusy = false;
    renderShell();
  }
}

async function runWorkloadWhatIf() {
  appState.workloadWhatIfBusy = true;
  appState.activeTab = "apps";
  renderShell();

  try {
    appState.workloadWhatIf = await api(workloadApiPath("what-if"), { method: "POST" });
    await loadState();
  } catch (error) {
    appState.workloadWhatIf = {
      status: "failed",
      message: error.message,
      changes: [],
      summary: {}
    };
    await recordActivity(`Workload what-if failed: ${error.message}`, "error");
  } finally {
    appState.workloadWhatIfBusy = false;
    renderShell();
  }
}

async function deployWorkload() {
  const plan = appState.workloadPlan;
  const confirmText = workloadConfirmValue("deploy");
  const warning = [
    `Deploy ${plan?.app?.name || "selected workload"} now?`,
    "",
    "This can create usage-based Azure app resources and may generate model, telemetry, and hosting charges until deleted.",
    "",
    `Required confirmation: ${confirmText}`,
    "",
    "The server will reject this unless ENABLE_WORKLOAD_DEPLOYMENT=true and a real workload image is configured."
  ].join("\n");

  if (!window.confirm(warning)) {
    await recordActivity("Workload deployment was cancelled before submission.", "info");
    renderShell();
    return;
  }

  appState.workloadDeployBusy = true;
  appState.activeTab = "apps";
  renderShell();

  try {
    appState.workloadDeployment = await api(workloadApiPath("deploy"), {
      method: "POST",
      body: JSON.stringify({
        confirm: confirmText,
        ackBilling: true
      })
    });
    appState.workloadStatus = await api(workloadApiPath("status"));
    await loadState();
  } catch (error) {
    appState.workloadDeployment = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`Workload deployment failed: ${error.message}`, "error");
  } finally {
    appState.workloadDeployBusy = false;
    renderShell();
  }
}

async function teardownWorkload() {
  const plan = appState.workloadPlan;
  const confirmText = workloadConfirmValue("delete");
  const warning = [
    `Delete ${plan?.app?.name || "selected workload"} resources now?`,
    "",
    "This deletes workload app resources in the selected BU/environment resource group. Platform Core resources remain.",
    "",
    `Required confirmation: ${confirmText}`
  ].join("\n");

  if (!window.confirm(warning)) {
    await recordActivity("Workload teardown was cancelled before submission.", "info");
    renderShell();
    return;
  }

  appState.workloadTeardownBusy = true;
  appState.activeTab = "apps";
  renderShell();

  try {
    appState.workloadTeardown = await api(workloadApiPath("teardown"), {
      method: "POST",
      body: JSON.stringify({
        confirm: confirmText,
        ackDelete: true
      })
    });
    appState.workloadStatus = await api(workloadApiPath("status"));
    await loadState();
  } catch (error) {
    appState.workloadTeardown = {
      status: "failed",
      message: error.message,
      resources: []
    };
    await recordActivity(`Workload teardown failed: ${error.message}`, "error");
  } finally {
    appState.workloadTeardownBusy = false;
    renderShell();
  }
}

async function checkSampleApps(appKey = "") {
  appState.sampleAppHealthBusy = true;
  const targetTab = appState.activeTab === "apps" ? "apps" : "testing";
  appState.activeTab = targetTab;
  renderShell();

  try {
    const query = appKey ? `?app=${encodeURIComponent(appKey)}` : "";
    const result = await api(`/api/sample-apps/status${query}`);
    const existing = appKey ? appState.sampleAppHealth?.apps || [] : [];
    const mergedApps = appKey
      ? sampleApps.map((app) => result.apps.find((item) => item.key === app.key) || existing.find((item) => item.key === app.key)).filter(Boolean)
      : result.apps;
    appState.sampleAppHealth = {
      ...result,
      apps: mergedApps,
      total: appKey ? sampleApps.length : result.total,
      readyCount: mergedApps.filter((item) => item.status === "ready").length
    };
    await loadState();
  } catch (error) {
    appState.sampleAppHealth = {
      status: "failed",
      message: error.message,
      apps: []
    };
    await recordActivity(`Local sample app health check failed: ${error.message}`, "error");
  } finally {
    appState.sampleAppHealthBusy = false;
    renderShell();
  }
}

async function runSampleSmokeTests(appKey = "") {
  appState.sampleSmokeBusy = true;
  const targetTab = appState.activeTab === "apps" ? "apps" : "testing";
  appState.activeTab = targetTab;
  renderShell();

  try {
    const result = await api("/api/sample-apps/smoke", {
      method: "POST",
      body: JSON.stringify({ app: appKey })
    });
    const existing = appKey ? appState.sampleSmokeResult?.results || [] : [];
    const mergedResults = appKey
      ? sampleApps
          .map((app) => result.results.find((item) => item.key === app.key) || existing.find((item) => item.key === app.key))
          .filter(Boolean)
      : result.results;
    appState.sampleSmokeResult = {
      ...result,
      results: mergedResults,
      total: appKey ? sampleApps.length : result.total,
      passedCount: mergedResults.filter((item) => item.passed).length
    };
    await loadState();
  } catch (error) {
    appState.sampleSmokeResult = {
      status: "failed",
      message: error.message,
      results: []
    };
    await recordActivity(`Local sample smoke test failed: ${error.message}`, "error");
  } finally {
    appState.sampleSmokeBusy = false;
    renderShell();
  }
}

async function runReadinessReport(includeAzure = false) {
  appState.readinessBusy = true;
  appState.activeTab = "readiness";
  renderShell();

  try {
    appState.readinessReport = await api(`/api/readiness/report?includeAzure=${includeAzure ? "true" : "false"}`);
    appState.sampleAppHealth = appState.readinessReport.sampleHealth || appState.sampleAppHealth;
    if (appState.readinessReport.latestSmoke) {
      appState.sampleSmokeResult = appState.readinessReport.latestSmoke;
    }
    await loadState();
  } catch (error) {
    appState.readinessReport = {
      status: "failed",
      verdict: error.message,
      checks: [],
      summary: { passed: 0, warnings: 0, blocked: 1, total: 1 }
    };
    await recordActivity(`Readiness report failed: ${error.message}`, "error");
  } finally {
    appState.readinessBusy = false;
    renderShell();
  }
}

async function loadGovernancePlan() {
  appState.governancePlanBusy = true;
  appState.activeTab = "governance";
  renderShell();

  try {
    appState.governancePlan = await api("/api/governance/limits/plan");
    await loadState();
  } catch (error) {
    appState.governancePlan = {
      status: "failed",
      message: error.message,
      tokenLimits: [],
      budgetControls: [],
      enforcementLayers: []
    };
    await recordActivity(`Governance plan failed: ${error.message}`, "error");
  } finally {
    appState.governancePlanBusy = false;
    renderShell();
  }
}

async function deployFoundation() {
  const confirmed = window.confirm(
    "Create the foundation resource groups in Azure now? This will deploy the 13 planned resource groups using Incremental mode."
  );
  if (!confirmed) {
    await recordActivity("Foundation deployment was cancelled before submission.", "info");
    renderShell();
    return;
  }

  appState.foundationDeployBusy = true;
  appState.activeTab = "blueprint";
  renderShell();

  try {
    if (!appState.foundationPlan) {
      appState.foundationPlan = await api("/api/iac/foundation/plan");
    }
    appState.foundationDeployment = await api("/api/iac/foundation/deploy", {
      method: "POST",
      body: JSON.stringify({ confirm: "DEPLOY FOUNDATION" })
    });
    appState.foundationWhatIf = await api("/api/iac/foundation/what-if", { method: "POST" });
    await loadState();
  } catch (error) {
    appState.foundationDeployment = {
      status: "failed",
      message: error.message,
      resourceGroups: []
    };
    await recordActivity(`Foundation deployment failed: ${error.message}`, "error");
  } finally {
    appState.foundationDeployBusy = false;
    renderShell();
  }
}

function renderActivePanel(cfg) {
  switch (appState.activeTab) {
    case "readiness":
      return renderReadiness(cfg);
    case "azure":
      return renderAzure(cfg);
    case "blueprint":
      return renderBlueprint(cfg);
    case "environments":
      return renderEnvironments(cfg);
    case "business-units":
      return renderBusinessUnits(cfg);
    case "apps":
      return renderApps();
    case "cicd":
      return renderCicd();
    case "governance":
      return renderGovernance(cfg);
    case "activity":
      return renderActivity();
    case "testing":
      return renderTesting();
    case "demo-script":
      return renderDemoScript(cfg);
    case "teardown":
      return renderTeardown(cfg);
    default:
      return renderOverview(cfg);
  }
}

function panelHeader(title, subtitle, action = "") {
  return `
    <div class="section-header">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p class="subtle">${escapeHtml(subtitle)}</p>
      </div>
      <div>${action}</div>
    </div>
  `;
}

function renderOverview(cfg) {
  const enabledBus = cfg.businessUnits.filter((item) => item.enabled).length;
  const enabledEnvs = cfg.environments.filter((item) => item.enabled).length;

  return `
    ${panelHeader(
      "Platform Command Center",
      "A single operating surface for provisioning Foundry, onboarding business units, deploying agentic apps, and cleaning up demo environments."
    )}
    <section class="metric-row">
      <div class="metric"><span class="metric-value">${enabledBus}</span><span class="metric-label">Business units enabled</span></div>
      <div class="metric"><span class="metric-value">${enabledEnvs}</span><span class="metric-label">Environments planned</span></div>
      <div class="metric"><span class="metric-value">${sampleApps.length}</span><span class="metric-label">Agentic apps in gallery</span></div>
      <div class="metric"><span class="metric-value">$${escapeHtml(cfg.governance.monthlyBudgetAmount)}</span><span class="metric-label">Monthly budget guardrail</span></div>
    </section>
    <section class="grid two">
      <div class="panel pad">
        <h3>Recommended hosting stance</h3>
        <p class="subtle">Use Foundry for AI platform capabilities, Azure Container Apps for most custom agentic apps, and Azure App Service for simpler web/API scenarios. Keep AKS as an advanced option rather than the default.</p>
      </div>
      <div class="panel pad">
        <h3>Current configuration</h3>
        <ul class="list">
          <li class="list-item"><span><span class="small-label">Subscription</span><br><span class="value">${escapeHtml(cfg.azure.subscriptionId || "Not configured")}</span></span>${statusPill(cfg.azure.subscriptionId ? "ready" : "pending", cfg.azure.subscriptionId ? "Configured" : "Missing")}</li>
          <li class="list-item"><span><span class="small-label">Region</span><br><span class="value">${escapeHtml(cfg.azure.location)}</span></span>${statusPill("ready", "Selected")}</li>
          <li class="list-item"><span><span class="small-label">Model strategy</span><br><span class="value">${escapeHtml(cfg.foundry.defaultModelProvider)}</span></span>${statusPill("info", "Demo mode")}</li>
        </ul>
      </div>
    </section>
  `;
}

function renderAzure(cfg) {
  const result = appState.prerequisiteResult;
  return `
    ${panelHeader(
      "Azure Setup",
      "Validate credentials, subscription access, provider registration state, regional readiness, and current subscription spend.",
      `<div class="inline-actions">
        <button class="btn" data-action="register-provider" ${
          appState.providerRegisterBusy ? "disabled" : ""
        }>${appState.providerRegisterBusy ? "Registering..." : "Register Microsoft.App"}</button>
        <button class="btn" data-action="billing" ${appState.billingBusy ? "disabled" : ""}>${
          appState.billingBusy ? "Fetching billing..." : "Month-to-date Billing"
        }</button>
      </div>`
    )}
    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <h3>.env configuration</h3>
          ${cfg.azure.clientSecretConfigured ? statusPill("ready", "Secret present") : statusPill("failed", "Secret missing")}
        </div>
        <div class="panel-body form-grid">
          ${readonlyField("Subscription ID", cfg.azure.subscriptionId)}
          ${readonlyField("Tenant ID", cfg.azure.tenantId)}
          ${readonlyField("Client ID", cfg.azure.clientId)}
          ${readonlyField("Azure region", cfg.azure.location)}
          ${readonlyField("Resource prefix", cfg.azure.resourcePrefix)}
          ${readonlyField("Foundry project", cfg.foundry.projectName)}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h3>Prerequisite result</h3>
          ${
            result
              ? statusPill(result.status, result.status)
              : statusPill(appState.busy ? "running" : "pending", appState.busy ? "Running" : "Not run")
          }
        </div>
        <div class="panel-body">
          <p class="subtle">${escapeHtml(
            result?.message ||
              "Run the prerequisite check to confirm the service principal can deploy the platform."
          )}</p>
        </div>
      </div>
    </section>
    ${renderProviderRegistrationCard()}
    ${renderBillingCard()}
    ${result ? renderPrerequisiteTables(result) : ""}
  `;
}

function renderProviderRegistrationCard() {
  const registration = appState.providerRegistrationResult;
  if (!registration) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Container Apps prerequisite:</strong> register <span class="value">Microsoft.App</span> before provisioning Azure Container Apps environments and apps.
      </section>
    `;
  }

  const status =
    registration.status === "Registered"
      ? "success"
      : registration.status === "failed"
        ? "failed"
        : "warning";

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Provider registration</h3>
        ${statusPill(status, registration.status)}
      </div>
      <div class="panel-body">
        <div class="list-item">
          <span>
            <span class="small-label">${escapeHtml(registration.namespace || "Microsoft.App")}</span><br>
            <span class="value">${escapeHtml(registration.message || "Registration action completed.")}</span><br>
            <span class="subtle">Before: ${escapeHtml(registration.beforeState || "Unknown")} · Current: ${escapeHtml(registration.afterState || registration.status || "Unknown")}</span>
          </span>
          ${statusPill(status, registration.status)}
        </div>
      </div>
    </section>
  `;
}

function renderBillingCard() {
  const billing = appState.billingResult;
  const status = billing?.status === "failed" ? "failed" : billing?.status === "ok" ? "success" : "pending";
  const amountLabel =
    billing?.status === "ok"
      ? formatMoney(billing.amount, billing.currency)
      : billing?.status === "failed"
        ? "Unavailable"
        : "Not fetched";
  const refreshed = billing?.asOf ? new Date(billing.asOf).toLocaleString() : "Run the billing check to refresh.";

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Month-to-date billing</h3>
        ${statusPill(status, billing?.status === "ok" ? "Fetched" : billing?.status === "failed" ? "Failed" : "Pending")}
      </div>
      <div class="panel-body billing-grid">
        <div>
          <span class="small-label">Current month actual cost</span>
          <div class="billing-amount">${escapeHtml(amountLabel)}</div>
          <p class="subtle">Source: Azure Cost Management Query API. Billing data can lag actual resource usage.</p>
        </div>
        <div>
          <span class="small-label">Last refreshed</span>
          <p class="value">${escapeHtml(refreshed)}</p>
          <p class="subtle">${escapeHtml(billing?.message || billing?.note || "Uses the subscription configured in .env.")}</p>
        </div>
      </div>
    </section>
  `;
}

function formatMoney(amount, currency) {
  const numericAmount = Number(amount || 0);
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numericAmount);
    } catch {
      return `${currency} ${numericAmount.toFixed(2)}`;
    }
  }
  return numericAmount.toFixed(2);
}

function readonlyField(label, value) {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <input value="${escapeHtml(value || "Not configured")}" readonly>
    </div>
  `;
}

function renderPrerequisiteTables(result) {
  const checks = result.checks || [];
  const providers = result.providers || [];
  return `
    <section class="grid two" style="margin-top: 14px;">
      <div class="panel">
        <div class="panel-header"><h3>Permission checks</h3></div>
        <div class="panel-body">
          ${checks.length ? renderCheckTable(checks) : "<p class='subtle'>No permission details returned.</p>"}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>Provider states</h3></div>
        <div class="panel-body">
          ${providers.length ? renderProviderTable(providers) : "<p class='subtle'>No provider details returned.</p>"}
        </div>
      </div>
    </section>
  `;
}

function renderCheckTable(checks) {
  return `
    <table class="table">
      <thead><tr><th>Check</th><th>Status</th></tr></thead>
      <tbody>
        ${checks
          .map(
            (check) => `
              <tr>
                <td><strong>${escapeHtml(check.name)}</strong><br><span class="subtle">${escapeHtml(check.detail)}</span></td>
                <td>${statusPill(check.status, check.status)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderProviderTable(providers) {
  return `
    <table class="table">
      <thead><tr><th>Provider</th><th>Status</th></tr></thead>
      <tbody>
        ${providers
          .map(
            (provider) => `
              <tr>
                <td><strong>${escapeHtml(provider.namespace)}</strong><br><span class="subtle">${escapeHtml(provider.detail)}</span></td>
                <td>${statusPill(provider.status, provider.status)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderBlueprint(cfg) {
  return `
    ${panelHeader(
      "Platform Blueprint",
      "The portal will provision a reusable enterprise platform and then deploy BU-specific apps into the right environment.",
      `<div class="inline-actions">
        <button class="btn" data-action="check-foundation-status" ${
          appState.foundationStatusBusy ? "disabled" : ""
        }>${appState.foundationStatusBusy ? "Checking..." : "Check Foundation Status"}</button>
        <button class="btn" data-action="load-foundation-plan" ${
          appState.foundationPlanBusy ? "disabled" : ""
        }>${appState.foundationPlanBusy ? "Building plan..." : "Preview Foundation IaC"}</button>
        <button class="btn primary" data-action="run-foundation-what-if" ${
          appState.foundationWhatIfBusy ? "disabled" : ""
        }>${appState.foundationWhatIfBusy ? "Running what-if..." : "What-if Foundation Deployment"}</button>
        <button class="btn deploy" data-action="deploy-foundation" ${
          appState.foundationDeployBusy ? "disabled" : ""
        }>${appState.foundationDeployBusy ? "Deploying..." : "Deploy Foundation"}</button>
      </div>`
    )}
    <section class="grid three">
      <div class="panel pad">
        <h3>Control plane</h3>
        <p class="subtle">Foundry hub/project, identity, Key Vault, RBAC, budgets, model aliases, and policy guardrails.</p>
      </div>
      <div class="panel pad">
        <h3>App plane</h3>
        <p class="subtle">Container Apps and App Service host user apps, APIs, ingestion jobs, and tool adapters.</p>
      </div>
      <div class="panel pad">
        <h3>Observability plane</h3>
        <p class="subtle">Application Insights, Log Analytics, evaluation telemetry, cost tagging, and activity history.</p>
      </div>
    </section>
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header"><h3>Default naming</h3>${statusPill("info", cfg.azure.resourcePrefix)}</div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Resource group pattern</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td>${escapeHtml(cfg.azure.resourcePrefix)}-platform-&lt;env&gt;-rg</td><td>Shared platform resources per environment.</td></tr>
            <tr><td>${escapeHtml(cfg.azure.resourcePrefix)}-&lt;bu&gt;-&lt;env&gt;-rg</td><td>Business-unit app resources and data services.</td></tr>
            <tr><td>${escapeHtml(cfg.azure.resourcePrefix)}-ops-rg</td><td>Central dashboards, logs, automation, and reports.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    ${renderFoundationStatus()}
    ${renderFoundationPlan()}
    ${renderFoundationWhatIf()}
    ${renderFoundationDeployment()}
    ${renderPlatformCorePlan()}
    ${renderPlatformCoreWhatIf()}
    ${renderPlatformCoreDeployment()}
    ${renderPlatformCoreStatus()}
    ${renderPlatformCoreTeardown()}
  `;
}

function renderFoundationStatus() {
  const status = appState.foundationStatus;
  if (!status) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Foundation status:</strong> now that the resource groups exist, run a live status check to confirm creation, location, and tag drift before adding platform services.
      </section>
    `;
  }

  if (status.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Foundation status</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(status.message)}</p></div>
      </section>
    `;
  }

  const summaryEntries = Object.entries(status.summary || {});
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Foundation status</h3>
        ${statusPill(status.status === "ready" ? "ready" : "warning", status.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Created || 0)}</span><span class="metric-label">Created</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Missing || 0)}</span><span class="metric-label">Missing</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.TagDrift || 0)}</span><span class="metric-label">Tag drift</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource group</th><th>Status</th><th>Tags</th></tr></thead>
          <tbody>
            ${status.resourceGroups
              .map(
                (resourceGroup) => `
                  <tr>
                    <td><strong>${escapeHtml(resourceGroup.name)}</strong><br><span class="subtle">${escapeHtml(resourceGroup.location || resourceGroup.expectedLocation)}</span></td>
                    <td>${statusPill(resourceGroup.status, resourceGroup.status)}</td>
                    <td>${statusPill(resourceGroup.tagStatus, resourceGroup.tagStatus)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <p class="subtle" style="margin-top: 10px;">Summary: ${escapeHtml(summaryEntries.map(([key, value]) => `${key}: ${value}`).join(", "))}</p>
      </div>
    </section>
  `;
}

function renderFoundationPlan() {
  const plan = appState.foundationPlan;
  if (!plan) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Foundation IaC scaffold:</strong> the first Bicep module will create the resource-group layout only. Use the preview button to inspect the Azure footprint before we add a deploy action.
      </section>
    `;
  }

  if (plan.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Foundation IaC plan</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(plan.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Foundation IaC plan</h3>
        ${statusPill("ready", `${plan.totals.resourceGroups} resource groups`)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(plan.totals.environments)}</span><span class="metric-label">Environments</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.totals.businessUnits)}</span><span class="metric-label">Business units</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.location)}</span><span class="metric-label">Azure region</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource group</th><th>Scope</th><th>Purpose</th></tr></thead>
          <tbody>
            ${plan.resourceGroups
              .map(
                (resourceGroup) => `
                  <tr>
                    <td><strong>${escapeHtml(resourceGroup.name)}</strong><br><span class="subtle">${escapeHtml(resourceGroup.environment)} · ${escapeHtml(resourceGroup.businessUnit)}</span></td>
                    <td>${statusPill(resourceGroup.scope, resourceGroup.scope)}</td>
                    <td>${escapeHtml(resourceGroup.purpose)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <div class="command-box">${escapeHtml(plan.command)}</div>
      </div>
    </section>
  `;
}

function renderFoundationDeployment() {
  const result = appState.foundationDeployment;
  if (!result) {
    return `
      <section class="callout deploy-callout" style="margin-top: 14px;">
        <strong>Deployment guardrail:</strong> the deploy action uses Incremental mode and creates only the foundation resource groups shown in the plan. The browser will ask for confirmation before submitting.
      </section>
    `;
  }

  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Foundation deployment</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Foundation deployment</h3>
        ${statusPill("succeeded", result.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.resourceGroups.length)}</span><span class="metric-label">Resource groups ready</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.location)}</span><span class="metric-label">Deployment region</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.duration || "Completed")}</span><span class="metric-label">ARM duration</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource group</th><th>Scope</th><th>Resource ID</th></tr></thead>
          <tbody>
            ${result.resourceGroups
              .map(
                (resourceGroup) => `
                  <tr>
                    <td><strong>${escapeHtml(resourceGroup.name)}</strong><br><span class="subtle">${escapeHtml(resourceGroup.environment)} · ${escapeHtml(resourceGroup.businessUnit)}</span></td>
                    <td>${statusPill(resourceGroup.scope, resourceGroup.scope)}</td>
                    <td>${escapeHtml(resourceGroup.resourceId)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFoundationWhatIf() {
  const result = appState.foundationWhatIf;
  if (!result) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Azure what-if:</strong> run a live Azure Resource Manager preview to confirm whether these resource groups would be created, modified, ignored, or blocked before we add a deployment button.
      </section>
    `;
  }

  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Foundation what-if</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  const summaryEntries = Object.entries(result.summary || {});
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Foundation what-if</h3>
        ${statusPill("success", `${result.changes.length} change(s)`)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.templateResourceCount)}</span><span class="metric-label">Template resources</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.changes.length)}</span><span class="metric-label">Reported changes</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(summaryEntries.map(([key, value]) => `${key}: ${value}`).join(", ") || "NoChange: 0")}</span><span class="metric-label">Change summary</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Change</th><th>Type</th></tr></thead>
          <tbody>
            ${
              result.changes.length
                ? result.changes
                    .map(
                      (change) => `
                        <tr>
                          <td><strong>${escapeHtml(change.resourceName)}</strong><br><span class="subtle">${escapeHtml(change.resourceId)}</span></td>
                          <td>${statusPill(change.changeType, change.changeType)}</td>
                          <td>${escapeHtml(change.resourceType || "Unknown")}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="3">Azure did not report any changes for this template.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPlatformCorePlan() {
  const plan = appState.platformCorePlan;
  if (!plan) {
    const selectedEnvironment = appState.platformCoreEnvironment || "dev";
    const label = envLabel(selectedEnvironment);
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>${escapeHtml(label)} platform core:</strong> plan shared ${escapeHtml(label)} services in <span class="value">msfoundryv1-platform-${escapeHtml(selectedEnvironment)}-rg</span>. This includes observability, secrets, hosting, search, and the Foundry AI resource.
        ${platformCoreActions(selectedEnvironment, true)}
      </section>
    `;
  }

  if (plan.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>${escapeHtml(envLabel(plan.environment))} platform core plan</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(plan.message)}</p></div>
      </section>
    `;
  }

  const label = envLabel(plan.environment);
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(label)} platform core plan</h3>
        <div class="inline-actions">
          ${statusPill("ready", `${plan.totals.resources} resources`)}
          ${platformCoreActions(plan.environment)}
        </div>
      </div>
      <div class="panel-body">
        <div class="callout billing-warning" style="margin-bottom: 14px;">
          <strong>Billing warning:</strong> deploying ${escapeHtml(label)} Core creates usage-based Azure resources that may continue billing until deleted. App Service is deferred because current subscription quota is 0.
        </div>
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(plan.environment.toUpperCase())}</span><span class="metric-label">Environment</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.resourceGroupName)}</span><span class="metric-label">Resource group</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.location)}</span><span class="metric-label">Azure region</span></div>
          ${
            plan.searchLocation && plan.searchLocation !== plan.location
              ? `<div class="metric"><span class="metric-value">${escapeHtml(plan.searchLocation)}</span><span class="metric-label">AI Search region</span></div>`
              : ""
          }
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Type</th><th>SKU / Cost posture</th><th>Purpose</th></tr></thead>
          <tbody>
            ${plan.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong></td>
                    <td>${escapeHtml(resource.type)}</td>
                    <td><strong>${escapeHtml(resource.sku)}</strong><br><span class="subtle">${escapeHtml(resource.cost)}</span></td>
                    <td>${escapeHtml(resource.purpose)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        ${
          plan.deferredResources?.length
            ? `
              <div class="callout" style="margin-top: 14px;">
                <strong>Deferred resource:</strong> ${escapeHtml(plan.deferredResources.length)} item is intentionally excluded from ${escapeHtml(label)} Core until a prerequisite is resolved.
              </div>
              <table class="table" style="margin-top: 10px;">
                <thead><tr><th>Deferred resource</th><th>Reason</th><th>Next step</th></tr></thead>
                <tbody>
                  ${plan.deferredResources
                    .map(
                      (resource) => `
                        <tr>
                          <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.type)}</span></td>
                          <td>${escapeHtml(resource.reason)}</td>
                          <td>${escapeHtml(resource.nextStep)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : ""
        }
        <div class="command-box">${escapeHtml(plan.command)}</div>
      </div>
    </section>
  `;
}

function renderPlatformCoreDeployment() {
  const result = appState.platformCoreDeployment;
  if (!result) {
    return "";
  }
  const label = envLabel(result.environment || appState.platformCoreEnvironment);

  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>${escapeHtml(label)} platform core deployment</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(label)} platform core deployment</h3>
        ${statusPill("succeeded", result.status)}
      </div>
      <div class="panel-body">
        <div class="callout billing-warning" style="margin-bottom: 14px;">
          <strong>Billing reminder:</strong> these ${escapeHtml(label)} Core resources may accrue charges until deleted through the teardown flow or Azure Portal.
        </div>
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.resources.length)}</span><span class="metric-label">Resources submitted</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.resourceGroupName)}</span><span class="metric-label">Resource group</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.duration || "Completed")}</span><span class="metric-label">ARM duration</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Type</th><th>Resource ID</th></tr></thead>
          <tbody>
            ${result.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.sku)} · ${escapeHtml(resource.cost)}</span></td>
                    <td>${escapeHtml(resource.type)}</td>
                    <td>${escapeHtml(resource.resourceId)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPlatformCoreStatus() {
  const status = appState.platformCoreStatus;
  if (!status) {
    return "";
  }
  const label = envLabel(status.environment || appState.platformCoreEnvironment);

  if (status.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>${escapeHtml(label)} platform core status</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(status.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(label)} platform core status</h3>
        ${statusPill(status.status === "ready" ? "ready" : "warning", status.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Created || 0)}</span><span class="metric-label">Created</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Missing || 0)}</span><span class="metric-label">Missing</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.deferredResources?.length || 0)}</span><span class="metric-label">Deferred</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Status</th><th>Provisioning</th></tr></thead>
          <tbody>
            ${status.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.type)}</span></td>
                    <td>${statusPill(resource.status, resource.status)}</td>
                    <td>${escapeHtml(resource.provisioningState || resource.detail || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPlatformCoreTeardown() {
  const result = appState.platformCoreTeardown;
  if (!result) {
    return "";
  }
  const label = envLabel(result.environment || appState.platformCoreEnvironment);

  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>${escapeHtml(label)} platform core teardown</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  const summaryEntries = Object.entries(result.summary || {});
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(label)} platform core teardown</h3>
        ${statusPill(result.status === "succeeded" ? "success" : "warning", result.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.summary?.Deleted || 0)}</span><span class="metric-label">Deleted</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.summary?.Skipped || 0)}</span><span class="metric-label">Already missing</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.summary?.Failed || 0)}</span><span class="metric-label">Failed</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            ${result.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.type)}</span></td>
                    <td>${statusPill(resource.status, resource.status)}</td>
                    <td>${escapeHtml(resource.detail || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <p class="subtle" style="margin-top: 10px;">${escapeHtml(result.note || "")}</p>
        <p class="subtle">Summary: ${escapeHtml(summaryEntries.map(([key, value]) => `${key}: ${value}`).join(", "))}</p>
      </div>
    </section>
  `;
}

function renderPlatformCoreWhatIf() {
  const result = appState.platformCoreWhatIf;
  if (!result) {
    return "";
  }
  const label = envLabel(result.environment || appState.platformCoreEnvironment);

  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>${escapeHtml(label)} platform core what-if</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  const summaryEntries = Object.entries(result.summary || {});
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(label)} platform core what-if</h3>
        ${statusPill("success", `${result.changes.length} change(s)`)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.templateResourceCount)}</span><span class="metric-label">Template resources</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.changes.length)}</span><span class="metric-label">Reported changes</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(summaryEntries.map(([key, value]) => `${key}: ${value}`).join(", ") || "NoChange: 0")}</span><span class="metric-label">Change summary</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Change</th><th>Type</th></tr></thead>
          <tbody>
            ${
              result.changes.length
                ? result.changes
                    .map(
                      (change) => `
                        <tr>
                          <td><strong>${escapeHtml(change.resourceName)}</strong><br><span class="subtle">${escapeHtml(change.resourceId)}</span></td>
                          <td>${statusPill(change.changeType, change.changeType)}</td>
                          <td>${escapeHtml(change.resourceType || "Unknown")}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="3">Azure did not report any changes for this template.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderEnvironments(cfg) {
  const environmentDetails = {
    dev: {
      trigger: "Feature branch or manual",
      purpose: "Fast iteration, model experiments, smoke tests.",
      gate: "Lowest-cost sandbox for proving platform changes before promotion."
    },
    test: {
      trigger: "Pull request or release candidate",
      purpose: "Regression evals, safety checks, business validation.",
      gate: "Promotion target for the same app artifacts after Dev validation."
    },
    prod: {
      trigger: "Manual approval",
      purpose: "Leadership-ready demo with monitoring and rollback.",
      gate: "Controlled release target with stronger approval and teardown discipline."
    }
  };

  return `
    ${panelHeader(
      "Environment Strategy",
      "Dev, Test, and Prod are separate deployment targets with artifact promotion and approval gates."
    )}
    <section class="panel">
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Environment</th><th>Trigger</th><th>Purpose</th><th>Status</th></tr></thead>
          <tbody>
            ${cfg.environments
              .map((env) => {
                const detail = environmentDetails[env.key] || environmentDetails.dev;
                return `<tr><td><strong>${escapeHtml(env.name)}</strong></td><td>${escapeHtml(detail.trigger)}</td><td>${escapeHtml(detail.purpose)}</td><td>${statusPill(env.enabled ? "enabled" : "pending", env.enabled ? "Enabled" : "Disabled")}</td></tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
    <section class="grid three" style="margin-top: 14px;">
      ${cfg.environments
        .map((env) => {
          const detail = environmentDetails[env.key] || environmentDetails.dev;
          return `
            <article class="panel pad">
              <div class="panel-header" style="padding: 0 0 12px; border-bottom: 0;">
                <h3>${escapeHtml(env.name)} Platform Core</h3>
                ${statusPill(env.enabled ? "enabled" : "pending", env.enabled ? "Enabled" : "Disabled")}
              </div>
              <p class="small-label">${escapeHtml(detail.trigger)}</p>
              <p class="subtle">${escapeHtml(detail.gate)}</p>
              <div class="callout billing-warning" style="margin-top: 12px;">
                <strong>Billing warning:</strong> deploying ${escapeHtml(env.name)} Core creates usage-based Azure resources until teardown.
              </div>
              ${platformCoreActions(env.key, true)}
            </article>
          `;
        })
        .join("")}
    </section>
    ${renderPlatformCorePlan()}
    ${renderPlatformCoreWhatIf()}
    ${renderPlatformCoreDeployment()}
    ${renderPlatformCoreStatus()}
    ${renderPlatformCoreTeardown()}
  `;
}

function renderBusinessUnits(cfg) {
  const useCases = {
    finance: "Spend insight assistant, policy Q&A, and variance explanation.",
    hr: "Employee policy helper, onboarding guide, and benefits Q&A.",
    manufacturing: "Maintenance assistant, quality issue triage, and SOP search."
  };
  return `
    ${panelHeader(
      "Business Unit Onboarding",
      "Each BU gets isolated configuration, sample data, model policy, telemetry, and deployment slots."
    )}
    <section class="grid three">
      ${cfg.businessUnits
        .map(
          (bu) => `
            <div class="panel pad">
              <div class="panel-header" style="padding: 0 0 12px; border-bottom: 0;">
                <h3>${escapeHtml(bu.name)}</h3>
                ${statusPill(bu.enabled ? "enabled" : "pending", bu.enabled ? "Enabled" : "Disabled")}
              </div>
              <p class="subtle">${escapeHtml(useCases[bu.key])}</p>
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function renderReadiness(cfg) {
  const report = appState.readinessReport;
  const summary = report?.summary || { passed: 0, warnings: 0, blocked: 0, total: 0 };
  const verdict = report?.verdict || "Run a readiness check before moving toward Azure workload deployment.";
  const status = report?.status || "not-run";

  return `
    ${panelHeader(
      "Deployment Readiness",
      "A single go/no-go dashboard before pushing images or deploying workloads into Azure.",
      `<div class="inline-actions">
        <button class="btn" data-action="run-readiness-local" ${appState.readinessBusy ? "disabled" : ""}>${
          appState.readinessBusy ? "Checking..." : "Run Local Check"
        }</button>
        <button class="btn primary" data-action="run-readiness-full" ${appState.readinessBusy ? "disabled" : ""}>${
          appState.readinessBusy ? "Checking..." : "Run Full Readiness Check"
        }</button>
      </div>`
    )}
    <section class="grid four">
      <div class="metric"><span class="metric-value">${escapeHtml(summary.passed)}</span><span class="metric-label">Passed</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(summary.warnings)}</span><span class="metric-label">Warnings</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(summary.blocked)}</span><span class="metric-label">Blockers</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(summary.total)}</span><span class="metric-label">Checks</span></div>
    </section>
    <section class="callout ${status === "blocked" || status === "failed" ? "billing-warning" : ""}" style="margin-top: 14px;">
      <strong>Verdict:</strong> ${escapeHtml(verdict)}
    </section>
    ${renderReadinessChecks(report)}
    ${renderDeployedUrlPlaceholders(report, cfg)}
    ${renderImagePackaging(report)}
  `;
}

function renderReadinessChecks(report) {
  if (!report) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Readiness checks:</strong> run the local check for no-Azure validation, or run the full check for read-only Azure status and billing posture.
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Go / No-Go checks</h3>
        ${statusPill(report.status === "blocked" ? "blocked" : report.status, report.status)}
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Area</th><th>Check</th><th>Status</th><th>Detail</th><th>Next action</th></tr></thead>
          <tbody>
            ${(report.checks || [])
              .map(
                (check) => `
                  <tr>
                    <td>${escapeHtml(check.area)}</td>
                    <td><strong>${escapeHtml(check.name)}</strong></td>
                    <td>${statusPill(check.status, check.status)}</td>
                    <td>${escapeHtml(check.detail)}</td>
                    <td>${escapeHtml(check.action || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDeployedUrlPlaceholders(report, cfg) {
  const rows =
    report?.urlPlaceholders ||
    sampleApps.map((app) => ({
      appName: app.name,
      local: app.localUrl,
      dev: "Pending workload deployment",
      test: "Pending promotion",
      prod: "Pending promotion",
      note: "Run readiness report to populate expected Azure URL patterns."
    }));

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Local and Azure URL matrix</h3>
        ${statusPill("info", cfg?.azure?.resourcePrefix || "msfoundryv1")}
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>App</th><th>Local mock</th><th>Dev</th><th>Test</th><th>Prod</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.appName)}</strong><br><span class="subtle">${escapeHtml(row.note || "")}</span></td>
                    <td><a href="${escapeHtml(row.local)}" target="_blank" rel="noreferrer">${escapeHtml(row.local)}</a></td>
                    <td>${escapeHtml(row.dev)}</td>
                    <td>${escapeHtml(row.test)}</td>
                    <td>${escapeHtml(row.prod)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderImagePackaging(report) {
  const packaging = report?.packaging || {
    registryStrategy: appState.config?.cicd?.imageRegistryStrategy || "ghcr",
    workloadImageReference: appState.config?.cicd?.workloadImageConfigured ? "configured" : "",
    localImageArchives: [],
    buildCommands: ["npm run docker:retail", "npm run docker:writer", "npm run docker:appservice"],
    archiveCommands: ["npm run image:retail:save", "npm run image:writer:save", "npm run image:appservice:save"],
    manifestCommands: ["npm run manifest:retail:dev", "npm run manifest:writer:dev", "npm run manifest:appservice:dev"]
  };
  const archiveCount = (packaging.localImageArchives || []).filter((item) => item.exists).length;
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Container image packaging checklist</h3>
        ${statusPill(packaging.workloadImageReference ? "ready" : archiveCount ? "warning" : "warning", packaging.registryStrategy)}
      </div>
      <div class="panel-body">
        <div class="grid three">
          <div>
            <h3>Local build commands</h3>
            <ul>
              ${(packaging.buildCommands || []).map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("")}
            </ul>
          </div>
          <div>
            <h3>Archive commands</h3>
            <ul>
              ${(packaging.archiveCommands || []).map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("")}
            </ul>
          </div>
          <div>
            <h3>Manifest commands</h3>
            <ul>
              ${(packaging.manifestCommands || []).map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("")}
            </ul>
          </div>
        </div>
        <table class="table" style="margin-top: 14px;">
          <thead><tr><th>Archive</th><th>Status</th><th>Path</th></tr></thead>
          <tbody>
            ${
              (packaging.localImageArchives || []).length
                ? packaging.localImageArchives
                    .map(
                      (archive) => `
                        <tr>
                          <td><strong>${escapeHtml(archive.appKey)}</strong></td>
                          <td>${statusPill(archive.exists ? "passed" : "missing", archive.exists ? "Found" : "Missing")}</td>
                          <td>${escapeHtml(archive.path)}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="3">Run a readiness report to check local image archive paths.</td></tr>`
            }
          </tbody>
        </table>
        <div class="callout billing-warning" style="margin-top: 14px;">
          <strong>Billing posture:</strong> local builds and local archives do not create Azure resources. Azure deployment still requires a registry image reference and can incur charges.
        </div>
      </div>
    </section>
  `;
}

function renderSampleAppReadiness() {
  const health = appState.sampleAppHealth;
  const headerStatus = health
    ? statusPill(health.status === "ready" ? "ready" : health.status === "failed" ? "failed" : "warning", `${health.readyCount || 0}/${health.total || sampleApps.length} running`)
    : statusPill("notchecked", "Not checked");
  const checkedAt = health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : "Not checked yet";

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <div>
          <h3>Local sample app readiness</h3>
          <p class="subtle">Use these local mock apps for the leadership walkthrough before deploying workloads to Azure.</p>
        </div>
        ${headerStatus}
      </div>
      <div class="panel-body">
        <div class="inline-actions" style="margin-bottom: 14px; justify-content: flex-start;">
          <button class="btn primary" data-action="check-sample-apps" ${appState.sampleAppHealthBusy ? "disabled" : ""}>${
            appState.sampleAppHealthBusy ? "Checking..." : "Check All Local Apps"
          }</button>
          <button class="btn deploy" data-action="run-sample-smoke-tests" ${appState.sampleSmokeBusy ? "disabled" : ""}>${
            appState.sampleSmokeBusy ? "Running..." : "Run All Smoke Tests"
          }</button>
          <span class="small-label">Last checked: ${escapeHtml(checkedAt)}</span>
        </div>
        ${
          health?.status === "failed"
            ? `<div class="callout billing-warning" style="margin-bottom: 14px;"><strong>Health check failed:</strong> ${escapeHtml(health.message)}</div>`
            : ""
        }
        <table class="table">
          <thead>
            <tr><th>App</th><th>Local URL</th><th>Status</th><th>Smoke test</th><th>Start command</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${sampleApps
              .map((app) => {
                const appHealth = sampleAppHealthFor(app.key);
                const message = appHealth?.message || "Click check to verify this local app.";
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(app.name)}</strong><br>
                      <span class="subtle">${escapeHtml(app.type)} / ${escapeHtml(app.defaultBusinessUnit.toUpperCase())}</span>
                    </td>
                    <td><a href="${escapeHtml(app.localUrl)}" target="_blank" rel="noreferrer">${escapeHtml(app.localUrl)}</a></td>
                    <td>${sampleAppStatus(app.key)}<br><span class="subtle">${escapeHtml(message)}</span></td>
                    <td>${escapeHtml(app.smokePrompt)}<br><span class="subtle">${escapeHtml(app.expectedSignal)}</span></td>
                    <td><code>${escapeHtml(app.startCommand)}</code></td>
                    <td>
                      <div class="inline-actions" style="justify-content: flex-start;">
                        <button class="btn" data-action="check-sample-app" data-app="${escapeHtml(app.key)}" ${appState.sampleAppHealthBusy ? "disabled" : ""}>Check</button>
                        <button class="btn" data-action="run-sample-smoke-test" data-app="${escapeHtml(app.key)}" ${appState.sampleSmokeBusy ? "disabled" : ""}>Smoke</button>
                        <a class="btn" href="${escapeHtml(app.localUrl)}" target="_blank" rel="noreferrer">Open</a>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
        <div class="callout" style="margin-top: 14px;">
          <strong>Demo note:</strong> local apps run in mock mode and are safe to test. Azure workload deployment remains guarded separately because deployed hosting can incur charges.
        </div>
      </div>
    </section>
    ${renderSampleSmokeResults()}
  `;
}

function renderSampleSmokeResults() {
  const result = appState.sampleSmokeResult;
  if (!result) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Smoke tests:</strong> run the local smoke tests to capture pass/fail, token estimates, and tool or agent traces in one place.
      </section>
    `;
  }
  if (result.status === "failed" && !result.results?.length) {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Smoke test results</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }

  const ranAt = result.ranAt ? new Date(result.ranAt).toLocaleTimeString() : "Just now";
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <div>
          <h3>Smoke test results</h3>
          <p class="subtle">Last run: ${escapeHtml(ranAt)}</p>
        </div>
        <div class="inline-actions">
          <a class="btn" href="/api/sample-apps/eval-report" target="_blank" rel="noreferrer">Download JSON</a>
          ${statusPill(result.status === "passed" ? "passed" : "warning", `${result.passedCount || 0}/${result.total || sampleApps.length} passed`)}
        </div>
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>App</th><th>Status</th><th>Observed signal</th><th>Usage</th><th>Trace</th></tr></thead>
          <tbody>
            ${(result.results || [])
              .map((item) => {
                const traceParts = [
                  item.trace?.sources?.length ? `sources: ${item.trace.sources.length}` : "",
                  item.trace?.agents?.length ? `agents: ${item.trace.agents.map((agent) => agent.role).join(", ")}` : "",
                  item.trace?.toolCalls?.length ? `tools: ${item.trace.toolCalls.map((call) => `${call.name} (${call.status})`).join(", ")}` : ""
                ].filter(Boolean);
                const usage = item.usage
                  ? `${item.usage.totalTokens} / ${item.usage.tokenLimitPerSession} est. tokens`
                  : "No usage returned";
                return `
                  <tr>
                    <td><strong>${escapeHtml(item.name)}</strong><br><span class="subtle">${escapeHtml(item.prompt || "")}</span></td>
                    <td>${statusPill(item.passed ? "passed" : "failed", item.passed ? "Passed" : "Failed")}<br><span class="subtle">${escapeHtml(item.durationMs || 0)} ms</span></td>
                    <td>${escapeHtml(item.observedSignal || item.message || "")}<br><span class="subtle">Expected: ${escapeHtml(item.expectedSignal || "")}</span></td>
                    <td>${escapeHtml(usage)}</td>
                    <td>${escapeHtml(traceParts.join(" | ") || item.message || "")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderApps() {
  const selection = normalizeWorkloadSelection(appState.config);
  const environments = appState.config?.environments || [];
  const businessUnits = appState.config?.businessUnits || [];

  return `
    ${panelHeader(
      "Agentic App Factory",
      "Generate a workload plan for a business unit, environment, app pattern, model policy, and promotion path."
    )}
    <section class="panel">
      <div class="panel-header">
        <h3>Workload planner</h3>
        ${statusPill("info", "Read-only")}
      </div>
      <div class="panel-body">
        <div class="form-grid three">
          <div class="field">
            <label for="workload-environment">Environment</label>
            <select id="workload-environment" data-workload-select="environment">
              ${environments
                .map(
                  (env) => `<option value="${escapeHtml(env.key)}" ${env.key === selection.environment ? "selected" : ""}>${escapeHtml(env.name)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="workload-business-unit">Business Unit</label>
            <select id="workload-business-unit" data-workload-select="businessUnit">
              ${businessUnits
                .map(
                  (bu) => `<option value="${escapeHtml(bu.key)}" ${bu.key === selection.businessUnit ? "selected" : ""}>${escapeHtml(bu.name)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="workload-app">Sample App</label>
            <select id="workload-app" data-workload-select="app">
              ${sampleApps
                .map(
                  (app) => `<option value="${escapeHtml(app.key)}" ${app.key === selection.app ? "selected" : ""}>${escapeHtml(app.name)}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>
        <div class="inline-actions" style="margin-top: 14px; justify-content: flex-start;">
          <button class="btn primary" data-action="load-workload-plan" ${appState.workloadPlanBusy ? "disabled" : ""}>${
            appState.workloadPlanBusy ? "Generating plan..." : "Generate Workload Plan"
          }</button>
        </div>
        <div class="callout billing-warning" style="margin-top: 14px;">
          <strong>Billing note:</strong> this planner does not create Azure resources. Future workload deployments may create usage-based hosting resources and can generate model inference, telemetry, and storage charges.
        </div>
      </div>
    </section>
    <section class="grid three">
      ${sampleApps
        .map(
          (app) => `
            <article class="panel pad">
              <h3>${escapeHtml(app.name)}</h3>
              <p class="small-label">${escapeHtml(app.type)}</p>
              <p class="subtle">${escapeHtml(app.proves)}</p>
              <div style="margin-top: 14px;">${statusPill("info", app.target)} ${sampleAppStatus(app.key)}</div>
              <div class="inline-actions" style="margin-top: 12px; justify-content: flex-start;">
                <button class="btn" data-action="quick-workload-plan" data-app="${escapeHtml(app.key)}" data-business-unit="${escapeHtml(app.defaultBusinessUnit)}">
                  Plan ${escapeHtml(app.name)}
                </button>
                <button class="btn" data-action="check-sample-app" data-app="${escapeHtml(app.key)}" ${appState.sampleAppHealthBusy ? "disabled" : ""}>Check Local</button>
                <a class="btn" href="${escapeHtml(app.localUrl)}" target="_blank" rel="noreferrer">Open</a>
              </div>
            </article>
          `
        )
        .join("")}
    </section>
    ${renderSampleAppReadiness()}
    ${renderWorkloadPlan()}
  `;
}

function renderWorkloadPlan() {
  const plan = appState.workloadPlan;
  if (!plan) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Next action:</strong> generate a workload plan to show how a BU team consumes the Foundry platform through CI/CD, model policy, IaC, and test prompts.
      </section>
    `;
  }

  if (plan.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Workload plan</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(plan.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(plan.businessUnit.name)} - ${escapeHtml(plan.app.name)}</h3>
        ${statusPill(plan.status === "ready" ? "ready" : "warning", plan.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(plan.environment.name)}</span><span class="metric-label">Environment</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.hosting.target)}</span><span class="metric-label">Hosting target</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.resourceGroupName)}</span><span class="metric-label">Resource group</span></div>
        </div>
        <div class="callout billing-warning" style="margin-bottom: 14px;">
          <strong>Billing warning:</strong> ${escapeHtml(plan.billingWarning)}
        </div>
        <div class="callout" style="margin-bottom: 14px;">
          <strong>Deployment readiness:</strong> ${escapeHtml(plan.deployment.readiness)}
        </div>
        ${renderWorkloadDeploymentPreflight(plan)}
        <div class="inline-actions" style="margin-bottom: 14px; justify-content: flex-start;">
          <button class="btn" data-action="check-workload-status" ${appState.workloadStatusBusy ? "disabled" : ""}>${
            appState.workloadStatusBusy ? "Checking..." : "Check Workload Status"
          }</button>
          <button class="btn primary" data-action="run-workload-what-if" ${appState.workloadWhatIfBusy ? "disabled" : ""}>${
            appState.workloadWhatIfBusy ? "Running..." : "What-if Workload"
          }</button>
          <button class="btn deploy" data-action="deploy-workload" ${appState.workloadDeployBusy ? "disabled" : ""}>${
            appState.workloadDeployBusy ? "Deploying..." : "Deploy Workload"
          }</button>
          <button class="btn danger" data-action="teardown-workload" ${appState.workloadTeardownBusy ? "disabled" : ""}>${
            appState.workloadTeardownBusy ? "Deleting..." : "Teardown Workload"
          }</button>
        </div>
        <table class="table">
          <thead><tr><th>Resource or dependency</th><th>Type</th><th>SKU / Cost posture</th><th>Purpose</th></tr></thead>
          <tbody>
            ${plan.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong></td>
                    <td>${escapeHtml(resource.type)}</td>
                    <td><strong>${escapeHtml(resource.sku)}</strong><br><span class="subtle">${escapeHtml(resource.cost)}</span></td>
                    <td>${escapeHtml(resource.purpose)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <div class="grid two" style="margin-top: 14px;">
          <div class="panel">
            <div class="panel-header"><h3>Model policy</h3>${statusPill("info", plan.modelPolicy.provider)}</div>
            <div class="panel-body">
              <p class="subtle"><strong>Preferred:</strong> ${escapeHtml(plan.modelPolicy.preferredModel)}</p>
              <p class="subtle"><strong>Fallback:</strong> ${escapeHtml(plan.modelPolicy.fallbackModel)}</p>
              <p class="subtle" style="margin-top: 8px;">${escapeHtml(plan.modelPolicy.costNote)}</p>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header"><h3>Hosting note</h3>${statusPill(plan.hosting.status === "ready" ? "ready" : "warning", plan.hosting.status)}</div>
            <div class="panel-body">
              <p class="subtle">${escapeHtml(plan.hosting.note)}</p>
              <p class="subtle" style="margin-top: 8px;"><strong>Target resource:</strong> ${escapeHtml(plan.hosting.targetResourceName)}</p>
            </div>
          </div>
        </div>
        <h3 style="margin-top: 18px;">Artifacts</h3>
        <table class="table" style="margin-top: 10px;">
          <thead><tr><th>Artifact</th><th>Path</th><th>Purpose</th></tr></thead>
          <tbody>
            ${plan.artifacts
              .map(
                (artifact) => `
                  <tr>
                    <td><strong>${escapeHtml(artifact.name)}</strong></td>
                    <td>${escapeHtml(artifact.path)}</td>
                    <td>${escapeHtml(artifact.purpose)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <h3 style="margin-top: 18px;">Promotion gates</h3>
        <table class="table" style="margin-top: 10px;">
          <thead><tr><th>Stage</th><th>Gate</th><th>Owner</th></tr></thead>
          <tbody>
            ${plan.pipeline
              .map(
                (stage) => `
                  <tr>
                    <td><strong>${escapeHtml(stage.stage)}</strong></td>
                    <td>${escapeHtml(stage.gate)}</td>
                    <td>${escapeHtml(stage.owner)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <h3 style="margin-top: 18px;">Test prompts</h3>
        <ul>
          ${plan.testGuide.prompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}
        </ul>
        <div class="command-box">${escapeHtml(plan.command)}</div>
      </div>
    </section>
    ${renderWorkloadLifecycleResults()}
  `;
}

function renderWorkloadDeploymentPreflight(plan) {
  const preflight = plan.deployment?.preflight;
  if (!preflight) return "";
  return `
    <div class="panel" style="margin-bottom: 14px;">
      <div class="panel-header">
        <h3>Dev deployment preflight</h3>
        ${statusPill(preflight.status === "blocked" ? "warning" : "ready", preflight.status)}
      </div>
      <div class="panel-body">
        <p class="subtle" style="margin-bottom: 12px;">${escapeHtml(preflight.summary)}</p>
        <table class="table">
          <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            ${preflight.checks
              .map(
                (check) => `
                  <tr>
                    <td><strong>${escapeHtml(check.check)}</strong></td>
                    <td>${statusPill(check.status, check.status)}</td>
                    <td>${escapeHtml(check.detail)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWorkloadLifecycleResults() {
  return `
    ${renderWorkloadStatus()}
    ${renderWorkloadWhatIf()}
    ${renderWorkloadDeployment()}
    ${renderWorkloadTeardown()}
  `;
}

function renderWorkloadStatus() {
  const status = appState.workloadStatus;
  if (!status) return "";
  if (status.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Workload status</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(status.message)}</p></div>
      </section>
    `;
  }
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(status.businessUnit.name)} - ${escapeHtml(status.app.name)} status</h3>
        ${statusPill(status.status === "ready" ? "ready" : "warning", status.status)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Created || 0)}</span><span class="metric-label">Created</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.summary?.Missing || 0)}</span><span class="metric-label">Missing</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(status.resourceGroupName)}</span><span class="metric-label">Resource group</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Status</th><th>Provisioning</th></tr></thead>
          <tbody>
            ${status.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.type)}</span></td>
                    <td>${statusPill(resource.status, resource.status)}</td>
                    <td>${escapeHtml(resource.provisioningState || resource.detail || resource.defaultHostName || resource.latestRevisionFqdn || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderWorkloadWhatIf() {
  const result = appState.workloadWhatIf;
  if (!result) return "";
  if (result.status === "failed" || result.status === "deferred") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Workload what-if</h3>${statusPill(result.status === "deferred" ? "warning" : "failed", result.status)}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }
  const summaryEntries = Object.entries(result.summary || {});
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(result.businessUnit.name)} - ${escapeHtml(result.app.name)} what-if</h3>
        ${statusPill("success", `${result.changes.length} change(s)`)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(result.templateResourceCount)}</span><span class="metric-label">Template resources</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(result.changes.length)}</span><span class="metric-label">Reported changes</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(summaryEntries.map(([key, value]) => `${key}: ${value}`).join(", ") || "NoChange: 0")}</span><span class="metric-label">Change summary</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Resource</th><th>Change</th><th>Type</th></tr></thead>
          <tbody>
            ${
              result.changes.length
                ? result.changes
                    .map(
                      (change) => `
                        <tr>
                          <td><strong>${escapeHtml(change.resourceName)}</strong><br><span class="subtle">${escapeHtml(change.resourceId)}</span></td>
                          <td>${statusPill(change.changeType, change.changeType)}</td>
                          <td>${escapeHtml(change.resourceType || "Unknown")}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `<tr><td colspan="3">Azure did not report any changes for this workload template.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderWorkloadDeployment() {
  const result = appState.workloadDeployment;
  if (!result) return "";
  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Workload deployment</h3>${statusPill("failed", "Blocked")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header"><h3>Workload deployment</h3>${statusPill("success", result.status)}</div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Resource</th><th>Type</th><th>Resource ID</th></tr></thead>
          <tbody>
            ${result.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong></td>
                    <td>${escapeHtml(resource.type)}</td>
                    <td>${escapeHtml(resource.resourceId)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderWorkloadTeardown() {
  const result = appState.workloadTeardown;
  if (!result) return "";
  if (result.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Workload teardown</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(result.message)}</p></div>
      </section>
    `;
  }
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header"><h3>Workload teardown</h3>${statusPill(result.status === "succeeded" ? "success" : "warning", result.status)}</div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Resource</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            ${result.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.name)}</strong><br><span class="subtle">${escapeHtml(resource.type)}</span></td>
                    <td>${statusPill(resource.status, resource.status)}</td>
                    <td>${escapeHtml(resource.detail || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCicd() {
  return `
    ${panelHeader(
      "CI/CD Promotion Model",
      "New apps from user teams are shipped through golden path templates and promoted as immutable artifacts."
    )}
    <section class="pipeline">
      ${deploymentStages
        .map(
          (stage, index) => `
            <div class="stage">
              <span class="stage-number">${index + 1}</span>
              <h3>${escapeHtml(stage.name)}</h3>
              <p class="subtle">${escapeHtml(stage.detail)}</p>
            </div>
          `
        )
        .join("")}
    </section>
    <section class="callout" style="margin-top: 14px;">
      <strong>Default hosting rule:</strong> Container Apps for most new agentic apps, App Service for simpler web/API apps, AKS only when a platform team needs advanced Kubernetes controls.
    </section>
    ${renderRegistryStrategy(appState.config)}
    ${renderImagePackaging(appState.readinessReport)}
    ${renderDevOpsOnboarding()}
  `;
}

function renderRegistryStrategy(cfg) {
  const cicd = cfg?.cicd || {};
  const strategy = cicd.imageRegistryStrategy || "ghcr";
  const registryLabel =
    strategy === "acr"
      ? "Azure Container Registry"
      : strategy === "local-archive"
        ? "Local archive"
        : "GitHub Container Registry";
  const registryReady = strategy === "ghcr" || strategy === "local-archive" || Boolean(cicd.workloadRegistryServer);
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Registry strategy</h3>
        ${statusPill(registryReady ? "ready" : "warning", registryLabel)}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(strategy)}</span><span class="metric-label">IMAGE_REGISTRY_STRATEGY</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(cicd.workloadImageConfigured ? "Yes" : "No")}</span><span class="metric-label">WORKLOAD_IMAGE_REFERENCE</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(cicd.workloadDeploymentEnabled ? "Enabled" : "Guarded")}</span><span class="metric-label">Workload deployment</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Option</th><th>Use when</th><th>Billing posture</th></tr></thead>
          <tbody>
            <tr><td><strong>GHCR</strong></td><td>Fastest demo path with GitHub Actions and package permissions.</td><td>No Azure registry resource is created by this app.</td></tr>
            <tr><td><strong>ACR</strong></td><td>Enterprise Azure-native registry, private networking, Microsoft Defender image scanning.</td><td>Creating or using ACR may incur Azure charges.</td></tr>
            <tr><td><strong>Local archive</strong></td><td>Temporary offline packaging using Docker save into artifacts/images.</td><td>No Azure charges, but cannot be deployed to Azure until pushed to a registry.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDevOpsOnboarding() {
  const steps = [
    {
      name: "Start from template",
      owner: "App team",
      detail: "Copy one sample app pattern, keep prompts/evals beside source, and preserve Dockerfile conventions."
    },
    {
      name: "Commit AI artifacts",
      owner: "App team",
      detail: "Version prompts, tool policy, smoke evals, and release manifest inputs with the application code."
    },
    {
      name: "Validate in CI",
      owner: "Pipeline",
      detail: "Run syntax checks, eval JSON validation, image build, and release manifest generation."
    },
    {
      name: "Publish image",
      owner: "Pipeline",
      detail: "Push immutable image tags to GHCR or ACR and capture digest for promotion."
    },
    {
      name: "Promote by manifest",
      owner: "Release approver",
      detail: "Reuse the same image digest from Dev to Test to Prod with what-if, eval, budget, and manual gates."
    }
  ];
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>New app team onboarding</h3>
        ${statusPill("ready", "Golden path")}
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Step</th><th>Owner</th><th>Guidance</th></tr></thead>
          <tbody>
            ${steps
              .map(
                (step) => `
                  <tr>
                    <td><strong>${escapeHtml(step.name)}</strong></td>
                    <td>${escapeHtml(step.owner)}</td>
                    <td>${escapeHtml(step.detail)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderGovernance(cfg) {
  const plan = appState.governancePlan;
  return `
    ${panelHeader(
      "Governance & Limits",
      "Token quotas, Azure budget guardrails, telemetry caps, and kill-switch controls for agentic app consumption.",
      `<button class="btn primary" data-action="load-governance-plan" ${appState.governancePlanBusy ? "disabled" : ""}>${
        appState.governancePlanBusy ? "Generating..." : "Generate Limits Plan"
      }</button>`
    )}
    <section class="grid three">
      <div class="metric"><span class="metric-value">${escapeHtml(cfg.governance.tokenLimitPerSession)}</span><span class="metric-label">Tokens per session</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(cfg.governance.tokenLimitPerUserDaily)}</span><span class="metric-label">Tokens per user per day</span></div>
      <div class="metric"><span class="metric-value">$${escapeHtml(cfg.governance.monthlyBudgetAmount)}</span><span class="metric-label">Monthly budget guardrail</span></div>
    </section>
    <section class="callout billing-warning" style="margin-top: 14px;">
      <strong>Control note:</strong> this tab defines guardrails only. Azure budgets and token quotas need enforcement wiring before they become active controls.
    </section>
    ${renderModelConfiguration(cfg)}
    ${renderGovernancePlan(plan)}
  `;
}

function renderModelConfiguration(cfg) {
  const model = cfg?.modelConfig || {};
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Model configuration</h3>
        ${statusPill(model.realModelCallsEnabled ? "warning" : "ready", model.realModelCallsEnabled ? "Real calls enabled" : "Mock mode")}
      </div>
      <div class="panel-body">
        <div class="grid three">
          <div class="metric"><span class="metric-value">${escapeHtml(model.provider || "github-models")}</span><span class="metric-label">Provider</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(model.chatModel || "Not set")}</span><span class="metric-label">Chat model</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(model.fallbackModel || "Not set")}</span><span class="metric-label">Fallback model</span></div>
        </div>
        <div class="callout ${model.realModelCallsEnabled ? "billing-warning" : ""}" style="margin-top: 14px;">
          <strong>Mode:</strong> ${escapeHtml(model.note || "Mock mode is active by default.")}
        </div>
      </div>
    </section>
  `;
}

function renderGovernancePlan(plan) {
  if (!plan) {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Next action:</strong> generate the limits plan to show how user/session/app/BU token caps and Azure budget alerts will be enforced.
      </section>
    `;
  }

  if (plan.status === "failed") {
    return `
      <section class="panel" style="margin-top: 14px;">
        <div class="panel-header"><h3>Governance plan</h3>${statusPill("failed", "Failed")}</div>
        <div class="panel-body"><p class="subtle">${escapeHtml(plan.message)}</p></div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Token and spend guardrails</h3>
        ${statusPill("ready", "Ready")}
      </div>
      <div class="panel-body">
        <div class="grid three" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(plan.tokenWarningThreshold)}%</span><span class="metric-label">Warning threshold</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.logAnalyticsDailyCapGb)} GB</span><span class="metric-label">Log Analytics daily cap</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.monthlyBudget.thresholds.join(", "))}</span><span class="metric-label">Budget alert thresholds</span></div>
        </div>
        <div class="callout" style="margin-bottom: 14px;">
          <strong>Budget behavior:</strong> ${escapeHtml(plan.monthlyBudget.note)}
        </div>
        <h3>Token limits</h3>
        <table class="table" style="margin-top: 10px;">
          <thead><tr><th>Scope</th><th>Limit</th><th>Window</th><th>Enforcement</th><th>Action at limit</th></tr></thead>
          <tbody>
            ${plan.tokenLimits
              .map(
                (limit) => `
                  <tr>
                    <td><strong>${escapeHtml(limit.scope)}</strong></td>
                    <td>${escapeHtml(limit.limit)}</td>
                    <td>${escapeHtml(limit.window)}</td>
                    <td>${escapeHtml(limit.enforcement)}</td>
                    <td>${escapeHtml(limit.actionAtLimit)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <h3 style="margin-top: 18px;">Budget actions</h3>
        <table class="table" style="margin-top: 10px;">
          <thead><tr><th>Threshold</th><th>Estimated amount</th><th>Action</th></tr></thead>
          <tbody>
            ${plan.budgetControls
              .map(
                (control) => `
                  <tr>
                    <td>${statusPill(control.threshold >= 90 ? "warning" : "info", `${control.threshold}%`)}</td>
                    <td>$${escapeHtml(control.estimatedAmount)}</td>
                    <td>${escapeHtml(control.action)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <h3 style="margin-top: 18px;">Enforcement layers</h3>
        <table class="table" style="margin-top: 10px;">
          <thead><tr><th>Layer</th><th>Status</th><th>Responsibility</th></tr></thead>
          <tbody>
            ${plan.enforcementLayers
              .map(
                (layer) => `
                  <tr>
                    <td><strong>${escapeHtml(layer.layer)}</strong></td>
                    <td>${statusPill(layer.status.toLowerCase().replaceAll(" ", "-"), layer.status)}</td>
                    <td>${escapeHtml(layer.responsibility)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <div class="grid two" style="margin-top: 14px;">
          <div>
            <h3>Business-unit policy</h3>
            <table class="table" style="margin-top: 10px;">
              <thead><tr><th>BU</th><th>Daily tokens</th><th>Model policy</th></tr></thead>
              <tbody>
                ${plan.businessUnitPolicies
                  .map(
                    (policy) => `
                      <tr>
                        <td><strong>${escapeHtml(policy.businessUnit)}</strong><br><span class="subtle">${escapeHtml(policy.costCenter)}</span></td>
                        <td>${escapeHtml(policy.dailyTokenLimit)}</td>
                        <td>${escapeHtml(policy.defaultModelPolicy)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Environment policy</h3>
            <table class="table" style="margin-top: 10px;">
              <thead><tr><th>Environment</th><th>Token multiplier</th><th>Gate</th></tr></thead>
              <tbody>
                ${plan.environmentPolicies
                  .map(
                    (policy) => `
                      <tr>
                        <td><strong>${escapeHtml(policy.environment)}</strong></td>
                        <td>${escapeHtml(policy.tokenMultiplier)}</td>
                        <td>${escapeHtml(policy.deploymentGate)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
        <h3 style="margin-top: 18px;">Implementation steps</h3>
        <ul>
          ${plan.implementationSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ul>
      </div>
    </section>
  `;
}

function renderActivity() {
  return `
    ${panelHeader(
      "Activity Log",
      "Every setup, validation, deployment, promotion, and teardown action will be written here for demo visibility."
    )}
    <pre class="activity-log">${escapeHtml(formatActivity())}</pre>
  `;
}

function formatActivity() {
  if (!appState.activity.length) {
    return "No activity yet.";
  }
  return appState.activity
    .map((entry) => {
      const time = new Date(entry.time).toLocaleString();
      const detail = entry.details ? `\n    ${entry.details}` : "";
      return `[${time}] ${String(entry.level || "info").toUpperCase()}  ${entry.message}${detail}`;
    })
    .join("\n");
}

function renderTesting() {
  return `
    ${panelHeader(
      "Test Guide",
      "Use the local mock apps first, then repeat the same prompts against deployed URLs after workload promotion."
    )}
    <section class="grid three">
      <div class="panel pad">
        <h3>1. Start</h3>
        <p class="subtle">Run the sample app start commands shown below for any app that is stopped.</p>
      </div>
      <div class="panel pad">
        <h3>2. Check</h3>
        <p class="subtle">Use Check All Local Apps to confirm the demo surfaces are responding before presenting.</p>
      </div>
      <div class="panel pad">
        <h3>3. Demo</h3>
        <p class="subtle">Open each app and run the smoke prompt, then point back to the workload plan and promotion gates.</p>
      </div>
    </section>
    ${renderSampleAppReadiness()}
    ${renderSelectedWorkloadTesting()}
  `;
}

function renderDemoScript(cfg) {
  const agenda = [
    {
      title: "Platform control tower",
      tab: "Readiness",
      talkTrack: "Start with the go/no-go dashboard. Explain that the platform can validate local apps, governance, packaging, Azure status, billing posture, and teardown readiness before deployment."
    },
    {
      title: "Enterprise platform foundation",
      tab: "Platform Blueprint",
      talkTrack: "Show the Dev/Test/Prod resource group layout, Foundry project, AI Search, telemetry, Key Vault, Storage, managed identity, and Container Apps environment."
    },
    {
      title: "Business-unit consumption",
      tab: "Business Units",
      talkTrack: "Explain that Finance, HR, and Manufacturing can consume the same platform with isolated resource groups, tags, cost centers, and model policy."
    },
    {
      title: "Agentic app factory",
      tab: "Agentic Apps",
      talkTrack: "Generate a workload plan and show how app teams get source, prompts, evals, IaC, image, release manifest, and promotion gates."
    },
    {
      title: "Live sample apps",
      tab: "Test Guide",
      talkTrack: "Run all smoke tests from the portal, then open each local app to show a grounded copilot, a multi-agent writer, and a tool-using operations agent."
    },
    {
      title: "Governance",
      tab: "Governance",
      talkTrack: "Show token caps, model mode, budget thresholds, Log Analytics cap, and enforcement layers before real model calls are enabled."
    },
    {
      title: "CI/CD and promotion",
      tab: "CI/CD",
      talkTrack: "Show GitHub/Azure DevOps templates, image packaging, registry strategy, immutable manifests, and manual gates for Test and Prod."
    },
    {
      title: "Cleanup discipline",
      tab: "Teardown",
      talkTrack: "Close by showing the teardown rehearsal: what gets deleted, what remains, and why this is critical for cost control after demos."
    }
  ];

  return `
    ${panelHeader(
      "Leadership Demo Script",
      "A click-by-click narrative for showing how Microsoft Foundry becomes an enterprise AI platform, not a one-off app."
    )}
    <section class="grid three">
      <div class="metric"><span class="metric-value">${escapeHtml(cfg?.businessUnits?.length || 3)}</span><span class="metric-label">Business units</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(sampleApps.length)}</span><span class="metric-label">Agentic app patterns</span></div>
      <div class="metric"><span class="metric-value">${escapeHtml(cfg?.environments?.length || 3)}</span><span class="metric-label">Environments</span></div>
    </section>
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Recommended flow</h3>
        ${statusPill("ready", "15-20 min")}
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Segment</th><th>Portal tab</th><th>Talking point</th></tr></thead>
          <tbody>
            ${agenda
              .map(
                (item) => `
                  <tr>
                    <td><strong>${escapeHtml(item.title)}</strong></td>
                    <td>${escapeHtml(item.tab)}</td>
                    <td>${escapeHtml(item.talkTrack)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
    <section class="grid three" style="margin-top: 14px;">
      ${sampleApps
        .map(
          (app) => `
            <article class="panel pad">
              <h3>${escapeHtml(app.name)}</h3>
              <p class="small-label">${escapeHtml(app.defaultBusinessUnit.toUpperCase())} / ${escapeHtml(app.type)}</p>
              <p class="subtle">${escapeHtml(app.proves)}</p>
              <div class="callout" style="margin-top: 12px;">
                <strong>Prompt:</strong> ${escapeHtml(app.smokePrompt)}
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderSelectedWorkloadTesting() {
  const plan = appState.workloadPlan;
  if (!plan || plan.status === "failed") {
    return `
      <section class="callout" style="margin-top: 14px;">
        <strong>Workload-specific testing:</strong> generate a plan in the Agentic Apps tab to populate app URL pattern, prompts, expected signals, and telemetry checks.
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>${escapeHtml(plan.app.name)} test run</h3>
        ${statusPill("info", `${plan.businessUnit.name} / ${plan.environment.name}`)}
      </div>
      <div class="panel-body">
        <div class="grid two" style="margin-bottom: 14px;">
          <div class="metric"><span class="metric-value">${escapeHtml(plan.testGuide.urlPattern)}</span><span class="metric-label">Expected URL pattern</span></div>
          <div class="metric"><span class="metric-value">${escapeHtml(plan.modelPolicy.preferredModel)}</span><span class="metric-label">Configured model</span></div>
        </div>
        <table class="table">
          <thead><tr><th>Prompt</th><th>Expected signal</th></tr></thead>
          <tbody>
            ${plan.testGuide.prompts
              .map(
                (prompt, index) => `
                  <tr>
                    <td>${escapeHtml(prompt)}</td>
                    <td>${escapeHtml(plan.testGuide.expectedSignals[index] || plan.testGuide.expectedSignals.at(-1))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderTeardown(cfg) {
  const environments = cfg?.environments?.length
    ? cfg.environments
    : [
        { key: "dev", name: "Dev" },
        { key: "test", name: "Test" },
        { key: "prod", name: "Prod" }
      ];
  const prefix = cfg?.azure?.resourcePrefix || "msfoundryv1";

  return `
    ${panelHeader(
      "Demo Teardown",
      "A controlled cleanup step will delete selected environments after the demo and produce a deletion report."
    )}
    <section class="grid three">
      ${environments
        .map(
          (env) => `
            <div class="panel pad danger-zone">
              <h3>${escapeHtml(env.name)} Platform Core</h3>
              <p class="subtle">Deletes billable ${escapeHtml(env.name)} Core resources inside <strong>${escapeHtml(prefix)}-platform-${escapeHtml(env.key)}-rg</strong> while preserving the foundation resource group.</p>
              ${platformCoreTeardownActions(env.key)}
            </div>
          `
        )
        .join("")}
    </section>
    <section class="panel pad" style="margin-top: 14px;">
        <h3>Remaining Teardown Workflows</h3>
        <p class="subtle">Full environment and foundation teardown will be added after Test/Prod platform and app deployments exist.</p>
        <ul>
          <li>Delete sample apps and BU resources.</li>
          <li>Delete all platform core resources by environment.</li>
          <li>Delete foundation resource groups after final confirmation.</li>
          <li>Export final activity and cost report before deletion.</li>
        </ul>
    </section>
    ${renderTeardownRehearsal(prefix)}
    ${renderPlatformCoreStatus()}
    ${renderPlatformCoreTeardown()}
  `;
}

function renderTeardownRehearsal(prefix) {
  const rows = [
    {
      step: "Workload apps",
      deletes: "Container Apps or App Service apps, workload managed identities, workload-specific settings.",
      remains: "Shared Platform Core and foundation resource groups.",
      verify: "Workload status shows Missing or Deleted for app resources."
    },
    {
      step: "Platform Core",
      deletes: "Foundry account/project, AI Search, Container Apps environment, telemetry, Key Vault, Storage, managed identity.",
      remains: `${prefix}-platform-<env>-rg resource group and foundation layout.`,
      verify: "Platform Core status shows resources missing or deleted."
    },
    {
      step: "Foundation",
      deletes: "Foundation and BU/environment resource groups after final approval.",
      remains: "Key Vault soft-delete records may persist until retention or purge.",
      verify: "Azure portal/resource graph shows no remaining demo resources with the prefix."
    },
    {
      step: "Cost closure",
      deletes: "No resource deletion here; this is a verification step.",
      remains: "Cost Management may lag before reflecting deletion.",
      verify: "Run month-to-date billing and confirm no unexpected active resources remain."
    }
  ];
  return `
    <section class="panel" style="margin-top: 14px;">
      <div class="panel-header">
        <h3>Teardown rehearsal</h3>
        ${statusPill("ready", "Required before deploy")}
      </div>
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>Step</th><th>Deletes</th><th>Remains / caveat</th><th>Verification</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.step)}</strong></td>
                    <td>${escapeHtml(row.deletes)}</td>
                    <td>${escapeHtml(row.remains)}</td>
                    <td>${escapeHtml(row.verify)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <div class="callout billing-warning" style="margin-top: 14px;">
          <strong>Billing reminder:</strong> any deployed Azure workload or Platform Core resource can keep incurring charges until the relevant teardown step completes and resource status is verified.
        </div>
      </div>
    </section>
  `;
}

async function start() {
  try {
    await loadState();
  } catch (error) {
    appState.config = {
      azure: {},
      foundry: {},
      businessUnits: [],
      environments: [],
      cicd: {},
      governance: {}
    };
    appState.activity = [
      {
        time: new Date().toISOString(),
        level: "error",
        message: `Failed to load portal state: ${error.message}`
      }
    ];
  }
  renderShell();
}

start();
