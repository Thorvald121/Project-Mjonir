/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@valhalla/db', '@valhalla/hooks', '@valhalla/types', '@valhalla/utils'],
  
  // Skip type checking and linting during build
  // These run locally and in CI instead
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig