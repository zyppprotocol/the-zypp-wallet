const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Custom resolver configuration from the second config
const resolveRequestWithPackageExports = (context, moduleName, platform) => {
  // Package exports in `isows` are incorrect, so we need to disable them
  if (moduleName === "isows") {
    const ctx = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // Package exports in `zustand@4` are incorrect, so we need to disable them
  if (moduleName.startsWith("zustand")) {
    const ctx = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  // Package exports in `jose` are incorrect, so we need to force the browser version
  if (moduleName === "jose") {
    const ctx = {
      ...context,
      unstable_conditionNames: ["browser"],
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.resolveRequest = resolveRequestWithPackageExports;
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: require.resolve("stream-browserify"),
  crypto: require.resolve("crypto-browserify"),
  buffer: require.resolve("buffer"),
  process: require.resolve("process/browser"),
  util: require.resolve("util/"),
  assert: require.resolve("assert/"),
  events: require.resolve("events"),
  "readable-stream": require.resolve("readable-stream"),
  "stream-http": require.resolve("stream-http"),
  "https-browserify": require.resolve("https-browserify"),
  os: require.resolve("os-browserify/browser"),
};

// Ensure CommonJS (.cjs) files are resolved by Metro for some packages
config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts || []), "cjs"])
);

// Apply NativeWind at the end
module.exports = withNativeWind(config, { input: "./global.css" });
