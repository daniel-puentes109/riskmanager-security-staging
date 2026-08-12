const assert = require('node:assert/strict');
const { normalizeIdentity, planUidMigration } = require('./migration_rehearsal');

function fixture() {
  return {
    users: {
      U1: { name: 'Álvaro Uno', email: 'u1@example.invalid' },
      U2: { name: 'Nombre Repetido', email: 'u2@example.invalid' },
      U3: { name: 'Nombre Repetido', email: 'u3@example.invalid' },
    },
    permissions: {
      unique: { gestor: 'alvaro uno' },
      ambiguous: { gestor: 'Nombre Repetido' },
      conflicting: { gestor: 'Nombre Repetido', email: 'u1@example.invalid' },
      unmatched: { gestor: 'Sin Usuario' },
      modern: { gestor: 'Álvaro Uno', uid: 'U1' },
    },
    login_logs: {
      openMatched: { name: 'Álvaro Uno', email: 'u1@example.invalid' },
      openNoSession: { name: 'Nombre Repetido', email: 'u2@example.invalid' },
      closedUnique: { name: 'Álvaro Uno', logoutTime: 10 },
      modern: { name: 'Álvaro Uno', uid: 'U1' },
    },
    active_sessions: {
      U1: { name: 'Álvaro Uno', email: 'u1@example.invalid' },
    },
  };
}

function testNormalization() {
  assert.equal(normalizeIdentity('  ÁLVARO   Uno '), 'alvaro uno');
  assert.equal(normalizeIdentity(null), null);
}

function testConservativeSelection() {
  const plan = planUidMigration(fixture());
  assert.deepEqual(plan.updates, {
    'permissions/unique/uid': 'U1',
    'login_logs/openMatched/uid': 'U1',
    'login_logs/closedUnique/uid': 'U1',
  });
  assert.equal(plan.counts.ambiguous, 2);
  assert.equal(plan.counts.unmatched, 2);
}

function testIdempotence() {
  const state = fixture();
  state.permissions.unique.uid = 'U1';
  state.login_logs.openMatched.uid = 'U1';
  state.login_logs.closedUnique.uid = 'U1';
  assert.equal(planUidMigration(state).counts.selected, 0);
}

testNormalization();
testConservativeSelection();
testIdempotence();
console.log('MIGRATION_UNIT_TESTS=PASS');
