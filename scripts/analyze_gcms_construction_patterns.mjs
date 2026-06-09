#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildHeroFormulaRawDbSupportRows } from "../src/lib/hero_formula_material_support.js";
import {
  DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
  ROOT,
} from "./lib/gcms_reference_pipeline.mjs";
import {
  DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
  buildGcmsConstructionPatterns,
  formatGcmsConstructionPatternsMarkdown,
  formatGcmsConstructionPatternsText,
  loadGcmsConstructionPatternInputs,
  writeGcmsConstructionPatterns,
} from "./lib/gcms_construction_patterns.mjs";

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function parseArgs(argv) {
  const args = {
    structuredPath: DEFAULT_GCMS_STRUCTURED_CANDIDATES_PATH,
    outputPath: DEFAULT_GCMS_CONSTRUCTION_PATTERNS_PATH,
    outputFormat: "text",
    writePath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--structured") {
      const value = argv[++index];
      if (!value) throw new Error("--structured requires a path");
      args.structuredPath = resolveRepoPath(value);
    } else if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--json") {
      args.outputFormat = "json";
    } else if (arg === "--markdown") {
      args.outputFormat = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index];
      if (!value) throw new Error("--write requires a path");
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatOutput(report, outputFormat) {
  if (outputFormat === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (outputFormat === "markdown") return formatGcmsConstructionPatternsMarkdown(report);
  return formatGcmsConstructionPatternsText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const inputs = loadGcmsConstructionPatternInputs({
    structuredPath: args.structuredPath,
  });
  const report = buildGcmsConstructionPatterns({
    ...inputs,
    inventoryNames: Object.keys(buildHeroFormulaRawDbSupportRows({})),
  });

  writeGcmsConstructionPatterns(args.outputPath, report);
  const output = formatOutput(report, args.outputFormat);

  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.outputFormat !== "json") {
      console.log(`GCMS construction pattern report written: ${path.relative(ROOT, args.writePath)}`);
      console.log(`GCMS construction pattern JSON written: ${path.relative(ROOT, args.outputPath)}`);
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
    console.error(error.message);
    process.exitCode = 1;
  }
}
