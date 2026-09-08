(() => {
  'use strict';
  // Pune ALU grid: make ONLY this grid darker/70% thicker.
  // The existing Pune region, geometry, basemap and relative alpha are unchanged.
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
  const blacken = value => {
    const match = String(value).match(/^rgba?\(\s*[^,]+\s*,\s*[^,]+\s*,\s*[^,)]+(?:\s*,\s*([0-9.]+))?\s*\)$/i);
    if (!match) return '#000000';
    return `rgba(0,0,0,${match[1] ?? '1'})`;
  };
  const isPuneGrid = function(){
    return !!this?.canvas?.classList?.contains('pune-coverage-canvas');
  };
  CanvasRenderingContext2D.prototype.stroke = function(...args) {
    const previousColor = this.strokeStyle;
    const previousWidth = this.lineWidth;
    if (isPuneGrid.call(this)) {
      this.strokeStyle = blacken(previousColor);
      this.lineWidth = previousWidth * 1.7;
    }
    try { return originalStroke.apply(this, args); }
    finally {
      this.strokeStyle = previousColor;
      this.lineWidth = previousWidth;
    }
  };
  CanvasRenderingContext2D.prototype.strokeRect = function(...args) {
    const previousColor = this.strokeStyle;
    const previousWidth = this.lineWidth;
    if (isPuneGrid.call(this)) {
      this.strokeStyle = blacken(previousColor);
      this.lineWidth = previousWidth * 1.7;
    }
    try { return originalStrokeRect.apply(this, args); }
    finally {
      this.strokeStyle = previousColor;
      this.lineWidth = previousWidth;
    }
  };
})();
