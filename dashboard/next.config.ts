import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: "/Users/andreschuler/Caturepilot 2.0/dashboard",
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://ryxgjzehoijjvczqkhwr.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com",
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.capturepilot.com",
  }
};

export default nextConfig;
