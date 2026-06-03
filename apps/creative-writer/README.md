# Contoso Creative Writer

Mock-first multi-agent writing workflow for the Microsoft Foundry platform demo.

This app runs before any model wiring exists. It uses deterministic local agent logic for writer, reviewer, and compliance passes, so local testing does not generate LLM token charges.

## Run Locally

From the repo root:

```bash
npm run start:writer
```

Then open:

```text
http://127.0.0.1:4612
```

## Endpoints

- `GET /health` returns app readiness.
- `POST /api/write` runs the mock writer, reviewer, and compliance workflow.

## Guardrails

- `TOKEN_LIMIT_PER_REQUEST` defaults to `1600`.
- `TOKEN_LIMIT_PER_SESSION` defaults to `6000`.
- `CREATIVE_WRITER_MOCK_MODE` defaults to mock mode.

## Deployment Shape

- Hosted target: Azure Container Apps.
- Container port: `8080`.
- Image is built from `Dockerfile`.
- Model calls should remain disabled until Foundry model configuration and token ledger middleware are wired in.
