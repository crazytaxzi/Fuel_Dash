const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const ignored = new Set([".git", ".github", "vendor", "assets", "data", "dist"]);
const textExtensions = new Set([".js", ".mjs", ".html", ".txt", ".md", ".ps1", ".yml", ".yaml", ".json"]);
const explicitReportFilename = /(?:summary|detail|c1|driver[ _-]*(?:fuel[ _-]*)?metrics(?:[ _-]*detail)?|driver[ _-]*details|rolling[ _-]*7[ _-]*day|fuel[ _-]*compliance[ _-]*analysis|fuel[ _-]*noncompliant[ _-]*cost[ _-]*analysis|mpg[ _-]*by[ _-]*driver|pta[ _-]*dispatch[ _-]*tracker|fleet[ _-]*pta[ _-]*finder|electric[ _-]*apu)\.(?:xlsx|xlsm|xlsb|xls|pdf)/i;
const filenameRouter = /ALL_FILE_PATTERNS|EXPECTED_FILES|BASIC_REPORT_FILES|IDLE_REPORT_FILES|matchSourceKey|filenameFallback/i;
const problems = [];
const scripts = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      const relative = path.relative(root, full).replace(/\\/g, "/");
      const text = fs.readFileSync(full, "utf8");
      if (explicitReportFilename.test(text)) problems.push(`${relative}: explicit report filename`);
      if (relative !== "validate_dashboard.js" && filenameRouter.test(text)) problems.push(`${relative}: filename-routing construct`);
      if (/\.m?js$/i.test(entry.name)) scripts.push(full);
    }
  }
}

walk(root);
for (const script of scripts) {
  try {
    execFileSync(process.execPath, ["--check", script], { stdio: "pipe" });
  } catch (error) {
    problems.push(`${path.relative(root, script)}: JavaScript syntax check failed\n${error.stderr || error.message}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Validated ${scripts.length} JavaScript files. Report discovery is content-based except for the isolated APU filename marker.`);
