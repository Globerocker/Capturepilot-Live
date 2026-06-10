import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@crawlee/cheerio", "@crawlee/core", "@crawlee/http", "@crawlee/basic", "got-scraping"],
  // Include the protected/starter-pack directory in the Vercel serverless bundle.
  // Files in /public/ are served as static assets (publicly accessible via CDN).
  // Files in /protected/ are NOT served statically — they are only reachable
  // through token-gated API routes that read them server-side with Node fs.
  // outputFileTracingIncludes tells Next.js to copy these files into the
  // serverless function bundle so they are available at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/startup-pack/file/[token]/[id]": ["./protected/**/*"],
    "/api/startup-pack/zip/[token]": ["./protected/**/*"],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://ryxgjzehoijjvczqkhwr.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com",
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.capturepilot.com",
  }
};

export default nextConfig;
