import {
  // eslint-disable-next-line import/named
  Configuration,
  LogLevel,
  ConfidentialClientApplication
} from '@azure/msal-node'
import ILogger from './logger-interface'
// eslint-disable-next-line import/named
import {AuthenticationProvider} from '@microsoft/microsoft-graph-client'
import crypto from 'crypto'

export class MSALClientCredentialsAuthProvider
  implements AuthenticationProvider
{
  private msalConfig: Configuration | null = null
  private msalCCA: ConfidentialClientApplication | null = null

  private tokenRequest = {
    scopes: ['https://graph.microsoft.com/.default']
  }

  constructor(tenant: string, clientId: string, logger: ILogger) {
    this.msalConfig = {
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenant}/`,
        knownAuthorities: []
      },
      system: {
        loggerOptions: {
          loggerCallback(
            loglevel: LogLevel,
            message: string,
            containsPii: boolean
          ) {
            if (!containsPii) {
              switch (loglevel) {
                case LogLevel.Error: {
                  logger.logError(message)
                  break
                }
                case LogLevel.Verbose: {
                  logger.logDebug(message)
                  break
                }
                case LogLevel.Warning: {
                  logger.logWarn(message)
                  break
                }
                default: {
                  logger.logInfo(message)
                  break
                }
              }
            }
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Verbose
        }
      }
    }
  }

  initializeWithClientSecret(clientSecret: string): void {
    if (!this.msalConfig) {
      throw Error(
        'MSALClientCredentialsAuthProvider not correctly initialized.'
      )
    } else {
      this.msalConfig.auth.clientSecret = clientSecret
      this.msalCCA = new ConfidentialClientApplication(this.msalConfig)
    }
  }

  initializeWithClientAssertion(clientAssertion: string): void {
    if (!this.msalConfig) {
      throw Error(
        'MSALClientCredentialsAuthProvider not correctly initialized.'
      )
    } else {
      this.msalConfig.auth.clientAssertion = clientAssertion
      this.msalCCA = new ConfidentialClientApplication(this.msalConfig)
    }
  }

  initializeWithClientCertificate(
    clientCertificateThumbprint: string,
    clientCertificateKey: string,
    clientCertificatePass: string
  ): void {
    if (!this.msalConfig) {
      throw Error(
        'MSALClientCredentialsAuthProvider not correctly initialized.'
      )
    } else {
      const privateKeyObject = crypto.createPrivateKey({
        key: clientCertificateKey,
        passphrase: clientCertificatePass,
        format: 'pem'
      })

      const privateKey = privateKeyObject
        .export({
          format: 'pem',
          type: 'pkcs8'
        })
        .toString()

      this.msalConfig.auth.clientCertificate = {
        thumbprint: clientCertificateThumbprint,
        privateKey
      }
      this.msalCCA = new ConfidentialClientApplication(this.msalConfig)
    }
  }

  async getAccessToken(): Promise<string> {
    if (!this.msalCCA) {
      throw Error(
        'MSALClientCredentialsAuthProvider not correctly initialized.'
      )
    } else {
      const authResponse = await this.msalCCA.acquireTokenByClientCredential(
        this.tokenRequest
      )
      if (!authResponse) {
        throw Error('Failed to acquire an authentication token.')
      }
      return authResponse.accessToken
    }
  }
}
