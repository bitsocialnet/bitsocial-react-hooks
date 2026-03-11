#!/usr/bin/env node
/**
 * Reads coverage-final.json and reports uncovered statements, functions, and branches
 * for files matching: feed-sorter, feeds-store, feeds/utils, replies-pages-store,
 * replies-store, replies/utils, communities-pages, communities-store
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coverageDir = process.env.COVERAGE_DIR || "coverage-live3";
const coveragePath = join(__dirname, `../src/${coverageDir}/coverage-final.json`);

const MATCH_KEYS = [
  "feed-sorter",
  "feeds-store",
  "feeds/utils",
  "replies-pages-store",
  "replies-store",
  "replies/utils",
  "communities-pages",
  "communities-store",
];

const data = JSON.parse(readFileSync(coveragePath, "utf8"));
const paths = Object.keys(data).filter((p) => MATCH_KEYS.some((k) => p.includes(k)));

const report = {};

for (const path of paths) {
  const entry = data[path];
  const { statementMap = {}, fnMap = {}, branchMap = {}, s = {}, f = {}, b = {} } = entry;

  const stmtLines = [];
  for (const [id, count] of Object.entries(s)) {
    if (count === 0 && statementMap[id]) {
      stmtLines.push(statementMap[id].start.line);
    }
  }
  stmtLines.sort((a, b) => a - b);

  const funcLines = [];
  for (const [id, count] of Object.entries(f)) {
    if (count === 0) {
      const fn = fnMap[id];
      const line = fn?.decl?.start?.line ?? fn?.loc?.start?.line;
      if (line != null) funcLines.push(line);
    }
  }
  funcLines.sort((a, b) => a - b);

  const branchIds = [];
  for (const [id, counts] of Object.entries(b)) {
    const hasZero = Array.isArray(counts) ? counts.some((c) => c === 0) : counts === 0;
    if (hasZero && branchMap[id]) {
      branchIds.push(id);
    }
  }

  const shortPath = path.replace(/^.*\/src\//, "src/");
  report[shortPath] = {
    uncoveredStmtLines: [...new Set(stmtLines)],
    uncoveredFuncLines: [...new Set(funcLines)],
    uncoveredBranchIds: branchIds,
  };
}

console.log(JSON.stringify(report, null, 2));
