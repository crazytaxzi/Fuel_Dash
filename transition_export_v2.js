(() => {
  "use strict";

  window.VixenRichTransitionReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = false;
    script.src = "database/rich-transition-editor.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("The rich transition composer could not start."));
    document.head.appendChild(script);
  });
})();
