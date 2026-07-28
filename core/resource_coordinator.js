(() => {
  "use strict";

  if (window.VixenResourceCoordinator?.installed) return;

  const nativeFetch = window.fetch.bind(window);
  const nativeFileArrayBuffer = window.File?.prototype?.arrayBuffer;
  const manifestByPath = new Map();
  const responseCache = new Map();
  const fileBuffers = new WeakMap();
  const bufferWorkbooks = new WeakMap();
  const workbookCache = new Map();
  const MAX_WORKBOOKS = 24;
  const stats = {
    manifestRequests: 0,
    reportRequests: 0,
    reportCacheHits: 0,
    bufferCacheHits: 0,
    workbookReads: 0,
    workbookCacheHits: 0,
    bytesDownloaded: 0,
  };

  const coordinator = {
    installed: true,
    stats,
    readWorkbook,
    rememberWorkbook,
    clear,
    getManifestSignature,
  };

  window.VixenResourceCoordinator = coordinator;
  installFetchCache();
  installFileBufferCache();
  installWorkbookCache();

  function installFetchCache() {
    window.fetch = async (input, init = {}) => {
      const requestUrl = resolveUrl(input);
      if (!requestUrl) return nativeFetch(input, init);

      const path = requestUrl.pathname.replace(/^\//, "");
      if (path === "data-manifest.json") {
        stats.manifestRequests += 1;
        const response = await nativeFetch(input, { ...init, cache: "no-store" });
        if (response.ok) await updateManifest(response.clone());
        return response;
      }

      if (!path.startsWith("data-file/")) return nativeFetch(input, init);

      stats.reportRequests += 1;
      const relativePath = `${path}${requestUrl.search}`;
      const manifestKey = path.split("?")[0];
      const version = manifestByPath.get(manifestKey) || "unknown";
      const cacheKey = `${relativePath}|${version}`;

      if (!responseCache.has(cacheKey)) {
        responseCache.set(cacheKey, nativeFetch(input, { ...init, cache: "no-store" }).then(async (response) => {
          const blob = await response.blob();
          if (response.ok) stats.bytesDownloaded += blob.size || 0;
          return {
            blob,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers.entries()],
          };
        }).catch((error) => {
          responseCache.delete(cacheKey);
          throw error;
        }));
      } else {
        stats.reportCacheHits += 1;
      }

      const cached = await responseCache.get(cacheKey);
      return new Response(cached.blob, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
    };
  }

  async function updateManifest(response) {
    const manifest = await response.json();
    const next = new Map();
    for (const item of Array.isArray(manifest) ? manifest : []) {
      if (!item?.path) continue;
      const path = String(item.path).replace(/^\//, "");
      next.set(path, `${item.size || 0}|${item.lastModified || ""}`);
    }

    let changed = next.size !== manifestByPath.size;
    if (!changed) {
      for (const [path, signature] of next) {
        if (manifestByPath.get(path) !== signature) {
          changed = true;
          break;
        }
      }
    }

    manifestByPath.clear();
    next.forEach((signature, path) => manifestByPath.set(path, signature));
    if (changed) {
      for (const key of [...responseCache.keys()]) {
        const path = key.split("|")[0].split("?")[0];
        const expected = manifestByPath.get(path) || "missing";
        if (!key.endsWith(`|${expected}`)) responseCache.delete(key);
      }
      document.dispatchEvent(new CustomEvent("vixen:manifest-changed", { detail: { signature: getManifestSignature() } }));
    }
  }

  function installFileBufferCache() {
    if (!nativeFileArrayBuffer) return;
    window.File.prototype.arrayBuffer = function cachedArrayBuffer() {
      if (fileBuffers.has(this)) {
        stats.bufferCacheHits += 1;
        return fileBuffers.get(this);
      }
      const promise = nativeFileArrayBuffer.call(this).then((buffer) => {
        if (this.vixenWorkbook) bufferWorkbooks.set(buffer, this.vixenWorkbook);
        return buffer;
      }).catch((error) => {
        fileBuffers.delete(this);
        throw error;
      });
      fileBuffers.set(this, promise);
      return promise;
    };
  }

  function installWorkbookCache() {
    const api = window.XLSX;
    if (!api?.read || api.read.__vixenCoordinated) return;
    const nativeRead = api.read.bind(api);
    const coordinatedRead = (input, options) => {
      stats.workbookReads += 1;
      if (input && typeof input === "object" && bufferWorkbooks.has(input)) {
        stats.workbookCacheHits += 1;
        return bufferWorkbooks.get(input);
      }

      const signature = fingerprint(input);
      if (signature && workbookCache.has(signature)) {
        stats.workbookCacheHits += 1;
        const workbook = workbookCache.get(signature);
        touch(workbookCache, signature, workbook);
        if (input && typeof input === "object") bufferWorkbooks.set(input, workbook);
        return workbook;
      }

      const workbook = nativeRead(input, options);
      if (input && typeof input === "object") bufferWorkbooks.set(input, workbook);
      if (signature) {
        touch(workbookCache, signature, workbook);
        trim(workbookCache, MAX_WORKBOOKS);
      }
      return workbook;
    };
    coordinatedRead.__vixenCoordinated = true;
    coordinatedRead.__nativeRead = nativeRead;
    api.read = coordinatedRead;
  }

  async function readWorkbook(file, options = {}) {
    if (!file) throw new Error("A workbook file is required.");
    if (file.vixenWorkbook) return file.vixenWorkbook;
    const workbook = window.XLSX.read(await file.arrayBuffer(), {
      type: "array",
      raw: true,
      cellDates: false,
      dense: false,
      ...options,
    });
    file.vixenWorkbook = workbook;
    return workbook;
  }

  function rememberWorkbook(file, workbook) {
    if (!file || !workbook) return workbook;
    file.vixenWorkbook = workbook;
    const pending = fileBuffers.get(file);
    if (pending) pending.then((buffer) => bufferWorkbooks.set(buffer, workbook)).catch(() => {});
    return workbook;
  }

  function clear() {
    responseCache.clear();
    workbookCache.clear();
  }

  function getManifestSignature() {
    return [...manifestByPath.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, signature]) => `${path}|${signature}`).join("||");
  }

  function resolveUrl(input) {
    try {
      const value = typeof input === "string" || input instanceof URL ? input : input?.url;
      return value ? new URL(value, location.href) : null;
    } catch (_) {
      return null;
    }
  }

  function fingerprint(input) {
    let bytes;
    if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    else return "";

    let hash = 2166136261;
    const sampleCount = Math.min(96, bytes.length);
    const step = sampleCount > 1 ? Math.max(1, Math.floor((bytes.length - 1) / (sampleCount - 1))) : 1;
    for (let index = 0, offset = 0; index < sampleCount; index += 1, offset = Math.min(bytes.length - 1, offset + step)) {
      hash ^= bytes[offset] || 0;
      hash = Math.imul(hash, 16777619);
    }
    return `${bytes.length}:${hash >>> 0}`;
  }

  function touch(map, key, value) {
    map.delete(key);
    map.set(key, value);
  }

  function trim(map, limit) {
    while (map.size > limit) map.delete(map.keys().next().value);
  }
})();
