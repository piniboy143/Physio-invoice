const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add HTML, CSS and JS folder to assets
config.resolver.assetExts.push('html', 'css');

module.exports = config;
