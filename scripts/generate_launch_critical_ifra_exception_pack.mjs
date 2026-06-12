#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_PATH = path.join(
  ROOT,
  "data",
  "ifra_source_acquisition",
  "launch_critical_ifra_exception_pack.json"
);
const DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_MARKDOWN_PATH = path.join(
  ROOT,
  "docs",
  "ifra",
  "launch_critical_ifra_exception_pack.md"
);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate_launch_critical_ifra_exception_pack.mjs
  node scripts/generate_launch_critical_ifra_exception_pack.mjs --json
  node scripts/generate_launch_critical_ifra_exception_pack.mjs --markdown
  node scripts/generate_launch_critical_ifra_exception_pack.mjs --markdown --write docs/ifra/launch_critical_ifra_exception_pack.md

Options:
  --json              Print JSON.
  --markdown          Print Markdown.
  --write <path>      Write formatted output.
  --output <path>     JSON report path.
  --help              Show this help.

This command compresses current IFRA/source gaps into a formula-relevant exception pack. It reads existing local generated outputs only. It does not scrape sources, promote IFRA limits, change runtime IFRA classification, or claim launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    writePath: null,
    outputPath: DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_PATH,
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
      const value =
        argv[++index] || DEFAULT_LAUNCH_CRITICAL_IFRA_EXCEPTION_PACK_MARKDOWN_PATH;
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

function renderReport(
  report,
  format,
  { formatLaunchCriticalIfraExceptionPackMarkdown, formatLaunchCriticalIfraExceptionPackText }
) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") {
    return formatLaunchCriticalIfraExceptionPackMarkdown(report);
  }
  return formatLaunchCriticalIfraExceptionPackText(report);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const {
    buildLaunchCriticalIfraExceptionPackFromFiles,
    formatLaunchCriticalIfraExceptionPackMarkdown,
    formatLaunchCriticalIfraExceptionPackText,
    writeLaunchCriticalIfraExceptionPack,
  } = await import("./lib/launch_critical_ifra_exception_pack.mjs");

  const report = buildLaunchCriticalIfraExceptionPackFromFiles();
  writeLaunchCriticalIfraExceptionPack(args.outputPath, report);

  const output = renderReport(report, args.format, {
    formatLaunchCriticalIfraExceptionPackMarkdown,
    formatLaunchCriticalIfraExceptionPackText,
  });
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `Launch-critical IFRA exception pack written: ${path.relative(
          ROOT,
          args.writePath
        )}`
      );
      console.log(
        `Launch-critical IFRA exception pack JSON written: ${path.relative(
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
