const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');

let testEnv;

beforeAll(async () => {
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
        'log_other': { uid: 'other_gestor', loginTime: 100 },
        'log_gestor': { uid: 'gestor_789', loginTime: 123 }
      },
      active_sessions: {
        'other_gestor': { status: 'Activo' },
        'gestor_789': { status: 'Activo' }
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
  it('DENY recursos protegidos', async () => {
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

  it('DENY leer perfil protegido de otro UID', async () => {
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

  it('ALLOW operaciones propias autorizadas', async () => {
    await assertSucceeds(gestorDb.ref('users/gestor_789/status').set('Inactivo'));
  });

  it('ALLOW logoutTime propio según reglas previstas', async () => {
    await assertSucceeds(gestorDb.ref('login_logs/log_gestor/logoutTime').set(456));
  });

  it('ALLOW readBy propio cuando corresponda', async () => {
    await assertSucceeds(gestorDb.ref('announcements/ann_1/readBy/gestor_789').set({ readAt: 123 }));
  });
});

// C. Supervisor
describe('Supervisor Context', () => {
  let supDb;
  beforeEach(() => {
    supDb = testEnv.authenticatedContext('sup_456').database();
  });

  it('ALLOW operaciones de supervisión previstas', async () => {
    await assertSucceeds(supDb.ref('users/gestor_789').once('value'));
  });

  it('ALLOW modificar permissions ajenos', async () => {
    await assertSucceeds(supDb.ref('permissions/perm_other').update({ status: 'Aprobado' }));
  });

  it('DENY operaciones exclusivas de Admin', async () => {
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

  it('ALLOW gestión autorizada de usuarios/permisos', async () => {
    await assertSucceeds(adminDb.ref('users/new_user').set({ role: 'Gestor', approved: true }));
  });
});
