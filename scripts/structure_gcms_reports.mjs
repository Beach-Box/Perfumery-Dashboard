#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_APP_PATH,
  DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
  DEFAULT_GCMS_MANIFEST_PATH,
  DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  ROOT,
  structureGcmsReports,
} from "./lib/gcms_reference_pipeline.mjs";

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_GCMS_MANIFEST_PATH,
    extractionStatusPath: DEFAULT_GCMS_EXTRACTION_STATUS_PATH,
    outputPath: DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
    appPath: DEFAULT_APP_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      const value = argv[++index];
      if (!value) throw new Error("--manifest requires a path");
      args.manifestPath = path.resolve(ROOT, value);
    } else if (arg === "--extraction-status") {
      const value = argv[++index];
      if (!value) throw new Error("--extraction-status requires a path");
      args.extractionStatusPath = path.resolve(ROOT, value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = path.resolve(ROOT, value);
    } else if (arg === "--app") {
      const value = argv[++index];
      if (!value) throw new Error("--app requires a path");
      args.appPath = path.resolve(ROOT, value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const structured = structureGcmsReports(args);
  const detectedCount = structured.reports.reduce(
    (sum, report) => sum + (report.detectedMaterials?.length || 0),
    0
  );
  const reviewCount = structured.reports.filter((report) => report.reviewNeeded).length;
  console.log(`GCMS structured candidates written: ${path.relative(ROOT, args.outputPath)}`);
  console.log(`Reports structured: ${structured.reportCount}`);
  console.log(`Detected material candidate rows: ${detectedCount}`);
  console.log(`Reports needing review: ${reviewCount}`);
  return structured;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
