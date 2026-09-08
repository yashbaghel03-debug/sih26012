(() => {
  'use strict';
  // Pune ALU grid: replace ONLY the stroke hue with black while preserving
  // the original alpha, line widths, geometry, and basemap visibility.
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
  const blacken = value => {
    const match = String(value).match(/^rgba?\(\s*[^,]+\s*,\s*[^,]+\s*,\s*[^,)]+(?:\s*,\s*([0-9.]+))?\s*\)$/i);
    if (!match) return '#000000';
    return `rgba(0,0,0,${match[1] ?? '1'})`;
  };
  CanvasRenderingContext2D.prototype.stroke = function(...args) {
    const previous = this.strokeStyle;
    this.strokeStyle = blacken(previous);
    try { return originalStroke.apply(this, args); }
    finally { this.strokeStyle = previous; }
  };
  CanvasRenderingContext2D.prototype.strokeRect = function(...args) {
    const previous = this.strokeStyle;
    this.strokeStyle = blacken(previous);
    try { return originalStrokeRect.apply(this, args); }
    finally { this.strokeStyle = previous; }
  };
})();
