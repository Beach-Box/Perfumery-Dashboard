#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildHeroIfraSourceGapReport } from "./report_hero_ifra_source_gaps.mjs";
import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_MARKDOWN_PATH,
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  buildHeroIfraSourceAcquisitionQueue,
  formatHeroIfraSourceAcquisitionQueueMarkdown,
  formatHeroIfraSourceAcquisitionQueueText,
  loadExistingHeroIfraSourceQueue,
  writeHeroIfraSourceAcquisitionQueue,
} from "./lib/hero_ifra_source_acquisition_queue.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    outputPath: DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
    writePath: null,
    ingredientReferencePath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_HERO_IFRA_SOURCE_QUEUE_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else if (arg === "--ingredient-reference") {
      const value = argv[++index];
      if (!value) throw new Error("--ingredient-reference requires a CSV path");
      args.ingredientReferencePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatOutput(queue, format) {
  if (format === "json") return `${JSON.stringify(queue, null, 2)}\n`;
  if (format === "markdown") return formatHeroIfraSourceAcquisitionQueueMarkdown(queue);
  return formatHeroIfraSourceAcquisitionQueueText(queue);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const existingQueue = loadExistingHeroIfraSourceQueue(args.outputPath);
  const gapReport = buildHeroIfraSourceGapReport({
    ingredientReferencePath: args.ingredientReferencePath,
  });
  const queue = buildHeroIfraSourceAcquisitionQueue({
    gapReport,
    existingQueue,
  });

  writeHeroIfraSourceAcquisitionQueue(args.outputPath, queue);

  const output = formatOutput(queue, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Hero IFRA source acquisition queue written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `Hero IFRA source acquisition queue JSON written: ${path.relative(
          ROOT,
          args.outputPath
        )}`
      );
    }
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }

  return queue;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
