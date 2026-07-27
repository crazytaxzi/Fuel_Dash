(() => {
  "use strict";

  const DB_NAME = "fuel-dash-operations";
  const DB_VERSION = 1;
  const STORE_SETTINGS = "settings";
  const STORE_SNAPSHOTS = "ptaSnapshots";
  const STORE_CHANGES = "ptaChanges";
  const MANAGED_KEYS = new Set([
    "vixenManualPtaActive",
    "vixenManualPtaText",
    "vixenManualPtaSavedAt",
    "vixenPtaActionNotesV1",
    "vixenDriverActionNotesV1",
    "vixenWorkedNoteCompletionV2",
    "vixenTransitionNoteSelectionV1",
    "vixenPlanningPpg",
    "vixenRefreshSeconds",
    "vixenBrand",
    "vixenTagline",
  ]);

  const nativeStorage = window.localStorage;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeClear = Storage.prototype.clear;
  const cache = new Map();
  let db = null;
  let bridgeInstalled = false;

  const ready = initialize().catch((error) => {
    console.error("Fuel dashboard database failed to initialize", error);
    return { mode: "legacy", error };
  });

  window.FuelDashboardDb = {
    ready,
    managedKeys: [...MANAGED_KEYS],
    get: (key) => cache.has(String(key)) ? cache.get(String(key)) : null,
    set: async (key, value) => setManagedValue(String(key), String(value)),
    remove: async (key) => removeManagedValue(String(key)),
    savePtaSnapshot,
    listPtaSnapshots,
    searchPtaHistory,
    searchPtaNotes,
    listPtaChanges,
    markPtaChangeReviewed,
    markAllPtaChangesReviewed,
    getUnreviewedPtaChangeCount,
    deletePtaSnapshot,
    clearPtaHistory,
    parsePtaText,
  };

  async function initialize() {
    db = await openDatabase();
    await loadSettingsCache();
    await migrateLegacyLocalStorage();
    installLocalStorageBridge();
    await seedSnapshotFromCurrentPaste();
    return { mode: "indexeddb", database: DB_NAME, version: DB_VERSION };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const nextDb = request.result;
        if (!nextDb.objectStoreNames.contains(STORE_SETTINGS)) {
          nextDb.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        }
        if (!nextDb.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const store = nextDb.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
          store.createIndex("savedAt", "savedAt", { unique: false });
          store.createIndex("hash", "hash", { unique: false });
        }
        if (!nextDb.objectStoreNames.contains(STORE_CHANGES)) {
          const store = nextDb.createObjectStore(STORE_CHANGES, { keyPath: "id" });
          store.createIndex("detectedAt", "detectedAt", { unique: false });
          store.createIndex("truck", "truck", { unique: false });
          store.createIndex("severity", "severity", { unique: false });
          store.createIndex("reviewedAt", "reviewedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the dashboard database."));
      request.onblocked = () => reject(new Error("The dashboard database upgrade is blocked by another open tab."));
    });
  }

  async function loadSettingsCache() {
    const rows = await getAll(STORE_SETTINGS);
    rows.forEach((row) => {
      if (row && MANAGED_KEYS.has(row.key)) cache.set(row.key, String(row.value ?? ""));
    });
  }

  async function migrateLegacyLocalStorage() {
    const writes = [];
    MANAGED_KEYS.forEach((key) => {
      const legacy = nativeGetItem.call(nativeStorage, key);
      if (!cache.has(key) && legacy !== null) {
        cache.set(key, legacy);
        writes.push(put(STORE_SETTINGS, { key, value: legacy, updatedAt: new Date().toISOString() }));
      }
    });
    if (writes.length) await Promise.all(writes);
    MANAGED_KEYS.forEach((key) => {
      if (nativeGetItem.call(nativeStorage, key) !== null) nativeRemoveItem.call(nativeStorage, key);
    });
  }

  async function seedSnapshotFromCurrentPaste() {
    if (cache.get("vixenManualPtaActive") !== "true") return;
    const rawText = String(cache.get("vixenManualPtaText") || "").trim();
    if (!rawText) return;
    const existing = await getAll(STORE_SNAPSHOTS);
    if (existing.length) return;
    const parsed = parsePtaText(rawText);
    if (!parsed.records.length) return;
    const savedMillis = Number(cache.get("vixenManualPtaSavedAt"));
    const savedAt = Number.isFinite(savedMillis) && savedMillis > 0 ? new Date(savedMillis).toISOString() : new Date().toISOString();
    const snapshot = {
      id: `migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt,
      hash: await sha256(rawText),
      rawText,
      headers: parsed.headers,
      records: parsed.records,
      rowCount: parsed.records.length,
      source: "localstorage-migration",
      restoredFrom: null,
      label: "Migrated current PTA paste",
      changeCount: 0,
      highChangeCount: 0,
    };
    await put(STORE_SNAPSHOTS, snapshot);
  }

  function installLocalStorageBridge() {
    if (bridgeInstalled) return;
    bridgeInstalled = true;

    Storage.prototype.getItem = function getItem(key) {
      const normalized = String(key);
      if (this === nativeStorage && MANAGED_KEYS.has(normalized)) {
        return cache.has(normalized) ? cache.get(normalized) : null;
      }
      return nativeGetItem.call(this, key);
    };

    Storage.prototype.setItem = function setItem(key, value) {
      const normalized = String(key);
      if (this === nativeStorage && MANAGED_KEYS.has(normalized)) {
        const stringValue = String(value);
        cache.set(normalized, stringValue);
        void setManagedValue(normalized, stringValue);
        dispatchDatabaseEvent("write", normalized, stringValue);
        return;
      }
      nativeSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function removeItem(key) {
      const normalized = String(key);
      if (this === nativeStorage && MANAGED_KEYS.has(normalized)) {
        cache.delete(normalized);
        void removeManagedValue(normalized);
        dispatchDatabaseEvent("remove", normalized, null);
        return;
      }
      nativeRemoveItem.call(this, key);
    };

    Storage.prototype.clear = function clear() {
      if (this !== nativeStorage) return nativeClear.call(this);
      nativeClear.call(this);
      const keys = [...cache.keys()];
      cache.clear();
      void Promise.all(keys.map((key) => removeManagedValue(key)));
      dispatchDatabaseEvent("clear", "*", null);
    };
  }

  function dispatchDatabaseEvent(action, key, value) {
    window.dispatchEvent(new CustomEvent("fuel-dashboard-database-change", {
      detail: { action, key, value },
    }));
  }

  async function setManagedValue(key, value) {
    if (!MANAGED_KEYS.has(key)) throw new Error(`Unsupported dashboard setting: ${key}`);
    cache.set(key, value);
    if (!db) await ready;
    return put(STORE_SETTINGS, { key, value, updatedAt: new Date().toISOString() });
  }

  async function removeManagedValue(key) {
    cache.delete(key);
    if (!db) await ready;
    return remove(STORE_SETTINGS, key);
  }

  async function savePtaSnapshot(rawText, metadata = {}) {
    await ready;
    if (!db) throw new Error("The dashboard database is unavailable.");
    const text = String(rawText || "").trim();
    if (!text) throw new Error("Paste PTA data before saving a snapshot.");

    const parsed = parsePtaText(text);
    if (!parsed.records.length) throw new Error("No PTA rows could be recognized in that paste.");
    const hash = await sha256(text);
    const latest = (await listPtaSnapshots({ limit: 1 }))[0] || null;
    if (latest?.hash === hash) {
      return { snapshot: latest, changes: [], duplicate: true };
    }

    const savedAt = new Date().toISOString();
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      savedAt,
      hash,
      rawText: text,
      headers: parsed.headers,
      records: parsed.records,
      rowCount: parsed.records.length,
      source: metadata.source || "manual-paste",
      restoredFrom: metadata.restoredFrom || null,
      label: String(metadata.label || "").trim().slice(0, 120),
    };

    const changes = await analyzePtaChanges(latest, snapshot);
    snapshot.changeCount = changes.length;
    snapshot.highChangeCount = changes.filter((change) => change.severity === "high").length;
    await put(STORE_SNAPSHOTS, snapshot);
    if (changes.length) await putMany(STORE_CHANGES, changes);
    dispatchDatabaseEvent("pta-snapshot", snapshot.id, { rowCount: snapshot.rowCount, changeCount: changes.length });
    return { snapshot, changes, duplicate: false };
  }

  async function analyzePtaChanges(previous, current) {
    if (!previous?.records?.length) return [];
    if (typeof Worker !== "function") return analyzeChangesFallback(previous, current);

    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker("database/pta-change-worker.js");
      const finish = (value) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        resolve(Array.isArray(value) ? value : []);
      };
      const timer = window.setTimeout(() => finish(analyzeChangesFallback(previous, current)), 4000);
      worker.onmessage = (event) => {
        window.clearTimeout(timer);
        const base = Array.isArray(event.data?.changes) ? event.data.changes : [];
        finish(base.map((change, index) => ({
          ...change,
          id: `${current.id}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          snapshotId: current.id,
          previousSnapshotId: previous.id,
          detectedAt: current.savedAt,
          reviewedAt: null,
        })));
      };
      worker.onerror = () => {
        window.clearTimeout(timer);
        finish(analyzeChangesFallback(previous, current));
      };
      worker.postMessage({ previous, current });
    });
  }

  function analyzeChangesFallback(previous, current) {
    const oldByTruck = new Map((previous.records || []).map((record) => [record.truckKey, record]));
    const changes = [];
    (current.records || []).forEach((record) => {
      const old = oldByTruck.get(record.truckKey);
      if (!old) return;
      const oldTime = Date.parse(old.ptaIso || "");
      const newTime = Date.parse(record.ptaIso || "");
      if (Number.isFinite(oldTime) && Number.isFinite(newTime)) {
        const hours = (newTime - oldTime) / 3600000;
        if (hours <= -2 || hours >= 12) {
          changes.push({
            truck: record.truck,
            severity: Math.abs(hours) >= 24 ? "high" : "medium",
            type: "pta-shift",
            summary: `PTA moved ${hours < 0 ? "earlier" : "later"} by ${Math.abs(hours).toFixed(1)} hours.`,
            previousValue: old.ptaDisplay,
            currentValue: record.ptaDisplay,
            driver: record.driver,
          });
        }
      }
      if (old.driver && record.driver && normalize(old.driver) !== normalize(record.driver)) {
        changes.push({ truck: record.truck, severity: "medium", type: "driver-change", summary: `Driver changed from ${old.driver} to ${record.driver}.`, previousValue: old.driver, currentValue: record.driver, driver: record.driver });
      }
      if (hasPlan(old.planStatus) && !hasPlan(record.planStatus)) {
        changes.push({ truck: record.truck, severity: "high", type: "plan-removed", summary: "A previously reported plan is now missing or marked no preplan.", previousValue: old.planStatus, currentValue: record.planStatus, driver: record.driver });
      }
    });
    return changes.map((change, index) => ({
      ...change,
      id: `${current.id}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      snapshotId: current.id,
      previousSnapshotId: previous.id,
      detectedAt: current.savedAt,
      reviewedAt: null,
    }));
  }

  async function listPtaSnapshots({ limit = 100 } = {}) {
    await ready;
    const rows = await getAll(STORE_SNAPSHOTS);
    return rows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, Math.max(1, limit));
  }

  async function searchPtaHistory(query, { limit = 250 } = {}) {
    const needle = normalize(query);
    const snapshots = await listPtaSnapshots({ limit: 500 });
    const matches = [];
    for (const snapshot of snapshots) {
      for (const record of snapshot.records || []) {
        const haystack = normalize([
          record.truck,
          record.driver,
          record.division,
          record.status,
          record.planStatus,
          record.destination,
          record.ptaDisplay,
        ].join(" "));
        if (!needle || haystack.includes(needle)) {
          matches.push({ snapshotId: snapshot.id, savedAt: snapshot.savedAt, record });
          if (matches.length >= limit) return matches;
        }
      }
    }
    return matches;
  }

  async function searchPtaNotes(query, { limit = 150 } = {}) {
    await ready;
    const needle = normalize(query);
    let groups = {};
    try {
      groups = JSON.parse(cache.get("vixenPtaActionNotesV1") || "{}");
    } catch (_) {
      groups = {};
    }
    const matches = [];
    Object.entries(groups && typeof groups === "object" ? groups : {}).forEach(([truck, notes]) => {
      (Array.isArray(notes) ? notes : []).forEach((note) => {
        const haystack = normalize([truck, note?.text, note?.driver, note?.status, note?.planStatus, note?.destination, note?.pta, note?.savedAt].join(" "));
        if (!needle || haystack.includes(needle)) matches.push({ truck, ...note });
      });
    });
    return matches
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
      .slice(0, Math.max(1, limit));
  }

  async function listPtaChanges({ query = "", unreviewedOnly = false, limit = 250 } = {}) {
    await ready;
    const needle = normalize(query);
    const rows = await getAll(STORE_CHANGES);
    return rows
      .filter((row) => !unreviewedOnly || !row.reviewedAt)
      .filter((row) => !needle || normalize([row.truck, row.driver, row.type, row.summary, row.previousValue, row.currentValue].join(" ")).includes(needle))
      .sort((a, b) => String(b.detectedAt).localeCompare(String(a.detectedAt)))
      .slice(0, Math.max(1, limit));
  }

  async function getUnreviewedPtaChangeCount() {
    const rows = await listPtaChanges({ unreviewedOnly: true, limit: 10000 });
    return rows.length;
  }

  async function markPtaChangeReviewed(id, reviewed = true) {
    await ready;
    const row = await get(STORE_CHANGES, id);
    if (!row) return false;
    row.reviewedAt = reviewed ? new Date().toISOString() : null;
    await put(STORE_CHANGES, row);
    dispatchDatabaseEvent("pta-change-review", id, row.reviewedAt);
    return true;
  }

  async function markAllPtaChangesReviewed() {
    const rows = await listPtaChanges({ unreviewedOnly: true, limit: 10000 });
    const reviewedAt = new Date().toISOString();
    await putMany(STORE_CHANGES, rows.map((row) => ({ ...row, reviewedAt })));
    dispatchDatabaseEvent("pta-change-review-all", "*", reviewedAt);
    return rows.length;
  }

  async function deletePtaSnapshot(id) {
    await ready;
    const changes = await getAll(STORE_CHANGES);
    await Promise.all([
      remove(STORE_SNAPSHOTS, id),
      ...changes.filter((change) => change.snapshotId === id).map((change) => remove(STORE_CHANGES, change.id)),
    ]);
    dispatchDatabaseEvent("pta-snapshot-delete", id, null);
  }

  async function clearPtaHistory() {
    await ready;
    await Promise.all([clearStore(STORE_SNAPSHOTS), clearStore(STORE_CHANGES)]);
    dispatchDatabaseEvent("pta-history-clear", "*", null);
  }

  function parsePtaText(rawText) {
    const rows = parseDelimitedText(rawText).filter((row) => row.some((cell) => String(cell || "").trim()));
    if (!rows.length) return { headers: [], records: [] };
    const known = ["truck", "driver", "pta", "status", "plans", "plan", "destination", "division", "div"];
    const first = rows[0].map((cell) => normalize(cell));
    const headerScore = first.filter((cell) => known.some((key) => cell.includes(normalize(key)))).length;
    const headers = headerScore >= 2 ? rows.shift().map((cell) => String(cell || "").trim()) : ["Truck #", "Div #", "Driver", "PTA", "Status", "Plans", "Plan", "Team", "Destination", "OM", "Count"];
    const index = {
      truck: findHeader(headers, ["truck #", "truck", "unit", "tractor"], 0),
      division: findHeader(headers, ["div #", "division", "div"], 1),
      driver: findHeader(headers, ["driver", "driver name"], 2),
      pta: findHeader(headers, ["pta", "projected time available"], 3),
      status: findHeader(headers, ["status"], 4),
      plans: findHeader(headers, ["plans", "preplan", "plan status"], 5),
      plan: findHeader(headers, ["plan", "plan type", "flag"], 6),
      team: findHeader(headers, ["team", "type", "driver type"], 7),
      destination: findHeader(headers, ["destination", "area"], 8),
      om: findHeader(headers, ["om", "miles"], 9),
      count: findHeader(headers, ["count"], 10),
    };

    const records = rows.map((row, rowIndex) => {
      const read = (column) => column >= 0 ? String(row[column] ?? "").trim() : "";
      const truck = read(index.truck);
      const driver = read(index.driver);
      const ptaRaw = read(index.pta);
      if (!truck && !driver && !ptaRaw) return null;
      const date = parseDate(ptaRaw);
      const plans = read(index.plans);
      const plan = read(index.plan);
      return {
        rowNumber: rowIndex + 2,
        truck,
        truckKey: normalize(truck) || `ROW${rowIndex + 2}`,
        division: read(index.division),
        driver,
        ptaRaw,
        ptaIso: date ? date.toISOString() : "",
        ptaDisplay: date ? date.toLocaleString() : ptaRaw || "Missing PTA",
        status: read(index.status),
        planStatus: [plans, plan].filter(Boolean).join(" · "),
        team: read(index.team),
        destination: read(index.destination),
        om: read(index.om),
        count: read(index.count),
      };
    }).filter(Boolean);
    return { headers, records };
  }

  function parseDelimitedText(rawText) {
    const source = String(rawText || "").replace(/\r\n?/g, "\n");
    const firstLine = source.split("\n").find((line) => line.trim()) || "";
    const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : firstLine.includes("|") ? "|" : "\t";
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(cell); cell = ""; }
      else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }

  function findHeader(headers, aliases, fallback) {
    const normalizedHeaders = headers.map(normalize);
    const found = normalizedHeaders.findIndex((header) => aliases.some((alias) => header === normalize(alias) || header.includes(normalize(alias))));
    return found >= 0 ? found : fallback;
  }

  function parseDate(value) {
    if (!value) return null;
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;
    const excel = Number(value);
    if (Number.isFinite(excel) && excel > 20000 && excel < 100000) {
      const date = new Date(Math.round((excel - 25569) * 86400000));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  function normalize(value) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function hasPlan(value) {
    const normalized = normalize(value);
    return Boolean(normalized) && !/(NO PREPLAN|NO PLAN|UNKNOWN|NONE|MISSING)/.test(normalized);
  }

  async function sha256(value) {
    if (window.crypto?.subtle) {
      const bytes = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv-${(hash >>> 0).toString(16)}`;
  }

  function transaction(storeName, mode = "readonly") {
    if (!db) throw new Error("Dashboard database is not ready.");
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function get(storeName, key) {
    return requestPromise(transaction(storeName).get(key));
  }

  function getAll(storeName) {
    return requestPromise(transaction(storeName).getAll());
  }

  function put(storeName, value) {
    return requestPromise(transaction(storeName, "readwrite").put(value));
  }

  function putMany(storeName, values) {
    if (!values.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      values.forEach((value) => store.put(value));
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error || new Error(`Could not write ${storeName}.`));
      tx.onabort = () => reject(tx.error || new Error(`Writing ${storeName} was aborted.`));
    });
  }

  function remove(storeName, key) {
    return requestPromise(transaction(storeName, "readwrite").delete(key));
  }

  function clearStore(storeName) {
    return requestPromise(transaction(storeName, "readwrite").clear());
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database request failed."));
    });
  }
})();
