#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_MARKDOWN_PATH,
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  buildCandidateIfraSourceExtractions,
  formatCandidateIfraExtractionsMarkdown,
  formatCandidateIfraExtractionsText,
  writeCandidateIfraExtractions,
} from "./lib/ifra_source_harvest.mjs";
import { DEFAULT_IFRA_SOURCE_DOCUMENT_DIR } from "./lib/ifra_source_document_review.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/extract_candidate_ifra_from_sources.mjs
  node scripts/extract_candidate_ifra_from_sources.mjs --json
  node scripts/extract_candidate_ifra_from_sources.mjs --markdown
  node scripts/extract_candidate_ifra_from_sources.mjs --markdown --write docs/ifra/candidate_ifra_source_extractions.md

Options:
  --source-dir <path>  Cached source directory. Defaults to downloads/source_documents/ifra/
  --json               Print JSON.
  --markdown           Print Markdown.
  --write <path>       Write formatted output.
  --output <path>      JSON report path.
  --help               Show this help.

This extractor reads cached HTML/text pages and extracts candidate IFRA/SDS snippets for review. It does not parse PDFs into runtime IFRA limits, promote records, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    sourceDir: DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
    format: "text",
    writePath: null,
    outputPath: DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--source-dir") {
      const value = argv[++index];
      if (!value) throw new Error("--source-dir requires a path");
      args.sourceDir = resolvePath(value);
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_MARKDOWN_PATH;
      args.writePath = resolvePath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolvePath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatCandidateIfraExtractionsMarkdown(report);
  return formatCandidateIfraExtractionsText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const report = buildCandidateIfraSourceExtractions({
    sourceDir: args.sourceDir,
  });
  writeCandidateIfraExtractions(args.outputPath, report);
  const output = renderReport(report, args.format);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Candidate IFRA source extraction report written: ${path.relative(
          ROOT,
          args.writePath
        )}`
      );
      console.log(
        `Candidate IFRA source extraction JSON written: ${path.relative(
          ROOT,
          args.outputPath
        )}`
      );
    }
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
