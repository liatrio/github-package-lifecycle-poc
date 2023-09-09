import { logger } from '@4lch4/logger'
import { Octokit } from '@octokit/rest'
import { Docker, Options } from 'docker-cli-js'
import { fileURLToPath } from 'url'
import * as path from 'path'
import fs from 'fs-extra'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const dockerOptions = new Options(
  /* machineName */ undefined,
  /* currentWorkingDirectory */ undefined,
  /* echo*/ false,
);

const docker = new Docker(dockerOptions);

const octokit = new Octokit({ auth: process.env.GH_TOKEN })
const MAX_PER_PAGE = 100

async function getOrgPackagesPage (org: string, pageNumber: number, packageType: any) {
  return await octokit.packages.listPackagesForOrganization({
    org: org,
    package_type: packageType,
    per_page: MAX_PER_PAGE,
    page: pageNumber,
  })
}

async function getOrgPackages (org: string, packageType: any){
    let pageNumber = 1
    let pagePackages = await getOrgPackagesPage(org, pageNumber, packageType)
    let allPackages = []
    if (pagePackages.data.length > 0) allPackages.push(...pagePackages.data)

    while (pagePackages.data.length === MAX_PER_PAGE) {
      pageNumber++
      pagePackages = await getOrgPackagesPage(org, pageNumber, packageType)
      allPackages.push(...pagePackages.data)
    }
    return allPackages
}

async function getPackageVersionsPage (org: string, packageType: any, packageName: string, pageNumber: number) {
  return await octokit.packages.getAllPackageVersionsForPackageOwnedByOrg({
    org: org,
    package_type: packageType,
    package_name: packageName,
    per_page: MAX_PER_PAGE,
    page: pageNumber,
  })
}

async function getImageManifest(registry:string){
  try {
    const manifest = await docker.command(`manifest inspect ${registry}`);
    return JSON.parse(manifest.raw)
  } catch (error) {
    logger.error(`[getImageManifest]:` + error)
  }
}

async function getPackageVersions (org: string, packageType: any, packageName: string) {
  let pageNumber = 1
  let pageVersions = await getPackageVersionsPage(org, packageType, packageName, pageNumber)
  let allVersions = []
  if (pageVersions.data.length > 0) allVersions.push(...pageVersions.data)

  while (pageVersions.data.length === MAX_PER_PAGE) {
    pageNumber++
    pageVersions = await getPackageVersionsPage(org, packageType, packageName, pageNumber)
    allVersions.push(...pageVersions.data)
  }
  return allVersions
}

async function getImageSize (registry:string) {
  const manifest = await getImageManifest(registry)
  let size = manifest.config?.size || 0
  if (manifest.manifests !== undefined) {
    for (let i = 0; i < manifest.manifests.length; i++){
      size += manifest.manifests[i].size  
    }
  }
  if (manifest.layers !== undefined) {
    for (let i = 0; i < manifest.layers.length; i++){
      size += manifest.layers[i].size  
    }
  }
  return size
}

function calculateAge (age: string) {
  const packageCreatedDate = new Date(age)
  const today = new Date()
  const diffTime = Math.abs(today.getTime() - packageCreatedDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}


async function outputReport(report: any[]) {
  try {
    logger.info('[outputReport]: Outputting report...')

    const timestamp = new Date().toISOString().replace(/:/g, '-')

    const jsonFilePath = path.join(__dirname, '..' ,'out', `report-${timestamp}.json`)

    logger.debug(`[outputReport]: Writing report to ${jsonFilePath}...`)

    await fs.ensureDir(path.join(__dirname, 'out'))
    await fs.writeJson(jsonFilePath, report, { spaces: 2 })

    console.table(report)

    logger.success(`[outputReport]: Report written to ${jsonFilePath}`)
  } catch (err) {
    logger.error('[outputReport]: Error encountered...')
    logger.error(err)
  }
}

async function main () {
  const org =  process.env.GH_ORG || ''
  const packageType = process.env.PACKAGE_TYPE
  const retentionPeriod = Number(process.env.RETENTION) || 90
  const allPackages = []
  try {
    const orgPackages = await getOrgPackages(org, packageType)

    for (let i = 0; i < orgPackages.length; i++){
      const packageVersions = await getPackageVersions(org, packageType, orgPackages[i].name)
      const packageReport = {
        org: org,
        packageName: orgPackages[i].name,
        count: packageVersions.length,
        version: <{name: string, age: number, size: number, location: string}[]>[],
      }
      switch (packageType) {
        case 'container':
          for (let j = 0; j < packageVersions.length; j++){
            const age = calculateAge(packageVersions[j].updated_at)
            if (age > retentionPeriod) {
              const packageTag = packageVersions[j]?.metadata?.container?.tags[0] || packageVersions[j].name
              let registry = ``
              if (packageVersions[j]?.metadata?.container?.tags[0]) registry = `ghcr.io/${org}/${orgPackages[i].name}:${packageVersions[j]?.metadata?.container?.tags[0]}`
              else registry = `ghcr.io/${org}/${orgPackages[i].name}@${packageVersions[j].name}`
              const size = await getImageSize(registry)
              const packageVersion = {
                name: packageTag,
                age: age,
                size: size,
                location: packageVersions[j].html_url || '',
              }
              packageReport.version.push(packageVersion)

              logger.success(`Package Version information successfully retrieved`)
              logger.info(`[PackageName]: ${packageReport.packageName}`)
              logger.info(`[Version]: ${packageVersion.name}`)
              logger.info(`[VersionAge]: ${packageVersion.age} days`)
              logger.info(`[VersionSize]: ${packageVersion.size} bytes`)
              logger.info(`[VersionLocation]: ${packageVersion.location}`)
            }
          }
       }
        allPackages.push(packageReport)
    }
    await outputReport(allPackages)
  } catch (error) {
    logger.error(`[main]:` + error)
  }
}

main()  
  .then(() => {
    logger.success(`Execution completed successfully!`)
  })
  .catch(err => {
    logger.error(`Error returned from main()`)
    logger.error(err)
  })