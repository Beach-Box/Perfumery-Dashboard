#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_MARKDOWN_PATH,
  DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
  DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
  buildIfraAutopilotRecommendationsFromFiles,
  buildProposedIfraStructuredRecordsFile,
  formatIfraAutopilotRecommendationsMarkdown,
  formatIfraAutopilotRecommendationsText,
  writeIfraAutopilotRecommendations,
  writeProposedIfraStructuredRecords,
} from "./lib/ifra_autopilot_recommendations.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate_ifra_autopilot_recommendations.mjs
  node scripts/generate_ifra_autopilot_recommendations.mjs --json
  node scripts/generate_ifra_autopilot_recommendations.mjs --markdown
  node scripts/generate_ifra_autopilot_recommendations.mjs --markdown --write docs/ifra/ifra_autopilot_recommendations.md

Options:
  --json                 Print JSON.
  --markdown             Print Markdown.
  --write <path>         Write formatted output.
  --output <path>        Recommendations JSON path.
  --proposed-output <path> Proposed structured records JSON path.
  --help                 Show this help.

This command stages review recommendations and proposed structured IFRA records from existing evidence outputs. Proposed records are not runtime-active, no IFRA limits are promoted, and no launch clearance is claimed.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
    outputPath: DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_PATH,
    proposedOutputPath: DEFAULT_PROPOSED_IFRA_STRUCTURED_RECORDS_PATH,
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
      const value = argv[++index] || DEFAULT_IFRA_AUTOPILOT_RECOMMENDATIONS_MARKDOWN_PATH;
      args.writePath = resolvePath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolvePath(value);
    } else if (arg === "--proposed-output") {
      const value = argv[++index];
      if (!value) throw new Error("--proposed-output requires a path");
      args.proposedOutputPath = resolvePath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatIfraAutopilotRecommendationsMarkdown(report);
  return formatIfraAutopilotRecommendationsText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const report = buildIfraAutopilotRecommendationsFromFiles();
  const proposedRecordsFile = buildProposedIfraStructuredRecordsFile({
    records: [
      ...(report.proposedStructuredRecords || []),
      ...(report.autoAcceptedNonLimitEvidence || []),
    ],
    generatedAt: report.metadata?.generatedAt || new Date().toISOString(),
  });
  writeIfraAutopilotRecommendations(args.outputPath, report);
  writeProposedIfraStructuredRecords(args.proposedOutputPath, proposedRecordsFile);

  const output = renderReport(report, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `IFRA autopilot recommendations written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `IFRA autopilot recommendations JSON written: ${path.relative(
          ROOT,
          args.outputPath
        )}`
      );
      console.log(
        `Proposed IFRA structured records JSON written: ${path.relative(
          ROOT,
          args.proposedOutputPath
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
