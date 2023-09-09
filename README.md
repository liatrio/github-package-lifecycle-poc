#  Github Package Lifecycle POC

This repository is a proof of concept for the Github Package Lifecycle on creating a report for the Github Package Registry that contains packages that are older than a specified retention period.

## How it works:

This POC does the following components:

- Queries the Github Rest API for all packages and versions in the Github Package Registry listed in the organization.
- Uses Docker to grab the package manifest and extract the the size of the package.
- Creates a report of all packages that are older than a specified retention period.
  - Reports on the size of the package.
  - Reports the age of the package.
  - Reports the versions of the package.
- Report is created in JSON format.
