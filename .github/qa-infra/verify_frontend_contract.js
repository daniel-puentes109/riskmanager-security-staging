const crypto = require('crypto');
const fs = require('fs');

const inputs = [
  {
    label: 'F0',
    env: 'F0_APP_PATH',
    sha: '7b94efd597551c7e6eae7409cc0795b543cdcb3716247732fa9f5096ff98813a',
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
    sha: '2ebee328f9e22120d2ffe9092afe43e48d76d364df943e25b5ec7ad67d807340',
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
process.stdout.write(`${JSON.stringify(output)}\n`);
if (output.status !== 'VERIFIED_EXECUTED') process.exitCode = 1;
