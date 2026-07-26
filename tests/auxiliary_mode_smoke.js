const fs = require("fs");
const vm = require("vm");

async function main() {
  global.window = global;
  global.location = new URL("http://127.0.0.1:8765/");
  global.document = {
    body: null,
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
  };

  window.fetch = async () => new Response("missing", { status: 404 });
  window.VixenSmartDataLoader = { ready: Promise.resolve({}) };
  window.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: (rows) => ({ rows }),
      book_append_sheet: (workbook, sheet, name) => {
        workbook.sheet = sheet;
        workbook.name = name;
      },
    },
    write: () => new Uint8Array([80, 75, 3, 4]).buffer,
  };

  vm.runInThisContext(fs.readFileSync("auxiliary_mode.js", "utf8"));

  const names = [
    "data/Driver Fuel Metrics.xlsx",
    "data/Fuel Compliance Analysis.xlsx",
    "data/Fuel Noncompliant Cost Analysis.xlsx",
    "data/MPG by Driver.xlsx",
  ];

  for (const name of names) {
    const response = await window.fetch(name);
    if (!response.ok || !response.headers.get("X-Vixen-Virtual-Report")) {
      throw new Error(`Virtual report fallback failed for ${name}`);
    }
  }

  await Promise.resolve();
  if (!window.VixenAuxiliaryMode.active) {
    throw new Error("Auxiliary mode did not activate without a complete core report group.");
  }

  console.log("Auxiliary-mode startup smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
