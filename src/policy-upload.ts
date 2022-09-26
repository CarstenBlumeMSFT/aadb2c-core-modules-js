import * as fs from 'fs'
import {DOMParser} from 'xmldom'
import ILogger from './logger-interface'
import upath from 'upath'
import glob from 'glob'
import 'isomorphic-fetch'
import {Client} from '@microsoft/microsoft-graph-client'
import {MSALClientCredentialsAuthProvider} from './msal-auth'
import {Readable} from 'stream'

interface IPolicy {
  policyInfo: PolicyInfoObj
  xmlData: string
  queued: boolean
}

interface PolicyInfoObj {
  PolicyId: string
  BasePolicyId: string
  TenantId: string
}

// Upload all policies entrypoint
export default async function PolicyUpload(
  policiesPath: string,
  authProvider: MSALClientCredentialsAuthProvider,
  logger: ILogger
): Promise<void> {
  policiesPath = upath.normalize(policiesPath)
  const policyFilter: string = upath.join(policiesPath, '**/*.xml')

  logger.startGroup(`Searching policy files matching: ${policyFilter}`)

  const files = glob.sync(policyFilter)

  //load all policies in memory
  const policies = loadPolicies(files, logger)

  if (!policies || policies.size === 0) {
    logger.logError(`No B2C policies found in ${policiesPath}`)
    return
  }

  logger.endGroup()

  const policyUploadQueue: IPolicy[] = []
  //upload policies recursively
  for (const policy of policies) {
    queuePolicyForUpload(policy[1], policies, policyUploadQueue)
  }

  logger.logInfo('Creating upload client...')
  const client = Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'beta'
  })

  logger.startGroup('Uploading policy files...')
  for (const policyUpload of policyUploadQueue) {
    const fileStream = new Readable()
    fileStream.push(policyUpload.xmlData)
    fileStream.push(null) // Indicates end of file/stream

    logger.logInfo(`Uploading ${policyUpload.policyInfo.PolicyId}...`)
    // Upload the policy
    await client
      .api(`trustFramework/policies/${policyUpload.policyInfo.PolicyId}/$value`)
      .putStream(fileStream)
  }
  logger.endGroup()
}

function queuePolicyForUpload(
  policy: IPolicy,
  policies: Map<string, IPolicy>,
  policyUploadQueue: IPolicy[]
): void {
  if (policy.queued) {
    return
  }

  //upload base policy first
  if (policy.policyInfo.BasePolicyId) {
    const basePolicy = policies.get(policy.policyInfo.BasePolicyId)
    if (basePolicy && !basePolicy.queued) {
      queuePolicyForUpload(basePolicy, policies, policyUploadQueue)
    }
  }

  policyUploadQueue.push(policy)
  policy.queued = true
}

function loadPolicies(files: string[], logger: ILogger): Map<string, IPolicy> {
  const result = new Map<string, IPolicy>()
  for (const file of files) {
    try {
      logger.logInfo(`Processing ${file}`)
      const xmlData = fs.readFileSync(file).toString()
      const xmlDoc = new DOMParser().parseFromString(xmlData)

      const policyId = xmlDoc.documentElement.getAttribute('PolicyId')
      const tenantId = xmlDoc.documentElement.getAttribute('TenantId')

      //skip the file if policy id or tenant id are not found
      if (!policyId || !tenantId) {
        logger.logInfo(
          'Skipping file since PolicyId and/or TenantId are not present...'
        )
        continue
      }
      logger.logInfo(`Found policy ${policyId} from tenant ${tenantId}`)

      let basePolicyId = ''
      const basePolicy = xmlDoc.getElementsByTagName('PolicyId')
      if (basePolicy.length !== 0 && basePolicy[0].textContent != null) {
        basePolicyId = basePolicy[0].textContent
        logger.logInfo(`Policy ${policyId} inherits basepolicy ${basePolicyId}`)
      }

      result.set(policyId, {
        policyInfo: {
          TenantId: tenantId,
          PolicyId: policyId,
          BasePolicyId: basePolicyId
        },
        xmlData,
        queued: false
      })
    } catch (error) {
      logger.logError(
        'Error retrieving PolicyId and BasePolicyId from Policy File. Please ensure the file being uploaded is a valid B2C Policy file.'
      )
      throw Error
    }
  }
  return result
}
