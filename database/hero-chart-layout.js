(() => {
  "use strict";

  const STYLE_ID = "vixenHeroChartLayout";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .hero-content {
      grid-auto-rows: minmax(320px, auto);
    }

    .hero-chart-wrap {
      min-height: 320px;
      padding: 0 126px 0 2px;
    }

    .hero-chart-wrap canvas {
      position: absolute;
      left: 2px;
      top: 30px;
      min-width: 0;
      min-height: 0;
      width: calc(100% - 128px) !important;
      height: calc(100% - 40px) !important;
    }
  `;
  document.head.appendChild(style);
})();
