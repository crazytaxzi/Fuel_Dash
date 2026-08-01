const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("styles.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /<img src="assets\/vixen\.png"[^>]*alt="[^"]+"/i, "Sidebar image must have a valid source and description");
assert.match(css, /\.portrait-frame img\s*\{[^}]*object-fit:\s*contain/s, "Sidebar image must render without cropping");
assert.doesNotMatch(css, /\.portrait-frame\s*,\s*\.motto-card\s*\{\s*display:\s*none/s, "Desktop layout must not hide the sidebar image");
assert.match(css, /\.nav-list\s*\{[^}]*overflow-y:\s*auto/s, "Desktop sidebar navigation must scroll vertically");
assert.match(css, /body\s*\{[^}]*min-width:\s*1180px/s, "The PC-only dashboard must retain its desktop canvas in narrow windows");
assert.doesNotMatch(css, /@media\s*\([^)]*max-width:\s*(?:[1-8]?\d{1,2})px/s, "Phone and tablet breakpoints must not return to the PC-only dashboard");

console.log("Desktop sidebar image and scrolling smoke test passed.");
