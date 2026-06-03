# Contoso Chat Retail Copilot

Mock-first RAG copilot sample for the Microsoft Foundry platform demo.

This app is intentionally runnable before any model wiring exists. It uses local product data and mock grounded responses, so local testing does not generate LLM token charges.

## Run Locally

From the repo root:

```bash
npm run start:retail
```

Then open:

```text
http://127.0.0.1:4611
```

## Endpoints

- `GET /health` returns app readiness.
- `GET /api/products` returns the local mock product catalog.
- `POST /api/chat` returns a grounded mock answer with source facts and estimated token usage.

## Guardrails

- `TOKEN_LIMIT_PER_REQUEST` defaults to `1200`.
- `TOKEN_LIMIT_PER_SESSION` defaults to `5000`.
- `RETAIL_COPILOT_MOCK_MODE` defaults to mock mode.

## Deployment Shape

- Hosted target: Azure Container Apps.
- Container port: `8080`.
- Image is built from `Dockerfile`.
- Model calls should remain disabled until Foundry model configuration and token ledger middleware are wired in.

## Image And Release Manifest

Build the local image:

```bash
npm run docker:retail
```

Generate a Dev release manifest:

```bash
npm run manifest:retail:dev
```

The manifest is written to:

```text
artifacts/releases/retail-copilot/dev/manifest.json
```

CI/CD templates are provided for GitHub Actions and Azure DevOps. They validate source, build the image, generate the manifest, and keep push/promotion behind explicit gates.
