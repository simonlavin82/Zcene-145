import { vi } from 'vitest';

// Global mock for firebase-admin
const mockDoc = {
  set: vi.fn(),
  get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
  update: vi.fn(),
};

const mockCollection = {
  doc: vi.fn(() => mockDoc),
  add: vi.fn(),
};

vi.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: vi.fn(() => mockCollection),
    doc: vi.fn(() => mockDoc),
  }),
  initializeApp: vi.fn(),
}));

export { mockDoc, mockCollection };
