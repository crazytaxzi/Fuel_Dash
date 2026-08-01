"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const roots = ["index.html", "styles.css", "missing_bol.js", "worked_workflow.js", "database"];
const files = [];

function collect(entry) {
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entry)) collect(path.join(entry, child));
  } else if (/\.(?:css|html|js)$/i.test(entry)) files.push(entry);
}

for (const root of roots) collect(root);
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /<meta\s+name=["']viewport["']/i, `${file} must not enable a mobile viewport`);
  for (const match of source.matchAll(/@media\s*\([^)]*max-width\s*:\s*(\d+)px/gi)) {
    assert.ok(Number(match[1]) >= 900, `${file} contains a mobile-only ${match[1]}px breakpoint`);
  }
}

console.log("Desktop-only source audit smoke test passed.");
