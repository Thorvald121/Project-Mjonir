/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@valhalla/db', '@valhalla/hooks', '@valhalla/types', '@valhalla/utils'],
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
