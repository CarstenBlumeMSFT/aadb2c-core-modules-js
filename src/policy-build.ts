import fs from 'fs'
import upath from 'upath'
import {RenumberPolicies} from './renumber-steps'
import {ILogger} from './logger-interface'
import fastglob from 'fast-glob'

export function PolicyBuild(
  rootPath: string,
  outputFolder: string,
  renumberSteps: boolean,
  logger: ILogger
): void {
  rootPath = upath.normalize(rootPath)
  outputFolder = upath.normalize(outputFolder)

  const policyFilter: string = upath.join(rootPath, '**/*.xml')

  const appSettingsFile = upath.join(rootPath, 'appsettings.json')

  // Check if appsettings.json is existed under for root folder
  if (!fs.existsSync(appSettingsFile)) {
    logger.logError(`No appsettings.json found in: ${appSettingsFile}`)
  }

  const appSettings = JSON.parse(fs.readFileSync(appSettingsFile, 'utf8'))

  const policyIgnore = `**/${appSettings.EnvironmentsFolder}/**`

  // Read all policy files from the root directory

  logger.startGroup(
    `Searching policy files matching: ${policyFilter} ignoring ${policyIgnore}`
  )

  const files = fastglob.sync(policyFilter, {ignore: [policyIgnore]})

  const policyFiles: PolicyFile[] = []
  for (const file of files) {
    logger.logInfo(`Found: ${file}`)
    const data = fs.readFileSync(file, 'utf8')
    policyFiles.push(
      new PolicyFile(upath.normalize(file), data.toString(), rootPath)
    )
  }

  // Iterate through the list of settings
  for (const file of policyFiles) {
    logger.logInfo(
      `Constructed File: ${file.FileName} with Subfolder: ${file.SubFolder}`
    )
  }

  logger.endGroup()

  if (renumberSteps) {
    logger.startGroup('Renumbering steps in policies...')
    RenumberPolicies(policyFiles, logger)
    logger.endGroup()
  }

  logger.startGroup(`Preparing outputFolder: ${outputFolder}`)
  // Ensure environments folder exists
  if (!fs.existsSync(outputFolder)) {
    logger.logInfo('Creating folder...')
    fs.mkdirSync(outputFolder)
  } else {
    logger.logInfo('Deleting and recreating folder...')
    fs.rmSync(outputFolder, {recursive: true})
    fs.mkdirSync(outputFolder)
  }
  logger.endGroup()

  logger.startGroup('Starting processing of environments...')
  // Iterate through environments
  for (const entry of appSettings.Environments) {
    logger.startGroup(`Processing environment: ${entry.Name}`)

    if (entry.PolicySettings == null) {
      logger.logWarn(
        `Can't generate '${entry.Name}' environment policies. Error: Accepted PolicySettings element is missing. You may use old version of the appSettings.json file. For more information, see https://github.com/yoelhor/aad-b2c-vs-code-extension/blob/master/README.md#app-settings`
      )
    } else {
      const environmentRootPath = upath.join(outputFolder, entry.Name)

      // Ensure environment folder exists
      if (!fs.existsSync(environmentRootPath)) {
        fs.mkdirSync(environmentRootPath)
      }

      // Iterate through the list of settings
      for (const file of policyFiles) {
        logger.startGroup(`Processing policy file: ${file.FileName}`)
        logger.logInfo('Processing settings...')

        let policyContent = file.Data

        // Replace the tenant name
        policyContent = policyContent.replace(
          new RegExp('{Settings:Tenant}', 'gi'),
          entry.Tenant
        )

        // Replace the file name
        policyContent = policyContent.replace(
          new RegExp('{Settings:Filename}', 'gi'),
          file.FileName.replace(/\.[^/.]+$/, '')
        )

        // Replace the file name and remove the policy prefix
        policyContent = policyContent.replace(
          new RegExp('{Settings:PolicyFilename}', 'gi'),
          file.FileName.replace(/\.[^/.]+$/, '').replace(
            new RegExp('B2C_1A_', 'g'),
            ''
          )
        )

        // Replace the environment name
        policyContent = policyContent.replace(
          new RegExp('{Settings:Environment}', 'gi'),
          entry.Name
        )

        // Replace the rest of the policy settings
        for (const key of Object.keys(entry.PolicySettings)) {
          policyContent = policyContent.replace(
            new RegExp(`{Settings:${key}}`, 'gi'),
            entry.PolicySettings[key]
          )
        }

        let filePath: string

        // Check to see if the policy's subdirectory exists.
        if (file.SubFolder) {
          const policyFolderPath = upath.join(
            environmentRootPath,
            file.SubFolder
          )

          if (!fs.existsSync(policyFolderPath)) {
            fs.mkdirSync(policyFolderPath, {recursive: true})
          }

          filePath = upath.join(policyFolderPath, file.FileName)
        } else {
          filePath = upath.join(environmentRootPath, file.FileName)
        }

        logger.logInfo(`Writing result to: ${filePath}`)
        fs.writeFile(filePath, policyContent, 'utf8', err => {
          if (err) throw err
        })
        logger.endGroup()
      }
    }
    logger.endGroup()
  }
  logger.endGroup()
}

export class PolicyFile {
  FileName: string
  Data: string
  SubFolder: string | null

  constructor(fileName: string, data: string, baseDir: string) {
    this.Data = data
    this.FileName = upath.basename(fileName)
    this.SubFolder = this.GetSubFolder(fileName, baseDir)
  }

  GetSubFolder(filePath: string, baseDir: string): string | null {
    const subFolder = upath.relative(
      baseDir,
      filePath.substring(0, filePath.lastIndexOf('/'))
    )

    if (!subFolder) {
      return null
    }
    return subFolder
  }
}
