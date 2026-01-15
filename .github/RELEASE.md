# Release Process

This repository uses GitHub Actions to automate releases to npm.

## Prerequisites

Before you can publish to npm, you need to set up an npm token:

1. **Create an NPM Access Token:**
   - Log in to [npmjs.com](https://www.npmjs.com)
   - Go to your account settings → Access Tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type (for CI/CD)
   - Copy the token

2. **Add Token to GitHub Secrets:**
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

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

### "npm ERR! 403 Forbidden"
- Check that `NPM_TOKEN` secret is set correctly
- Verify the token has "Automation" permissions
- Ensure you have publish rights to the package

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
