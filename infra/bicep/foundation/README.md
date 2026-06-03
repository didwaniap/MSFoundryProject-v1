# Foundation Bicep

This subscription-scope Bicep module creates the first Azure landing structure for the Microsoft Foundry demo platform.

## Scope

- One shared operations resource group.
- One platform resource group per environment.
- One business-unit resource group per environment.
- Consistent tags for ownership, environment, business unit, purpose, and demo cleanup.

## Deploy

From the portal, use **Platform Blueprint > Deploy Foundation** after reviewing the what-if output.

Equivalent Azure CLI command:

```bash
az deployment sub create \
  --name msfoundryv1-foundation \
  --location eastus2 \
  --template-file infra/bicep/foundation/main.bicep \
  --parameters infra/bicep/foundation/main.parameters.json
```

## What This Does Not Create Yet

- Microsoft Foundry resources.
- Azure Container Apps environments.
- App Service plans.
- Azure AI Search.
- Key Vault.
- Application Insights.
- Budgets.

Those come in later modules after the resource-group layout is confirmed.
