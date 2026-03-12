/**
 * UUID Mock for Jest
 *
 * Provides deterministic UUIDs for testing instead of random ones.
 * This ensures tests are reproducible and not flaky due to random values.
 */

let counter = 0;

const v4 = jest.fn(() => {
  counter++;
  // Generate a deterministic UUID-like string with incrementing counter
  const num = String(counter).padStart(32, '0');
  return `${num.slice(0, 8)}-${num.slice(8, 12)}-${num.slice(12, 16)}-${num.slice(
    16,
    20
  )}-${num.slice(20, 32)}`;
});

const v5 = jest.fn((namespace, name) => {
  // Simple deterministic v5-like implementation for testing
  const str = `${namespace}${name}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hexHash = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hexHash.slice(0, 8)}-${hexHash.slice(8, 12)}-${hexHash.slice(
    12,
    16
  )}-${hexHash.slice(16, 20)}-${hexHash.slice(20, 32)}`;
});

const NIL = '00000000-0000-0000-0000-000000000000';

const validate = jest.fn((uuid) => {
  return typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
});

const parse = jest.fn((uuid) => {
  if (!validate(uuid)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  const hex = uuid.replace(/-/g, '');
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
});

const stringify = jest.fn((bytes) => {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20, 32)}`;
});

module.exports = {
  v4,
  v5,
  NIL,
  validate,
  parse,
  stringify,
};
