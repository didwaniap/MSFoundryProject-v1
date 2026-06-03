# Pre-Deployment Readiness

Use the portal Readiness tab before deploying any app workload to Azure.

## Go / No-Go checks

- Local sample apps are responding.
- Portal smoke tests pass for Retail Copilot, Creative Writer, and App Service AI.
- Docker or CI image build path is available.
- Local image archive is present if using the temporary local packaging path.
- `WORKLOAD_IMAGE_REFERENCE` points to a registry image Azure can pull.
- Token limits are configured.
- Real model calls are intentionally enabled or mock mode remains active.
- Dev Platform Core status is checked.
- Month-to-date billing is reviewed.
- Teardown rehearsal is understood.
- Deployment billing acknowledgement is accepted only when you are ready to create billable resources.

## Billing note

Readiness checks are read-only. Actual workload deployment can create Azure hosting, telemetry, storage, and model inference charges until teardown completes.

Local image archives are non-billable and useful for packaging review. Azure deployment still requires a registry image reference.
