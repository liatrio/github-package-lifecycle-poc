import { logger } from '@4lch4/logger'
import { Octokit } from '@octokit/rest'
import 'dotenv/config'

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

function calculateAge (age: string) {
  const packageCreatedDate = new Date(age)
  const today = new Date()
  const diffTime = Math.abs(today.getTime() - packageCreatedDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

async function main () {
  const org =  'liatrio'
  const packageType = process.env.PACKAGE_TYPE
  const retentionPeriod = Number(process.env.RETENTION)
  try {
    const orgPackages = await getOrgPackages(org, packageType)

    for (let i = 0; i < orgPackages.length; i++){
      const packageVersions = await getPackageVersions(org, packageType, orgPackages[i].name)
      for (let j = 0; j < packageVersions.length; j++){
        const age = calculateAge(packageVersions[j].updated_at)
        if (age > retentionPeriod)
          logger.info(`[${orgPackages[i].name}]: ${packageVersions[j].name} created ${age} days ago`)
      }
    }

  } catch (error) {
    logger.error(`[main]:` + error)
  }
}

await main();
