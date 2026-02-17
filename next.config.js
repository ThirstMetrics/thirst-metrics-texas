/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      '@duckdb/node-api',
      '@duckdb/node-bindings',
      'tesseract.js',
      'tesseract.js-core',
      '@anthropic-ai/sdk',
    ],
  },

  webpack: (config, { isServer, webpack }) => {
    // Only apply to server-side builds (API routes, server components)
    if (isServer) {
      // Ignore the problematic HTML file that webpack tries to parse
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /@mapbox[/\\]node-pre-gyp[/\\]lib[/\\]util[/\\]nw-pre-gyp[/\\]index\.html$/,
        })
      );

      // Optional broader ignore if you see more weirdness
      // config.plugins.push(
      //   new webpack.IgnorePlugin({
      //     resourceRegExp: /@mapbox[/\\]node-pre-gyp[/\\]lib[/\\]util[/\\]nw-pre-gyp/,
      //   })
      // );
    }

    return config;
  },

  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
