(() => {
  "use strict";

  window.VixenRichTransitionReady = loadScript("database/rich-transition-editor.js", "The rich transition composer could not start.")
    .then(() => loadScript("database/transition-305-extension.js", "The Division 305 transition extension could not start."));

  function loadScript(src, message) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(message));
      document.head.appendChild(script);
    });
  }
})();
