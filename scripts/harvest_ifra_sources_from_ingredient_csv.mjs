#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_INGREDIENT_SOURCE_HARVEST_MARKDOWN_PATH,
  DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
  buildIngredientSourceHarvestReport,
  downloadHarvestSources,
  formatIngredientSourceHarvestMarkdown,
  formatIngredientSourceHarvestText,
  writeIngredientSourceHarvestReport,
} from "./lib/ifra_source_harvest.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/harvest_ifra_sources_from_ingredient_csv.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv"
  node scripts/harvest_ifra_sources_from_ingredient_csv.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv" --markdown --write docs/ifra/ingredient_source_harvest_report.md
  node scripts/harvest_ifra_sources_from_ingredient_csv.mjs --ingredient-reference "/path/to/Ingredient data - Ingredient Data.csv" --download

Options:
  --ingredient-reference <path>  Ingredient reference CSV path.
  --json                         Print JSON.
  --markdown                     Print Markdown.
  --write <path>                 Write formatted output.
  --output <path>                JSON report path.
  --download                     Download/cache known linked source documents/pages and copy IFRA 51 PDF if present.
  --copy-ifra-51                 Copy only the local IFRA 51 PDF into the ignored source folder if present.
  --dry-run                      Report only. This is the default.
  --rate-limit-ms <number>       Delay between downloads. Default: 350.
  --help                         Show this help.

Default mode is dry-run/report only. Downloaded source documents and cached pages stay under downloads/source_documents/ifra/ and are gitignored. This script does not add IFRA limits, promote records, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    ingredientReferencePath: null,
    format: "text",
    writePath: null,
    outputPath: DEFAULT_INGREDIENT_SOURCE_HARVEST_REPORT_PATH,
    download: false,
    copyIfra51: false,
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
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--markdown") {
      args.format = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_INGREDIENT_SOURCE_HARVEST_MARKDOWN_PATH;
      args.writePath = resolvePath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolvePath(value);
    } else if (arg === "--download") {
      args.download = true;
    } else if (arg === "--copy-ifra-51") {
      args.copyIfra51 = true;
    } else if (arg === "--dry-run") {
      args.download = false;
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
  if (format === "markdown") return formatIngredientSourceHarvestMarkdown(report);
  return formatIngredientSourceHarvestText(report);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  let report = buildIngredientSourceHarvestReport({
    ingredientReferencePath: args.ingredientReferencePath,
    download: args.download,
    copyIfra51: args.copyIfra51,
  });

  if (args.download) {
    report = await downloadHarvestSources({
      report,
      rateLimitMs: args.rateLimitMs,
    });
  }

  writeIngredientSourceHarvestReport(args.outputPath, report);
  const output = renderReport(report, args.format);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Ingredient source harvest report written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `Ingredient source harvest JSON written: ${path.relative(ROOT, args.outputPath)}`
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
