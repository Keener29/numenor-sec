// Jest setup file for React Testing Library
import '@testing-library/jest-dom/jest-globals';
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder/TextDecoder for jsdom
global.TextEncoder = TextEncoder as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];

  constructor() { }
  disconnect() {
    // noop for testing
  }
  observe() {
    // noop for testing
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {
    // noop for testing
  }
} as typeof IntersectionObserver;

// Mock fetch globally to prevent real API calls in tests
// Individual tests can override this mock as needed
const createDefaultFetchMock = () => {
  const defaultMock = jest.fn((url: string | URL | Request) => {
    // Default: return a successful response with a domain that's 365 days old
    // This prevents real API calls while allowing tests to override
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const domainMatch = urlString.match(/[?&](?:domain|domainName)=([^&]+)/);
    const domain = domainMatch ? decodeURIComponent(domainMatch[1]) : 'example.com';

    const defaultResponse = {
      ok: true,
      json: async () => ({
        domain: domain,
        created_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    };
    return Promise.resolve(defaultResponse as Response);
  });

  return defaultMock;
};

// Set up default fetch mock if not already set
if (typeof global.fetch === 'undefined' || !jest.isMockFunction(global.fetch)) {
  global.fetch = createDefaultFetchMock();
}

