(() => {
  "use strict";

  const PARTS = [
    "part-00.b64",
    "part-01.b64",
    "part-02.b64",
    "part-03.b64",
    "part-04.b64",
  ];
  const EXPECTED_SHA256 = "187d00de65db2a8c2d01353d9cde4ea2e4b2be534997d8dc97adc426511ea0ff";

  window.VixenRichTransitionReady = loadVerifiedComposer();

  async function loadVerifiedComposer() {
    const encodedParts = [];
    for (const filename of PARTS) {
      encodedParts.push(await fetchPart(filename));
    }

    const encoded = encodedParts.join("").replace(/\s+/g, "");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const source = new TextDecoder("utf-8").decode(bytes);

    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      if (actual !== EXPECTED_SHA256) throw new Error("The rich transition composer failed its integrity check.");
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
