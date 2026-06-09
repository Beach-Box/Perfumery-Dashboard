#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_GCMS_MANIFEST_PATH,
  DEFAULT_GCMS_REPORTS_DIR,
  ROOT,
  writeGcmsManifest,
} from "./lib/gcms_reference_pipeline.mjs";

function parseArgs(argv) {
  const args = {
    reportsDir: DEFAULT_GCMS_REPORTS_DIR,
    outputPath: DEFAULT_GCMS_MANIFEST_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reports-dir") {
      const value = argv[++index];
      if (!value) throw new Error("--reports-dir requires a path");
      args.reportsDir = path.resolve(ROOT, value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = path.resolve(ROOT, value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifest = writeGcmsManifest(args);
  console.log(`GCMS manifest written: ${path.relative(ROOT, args.outputPath)}`);
  console.log(`Reports discovered: ${manifest.reportCount}`);
  if (!manifest.reportCount) {
    console.log("No PDFs found. Place GCMS PDFs in downloads/gcms_reports/ and rerun.");
  }
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
