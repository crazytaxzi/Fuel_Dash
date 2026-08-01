let pdfjsPromise = null;

const input = document.getElementById("pdfInput");
const chooseBtn = document.getElementById("chooseBtn");
const dropZone = document.getElementById("dropZone");
const status = document.getElementById("status");
const results = document.getElementById("results");

chooseBtn.addEventListener("click", () => input.click());
input.addEventListener("change", () => convertFiles([...input.files]));
["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.add("drag");
}));
["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag");
}));
dropZone.addEventListener("drop", (event) => convertFiles([...event.dataTransfer.files].filter((file) => /\.pdf$/i.test(file.name))));

async function convertFiles(files) {
  if (!files.length) return;
  chooseBtn.disabled = true;
  results.innerHTML = "";
  status.textContent = `Converting ${files.length} PDF file${files.length === 1 ? "" : "s"}…`;
  let converted = 0;

  for (const file of files) {
    const row = document.createElement("div");
    row.className = "result";
    row.innerHTML = `<div><strong>${escapeHtml(file.name)}</strong><small>Reading positioned PDF text…</small></div><span>…</span>`;
    results.append(row);
    try {
      const pages = await extractPages(file);
      const reportType = classifyReportContent(pages);
      if (!reportType) throw new Error("The PDF text did not match a supported report structure. The file may need OCR or a new structural rule.");
      const workbook = buildWorkbook(reportType, pages, file.name);
      const outputName = convertedOutputName(file.name);
      XLSX.writeFile(workbook, outputName, { compression: true });
      const recordCount = workbook.__recordCount || 0;
      row.querySelector("small").textContent = `${recordCount.toLocaleString("en-US")} data row${recordCount === 1 ? "" : "s"} converted to ${outputName}`;
      row.querySelector("span").textContent = "Converted";
      row.querySelector("span").className = "ok";
      converted += 1;
    } catch (error) {
      row.querySelector("small").textContent = error.message || "Conversion failed.";
      row.querySelector("span").textContent = "Needs attention";
      row.querySelector("span").className = "error";
    }
  }
  status.textContent = `${converted} of ${files.length} report${files.length === 1 ? "" : "s"} converted. Check your Downloads folder.`;
  chooseBtn.disabled = false;
  input.value = "";
}

async function extractPages(file) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(positionedLines(content.items));
  }
  return pages;
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("./vendor/pdfjs/pdf.min.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    }).catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

function classifyReportContent(pages) {
  const lines = pages.flat();
  const text = normalize(lines.join("\n"));
  const scores = {
    driverMetrics: scorePhrases(text, [["dispatch mpg", 6], ["idle", 3], ["oor", 4], ["driver current position code", 5], ["driver leader", 2]]),
    compliance: scorePhrases(text, [["compliance", 6], ["date range", 3], ["last refreshed", 2], ["recommendation", 3]]) + (lines.some(hasDateAndPercent) ? 5 : 0),
    cost: scorePhrases(text, [["gallon over under cost", 7], ["location noncompliant cost", 7], ["total noncompliant cost", 7], ["grand total", 3]]) + (lines.some((line) => /\$\s*-?[\d,]+(?:\.\d+)?/.test(line)) ? 3 : 0),
    mpg: scorePhrases(text, [["dispatch mpg", 4], ["driver performance", 3], ["weekly mpg", 4], ["driver code", 2]]) + (lines.filter((line) => /\b\d{5,6}\b/.test(line) && /\b\d+\.\d+\b/.test(line)).length >= 2 ? 6 : 0),
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] >= 8 && ranked[0][1] > (ranked[1]?.[1] || 0) ? ranked[0][0] : null;
}

function scorePhrases(text, phrases) {
  return phrases.reduce((total, [phrase, weight]) => total + (text.includes(normalize(phrase)) ? weight : 0), 0);
}

function hasDateAndPercent(line) {
  return /\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})\b/.test(line) && /-?\d+(?:\.\d+)?%/.test(line);
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[%#]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function convertedOutputName(sourceName) {
  const base = String(sourceName || "report").replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "report";
  return `${base}-converted.xlsx`;
}

function positionedLines(items) {
  const rows = [];
  [...items]
    .filter((item) => item.str)
    .sort((a, b) => (b.transform?.[5] || 0) - (a.transform?.[5] || 0) || (a.transform?.[4] || 0) - (b.transform?.[4] || 0))
    .forEach((item) => {
      const y = item.transform?.[5] || 0;
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 1.4);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    });
  return rows.sort((a, b) => b.y - a.y).map((row) => joinPositionedItems(row.items)).filter(Boolean);
}

function joinPositionedItems(items) {
  let output = "";
  let previousEnd = null;
  let previousSize = 8;
  items.sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0)).forEach((item) => {
    const x = item.transform?.[4] || 0;
    const size = Math.abs(item.transform?.[0] || item.height || previousSize || 8);
    const gap = previousEnd === null ? 0 : x - previousEnd;
    if (output && gap > Math.max(1.4, Math.min(size, previousSize) * 0.28)) output += " ";
    output += item.str;
    previousEnd = x + (item.width || 0);
    previousSize = size;
  });
  return output.replace(/\s+/g, " ").replace(/\s+([,.:;%])/g, "$1").replace(/([$])\s+/g, "$1").trim();
}

