// Metro configuration tuned for the pnpm + Turborepo monorepo.
// Watches the workspace root so `@kitchenpal/*` symlinked packages are picked
// up, and resolves modules from both the app and the hoisted root store.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so edits to workspace packages trigger reloads.
config.watchFolders = [workspaceRoot];

// Resolve dependencies from the app first, then the workspace root store.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm links packages via symlinks; keep hierarchical lookup so nested
// dependencies of workspace packages still resolve.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
