const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("styles.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /<img src="assets\/vixen\.png"[^>]*alt="[^"]+"/i, "Sidebar image must have a valid source and description");
assert.match(css, /\.portrait-frame img\s*\{[^}]*object-fit:\s*contain/s, "Sidebar image must render without cropping");
assert.doesNotMatch(css, /\.portrait-frame\s*,\s*\.motto-card\s*\{\s*display:\s*none/s, "Responsive layout must not hide the sidebar image");
assert.match(css, /@media \(max-width: 850px\)[\s\S]*?\.sidebar\s*\{[^}]*overflow-y:\s*auto/s, "Responsive sidebar must scroll vertically");

console.log("Responsive sidebar image and scrolling smoke test passed.");
