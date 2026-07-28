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
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 320px;
      padding: 2px 126px 10px 2px;
    }

    .hero-chart-wrap .chart-heading {
      position: static;
      align-self: end;
      padding: 0 0 8px 6px;
    }

    .hero-chart-wrap canvas {
      min-width: 0;
      min-height: 0;
      width: 100% !important;
      height: 100% !important;
    }

    @media (max-width: 850px) {
      .hero-content {
        grid-auto-rows: auto;
      }

      .hero-chart-wrap {
        min-height: 320px;
        padding: 2px 0 10px 2px;
      }

      .hero-chart-wrap .chart-callout {
        grid-row: 3;
      }
    }
  `;
  document.head.appendChild(style);
})();
