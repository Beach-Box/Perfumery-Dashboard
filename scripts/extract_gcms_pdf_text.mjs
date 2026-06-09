#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  DEFAULT_GCMS_MANIFEST_PATH,
  DEFAULT_GCMS_RAW_TEXT_DIR,
  ROOT,
  extractGcmsPdfText,
} from "./lib/gcms_reference_pipeline.mjs";

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_GCMS_MANIFEST_PATH,
    rawTextDir: DEFAULT_GCMS_RAW_TEXT_DIR,
    outputPath: DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      const value = argv[++index];
      if (!value) throw new Error("--manifest requires a path");
      args.manifestPath = path.resolve(ROOT, value);
    } else if (arg === "--raw-text-dir") {
      const value = argv[++index];
      if (!value) throw new Error("--raw-text-dir requires a path");
      args.rawTextDir = path.resolve(ROOT, value);
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
  const status = extractGcmsPdfText(args);
  const failedCount = status.reports.filter((report) => report.extractionStatus === "failed").length;
  const partialCount = status.reports.filter((report) => report.extractionStatus === "partial").length;
  const okCount = status.reports.filter((report) => report.extractionStatus === "ok").length;
  console.log(`GCMS extraction status written: ${path.relative(ROOT, args.outputPath)}`);
  console.log(`Reports extracted: ${okCount}`);
  console.log(`Partial extractions: ${partialCount}`);
  console.log(`Failed extractions: ${failedCount}`);
  if (!status.reportCount) {
    console.log("No manifest reports found. Run scripts/build_gcms_manifest.mjs after placing PDFs in downloads/gcms_reports/.");
  }
  return status;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
