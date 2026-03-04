/**
 * Jest Setup Configuration
 *
 * Provides global test utilities and matchers for all unit tests.
 */

import '@testing-library/jest-dom';

// ─── Polyfills for jsdom + Next.js Server Actions ───────────────────────────
// jsdom lacks certain Node.js and Web APIs that Next.js server modules expect.
// Node.js 18+ provides these as globals; we ensure they're available in test env.

// TextEncoder/TextDecoder (needed by Next.js crypto operations)
if (!global.TextEncoder) {
  const { TextEncoder } = require('util');
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  const { TextDecoder } = require('util');
  global.TextDecoder = TextDecoder;
}

// AbortController (needed by Next.js fetch operations in server actions)
// Available in Node.js 15+, used by fetch and server operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).AbortController) {
  try {
    // Try to use Node.js built-in AbortController (Node 15+)
    const { AbortController: AC } = require('abort-controller');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).AbortController = AC;
  } catch {
    // Fallback: use a minimal implementation for older Node versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).AbortController = class AbortController {
      signal = { aborted: false };
      abort() {
        this.signal.aborted = true;
      }
    } as any;
  }
}

// Request, Response, Headers (needed by next/cache and next/server modules)
// Node.js 18+ provides undici globals; we import them explicitly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).Request) {
  try {
    const { Request, Response, Headers } = require('undici');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Request = Request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Response = Response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Headers = Headers;
  } catch {
    // If undici not available, create minimal stubs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Request = class Request {
      #url;
      #method;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(url: any, init?: any) {
        this.#url = url;
        this.#method = init?.method || 'GET';
      }

      get url() {
        return this.#url;
      }

      get method() {
        return this.#method;
      }
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Response = class Response {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(body: any, init?: any) {
        // @ts-ignore
        this.body = body;
        // @ts-ignore
        this.status = init?.status || 200;
      }
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).Headers = class Headers {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(init?: any) {
        // @ts-ignore
        this._headers = init || {};
      }
    } as any;
  }
}

// Crypto API (needed by Next.js encryption/hashing in server actions)
if (!global.crypto) {
  const { webcrypto } = require('crypto');
  global.crypto = webcrypto;
}

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
