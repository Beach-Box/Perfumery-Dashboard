#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
  loadExistingHeroIfraSourceQueue,
} from "./lib/hero_ifra_source_acquisition_queue.mjs";
import {
  DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
  DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_MARKDOWN_PATH,
  DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
  buildIfraSourceDocumentInventory,
  formatIfraSourceDocumentInventoryMarkdown,
  formatIfraSourceDocumentInventoryText,
  writeIfraSourceDocumentInventory,
} from "./lib/ifra_source_document_review.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function printHelp() {
  console.log(`Usage:
  node scripts/inventory_ifra_source_documents.mjs
  node scripts/inventory_ifra_source_documents.mjs --json
  node scripts/inventory_ifra_source_documents.mjs --markdown
  node scripts/inventory_ifra_source_documents.mjs --markdown --write docs/ifra/ifra_source_document_inventory.md

Options:
  --source-dir <path>  Local IFRA/source document folder. Defaults to downloads/source_documents/ifra/
  --queue <path>       Queue JSON path. Defaults to data/ifra_source_acquisition/hero_ifra_source_queue.json
  --output <path>      Inventory JSON path. Defaults to data/ifra_source_acquisition/ifra_source_document_inventory.json
  --json               Print JSON output.
  --markdown           Print Markdown output.
  --write <path>       Write Markdown output to a file.
  --help               Show this help.

This script inventories local source documents for review only. It does not parse documents, add IFRA limits, promote records, or prove launch clearance.`);
}

function parseArgs(argv) {
  const args = {
    format: "text",
    sourceDir: DEFAULT_IFRA_SOURCE_DOCUMENT_DIR,
    queuePath: DEFAULT_HERO_IFRA_SOURCE_QUEUE_PATH,
    outputPath: DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_PATH,
    writePath: null,
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
    } else if (arg === "--source-dir") {
      const value = argv[++index];
      if (!value) throw new Error("--source-dir requires a path");
      args.sourceDir = resolveRepoPath(value);
    } else if (arg === "--queue") {
      const value = argv[++index];
      if (!value) throw new Error("--queue requires a path");
      args.queuePath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_IFRA_SOURCE_DOCUMENT_INVENTORY_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatOutput(inventory, format) {
  if (format === "json") return `${JSON.stringify(inventory, null, 2)}\n`;
  if (format === "markdown") return formatIfraSourceDocumentInventoryMarkdown(inventory);
  return formatIfraSourceDocumentInventoryText(inventory);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const queue = loadExistingHeroIfraSourceQueue(args.queuePath);
  const inventory = buildIfraSourceDocumentInventory({
    sourceDir: args.sourceDir,
    queue,
  });
  writeIfraSourceDocumentInventory(args.outputPath, inventory);

  const output = formatOutput(inventory, args.format);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.format !== "json") {
      console.log(
        `IFRA source document inventory written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `IFRA source document inventory JSON written: ${path.relative(
          ROOT,
          args.outputPath
        )}`
      );
    }
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }

  return inventory;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}
