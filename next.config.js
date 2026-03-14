/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable polling-based watching so changes on WSL-mounted drives
  // (e.g. /mnt/c, /mnt/d) are reliably picked up in dev.
  webpackDevMiddleware: (config) => {
    return {
      ...config,
      watchOptions: {
        // Check for file changes every second
        poll: 1000,
        // Delay the rebuild a bit to batch rapid changes
        aggregateTimeout: 300,
        // Fallback to existing ignored settings, if any
        ...(config.watchOptions || {}),
      },
    };
  },
};

module.exports = nextConfig;
