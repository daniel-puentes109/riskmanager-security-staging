async function main() {
  let blocked = false;
  try {
    await fetch('https://riskops-75637.firebaseio.com/qa-negative-probe.json');
  } catch (error) {
    blocked = error && error.code === 'QA_NETWORK_GUARD_BLOCKED';
  }
  if (!blocked) throw new Error('NEGATIVE_PROBE_NOT_BLOCKED');
  process.stdout.write('NEGATIVE_PRODUCTION_PROBE_BLOCKED = VERIFIED_EXECUTED\n');
  process.stdout.write('PRODUCTION_NETWORK_REQUESTS = 0\n');
}

main().catch(() => {
  process.stderr.write('NETWORK_GUARD_VERIFICATION_FAILED\n');
  process.exitCode = 1;
});
