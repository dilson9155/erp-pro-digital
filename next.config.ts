import type { NextConfig } from "next";

/**
 * O nome do produto vive em um único lugar (`src/config/branding.ts`) para permitir
 * rebranding sem refatoração. Este aqui é apenas o fallback para metadata do build.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma 7 (driver adapter), @react-pdf e exceljs não devem ser bundlados pelo Turbopack.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "exceljs"],
  outputFileTracingIncludes: {
    "/api/fiscal/**": ["./node_modules/@prisma/client/**"],
  },
  experimental: {
    // AOTS de Turbopack: melhora builds, sem risco para o app.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/home", destination: "/dashboard", permanent: false },
      { source: "/app", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
