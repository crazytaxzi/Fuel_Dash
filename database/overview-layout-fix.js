(() => {
  "use strict";

  const STYLE_ID = "overviewLayoutFixStyles";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .primary-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  `;
  document.head.append(style);
})();
