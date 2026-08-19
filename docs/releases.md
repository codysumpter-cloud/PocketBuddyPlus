# Pocket Buddy+ releases

Pocket Buddy+ uses continuous delivery from the exact `main` commit that passed the normal **Pocket Buddy+ CI** workflow.

## Delivery contract

1. Pull requests are validated by `.github/workflows/pocket-buddy-plus-ci.yml`.
2. A merge to `main` triggers that same CI workflow against the merged tree.
3. When the `main` push run finishes successfully, `.github/workflows/pocket-buddy-plus-release.yml` checks out that exact green SHA.
4. The release workflow chooses a monotonic semantic patch version. The versions in the workspace and desktop `package.json` files are the source floor; if an equal or newer release tag already exists, the workflow increments the latest patch number for the new green commit.
5. macOS, Windows, and Linux packages are built from the same SHA with the resolved version stamped into the packaged application metadata.
6. A GitHub Release is created with platform artifacts, `SHA256SUMS.txt`, and `release-manifest.json` containing the version and source SHA.
7. The workflow verifies that GitHub's `releases/latest` endpoint points at the release it just published. Pocket Buddy+'s update checker reads that endpoint.

A green source merge is therefore not considered delivered until the downstream release workflow publishes and verifies the corresponding release.

## Duplicate protection

If a semver release tag already points at the exact green commit, the release workflow exits without publishing another release. Re-running CI for an already shipped commit is safe.

## Manual recovery

The release workflow also supports `workflow_dispatch`. Manual dispatch still uses the repository's exact selected default-branch SHA, applies the same duplicate protection, packages all supported desktop platforms, and verifies the resulting latest release.
