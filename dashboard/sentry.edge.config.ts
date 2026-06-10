import * as Sentry from "@sentry/nextjs";

const deploymentUrl =
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "local";
const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_GIT_SHA ||
    "unknown";
const env =
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env,
    release: gitSha,
    tracesSampleRate: 0.1,
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    initialScope: {
        tags: {
            deployment_url: deploymentUrl,
            git_sha: gitSha,
            environment: env,
            runtime: "edge",
        },
    },
});
