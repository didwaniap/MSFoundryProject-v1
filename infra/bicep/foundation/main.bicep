targetScope = 'subscription'

@description('Azure region for the foundation resource groups.')
param location string = 'eastus2'

@description('Short lowercase prefix used in all demo resource group names.')
param resourcePrefix string

@description('Deployment environments to create. Recommended values are dev, test, and prod.')
param environments array = [
  'dev'
  'test'
  'prod'
]

@description('Business units to onboard into every enabled environment.')
param businessUnits array = [
  {
    key: 'finance'
    name: 'Finance'
    costCenter: 'FIN-DEMO'
  }
  {
    key: 'hr'
    name: 'HR'
    costCenter: 'HR-DEMO'
  }
  {
    key: 'manufacturing'
    name: 'Manufacturing'
    costCenter: 'MFG-DEMO'
  }
]

@description('Common tags applied to every foundation resource group.')
param commonTags object = {}

var prefix = toLower(resourcePrefix)
var baseTags = union(commonTags, {
  Project: 'MSFoundryProject-v1'
  Workload: 'Microsoft Foundry Leadership Demo'
  ManagedBy: 'Bicep'
  ResourcePrefix: prefix
  Demo: 'true'
})

var businessUnitEnvironmentPairs = flatten([
  for environment in environments: [
    for businessUnit in businessUnits: {
      environment: toLower(environment)
      businessUnit: businessUnit
    }
  ]
])

resource opsResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${prefix}-ops-rg'
  location: location
  tags: union(baseTags, {
    Environment: 'shared'
    BusinessUnit: 'platform'
    Purpose: 'operations'
  })
}

resource platformResourceGroups 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for environment in environments: {
    name: '${prefix}-platform-${toLower(environment)}-rg'
    location: location
    tags: union(baseTags, {
      Environment: toLower(environment)
      BusinessUnit: 'platform'
      Purpose: 'platform'
    })
  }
]

resource businessUnitResourceGroups 'Microsoft.Resources/resourceGroups@2024-03-01' = [
  for item in businessUnitEnvironmentPairs: {
    name: '${prefix}-${toLower(item.businessUnit.key)}-${item.environment}-rg'
    location: location
    tags: union(baseTags, {
      Environment: item.environment
      BusinessUnit: item.businessUnit.name
      CostCenter: item.businessUnit.costCenter
      Purpose: 'agentic-apps'
    })
  }
]

output operationsResourceGroup string = opsResourceGroup.name
output platformResourceGroups array = [for resourceGroup in platformResourceGroups: resourceGroup.name]
output businessUnitResourceGroups array = [for resourceGroup in businessUnitResourceGroups: resourceGroup.name]
output allResourceGroups array = concat(
  [
    opsResourceGroup.name
  ],
  [for resourceGroup in platformResourceGroups: resourceGroup.name],
  [for resourceGroup in businessUnitResourceGroups: resourceGroup.name]
)

