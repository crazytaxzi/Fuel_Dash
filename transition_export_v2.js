(() => {
  "use strict";

  const PARTS = [
    "part-00.b64",
    "part-01.b64",
    "part-02.b64",
    "part-03.b64",
    "part-04.b64",
  ];

  window.VixenRichTransitionReady = loadComposer();

  async function loadComposer() {
    const encodedParts = [];
    for (const filename of PARTS) {
      encodedParts.push(await fetchPart(filename));
    }

    const encoded = encodedParts.join("").replace(/\s+/g, "");
    if (!encoded) throw new Error("The rich transition composer bundle is empty.");

    let binary;
    try {
      binary = atob(encoded);
    } catch (_) {
      throw new Error("The rich transition composer bundle could not be decoded.");
    }

    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_) {
      throw new Error("The rich transition composer contains invalid text data.");
    }

    if (!source.trim()) throw new Error("The rich transition composer decoded to an empty script.");

    // Diagnostic only. The release job validates the decoded script before packaging.
    // A stale embedded checksum must never block the entire dashboard again.
    if (globalThis.crypto?.subtle) {
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
        .then((digest) => {
          window.VixenRichTransitionDigest = [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
        })
        .catch(() => {});
    }

    await executeSource(source);
  }

  async function fetchPart(filename) {
    const locations = [
      `database/rich-transition-patch/${filename}`,
      `.github/rich-transition-patch/${filename}`,
    ];
    for (const location of locations) {
      try {
        const response = await fetch(location, { cache: "no-store" });
        if (response.ok) return response.text();
      } catch (_) {
        // Try the next packaged or source-tree location.
      }
    }
    throw new Error(`Could not load the rich transition composer part ${filename}.`);
  }

  function executeSource(source) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const script = document.createElement("script");
      script.async = false;
      script.src = url;
      script.onload = () => {
        URL.revokeObjectURL(url);
        script.remove();
        resolve();
      };
      script.onerror = () => {
        URL.revokeObjectURL(url);
        script.remove();
        reject(new Error("The rich transition composer could not start."));
      };
      document.head.appendChild(script);
    });
  }
})();
