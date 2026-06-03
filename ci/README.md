# CI/CD Templates

This folder documents the pipeline posture for app teams consuming the Microsoft Foundry demo platform.

## Sample App Pipelines

Templates:

- GitHub Actions: `.github/workflows/retail-copilot-ci.yml`
- Azure DevOps: `azure-pipelines/retail-copilot-ci.yml`

Default behavior:

- Validate JavaScript and eval artifacts.
- Build the container image.
- Generate a release manifest.
- Keep image push and promotion behind explicit switches/manual approval.

Release manifest commands:

- `npm run manifest:retail:dev`
- `npm run manifest:writer:dev`
- `npm run manifest:appservice:dev`

Registry and Dev deployment readiness:

- See `ci/registry-and-dev-deploy.md`.
- GHCR is the default fast demo path.
- ACR is available as an enterprise option, but creating or using ACR may incur Azure charges.

Deployment remains disabled until:

- A real image is available in a registry.
- `WORKLOAD_IMAGE_REFERENCE` is set.
- `ENABLE_WORKLOAD_DEPLOYMENT=true` is set.
- The portal what-if output is reviewed.
- The typed workload deployment confirmation is supplied.
