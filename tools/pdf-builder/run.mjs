#!/usr/bin/env node
/**
 * run.mjs — CLI wrapper around render.mjs
 *
 *   node tools/pdf-builder/run.mjs <config.json> <output.pdf>
 */

import { readFile } from "node:fs/promises";
import { resolve, isAbsolute, dirname } from "node:path";
import { renderPdf } from "./render.mjs";

const [, , configArg, outputArg] = process.argv;

if (!configArg || !outputArg) {
  console.error("Usage: node tools/pdf-builder/run.mjs <config.json> <output.pdf>");
  process.exit(1);
}

const configPath = isAbsolute(configArg) ? configArg : resolve(process.cwd(), configArg);
const outputPath = isAbsolute(outputArg) ? outputArg : resolve(process.cwd(), outputArg);

const configRaw = await readFile(configPath, "utf8");
let config;
try {
  config = JSON.parse(configRaw);
} catch (err) {
  console.error(`[pdf-builder] Failed to parse JSON config at ${configPath}: ${err.message}`);
  process.exit(1);
}

// Allow markdown bodies to live in sibling files via { "markdownFile": "..." }
const configDir = dirname(configPath);
if (Array.isArray(config.parts)) {
  for (const part of config.parts) {
    if (part && part.markdownFile) {
      const mdPath = isAbsolute(part.markdownFile)
        ? part.markdownFile
        : resolve(configDir, part.markdownFile);
      part.markdown = await readFile(mdPath, "utf8");
      delete part.markdownFile;
    }
  }
}

const t0 = Date.now();
const result = await renderPdf({ config, outputPath });
const ms = Date.now() - t0;

console.log(`✓ Rendered ${result.pageCount} page(s) → ${result.path}`);
console.log(`  ${result.sizeKB} KB · ${ms} ms`);