function buildWorkbook(type, pages, sourceName) {
  const lines = pages.flat();
  let rows;
  if (type === "driverMetrics") rows = driverMetricRows(lines);
  else if (type === "compliance") rows = complianceRows(lines);
  else if (type === "cost") rows = costRows(lines);
  else if (type === "mpg") rows = mpgRows(lines);
  else throw new Error("Unsupported report structure.");
  if (!rows.data.length) throw new Error("No report data rows were recognized. The PDF may need OCR or layout tuning.");

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows.sheet);
  sheet["!cols"] = rows.widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Table 1");
  const rawSheet = XLSX.utils.aoa_to_sheet([["Source PDF", sourceName], ["Converted", new Date().toISOString()], [], ...lines.map((line) => [line])]);
  rawSheet["!cols"] = [{ wch: 120 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, rawSheet, "Extracted Text");
  Object.defineProperty(workbook, "__recordCount", { value: rows.data.length });
  return workbook;
}

function driverMetricRows(lines) {
  const data = [];
  let pending = "";
  for (const original of lines) {
    const line = `${pending} ${original}`.trim();
    const tail = line.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%\s*$/);
    if (!tail) {
      pending = /^\d{5,8}\s+\S+/i.test(original) ? original : "";
      continue;
    }
    pending = "";
    if (/grand\s*total/i.test(line)) continue;
    const prefix = line.slice(0, tail.index).trim();
    const identity = prefix.match(/^(\d{5,6}|[A-Z]{5})(.+?)\s+(?=[A-Z]{4,7}\b)/i);
    if (!identity) continue;
    data.push([identity[2].trim(), identity[1], "", Number(tail[1]), Number(tail[2]) / 100, Number(tail[3]) / 100]);
  }
  return {
    sheet: [["Driver", "Driver Code", "Driver Leader", "Dispatch MPG", "28 Day Idle %", "OOR %"], ...data],
    data,
    widths: [30, 14, 20, 14, 16, 12],
  };
}

function complianceRows(lines) {
  const data = [];
  for (const line of lines) {
    const dateMatch = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/) || line.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    const percentages = [...line.matchAll(/(-?\d+(?:\.\d+)?)%/g)].map((match) => Number(match[1]) / 100);
    if (!dateMatch || !percentages.length || /date range|last refreshed/i.test(line)) continue;
    const date = dateMatch[0].includes("-")
      ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
      : new Date(Number(dateMatch[3]), Number(dateMatch[1]) - 1, Number(dateMatch[2]));
    const row = Array(33).fill(null);
    row[0] = date;
    row[32] = percentages.at(-1);
    data.push(row);
  }
  const header = Array(33).fill(null);
  header[0] = "Week End";
  header[32] = "% of Compliance";
  return { sheet: [header, ...data], data, widths: [14, ...Array(31).fill(2), 18] };
}

function costRows(lines) {
  const line = lines.find((value) => /grand\s*total/i.test(value)) || "";
  const currency = [...line.matchAll(/\$\s*(-?[\d,]+(?:\.\d+)?)/g)].map((match) => Number(match[1].replace(/,/g, "")));
  if (currency.length < 3) return { sheet: [], data: [], widths: [] };
  const row = Array(32).fill(null);
  row[0] = "Grand Total";
  row[21] = currency.at(-3);
  row[25] = currency.at(-2);
  row[31] = currency.at(-1);
  const header = Array(32).fill(null);
  header[0] = "Groupby";
  header[21] = "Gallon Over/Under Cost";
  header[25] = "Location Noncompliant Cost";
  header[31] = "Total Noncompliant Cost";
  return { sheet: [header, row], data: [row], widths: Array(32).fill(3).map((value, index) => [0, 21, 25, 31].includes(index) ? 25 : value) };
}

function mpgRows(lines) {
  const data = [];
  let pending = "";
  for (const original of lines) {
    const line = `${pending} ${original}`.trim();
    const code = line.match(/\b(\d{6})\b/);
    const values = [...line.matchAll(/\b\d+\.\d+\b/g)].map((match) => ({ value: Number(match[0]), index: match.index }));
    if (!code || !values.length) {
      pending = code ? line : "";
      continue;
    }
    pending = "";
    const name = line.slice((code.index || 0) + code[0].length, values[0].index).trim().replace(/\.\.$/, "").trim();
    if (!name) continue;
    const row = Array(13).fill(null);
    row[1] = `${code[1]} ${name}`;
    values.slice(-11).forEach((entry, index) => { row[index + 2] = entry.value; });
    data.push(row);
  }
  const headerRows = [
    ["Driver MPG history"],
    ["Converted from PDF"],
    [],
    ["Driver performance"],
    ["Driver Leader", "Driver Code Driver Name", "Weekly MPG values"],
  ];
  return { sheet: [...headerRows, ...data], data, widths: [20, 36, ...Array(11).fill(11)] };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
