declare module "ebay-oauth-nodejs-client" {
  type EbayOAuthEnvironment = "PRODUCTION" | "SANDBOX"

  interface EbayAuthTokenOptions {
    clientId: string
    clientSecret: string
    redirectUri: string
    env?: EbayOAuthEnvironment
    filePath?: string
  }

  interface GenerateAuthUrlOptions {
    state?: string
    prompt?: string
  }

  class EbayAuthToken {
    constructor(options: EbayAuthTokenOptions)
    generateUserAuthorizationUrl(
      environment: EbayOAuthEnvironment,
      scopes: string[] | string,
      options?: GenerateAuthUrlOptions
    ): string
    exchangeCodeForAccessToken(
      environment: EbayOAuthEnvironment,
      code: string
    ): Promise<string>
    getAccessToken(
      environment: EbayOAuthEnvironment,
      refreshToken: string,
      scopes: string[] | string
    ): Promise<string>
    getApplicationToken(
      environment: EbayOAuthEnvironment,
      scopes?: string[] | string
    ): Promise<string>
  }

  export default EbayAuthToken
}
