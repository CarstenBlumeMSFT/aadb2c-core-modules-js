/* eslint-disable no-console */
export default interface ILogger {
  logDebug: (message: string) => void
  logInfo: (message: string) => void
  logWarn: (message: string) => void
  logError: (message: string) => void
  startGroup: (title: string) => void
  endGroup: () => void
}

export class ConsoleLogger implements ILogger {
  verbose: boolean

  constructor(verbose: boolean) {
    this.verbose = verbose
  }

  logDebug(message: string): void {
    if (this.verbose) {
      console.debug(message)
    }
  }

  logInfo(message: string): void {
    console.info(message)
  }

  logWarn(message: string): void {
    console.warn(message)
  }

  logError(message: string): void {
    console.error(message)
  }

  startGroup(title: string): void {
    console.group(title)
  }

  endGroup(): void {
    console.groupEnd()
  }
}
