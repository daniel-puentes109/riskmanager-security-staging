const crypto = require('crypto');
const fs = require('fs');

const inputs = [
  {
    label: 'F0',
    env: 'F0_APP_PATH',
    sha: 'bc826c1d343c6c2c57a9b1570d8b964b4fe5ffadcb270b2f3aa80cd6c1eea62c',
    mustContain: [],
    mustNotContain: [
      "uid: userUid",
      "uid: currentUser.uid || firebase.auth().currentUser.uid",
      "permissionsRef = permissionsRef.orderByChild('uid').equalTo(authUid)",
    ],
  },
  {
    label: 'F1',
    env: 'F1_APP_PATH',
    sha: '6aa3c44deaa45dede85fdf27e877219b60d9c6e2b0f6faac1638f1277c630053',
    mustContain: [
      "uid: userUid",
      "uid: currentUser.uid || firebase.auth().currentUser.uid",
      "permissionsRef = permissionsRef.orderByChild('uid').equalTo(authUid)",
    ],
    mustNotContain: [],
  },
];

const output = { mode: 'STATIC_CONTRACT', browserSmoke: 'NOT_TESTED', inputs: {} };

for (const input of inputs) {
  const filePath = process.env[input.env];
  if (!filePath) throw new Error(`${input.env}_MISSING`);
  const content = fs.readFileSync(filePath, 'utf8');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const checks = [
    ...input.mustContain.map((needle) => ({ kind: 'contains', passed: content.includes(needle) })),
    ...input.mustNotContain.map((needle) => ({ kind: 'absent', passed: !content.includes(needle) })),
  ];
  output.inputs[input.label] = {
    sha256: sha,
    shaVerified: sha === input.sha,
    checksPassed: checks.every((check) => check.passed),
    checkCount: checks.length,
  };
}

output.status = Object.values(output.inputs).every((input) => input.shaVerified && input.checksPassed)
  ? 'VERIFIED_EXECUTED'
  : 'FAIL_VERIFIED_EXECUTED';
const reportPath = process.env.FRONTEND_CONTRACT_REPORT || 'frontend-contract-report.json';
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
if (output.status !== 'VERIFIED_EXECUTED') process.exitCode = 1;
