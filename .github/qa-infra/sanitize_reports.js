const fs = require('fs');

const forbidden = [
  /@[a-z0-9.-]+/i,
  /AIza[0-9A-Za-z_-]{20,}/,
  /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/,
  /riskops-75637/i,
  /firebaseio\.com/i,
  /firebasedatabase\.app/i,
  /R0_RULES_B64|R1_RULES_B64/,
];

for (const file of ['phase1-qa-report.json', 'phase1-qa-report.txt', 'network-summary.txt', 'frontend-contract-report.json']) {
  if (!fs.existsSync(file)) throw new Error(`MISSING_REPORT_${file}`);
  const content = fs.readFileSync(file, 'utf8');
  if (forbidden.some((pattern) => pattern.test(content))) throw new Error(`SENSITIVE_REPORT_${file}`);
}
