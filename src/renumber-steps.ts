import {DOMParser} from 'xmldom'
import {PolicyFile} from './policy-build'
import ILogger from './logger-interface'

export default function RenumberPolicies(
  files: PolicyFile[],
  logger: ILogger
): void {
  const policies: Map<string, Policy> = new Map()
  for (const file of files) {
    let policy = null
    try {
      policy = new Policy(file)
    } catch (e) {
      logger.logWarn(
        `${file.FileName} has invalid XML. Skipping renumber for this file`
      )
      continue
    }
    if (!policy.policyId) {
      continue
    }
    policies.set(policy.policyId, policy)
  }

  // Iterate over all the policies to determine if they have a base file
  for (const policy of policies.values()) {
    const basePolicy = policy.xml.getElementsByTagName('PolicyId')
    if (
      basePolicy.length !== 0 &&
      basePolicy[0].textContent != null &&
      policies.has(basePolicy[0].textContent)
    ) {
      policy.basePolicy = policies.get(basePolicy[0].textContent)
    }
  }

  for (const policy of policies.values()) {
    policy.process(logger)
  }
}

class Policy {
  // eslint-disable-next-line no-undef
  xml: XMLDocument
  file: PolicyFile
  basePolicy: Policy | undefined
  processed: boolean
  policyId: string | null
  journeys: Set<string>
  renumbered: number

  constructor(file: PolicyFile) {
    this.file = file
    this.xml = new DOMParser().parseFromString(file.Data, 'application/xml')
    this.policyId = this.xml.documentElement.getAttribute('PolicyId')
    this.processed = false
    this.journeys = new Set()
    this.renumbered = 0
  }

  hasPolicyId(policyId: string, logger: ILogger): boolean {
    try {
      if (this.journeys.has(policyId)) {
        return true
      }

      const seenBases = new Set()
      const maxDepth = Number(15)
      let currentDepth = 0
      let currentBase: Policy | undefined = this.basePolicy

      // Semi-recursively iterates over the base policies to determine if they have the given policyId
      while (
        currentBase !== null &&
        currentBase !== undefined &&
        currentDepth++ < maxDepth
      ) {
        // If the current base has the policy, we can return true
        if (currentBase.journeys.has(policyId)) {
          return true
        }

        // Add the current base to the seen bases, and advance to the next one
        seenBases.add(currentBase.policyId)
        currentBase = currentBase.basePolicy

        if (
          currentBase === null ||
          currentBase === undefined ||
          seenBases.has(currentBase.policyId)
        ) {
          // Either there is no base for the previous base, or we've hit a cycle
          // Hitting a cycle shouldn't technically be possible, but protect against it anyway as there's
          // nothing that would prevent people from writing an invalid policy
          return false
        }
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error != null) {
        logger.logWarn((error as Error).message)
      }
    }
    // In the event we didn't find the policyId in the base policies, return false
    return false
  }

  process(logger: ILogger): void {
    if (this.processed) {
      return
    }
    if (this.basePolicy && !this.basePolicy.processed) {
      this.basePolicy.process(logger)
      for (const j of this.basePolicy.journeys) {
        this.journeys.add(j)
      }
    }
    this.processed = true
    const journeys = this.xml.getElementsByTagName('UserJourney')
    if (journeys.length === 0) {
      return
    }
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let journeyIndex = 0; journeyIndex < journeys.length; journeyIndex++) {
      const journeyId = journeys[journeyIndex].getAttribute('Id')
      if (journeyId != null) {
        this.journeys.add(journeyId)
        if (this.basePolicy && this.basePolicy.hasPolicyId(journeyId, logger)) {
          logger.logInfo(
            `Skipped renumbering ${this.policyId} because it has a base journey in another file`
          )
          continue // We won't renumber anything which has the journey defined in its base because
          // it's impossible to know what the programmer intends
        }
        const steps =
          journeys[journeyIndex].getElementsByTagName('OrchestrationStep')
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          const orderAttr = steps[stepIndex].getAttribute('Order')
          if (orderAttr == null) {
            logger.logWarn(
              `Step ${stepIndex} of ${this.policyId} is missing the 'Order' attribute`
            )
          } else if (orderAttr !== (stepIndex + 1).toString()) {
            steps[stepIndex].setAttribute('Order', (stepIndex + 1).toString())
            this.renumbered++
          }
        }
      }
    }
    if (this.renumbered > 0) {
      this.file.Data = this.xml.documentElement.toString()
      logger.logInfo(`Renumbered ${this.renumbered} steps in ${this.policyId}`)
    }
  }
}
