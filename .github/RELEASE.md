# Release Process

This repository uses GitHub Actions to automate releases to npm using **Trusted Publishers** (OIDC authentication).

## Prerequisites

Before you can publish to npm, you need to configure npm Trusted Publishers:

### Setting up npm Account and Trusted Publishers

1. **Enable Two-Factor Authentication (Required):**
   - Go to [npmjs.com](https://www.npmjs.com) and log in
   - Click your profile → Account Settings
   - Go to "Two-Factor Authentication" section
   - Click "Enable 2FA"
   - Choose "Authorization and Publishing" (recommended) or "Authorization Only"
   - Follow the setup wizard with your authenticator app

2. **Log in to npm:**
   - Navigate to your package page (or create the package first if it doesn't exist)

3. **Configure Trusted Publishers:**
   - Go to your package settings
   - Click on "Publishing" tab
   - Scroll to "Trusted Publishers" section
   - Click "Add Trusted Publisher"
   
4. **Add GitHub Actions as a publisher:**
   - **Provider:** GitHub Actions
   - **Organization/User:** Your GitHub username (e.g., `aldrichang`)
   - **Repository:** `homebridge-legrand-radiant`
   - **Workflow:** `release.yml`
   - **Environment:** Leave blank (optional field)
   - Click "Add"

### First-time Package Publishing

If this is your first time publishing the package, you'll need to do an initial manual publish:

```bash
# Make sure you're logged in to npm (will prompt for 2FA code)
npm login

# Build and publish the first version
npm run build
npm publish --access public --otp=123456  # Replace 123456 with your 2FA code

# Then set up Trusted Publishers as described above
```

**Note:** After setting up Trusted Publishers, GitHub Actions will be able to publish without needing your 2FA code.

After the initial publish, all future releases will be automated through GitHub Actions.

### Benefits of Trusted Publishers

- ✅ **No tokens to manage** - Uses OIDC for secure authentication
- ✅ **More secure** - No long-lived credentials stored in GitHub
- ✅ **Automatic provenance** - Cryptographically links packages to source code
- ✅ **Simpler setup** - No secrets to rotate or manage

### Technical Requirements

- **Node.js 24+** is required for npm Trusted Publishers OIDC authentication
- The workflow automatically uses Node.js 24.x

## How to Release

### Option 1: Using GitHub UI (Recommended)

1. **Go to the Releases page:**
   - Navigate to your repository on GitHub
   - Click on "Releases" in the right sidebar
   - Click "Draft a new release"

2. **Create the release:**
   - Click "Choose a tag" and type a new tag (e.g., `v0.1.4` or `0.1.4`)
   - The tag will be created when you publish
   - Set the release title (e.g., "v0.1.4" or "Version 0.1.4")
   - Add release notes describing what's new
   - Click "Publish release"

3. **Automatic publishing:**
   - The GitHub Action will automatically trigger
   - It will build the package and publish to npm
   - Check the "Actions" tab to monitor progress

### Option 2: Using GitHub CLI

```bash
# Create and push a tag
git tag v0.1.4
git push origin v0.1.4

# Create a release from the tag
gh release create v0.1.4 --title "v0.1.4" --notes "Release notes here"
```

### Option 3: Manual Tag + Release

```bash
# Create and push a tag
git tag v0.1.4
git push origin v0.1.4

# Then go to GitHub UI and create a release from the tag
```

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (1.0.0): Breaking changes
- **MINOR** version (0.1.0): New features, backwards compatible
- **PATCH** version (0.0.1): Bug fixes, backwards compatible

Examples:
- `v0.1.4` - Patch release (bug fixes)
- `v0.2.0` - Minor release (new features)
- `v1.0.0` - Major release (breaking changes)

## What Happens During Release

1. **Trigger:** When you publish a GitHub release
2. **Checkout:** Code is checked out from the repository
3. **Setup:** Node.js and dependencies are installed
4. **Version:** package.json is updated with the release version
5. **Build:** TypeScript is compiled to JavaScript
6. **Publish:** Package is published to npm with provenance
7. **Tag:** Git tag is created (if it doesn't exist)

## Continuous Integration

Every push and pull request runs:
- Linting (ESLint)
- Build (TypeScript compilation)
- Tests on Node.js 18.x and 20.x

## Troubleshooting

### "npm ERR! 403 Forbidden" or "npm ERR! 401 Unauthorized"
- Verify that Trusted Publishers is configured correctly on npm
- Check that the GitHub repository name matches exactly
- Ensure the workflow name is `release.yml`
- Confirm you have publish rights to the package
- Make sure the package exists on npm (do initial manual publish if needed)

### "Version already exists"
- You're trying to publish a version that's already on npm
- Increment the version number in your release tag

### "Build failed"
- Check the Actions tab for detailed error logs
- Ensure the code builds locally with `npm run build`
- Fix any linting errors with `npm run lint`

## Manual Publishing (Not Recommended)

If you need to publish manually:

```bash
# Update version
npm version patch  # or minor, or major

# Build
npm run build

# Publish
npm publish

# Push tags
git push --follow-tags
```
