# Registry And Dev Deploy Readiness

The fastest demo path is GitHub Container Registry.

## Recommended path

1. Run the app CI workflow with `push_image=false` for validation.
2. Run it again with `push_image=true` after GitHub package permissions are confirmed.
3. Copy the immutable image reference into `.env` as `WORKLOAD_IMAGE_REFERENCE`.
4. Generate the workload plan in the portal and review the Dev deployment preflight.
5. Set `ENABLE_WORKLOAD_DEPLOYMENT=true` only after budget, image, Dev Core, and teardown readiness are confirmed.
6. Use the portal deploy button, which still requires typed confirmation and billing acknowledgement.

## Registry options

- `IMAGE_REGISTRY_STRATEGY=ghcr`: no Azure registry resource is created by this app.
- `IMAGE_REGISTRY_STRATEGY=acr`: enterprise Azure-native path. Creating or using Azure Container Registry may incur Azure charges.
- `IMAGE_REGISTRY_STRATEGY=local-archive`: temporary local packaging path. Use `npm run image:retail:save` to write a `.tar` under `artifacts/images`. Azure deployment still requires a registry image later.

## Local archive commands

```bash
npm run image:retail:save
npm run image:writer:save
npm run image:appservice:save
```

The script writes metadata with a SHA256 hash next to the archive. This is useful for offline review or handoff, but it is not a deployable Azure Container Apps source by itself.

## Billing reminder

Deploying a workload to Dev can create or use Azure hosting, telemetry, storage, model inference, and networking resources. Leave `ENABLE_WORKLOAD_DEPLOYMENT=false` until you intentionally want to create those resources and are ready to tear them down after the demo.
