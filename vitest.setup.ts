import '@testing-library/jest-dom/vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

class DOMRectStub {
  x = 0
  y = 0
  width = 0
  height = 0
  top = 0
  right = 0
  bottom = 0
  left = 0
  toJSON() {
    return {}
  }
}

if (typeof globalThis.DOMRect === 'undefined') {
  globalThis.DOMRect = DOMRectStub as unknown as typeof DOMRect
}