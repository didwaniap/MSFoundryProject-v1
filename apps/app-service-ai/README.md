# Azure App Service AI Scenario

Mock-first tool-using agent sample for the Microsoft Foundry platform demo.

This app represents a Manufacturing BU workload hosted on Azure App Service. It shows how a Foundry-backed agent can call enterprise application APIs as governed tools while respecting token limits and approval policy.

## Run locally

```bash
npm start
```

From the project root:

```bash
npm run start:appservice
```

Open:

```text
http://127.0.0.1:4613
```

## Demo behavior

- `GET /health` returns app health.
- `POST /api/agent` runs a deterministic mock agent workflow.
- `GET /api/tools/tasks` returns the in-memory task list.
- Policy or safety-sensitive actions are blocked or marked approval-required.
- No LLM calls are made unless `APP_SERVICE_AI_MOCK_MODE=false` is used in a future integration.

App Service deployment should remain deferred until quota, image registry, and budget guardrails are confirmed.
