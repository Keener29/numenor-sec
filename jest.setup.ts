// Jest setup file for React Testing Library
import '@testing-library/jest-dom/jest-globals';
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

// Polyfill setImmediate for Express/Node.js compatibility in Jest
if (globalThis.setImmediate === undefined) {
  (globalThis as any).setImmediate = (callback: (...args: any[]) => void, ...args: any[]) => {
    return setTimeout(() => callback(...args), 0);
  };
  (globalThis as any).clearImmediate = (id: ReturnType<typeof setTimeout>) => {
    clearTimeout(id);
  };
}

// Polyfill TextEncoder/TextDecoder for jsdom
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;

// Mock window.matchMedia
Object.defineProperty(globalThis.window, 'matchMedia', {
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
globalThis.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
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

// Mock HTMLDialogElement methods (showModal, close) for JSDOM
// JSDOM doesn't implement these methods natively
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  writable: true,
  value: jest.fn(function(this: HTMLDialogElement) {
    this.setAttribute('open', '');
    // Set aria-modal attribute to match browser behavior
    this.setAttribute('aria-modal', 'true');
    
    // Add keyboard event listener to fire cancel event on Escape key
    // This mimics browser behavior where Escape triggers cancel event
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.hasAttribute('open')) {
        const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
        this.dispatchEvent(cancelEvent);
      }
    };
    
    // Store the handler so we can remove it later
    (this as any)._dialogKeyHandler = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
  }),
});

Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  writable: true,
  value: jest.fn(function(this: HTMLDialogElement) {
    this.removeAttribute('open');
    // Remove aria-modal when closed
    this.removeAttribute('aria-modal');
    
    // Remove keyboard event listener
    if ((this as any)._dialogKeyHandler) {
      document.removeEventListener('keydown', (this as any)._dialogKeyHandler);
      delete (this as any)._dialogKeyHandler;
    }
  }),
});

// Mock fetch globally to prevent real API calls in tests
// Individual tests can override this mock as needed
const createDefaultFetchMock = () => {
  const defaultMock = jest.fn((url: string | URL | Request) => {
    // Default: return a successful response with a domain that's 365 days old
    // This prevents real API calls while allowing tests to override
    let urlString: string;
    if (typeof url === 'string') {
      urlString = url;
    } else if (url instanceof URL) {
      urlString = url.toString();
    } else {
      urlString = url.url;
    }
    const domainRegex = /[?&](?:domain|domainName)=([^&]+)/;
    const domainMatch = domainRegex.exec(urlString);
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
if (globalThis.fetch === undefined || !jest.isMockFunction(globalThis.fetch)) {
  globalThis.fetch = createDefaultFetchMock();
}

// Cleanup: Stop all background schedulers and close database connections after tests
afterAll(async () => {
  try {
    // Stop schedulers if they were started
    const { watchRenewalScheduler } = await import('./app/api/services/watchRenewalScheduler.js');
    const { microsoftSubscriptionRenewalScheduler } = await import('./app/api/services/microsoftSubscriptionRenewalScheduler.js');
    const { emailMonitor } = await import('./app/api/services/emailMonitor/index.js');
    
    watchRenewalScheduler.stop();
    microsoftSubscriptionRenewalScheduler.stop();
    emailMonitor.stopMonitoring();
    
    // Close database pool if it exists
    const { closePool } = await import('./app/db/connection.js');
    await closePool();
  } catch (error) {
    // Ignore errors during cleanup - tests may not have initialized these services
  }
}, 10000); // 10 second timeout for cleanup

