"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const server = fs.readFileSync("serve_dashboard.ps1", "utf8");
const workflow = fs.readFileSync("worked_workflow.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const bootstrap = fs.readFileSync("database/bootstrap.js", "utf8");
assert.match(server, /\$Extension\s+-in\s+@\("\.js",\s*"\.mjs",\s*"\.css"\)/, "runtime assets must revalidate after a local app update");
assert.match(workflow, /\["PERSONAL", \["specialNotes"\]\]/, "Special Notes must remain near the top of desktop navigation");
assert.match(html, /database\/bootstrap\.js\?v=3\.20\.2/, "the release bootstrap must bypass stale browser cache");
assert.match(bootstrap, /script\.src = `\$\{src\}\?v=\$\{BUILD_VERSION\}`/, "dynamically loaded modules must use the release cache key");

console.log("Local upgrade cache and Special Notes navigation smoke test passed.");
