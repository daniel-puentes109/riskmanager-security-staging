const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');

let testEnv;

beforeAll(async () => {
  // Load rules from the same directory
  const rules = readFileSync('database.rules.json', 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'riskmanager-security-test',
    database: {
      rules,
      host: '127.0.0.1',
      port: 9000
    }
  });
});

beforeEach(async () => {
  await testEnv.clearDatabase();

  // Setup initial mock data as an admin
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('/').set({
      users: {
        'admin_123': { role: 'Admin', status: 'Activo' },
        'sup_456': { role: 'Supervisor', status: 'Activo' },
        'gestor_789': { role: 'Gestor', status: 'Activo' },
        'other_gestor': { role: 'Gestor', status: 'Activo' }
      },
      shift_reports: {
        'rep_other': { uid: 'other_gestor', gestor: 'Other' }
      },
      permissions: {
        'perm_other': { uid: 'other_gestor', status: 'Pendiente' }
      },
      login_logs: {
        'log_other': { uid: 'other_gestor', loginTime: 100 }
      },
      active_sessions: {
        'other_gestor': { status: 'Activo' }
      },
      announcements: {
        'ann_1': { author: 'admin_123', readBy: {} }
      }
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// A. Unauthenticated
describe('Unauthenticated User', () => {
  it('DENY recursos protegidos (users)', async () => {
    const unauthDb = testEnv.unauthenticatedContext().database();
    await assertFails(unauthDb.ref('users').once('value'));
  });
});

// B. Gestor
describe('Gestor Context', () => {
  let gestorDb;
  beforeEach(() => {
    gestorDb = testEnv.authenticatedContext('gestor_789').database();
  });

  it('DENY cambiar role -> Admin', async () => {
    await assertFails(gestorDb.ref('users/gestor_789').update({ role: 'Admin' }));
  });

  it('DENY cambiar role -> Supervisor', async () => {
    await assertFails(gestorDb.ref('users/gestor_789').update({ role: 'Supervisor' }));
  });

  it('DENY autoaprobarse', async () => {
    await assertFails(gestorDb.ref('users/gestor_789').update({ approved: true }));
  });

  it('DENY leer perfil protegido de otro UID (admin)', async () => {
    await assertFails(gestorDb.ref('users/admin_123').once('value'));
  });

  it('DENY modificar permissions de otro UID', async () => {
    await assertFails(gestorDb.ref('permissions/perm_other').update({ status: 'Aprobado' }));
  });

  it('DENY shift_reports de otro UID', async () => {
    await assertFails(gestorDb.ref('shift_reports/rep_other').update({ timestamp: 123 }));
  });

  it('DENY login_logs de otro UID', async () => {
    await assertFails(gestorDb.ref('login_logs/log_other').update({ loginTime: 999 }));
  });

  it('DENY active_sessions de otro UID', async () => {
    await assertFails(gestorDb.ref('active_sessions/other_gestor').set({ status: 'Inactivo' }));
  });

  it('DENY administrar announcements', async () => {
    await assertFails(gestorDb.ref('announcements/ann_1').update({ author: 'gestor_789' }));
  });

  it('DENY readBy de otro usuario', async () => {
    await assertFails(gestorDb.ref('announcements/ann_1/readBy/other_gestor').set({ readAt: 123 }));
  });

  it('ALLOW operaciones propias autorizadas (actualizar su status)', async () => {
    await assertSucceeds(gestorDb.ref('users/gestor_789/status').set('Inactivo'));
  });

  it('ALLOW logoutTime propio', async () => {
    // Gestor can write to own login_log's logoutTime
    await assertSucceeds(gestorDb.ref('login_logs/log_gestor/logoutTime').set(456));
    // Verify wait, first we must create it properly if needed, but the rule says !newData.exists() || newData.isNumber(), and uid matches.
    // However, the rule requires `auth.uid === $log_id` for active_sessions. For login_logs, it checks `root.child('login_logs').child($log_id).child('uid').val() === auth.uid`.
    // Let\'s set up the own log first as admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('login_logs/log_own').set({ uid: 'gestor_789', loginTime: 123 });
    });
    await assertSucceeds(gestorDb.ref('login_logs/log_own/logoutTime').set(456));
  });

  it('ALLOW readBy propio', async () => {
    await assertSucceeds(gestorDb.ref('announcements/ann_1/readBy/gestor_789').set({ readAt: 123 }));
  });
});

// C. Supervisor
describe('Supervisor Context', () => {
  let supDb;
  beforeEach(() => {
    supDb = testEnv.authenticatedContext('sup_456').database();
  });

  it('ALLOW leer perfiles ajenos', async () => {
    await assertSucceeds(supDb.ref('users/gestor_789').once('value'));
  });

  it('ALLOW modificar permissions ajenos', async () => {
    await assertSucceeds(supDb.ref('permissions/perm_other').update({ status: 'Aprobado' }));
  });

  it('DENY crear usuarios directos (reservado a Admin)', async () => {
    await assertFails(supDb.ref('users/new_gestor').set({ role: 'Gestor' }));
  });
});

// D. Admin
describe('Admin Context', () => {
  let adminDb;
  beforeEach(() => {
    adminDb = testEnv.authenticatedContext('admin_123').database();
  });

  it('ALLOW announcements', async () => {
    await assertSucceeds(adminDb.ref('announcements/ann_new').set({ author: 'admin_123', text: 'hello' }));
  });

  it('ALLOW gestión autorizada de usuarios', async () => {
    await assertSucceeds(adminDb.ref('users/new_user').set({ role: 'Gestor', approved: true }));
  });
});
