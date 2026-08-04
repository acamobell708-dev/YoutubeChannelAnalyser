@description('Azure region of the existing managed environment and new Container App.')
param location string = resourceGroup().location

@description('Full Azure resource ID of the existing Container Apps managed environment to use.')
param existingManagedEnvironmentId string

@description('A globally unique name for the Azure Container App.')
param containerAppName string

@description('Immutable public GHCR image reference, including its commit SHA tag.')
param containerImage string

@secure()
@description('Server-side YouTube Data API key.')
param youtubeApiKey string

@secure()
@description('Server-side OpenAI project API key.')
param openaiApiKey string

@secure()
@description('Optional OpenAI organisation admin key used by the daily token guard.')
param openaiAdminKey string = ''

@secure()
@description('Google OAuth web client ID.')
param googleOAuthClientId string = ''

@secure()
@description('Google OAuth web client secret.')
param googleOAuthClientSecret string = ''

@description('Exact HTTPS Google OAuth callback URL for this Container App.')
param googleOAuthRedirectUri string = ''

@secure()
@description('At least 32 characters; signs browser session cookies.')
param sessionSecret string = ''

@description('Optional OpenAI video-analysis model override.')
param openaiVideoModel string = 'gpt-5.4'

@description('Optional OpenAI channel-analysis model override.')
param openaiChannelModel string = 'gpt-5.4'

@description('Expose the static Synthetic Short test controls and route.')
param enableDevFixtures bool = true

resource app 'Microsoft.App/containerApps@2025-07-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: existingManagedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: concat([
        {
          name: 'youtube-api-key'
          value: youtubeApiKey
        }
        {
          name: 'openai-api-key'
          value: openaiApiKey
        }
        {
          name: 'google-oauth-client-id'
          value: googleOAuthClientId
        }
        {
          name: 'google-oauth-client-secret'
          value: googleOAuthClientSecret
        }
        {
          name: 'session-secret'
          value: sessionSecret
        }
      ], empty(openaiAdminKey) ? [] : [
        {
          name: 'openai-admin-key'
          value: openaiAdminKey
        }
      ])
    }
    template: {
      containers: [
        {
          name: 'youtube-signal-lab'
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat([
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'ENABLE_DEV_FIXTURES'
              value: enableDevFixtures ? 'true' : 'false'
            }
            {
              name: 'YOUTUBE_API_KEY'
              secretRef: 'youtube-api-key'
            }
            {
              name: 'OPENAI_API_KEY'
              secretRef: 'openai-api-key'
            }
            {
              name: 'GOOGLE_OAUTH_CLIENT_ID'
              secretRef: 'google-oauth-client-id'
            }
            {
              name: 'GOOGLE_OAUTH_CLIENT_SECRET'
              secretRef: 'google-oauth-client-secret'
            }
            {
              name: 'GOOGLE_OAUTH_REDIRECT_URI'
              value: googleOAuthRedirectUri
            }
            {
              name: 'SESSION_SECRET'
              secretRef: 'session-secret'
            }
            {
              name: 'OPENAI_VIDEO_MODEL'
              value: openaiVideoModel
            }
            {
              name: 'OPENAI_CHANNEL_MODEL'
              value: openaiChannelModel
            }
          ], empty(openaiAdminKey) ? [] : [
            {
              name: 'OPENAI_ADMIN_KEY'
              secretRef: 'openai-admin-key'
            }
          ])
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http-requests'
            http: {
              metadata: {
                concurrentRequests: '1'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    application: 'youtube-signal-lab'
    costProfile: 'personal-scale-to-zero'
  }
}

output applicationUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output googleOAuthCallbackUrl string = 'https://${app.properties.configuration.ingress.fqdn}/auth/google/callback'
