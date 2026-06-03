targetScope = 'resourceGroup'

@description('Azure region for the workload resources.')
param location string = resourceGroup().location

@description('Container App name.')
param appName string

@description('User-assigned identity name for the workload.')
param managedIdentityName string

@description('Resource ID of the shared Azure Container Apps managed environment from Platform Core.')
param containerAppsEnvironmentId string

@description('Container image reference promoted by the CI/CD pipeline.')
param image string

@description('Container target port.')
param targetPort int = 8080

@description('Non-secret environment variables for the workload container.')
param environmentVariables array = []

@description('Common tags applied to workload resources.')
param commonTags object = {}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: commonTags
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'app'
          image: image
          env: [for item in environmentVariables: {
            name: item.name
            value: item.value
          }]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output appName string = containerApp.name
output workloadIdentityName string = managedIdentity.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
