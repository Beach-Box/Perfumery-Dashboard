#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_MARKDOWN_PATH,
  DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH,
  buildIfraPromotionOpportunityReportFromFiles,
  formatIfraPromotionOpportunitiesMarkdown,
  formatIfraPromotionOpportunitiesText,
  writeIfraPromotionOpportunityReport,
} from "./lib/ifra_promotion_opportunity_ranker.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/rank_ifra_promotion_opportunities.mjs
  node scripts/rank_ifra_promotion_opportunities.mjs --json
  node scripts/rank_ifra_promotion_opportunities.mjs --markdown
  node scripts/rank_ifra_promotion_opportunities.mjs --markdown --write docs/ifra/ifra_promotion_opportunities.md

Options:
  --json             Print JSON.
  --markdown         Print Markdown.
  --write <path>     Write formatted output.
  --output <path>    JSON report path.
  --help             Show this help.

This command ranks proposed structured IFRA records for human review. It does not promote IFRA limits, does not change runtime IFRA data, and does not claim launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
    outputPath: DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_PATH,
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
      const value = argv[++index] || DEFAULT_IFRA_PROMOTION_OPPORTUNITIES_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatIfraPromotionOpportunitiesMarkdown(report);
  return formatIfraPromotionOpportunitiesText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const report = buildIfraPromotionOpportunityReportFromFiles();
  writeIfraPromotionOpportunityReport(args.outputPath, report);

  const output = renderReport(report, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `IFRA promotion opportunities written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `IFRA promotion opportunities JSON written: ${path.relative(
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
