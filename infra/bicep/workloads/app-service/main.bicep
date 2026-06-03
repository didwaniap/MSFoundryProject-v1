targetScope = 'resourceGroup'

@description('Azure region for the workload resources.')
param location string = resourceGroup().location

@description('Web App name.')
param appName string

@description('Linux App Service plan name.')
param appServicePlanName string

@description('User-assigned identity name for the workload.')
param managedIdentityName string

@description('Container image reference promoted by the CI/CD pipeline.')
param image string

@description('Non-secret app settings for the workload.')
param appSettings array = []

@description('Common tags applied to workload resources.')
param commonTags object = {}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: commonTags
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  tags: commonTags
  sku: {
    name: 'B1'
    tier: 'Basic'
    size: 'B1'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux,container'
  tags: commonTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${image}'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: appSettings
    }
  }
}

output appName string = webApp.name
output appServicePlanName string = appServicePlan.name
output workloadIdentityName string = managedIdentity.name
output defaultHostName string = webApp.properties.defaultHostName
