const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// packages/kairo-core is consumed straight from source rather than as a build
// artifact, so Metro has to watch it and resolve it. Keeping one un-built copy
// of the scoring logic is the whole point: the client and the Edge Functions
// import the same file.
config.watchFolders = [path.resolve(projectRoot, 'packages')];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
// Keep Metro's default hierarchical lookup. The workspace package is linked
// from the root node_modules, while several dependencies resolve their own
// nested peers; disabling the lookup prevents that normal Expo resolution and
// is flagged by Expo Doctor.

module.exports = config;
