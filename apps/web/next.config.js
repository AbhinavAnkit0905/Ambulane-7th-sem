// Disable Next.js lockfile auto-patching in npm workspaces.
// This prevents Next.js from trying to invoke npm against workspace lockfiles
// for optional SWC platform binaries that are already locally installed.
process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@smart-ambulance/shared'],
};

module.exports = nextConfig;
