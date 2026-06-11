#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_MARKDOWN_PATH,
  DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_MARKDOWN_PATH,
  DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
  buildOfficialIfraHarvestReport,
  buildOfficialIfraSourceCandidatesFile,
  cacheOfficialIfraIndexPages,
  downloadOfficialStandardPdfs,
  formatOfficialIfraHarvestMarkdown,
  formatOfficialIfraHarvestText,
  writeOfficialIfraHarvestReport,
  writeOfficialIfraMarkdown,
  writeOfficialIfraSourceCandidates,
} from "./lib/official_ifra_harvest.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_PATH = path.join(
  ROOT,
  "data",
  "ifra_source_acquisition",
  "official_ifra_harvest_report.json"
);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/harvest_official_ifra_sources.mjs
  node scripts/harvest_official_ifra_sources.mjs --json
  node scripts/harvest_official_ifra_sources.mjs --markdown
  node scripts/harvest_official_ifra_sources.mjs --markdown --write docs/ifra/official_ifra_harvest_report.md
  node scripts/harvest_official_ifra_sources.mjs --download

Options:
  --json                         Print JSON.
  --markdown                     Print Markdown.
  --write <path>                 Write formatted output.
  --output <path>                JSON report path.
  --candidates-output <path>     Official candidate JSON path.
  --candidates-markdown <path>   Official candidate markdown path.
  --download                     Fetch/cache official IFRA pages and public standard PDFs where links are found.
  --help                         Show this help.

Default mode is cache/report only: it uses committed structured IFRA data and any cached official IFRA artifacts already present. Downloaded official PDFs/HTML stay under downloads/source_documents/ifra/official_ifra/ and are gitignored. This script does not promote runtime IFRA limits or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
    outputPath: DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_PATH,
    candidatesOutputPath: DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_PATH,
    candidatesMarkdownPath: DEFAULT_OFFICIAL_IFRA_SOURCE_CANDIDATES_MARKDOWN_PATH,
    download: false,
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
      const value = argv[++index] || DEFAULT_OFFICIAL_IFRA_HARVEST_REPORT_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--candidates-output") {
      const value = argv[++index];
      if (!value) throw new Error("--candidates-output requires a path");
      args.candidatesOutputPath = resolveRepoPath(value);
    } else if (arg === "--candidates-markdown") {
      const value = argv[++index];
      if (!value) throw new Error("--candidates-markdown requires a path");
      args.candidatesMarkdownPath = resolveRepoPath(value);
    } else if (arg === "--download") {
      args.download = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function renderReport(report, format) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") return formatOfficialIfraHarvestMarkdown(report);
  return formatOfficialIfraHarvestText(report);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  let downloadedPdfs = [];
  let indexDownloads = [];
  if (args.download) {
    indexDownloads = await cacheOfficialIfraIndexPages();
  }

  let report = buildOfficialIfraHarvestReport({
    downloadedPdfs: indexDownloads.filter((item) => item.status === "downloaded"),
  });

  if (args.download) {
    downloadedPdfs = await downloadOfficialStandardPdfs({ report });
    report = buildOfficialIfraHarvestReport({ downloadedPdfs });
  }

  const candidatesFile = buildOfficialIfraSourceCandidatesFile(report);
  writeOfficialIfraHarvestReport(args.outputPath, report);
  writeOfficialIfraSourceCandidates(args.candidatesOutputPath, candidatesFile);
  writeOfficialIfraMarkdown(
    args.candidatesMarkdownPath,
    formatOfficialIfraHarvestMarkdown({
      ...report,
      noOfficialMatchFound: [],
      needsSupplierDocumentInstead: [],
      weakAmbiguousMatches: [],
    })
  );

  const output = renderReport(report, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Official IFRA harvest report written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `Official IFRA harvest JSON written: ${path.relative(ROOT, args.outputPath)}`
      );
      console.log(
        `Official IFRA source candidates JSON written: ${path.relative(
          ROOT,
          args.candidatesOutputPath
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
