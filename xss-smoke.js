const assert = require('assert');
const { readFileSync } = require('fs');

const appSource = readFileSync('app.js', 'utf8');

function extractBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert(start >= 0, `Missing marker: ${startMarker}`);
  assert(end > start, `Missing marker after ${startMarker}: ${endMarker}`);
  return appSource.slice(start, end);
}

const escapeSource = extractBetween('function escapeHTML(', 'window.escapeHTML');
const renderSource = extractBetween('function renderIncidentsTable(', '/**');

const tbody = {
  innerHTML: ''
};

const documentStub = {
  getElementById(id) {
    return id === 'incidentsTableBody' ? tbody : null;
  }
};

const loadRenderer = new Function(
  'document',
  `${escapeSource}\n${renderSource}\nreturn { escapeHTML, renderIncidentsTable };`
);

const { escapeHTML, renderIncidentsTable } = loadRenderer(documentStub);
const payload = '<img src=x onerror=alert(1)>';

assert.strictEqual(
  escapeHTML(payload),
  '&lt;img src=x onerror=alert(1)&gt;',
  'escapeHTML did not neutralize the benign payload'
);

renderIncidentsTable([{
  timestamp: null,
  type: payload,
  title: payload,
  detail: payload,
  assignedTo: payload,
  reportedBy: payload,
  status: 'Abierto'
}]);

assert(!/<img(?:\s|>)/i.test(tbody.innerHTML), 'Executable <img> markup was generated');
assert(
  tbody.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'),
  'The neutralized payload was not rendered as text'
);

console.log('XSS_LOGS_SMOKE=PASS');
console.log(`PAYLOAD_RENDERED=${escapeHTML(payload)}`);
