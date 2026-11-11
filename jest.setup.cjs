require('@testing-library/jest-dom');
if (typeof import.meta === 'undefined') {
  global.import = { meta: { env: { VITE_USE_MOCKS: 'false', DEV: false } } };
}
