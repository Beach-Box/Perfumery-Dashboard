#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_MARKDOWN_PATH,
  DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_REPORT_PATH,
  formatIfraSourceAcquisitionAutopilotMarkdown,
  formatIfraSourceAcquisitionAutopilotText,
  runIfraSourceAcquisitionAutopilot,
} from "./lib/ifra_source_acquisition_autopilot.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/run_ifra_source_acquisition_autopilot.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv"
  node scripts/run_ifra_source_acquisition_autopilot.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv" --download
  node scripts/run_ifra_source_acquisition_autopilot.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv" --download --markdown --write docs/ifra/ifra_source_acquisition_autopilot_report.md

Options:
  --ingredient-reference <path>  Ingredient reference CSV path.
  --download                     Download/cache known CSV links and visible same-domain supplier document links.
  --dry-run                      Use existing cached/local data and report candidate links only. This is the default.
  --json                         Print JSON.
  --markdown                     Print Markdown.
  --write <path>                 Write formatted output.
  --output <path>                JSON report path.
  --rate-limit-ms <number>       Delay between downloads. Default: 350.
  --help                         Show this help.

Source Acquisition Autopilot v2 targets unresolved IFRA source gaps, refreshes official IFRA candidates, harvests known CSV links, optionally follows visible same-domain supplier IFRA/SDS/spec links from known product pages, and reruns the review-first evidence pipeline. It does not run broad web search, bypass access controls, promote runtime IFRA limits, change formulas/runtime behavior, or claim launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    ingredientReferencePath: null,
    download: false,
    format: "text",
    writePath: null,
    outputPath: DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_REPORT_PATH,
    rateLimitMs: 350,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--ingredient-reference") {
      const value = argv[++index];
      if (!value) throw new Error("--ingredient-reference requires a CSV path");
      args.ingredientReferencePath = resolvePath(value);
    } else if (arg === "--download") {
      args.download = true;
    } else if (arg === "--dry-run") {
      args.download = false;
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--write") {
      const value =
        argv[++index] || DEFAULT_IFRA_SOURCE_ACQUISITION_AUTOPILOT_MARKDOWN_PATH;
      args.writePath = resolvePath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolvePath(value);
    } else if (arg === "--rate-limit-ms") {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--rate-limit-ms requires a non-negative number");
      }
      args.rateLimitMs = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") {
    return formatIfraSourceAcquisitionAutopilotMarkdown(report);
  }
  return formatIfraSourceAcquisitionAutopilotText(report);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const { report } = await runIfraSourceAcquisitionAutopilot({
    ingredientReferencePath: args.ingredientReferencePath,
    download: args.download,
    rateLimitMs: args.rateLimitMs,
    outputPath: args.outputPath,
  });
  const output = renderReport(report, args.format);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `IFRA source acquisition autopilot report written: ${path.relative(
          ROOT,
          args.writePath
        )}`
      );
      console.log(
        `IFRA source acquisition autopilot JSON written: ${path.relative(
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
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
