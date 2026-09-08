(() => {
  'use strict';
  // Pune ALU grid: change ONLY the stroke color to dark black.
  // Existing line widths, geometry, opacity of the basemap, and map bounds remain unchanged.
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
  CanvasRenderingContext2D.prototype.stroke = function(...args) {
    const previous = this.strokeStyle;
    this.strokeStyle = '#000000';
    try { return originalStroke.apply(this, args); }
    finally { this.strokeStyle = previous; }
  };
  CanvasRenderingContext2D.prototype.strokeRect = function(...args) {
    const previous = this.strokeStyle;
    this.strokeStyle = '#000000';
    try { return originalStrokeRect.apply(this, args); }
    finally { this.strokeStyle = previous; }
  };
})();
