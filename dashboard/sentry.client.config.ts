import * as Sentry from "@sentry/nextjs";

const deploymentUrl =
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "local";
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "unknown";
const env =
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env,
    release: gitSha,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    initialScope: {
        tags: {
            deployment_url: deploymentUrl,
            git_sha: gitSha,
            environment: env,
            runtime: "browser",
        },
    },
});
