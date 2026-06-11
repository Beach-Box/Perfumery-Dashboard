#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_IFRA_EVIDENCE_RESOLUTION_MARKDOWN_PATH,
  DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
  buildIfraEvidenceResolutionFromFiles,
  formatIfraEvidenceResolutionMarkdown,
  formatIfraEvidenceResolutionText,
  writeIfraEvidenceResolution,
} from "./lib/ifra_evidence_resolver.mjs";
import { DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH } from "./lib/hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
  DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
} from "./lib/ifra_source_harvest.mjs";
import { DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH } from "./lib/candidate_ifra_review_queue.mjs";
import { DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH } from "./lib/reviewed_ifra_source_records.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/resolve_ifra_evidence_candidates.mjs
  node scripts/resolve_ifra_evidence_candidates.mjs --json
  node scripts/resolve_ifra_evidence_candidates.mjs --markdown
  node scripts/resolve_ifra_evidence_candidates.mjs --markdown --write docs/ifra/ifra_evidence_resolution.md
  node scripts/resolve_ifra_evidence_candidates.mjs --markdown --top 3

Options:
  --json                    Print JSON.
  --markdown                Print Markdown.
  --write <path>            Write formatted output.
  --output <path>           JSON output path.
  --top <count>             Candidate snippets per material in report. Defaults to 1.
  --queue <path>            Source acquisition queue JSON.
  --candidates <path>       Candidate extraction JSON.
  --review-queue <path>     Candidate review queue JSON.
  --reviewed-records <path> Reviewed IFRA source records JSON.
  --harvest <path>          Ingredient source harvest report JSON.
  --help                    Show this help.

Defaults:
  queue: ${path.relative(ROOT, DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH)}
  candidates: ${path.relative(ROOT, DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH)}
  review queue: ${path.relative(ROOT, DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH)}
  reviewed records: ${path.relative(ROOT, DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH)}
  harvest: ${path.relative(ROOT, DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH)}
  output: ${path.relative(ROOT, DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH)}

This resolver ranks already harvested/extracted candidates for human review. It does not scrape pages, promote IFRA limits, update runtime IFRA data, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
    outputPath: DEFAULT_IFRA_EVIDENCE_RESOLUTION_PATH,
    sourceQueuePath: DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
    candidateExtractionsPath: DEFAULT_CANDIDATE_IFRA_EXTRACTIONS_PATH,
    candidateReviewQueuePath: DEFAULT_CANDIDATE_IFRA_REVIEW_QUEUE_PATH,
    reviewedSourceRecordsPath: DEFAULT_REVIEWED_IFRA_SOURCE_RECORDS_PATH,
    ingredientSourceHarvestReportPath: DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
    top: 1,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_IFRA_EVIDENCE_RESOLUTION_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--top") {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--top requires a positive number");
      }
      args.top = Math.min(10, Math.round(value));
    } else if (arg === "--queue") {
      const value = argv[++index];
      if (!value) throw new Error("--queue requires a path");
      args.sourceQueuePath = resolveRepoPath(value);
    } else if (arg === "--candidates") {
      const value = argv[++index];
      if (!value) throw new Error("--candidates requires a path");
      args.candidateExtractionsPath = resolveRepoPath(value);
    } else if (arg === "--review-queue") {
      const value = argv[++index];
      if (!value) throw new Error("--review-queue requires a path");
      args.candidateReviewQueuePath = resolveRepoPath(value);
    } else if (arg === "--reviewed-records") {
      const value = argv[++index];
      if (!value) throw new Error("--reviewed-records requires a path");
      args.reviewedSourceRecordsPath = resolveRepoPath(value);
    } else if (arg === "--harvest") {
      const value = argv[++index];
      if (!value) throw new Error("--harvest requires a path");
      args.ingredientSourceHarvestReportPath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatIfraEvidenceResolutionMarkdown(report);
  return formatIfraEvidenceResolutionText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const report = buildIfraEvidenceResolutionFromFiles(args);
  writeIfraEvidenceResolution(args.outputPath, report);
  const output = renderReport(report, args.format);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `IFRA evidence resolution report written: ${path.relative(
          ROOT,
          args.writePath
        )}`
      );
      console.log(
        `IFRA evidence resolution JSON written: ${path.relative(
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
