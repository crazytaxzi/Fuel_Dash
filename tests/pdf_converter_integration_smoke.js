"use strict";
const fs = require("fs");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const converter = fs.readFileSync("pdf_to_xlsx.js", "utf8");
const mergeWorkflow = fs.readFileSync(".github/workflows/publish-v3-release-on-merge.yml", "utf8");

for (const id of ["pdfInput", "chooseBtn", "dropZone", "status", "results"]) {
  assert.match(html, new RegExp(`id="${id}"`), `Settings must provide #${id}`);
}
assert.match(html, /type="module" src="pdf_to_xlsx\.js"/, "the in-app converter module must be loaded by the dashboard");
assert.match(converter, /import\("\.\/vendor\/pdfjs\/pdf\.min\.mjs"\)/, "PDF.js must be loaded lazily when conversion starts");
assert.doesNotMatch(converter, /^import .*pdf\.min\.mjs/m, "PDF.js must not delay normal dashboard startup");
assert.match(mergeWorkflow, /Path\("pdf_to_xlsx\.js"\)/, "the release gate must validate the in-app converter");
assert.match(mergeWorkflow, /"tests"/, "developer tests must be excluded from release packages");
console.log("In-app PDF converter and clean-package smoke test passed.");
