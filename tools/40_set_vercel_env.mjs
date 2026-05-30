#!/usr/bin/env node
/**
 * Hidden-input credential ingestion for Vercel env vars.
 *
 * Usage:
 *   node tools/40_set_vercel_env.mjs MY_VAR_NAME
 *   node tools/40_set_vercel_env.mjs MY_VAR_NAME --env production,preview,development
 *
 * Prompts for the value with terminal-hidden input (no echo, like sudo).
 * The value is piped directly to `vercel env add` and never appears in:
 *   - shell history
 *   - chat conversation
 *   - Claude's context window
 *   - any log file
 *
 * Why this exists: the user-feedback memory `feedback_credentials_in_chat.md`
 * documents a recurring pattern of secrets being pasted into chat. This helper
 * is the prebuilt alternative — credentials land in Vercel env vars directly
 * without ever touching the conversation.
 *
 * Requirements:
 *   - vercel CLI installed + logged in (`vercel whoami` works)
 *   - run from any directory inside the repo
 */

import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { Writable } from "node:stream";

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Usage: node tools/40_set_vercel_env.mjs VAR_NAME [--env production,preview,development]");
    console.log("Prompts for the value with hidden input. Never echoes to terminal.");
    process.exit(args.length === 0 ? 1 : 0);
}

const varName = args[0];
if (!/^[A-Z][A-Z0-9_]*$/.test(varName)) {
    console.error(`✗ Invalid env var name "${varName}". Must be UPPER_SNAKE_CASE.`);
    process.exit(1);
}

const envFlagIdx = args.indexOf("--env");
const envs = envFlagIdx >= 0 && args[envFlagIdx + 1]
    ? args[envFlagIdx + 1].split(",").map(s => s.trim()).filter(Boolean)
    : ["production", "development"];

// Sanity-check vercel CLI is reachable.
const whoami = spawnSync("vercel", ["whoami"], { encoding: "utf8" });
if (whoami.status !== 0) {
    console.error("✗ vercel CLI not reachable. Install with `npm i -g vercel` and run `vercel login`.");
    process.exit(1);
}

// Hidden prompt — writes the question to stderr (so stdout stays clean for
// scripting) and reads chars without echoing them.
async function promptHidden(question) {
    process.stderr.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let buf = "";
    return new Promise((resolve, reject) => {
        const onData = (ch) => {
            switch (ch) {
                case "\n":
                case "\r":
                case "": // EOT
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.off("data", onData);
                    process.stderr.write("\n");
                    resolve(buf);
                    break;
                case "": // Ctrl-C
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.off("data", onData);
                    process.stderr.write("\n");
                    reject(new Error("cancelled"));
                    break;
                case "": // backspace
                    buf = buf.slice(0, -1);
                    break;
                default:
                    buf += ch;
            }
        };
        process.stdin.on("data", onData);
    });
}

const value = await promptHidden(`Value for ${varName} (input hidden): `);
if (!value) {
    console.error("✗ Empty value, aborting.");
    process.exit(1);
}
const confirm = await promptHidden(`Confirm value for ${varName} (re-type, hidden): `);
if (value !== confirm) {
    console.error("✗ Values don't match, aborting.");
    process.exit(1);
}

// Pipe the value straight into `vercel env add` via stdin so it never lands in argv.
for (const env of envs) {
    process.stderr.write(`→ Setting ${varName} in ${env}…\n`);
    const proc = spawn("vercel", ["env", "add", varName, env, "--force"], {
        stdio: ["pipe", "inherit", "inherit"],
    });
    proc.stdin.write(value);
    proc.stdin.end();
    const code = await new Promise(res => proc.on("close", res));
    if (code !== 0) {
        console.error(`✗ vercel env add failed for env=${env} (exit ${code})`);
        process.exit(1);
    }
}
console.error("✓ Done.");
