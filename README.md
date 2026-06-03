# MSFoundryProject-v1

Enterprise demo portal for standing up Microsoft Foundry platform patterns across business units, environments, and agentic applications.

## Run locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4591
```

## Current scope

- Tabbed portal UI for platform setup and demo flow.
- Sanitized `.env` configuration display.
- Read-only Azure prerequisite validation endpoint.
- Azure resource provider registration action for missing setup dependencies.
- Read-only month-to-date billing lookup through Azure Cost Management.
- Activity log surface for setup, deployment, promotion, and teardown events.
- Logical sections for Azure setup, business units, environments, app gallery, CI/CD, test guide, and cleanup.
- Foundation Bicep scaffold for resource groups, environment layout, BU isolation, and tags.
- Live Azure Resource Manager what-if preview for the foundation deployment.
- Confirmed Azure Resource Manager deployment action for the foundation resource groups.
- Foundation status checks and Dev platform core what-if scaffolding.
- Guarded Dev/Test/Prod platform core deployment with explicit billing acknowledgement.
- Guarded Dev/Test/Prod platform core teardown to delete billable Platform Core resources while preserving foundation resource groups.
- App Factory planner for BU-specific agentic app workload plans across Dev/Test/Prod.
- Guarded workload lifecycle endpoints for status, what-if, deployment, and teardown.
- Governance & Limits planner for token caps, budget thresholds, telemetry caps, and enforcement layers.
- Workload IaC scaffolds for Azure Container Apps and Azure App Service hosting patterns.
- Sample app scaffold placeholders for Retail Copilot, Creative Writer, and App Service AI.
- Runnable mock Contoso Chat Retail Copilot with local chat UI, health endpoint, Dockerfile, prompts, and smoke evals.
- Runnable mock Contoso Creative Writer with writer/reviewer/compliance agents, health endpoint, Dockerfile, prompts, and smoke evals.
- Runnable mock Azure App Service AI Scenario with tool trace, approval gate, health endpoint, Dockerfile, prompts, and smoke evals.
- CI/CD templates and release manifest packaging for sample app promotion metadata.
- Portal-driven local smoke test runner across all three sample apps.
- Shared sample-app token governance helper with request/session/user/app/BU limit checks.
- Registry strategy and guarded Dev workload deployment preflight.
- Pre-deployment readiness dashboard, URL matrix, teardown rehearsal, and leadership demo script.
- Temporary local image archive packaging with `npm run image:retail:save`, `npm run image:writer:save`, and `npm run image:appservice:save`.

## Next build steps

- Use the GitHub Actions workflows to publish the three sample app images to GHCR.
- Set app-specific image references with `WORKLOAD_IMAGE_RETAIL_COPILOT`, `WORKLOAD_IMAGE_CREATIVE_WRITER`, and `WORKLOAD_IMAGE_APP_SERVICE_AI`.
- Run workload status and what-if checks before creating any Azure workload resources.
- Enable `ENABLE_WORKLOAD_DEPLOYMENT=true` only when ready to create billable Azure workload resources.
- If App Service quota is unavailable, set `ENABLE_APP_SERVICE_AI_CONTAINER_APPS_FALLBACK=true` to host the App Service AI sample on Azure Container Apps for the demo.
- Add app-specific Azure live URLs after deployment.
