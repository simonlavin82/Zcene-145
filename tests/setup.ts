import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
  })) as any;
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  const MockResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver = MockResizeObserver as any;
  global.ResizeObserver = MockResizeObserver as any;
}

if (typeof window !== 'undefined' && typeof SVGElement !== 'undefined') {
  Object.defineProperty(SVGElement.prototype, 'width', {
    configurable: true,
    get() { return { baseVal: { value: 800 } }; }
  });
  Object.defineProperty(SVGElement.prototype, 'height', {
    configurable: true,
    get() { return { baseVal: { value: 600 } }; }
  });
}


