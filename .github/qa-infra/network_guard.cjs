const dns = require('dns');
const http = require('http');
const https = require('https');

const originalFetch = globalThis.fetch;
const originalLookup = dns.lookup;
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const blocked = [];

function hostnameOf(input) {
  if (typeof input === 'string' || input instanceof URL) return new URL(input).hostname;
  if (input && typeof input === 'object') return input.hostname || input.host || '127.0.0.1';
  return '127.0.0.1';
}

function assertAllowed(hostname) {
  const normalized = String(hostname).split(':')[0].toLowerCase();
  const allowed = normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
  if (!allowed) {
    blocked.push(normalized);
    const error = new Error('QA_NETWORK_GUARD_BLOCKED');
    error.code = 'QA_NETWORK_GUARD_BLOCKED';
    throw error;
  }
}

globalThis.fetch = async function guardedFetch(input, init) {
  assertAllowed(hostnameOf(input));
  return originalFetch(input, init);
};

dns.lookup = function guardedLookup(hostname, ...args) {
  assertAllowed(hostname);
  return originalLookup.call(dns, hostname, ...args);
};

function guardRequest(original) {
  return function guardedRequest(...args) {
    const first = args[0];
    assertAllowed(hostnameOf(first));
    return original.apply(this, args);
  };
}

http.request = guardRequest(originalHttpRequest);
https.request = guardRequest(originalHttpsRequest);

process.on('exit', () => {
  if (blocked.length) process.stderr.write(`QA_NETWORK_GUARD_BLOCKED_COUNT=${blocked.length}\n`);
});
