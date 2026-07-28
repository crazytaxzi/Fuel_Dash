(() => {
  "use strict";

  const GENERIC_NAMES = new Set([
    "driver",
    "no driver",
    "unknown",
    "unknown driver",
    "unassigned",
    "n a",
    "na",
  ]);
  const GENERIC_UNITS = new Set(["unknown", "unknown truck", "no truck", "unassigned", "n a", "na"]);

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function fold(value) {
    return clean(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizeNumericIdentity(value) {
    const normalized = clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) return "";
    return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : normalized;
  }

  function normalizeTruck(value) {
    const raw = clean(value);
    if (!raw || GENERIC_UNITS.has(fold(raw))) return "";
    return normalizeNumericIdentity(raw);
  }

  function normalizeDriverCode(value) {
    const raw = clean(value);
    if (!raw) return "";
    return normalizeNumericIdentity(raw);
  }

  function extractDriverCode(value) {
    const raw = clean(value);
    const parenthesized = raw.match(/\((\d{4,10})\)/);
    if (parenthesized) return normalizeDriverCode(parenthesized[1]);
    const standalone = raw.match(/(?:^|\D)(\d{4,10})(?=\D|$)/);
    return standalone ? normalizeDriverCode(standalone[1]) : "";
  }

  function displayDriverName(value, code = "") {
    let raw = clean(value);
    if (!raw) return "";
    const escapedCode = String(code || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escapedCode) raw = raw.replace(new RegExp(`(?:\\(|\\b)${escapedCode}(?:\\)|\\b)`, "gi"), " ");
    raw = raw.replace(/\([^)]*\d[^)]*\)/g, " ").replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, "");
    const commaParts = raw.split(",").map(clean).filter(Boolean);
    if (commaParts.length === 2) raw = `${commaParts[1]} ${commaParts[0]}`;
    return clean(raw.replace(/[|;/]+/g, " "));
  }

  function normalizeDriverName(value) {
    const code = extractDriverCode(value);
    const display = displayDriverName(value, code);
    const tokens = fold(display)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean);
    if (!tokens.length) return "";
    const phrase = tokens.join(" ");
    if (GENERIC_NAMES.has(phrase)) return "";
    return tokens.sort().join(" ");
  }

  function parseDriverIdentity(value) {
    const raw = clean(value);
    const code = extractDriverCode(raw);
    const name = displayDriverName(raw, code);
    return { raw, code, name };
  }

  function identityTokens(record = {}) {
    const parsed = parseDriverIdentity(record.driverRaw || record.driver || "");
    const truck = normalizeTruck(record.truck || record.truckNumber || record.unit || record.unitNumber || "");
    const code = normalizeDriverCode(record.driverCode || parsed.code || "");
    const name = normalizeDriverName(record.driverName || parsed.name || "");
    return [...new Set([
      truck ? `truck:${truck}` : "",
      code ? `code:${code}` : "",
      name ? `name:${name}` : "",
    ].filter(Boolean))];
  }

  function groupMessages(messages = []) {
    const source = (Array.isArray(messages) ? messages : []).map((message, index) => ({
      ...message,
      _groupIndex: index,
      identities: [...new Set(Array.isArray(message?.identities) && message.identities.length
        ? message.identities.filter(Boolean)
        : identityTokens(message))],
    }));
    const parent = source.map((_, index) => index);
    const rank = source.map(() => 0);

    function find(index) {
      let current = index;
      while (parent[current] !== current) {
        parent[current] = parent[parent[current]];
        current = parent[current];
      }
      return current;
    }

    function union(left, right) {
      let a = find(left);
      let b = find(right);
      if (a === b) return;
      if (rank[a] < rank[b]) [a, b] = [b, a];
      parent[b] = a;
      if (rank[a] === rank[b]) rank[a] += 1;
    }

    const firstByIdentity = new Map();
    source.forEach((message, index) => {
      message.identities.forEach((identity) => {
        if (firstByIdentity.has(identity)) union(index, firstByIdentity.get(identity));
        else firstByIdentity.set(identity, index);
      });
    });

    const grouped = new Map();
    source.forEach((message, index) => {
      const root = find(index);
      if (!grouped.has(root)) grouped.set(root, []);
      grouped.get(root).push(message);
    });

    return [...grouped.values()].map((items) => {
      const sorted = items.sort((a, b) => Number(a.savedAt || 0) - Number(b.savedAt || 0) || a._groupIndex - b._groupIndex);
      return {
        messages: sorted.map(({ _groupIndex, ...message }) => message),
        identities: [...new Set(sorted.flatMap((message) => message.identities || []))],
        savedAt: Number(sorted[0]?.savedAt || 0),
      };
    }).sort((a, b) => a.savedAt - b.savedAt);
  }

  const api = Object.freeze({
    clean,
    normalizeTruck,
    normalizeDriverCode,
    normalizeDriverName,
    extractDriverCode,
    parseDriverIdentity,
    identityTokens,
    groupMessages,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.VixenTransitionGrouping = api;
})();
