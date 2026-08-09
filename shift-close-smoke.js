const assert = require('assert');
const { readFileSync } = require('fs');

const appSource = readFileSync('app.js', 'utf8');
const helperStart = appSource.indexOf('async function persistShiftClosureCore(');
const handlerStart = appSource.indexOf('async function handleEndShift()', helperStart);
const handlerEnd = appSource.indexOf('// Inicializar inmediatamente', handlerStart);

assert(helperStart >= 0, 'persistShiftClosureCore is missing');
assert(handlerStart > helperStart, 'async handleEndShift is missing');
assert(handlerEnd > handlerStart, 'handleEndShift end marker is missing');

const helperSource = appSource.slice(helperStart, handlerStart);
const handlerSource = appSource.slice(handlerStart, handlerEnd);

let shouldFail = false;
const rootUpdates = [];
const databaseStub = {
  ref(path) {
    if (path === 'shift_reports') {
      return { push: () => ({ key: 'generated-report' }) };
    }
    if (path === undefined) {
      return {
        async update(updates) {
          if (shouldFail) throw new Error('PERMISSION_DENIED');
          rootUpdates.push(updates);
        }
      };
    }
    throw new Error(`Unexpected database path: ${path}`);
  }
};

const timestampSentinel = { '.sv': 'timestamp' };
const firebaseStub = {
  database: {
    ServerValue: {
      TIMESTAMP: timestampSentinel
    }
  }
};

const loadHelper = new Function(
  'database',
  'firebase',
  `${helperSource}\nreturn persistShiftClosureCore;`
);
const persistShiftClosureCore = loadHelper(databaseStub, firebaseStub);

(async () => {
  const report = { uid: 'gestor_789', gestor: 'Test Gestor' };
  const reportKey = await persistShiftClosureCore('gestor_789', 'login_123', report);

  assert.strictEqual(reportKey, 'generated-report');
  assert.strictEqual(rootUpdates.length, 1, 'Core closure must use one atomic root update');
  assert.deepStrictEqual(rootUpdates[0], {
    'shift_reports/generated-report': report,
    'active_sessions/gestor_789': null,
    'login_logs/login_123/logoutTime': timestampSentinel
  });

  shouldFail = true;
  await assert.rejects(
    () => persistShiftClosureCore('gestor_789', 'login_123', report),
    /PERMISSION_DENIED/
  );

  const coreIndex = handlerSource.indexOf('await persistShiftClosureCore(');
  const localCleanupIndex = handlerSource.indexOf("localStorage.removeItem('riskOps_currentUser')");
  const signOutIndex = handlerSource.indexOf('await firebase.auth().signOut()');
  const emailIndex = handlerSource.indexOf("fetch('https://formsubmit.co/ajax/");

  assert(coreIndex >= 0, 'Core persistence is not awaited');
  assert(coreIndex < localCleanupIndex, 'Local session is cleared before core persistence');
  assert(localCleanupIndex < signOutIndex, 'Authentication is closed before local cleanup');
  assert(signOutIndex < emailIndex, 'Email is attempted before the core logout finishes');
  assert(
    handlerSource.includes('Turno finalizado correctamente. No fue posible enviar la notificación por correo.'),
    'Non-blocking email warning is missing'
  );
  assert(handlerSource.includes('CORE_SHIFT_CLOSE_FAILED'), 'Core failure classification is missing');
  assert(handlerSource.includes('EMAIL_NOTIFICATION_FAILED'), 'Email failure classification is missing');

  console.log('SHIFT_CLOSE_SMOKE=PASS');
  console.log('CORE_UPDATE_MODE=ATOMIC');
  console.log('EMAIL_IS_CORE_TRANSACTION=NO');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
