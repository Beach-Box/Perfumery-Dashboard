#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ROOT } from "./lib/gcms_reference_pipeline.mjs";
import {
  DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_MARKDOWN_PATH,
  DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_PATH,
  buildHeroFormulaGcmsReferenceMatches,
  formatHeroFormulaGcmsReferenceMatchesMarkdown,
  formatHeroFormulaGcmsReferenceMatchesText,
  loadHeroFormulaGcmsReferenceMatchInputs,
  writeHeroFormulaGcmsReferenceMatches,
} from "./lib/gcms_formula_reference_matcher.mjs";

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function parseArgs(argv) {
  const args = {
    outputPath: DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_PATH,
    outputFormat: "text",
    writePath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a path");
      args.outputPath = resolveRepoPath(value);
    } else if (arg === "--json") {
      args.outputFormat = "json";
    } else if (arg === "--markdown") {
      args.outputFormat = "markdown";
    } else if (arg === "--write") {
      const value = argv[++index] || DEFAULT_HERO_FORMULA_GCMS_REFERENCE_MATCHES_MARKDOWN_PATH;
      args.writePath = resolveRepoPath(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatOutput(report, outputFormat) {
  if (outputFormat === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (outputFormat === "markdown") return formatHeroFormulaGcmsReferenceMatchesMarkdown(report);
  return formatHeroFormulaGcmsReferenceMatchesText(report);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const inputs = loadHeroFormulaGcmsReferenceMatchInputs();
  const report = buildHeroFormulaGcmsReferenceMatches(inputs);
  writeHeroFormulaGcmsReferenceMatches(args.outputPath, report);

  const output = formatOutput(report, args.outputFormat);
  if (args.writePath) {
    fs.mkdirSync(path.dirname(args.writePath), { recursive: true });
    fs.writeFileSync(args.writePath, output.endsWith("\n") ? output : `${output}\n`);
    if (args.outputFormat !== "json") {
      console.log(
        `Hero formula GCMS reference matches written: ${path.relative(ROOT, args.writePath)}`
      );
      console.log(
        `Hero formula GCMS reference match JSON written: ${path.relative(ROOT, args.outputPath)}`
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
    console.error(error.message);
    process.exitCode = 1;
  }
}
