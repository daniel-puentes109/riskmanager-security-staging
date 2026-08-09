const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseHTML } = require('linkedom');

const appPath = path.resolve(__dirname, '..', '..', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const sanitizerStart = appSource.indexOf('const ANNOUNCEMENT_ALLOWED_TAGS');
const sanitizerEnd = appSource.indexOf('// Auth Check');

assert(sanitizerStart >= 0 && sanitizerEnd > sanitizerStart, 'Announcement sanitizer was not found in app.js');

const { window } = parseHTML('<html><body></body></html>');
const context = vm.createContext({
  document: window.document,
  Node: window.Node,
  window
});
vm.runInContext(appSource.slice(sanitizerStart, sanitizerEnd), context);

const sanitize = context.window.sanitizeAnnouncementHTML;
const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'A']);

function inspectSanitized(input) {
  const html = sanitize(input);
  const container = window.document.createElement('div');
  container.innerHTML = html;

  Array.from(container.querySelectorAll('*')).forEach(element => {
    assert(allowedTags.has(element.tagName), `Unexpected tag survived: ${element.tagName}`);
    Array.from(element.attributes).forEach(attribute => {
      assert(
        element.tagName === 'A' && attribute.name === 'href',
        `Unexpected attribute survived: ${element.tagName}.${attribute.name}`
      );
    });

    if (element.tagName === 'A' && element.hasAttribute('href')) {
      assert(!/^\s*(?:javascript|data|vbscript):/i.test(element.getAttribute('href')));
    }
  });

  return { html, container };
}

const legitimate = inspectSanitized(`
  <p data-start="1">Inicio<br><strong onclick="alert(1)">negrita</strong> <em>énfasis</em></p>
  <ul data-teams="editor"><li>Uno</li></ul>
  <ol data-end="2"><li>Dos</li></ol>
  <a href="https://example.com/seguro" target="_blank" style="color:red">Enlace</a>
`);

allowedTags.forEach(tag => {
  assert(legitimate.container.querySelector(tag.toLowerCase()), `Legitimate ${tag} formatting was lost`);
});
assert.strictEqual(legitimate.container.querySelector('a').getAttribute('href'), 'https://example.com/seguro');
assert(!/[\s<](?:data-start|data-end|data-teams|style|on[a-z]+)=/i.test(legitimate.html));

const aliases = inspectSanitized('<div><b>Negrita</b> e <i>itálica</i></div>');
assert.strictEqual(aliases.html, '<p><strong>Negrita</strong> e <em>itálica</em></p>');

const xssPayloads = [
  '<script>alert(1)</script><p>Seguro</p>',
  '<img src=x onerror="alert(1)"><p>Seguro</p>',
  '<iframe srcdoc="<script>alert(1)</script>">iframe</iframe><p>Seguro</p>',
  '<p onclick="alert(1)" style="background:url(javascript:alert(1))" data-start="1">Seguro</p>',
  '<a href="javascript:alert(1)" onclick="alert(2)">Enlace</a>',
  '<a href="java\nscript:alert(1)">Enlace</a>',
  '<a href="data:text/html,<script>alert(1)</script>">Enlace</a>',
  '<svg onload="alert(1)"><a href="javascript:alert(2)">SVG</a></svg>',
  '<object data="javascript:alert(1)">Objeto</object><embed src="data:text/html,x">'
];

xssPayloads.forEach(payload => {
  const { html } = inspectSanitized(payload);
  assert(!/<\/?(?:script|iframe|style|object|embed|svg|img)\b/i.test(html));
  assert(!/[\s<](?:on[a-z]+|style|data-start|data-end|data-teams)=/i.test(html));
  assert(!/(?:javascript|vbscript|data):/i.test(html));
});

assert.strictEqual((appSource.match(/sanitizeAnnouncementHTML\(c\.content\)/g) || []).length, 3);
assert(appSource.includes("sanitizeAnnouncementHTML(document.getElementById('comunicadoContent').innerHTML)"));

console.log('ANNOUNCEMENT_SANITIZER_SMOKE=PASS');
console.log(`XSS_PAYLOADS=${xssPayloads.length}/${xssPayloads.length}`);
console.log(`FORMAT_TAGS=${allowedTags.size}/${allowedTags.size}`);
console.log('RAW_STORED_HTML_TRUSTED=NO');
