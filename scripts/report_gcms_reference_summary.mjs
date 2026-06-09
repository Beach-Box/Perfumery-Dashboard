#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  ROOT,
  buildGcmsReferenceSummary,
  formatGcmsSummaryMarkdown,
  formatGcmsSummaryText,
  loadStructuredCandidates,
} from "./lib/gcms_reference_pipeline.mjs";

function parseArgs(argv) {
  const args = {
    structuredPath: DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
    outputFormat: "text",
    writePath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--structured") {
      const value = argv[++index];
      if (!value) throw new Error("--structured requires a path");
      args.structuredPath = path.resolve(ROOT, value);
    } else if (arg === "--markdown") {
      args.outputFormat = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index];
      if (!value) throw new Error("--write requires a path");
      args.writePath = path.resolve(ROOT, value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const structured = loadStructuredCandidates(args.structuredPath);
  const summary = buildGcmsReferenceSummary(structured);
  const output =
    args.outputFormat === "markdown"
      ? formatGcmsSummaryMarkdown(summary)
      : formatGcmsSummaryText(summary);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    console.log(`GCMS summary written: ${path.relative(ROOT, args.writePath)}`);
  } else {
    console.log(output);
  }
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
