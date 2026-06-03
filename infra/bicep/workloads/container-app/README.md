# Container App Workload Template

Resource-group-scope template for agentic apps hosted on Azure Container Apps.

It creates:

- User-assigned managed identity.
- Public Container App in the shared Platform Core Container Apps environment.
- Single active revision with scale-to-zero enabled for demos.

Use this for most new agentic applications unless the app specifically needs App Service features or AKS-level controls.
