# Dev Platform Core Bicep

This resource-group-scope Bicep module defines the first shared Dev platform services for the Microsoft Foundry demo.

## Scope

- User-assigned managed identity.
- Log Analytics workspace.
- Workspace-based Application Insights.
- RBAC-enabled Key Vault.
- Hardened StorageV2 account.
- Azure AI Search service using the free tier.
- Azure Container Apps managed environment.
- Microsoft Foundry AI Services account.
- Default Dev Foundry project.

## Deferred By Default

- App Service plan is disabled by default because the current subscription reported App Service Plan VM quota `0` during what-if validation.
- Set `enableAppServicePlan` / `ENABLE_APP_SERVICE_PLAN=true` only after App Service quota is available.

## Preview

Use the portal action:

```text
Platform Blueprint > What-if Dev Core
```

Equivalent Azure CLI command:

```bash
az deployment group what-if \
  --resource-group msfoundryv1-platform-dev-rg \
  --name msfoundryv1-platform-core-dev \
  --template-file infra/bicep/platform-core/dev/main.bicep \
  --parameters infra/bicep/platform-core/dev/main.parameters.json
```

## Deployment Note

Do not deploy this layer until the what-if output is clean. Some resources are usage-based or have subscription-level free-tier constraints.

The portal requires a billing acknowledgement before deployment because Log Analytics, Key Vault, Storage, Azure AI Search, Container Apps Environment, and Foundry resources can accrue charges until deleted.

## Teardown

Use the portal action:

```text
Teardown > Teardown Dev Core
```

This deletes Dev Core resources inside `msfoundryv1-platform-dev-rg` but preserves the resource group and the foundation layout.
