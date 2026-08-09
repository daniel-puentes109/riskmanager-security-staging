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
        'perm_own': { uid: 'gestor_789', status: 'Pendiente', notified: false },
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

// E. /permissions privacy
describe('Permissions Privacy', () => {
  it('Gestor DENY read complete /permissions collection', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(gestorDb.ref('permissions').once('value'));
  });

  it('Gestor ALLOW query own permissions by authenticated UID', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertSucceeds(
      gestorDb.ref('permissions').orderByChild('uid').equalTo('gestor_789').once('value')
    );
  });

  it('Gestor DENY query permissions for another UID', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(
      gestorDb.ref('permissions').orderByChild('uid').equalTo('other_gestor').once('value')
    );
  });

  it('Gestor ALLOW read own permission directly', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertSucceeds(gestorDb.ref('permissions/perm_own').once('value'));
  });

  it('Gestor DENY read permission belonging to another UID', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(gestorDb.ref('permissions/perm_other').once('value'));
  });

  it('Unauth DENY read /permissions', async () => {
    const unauthDb = testEnv.unauthenticatedContext().database();
    await assertFails(unauthDb.ref('permissions').once('value'));
  });
});

// F. /logs authorization
describe('Logs Authorization', () => {
  it('Gestor ALLOW create own incident', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    const newLogRef = gestorDb.ref('logs').push();
    await assertSucceeds(newLogRef.set({
      uid: 'gestor_789',
      type: 'Novedad',
      title: 'Test incident',
      detail: 'Details',
      reportedBy: 'Test Gestor',
      timestamp: Date.now(),
      status: 'Abierto'
    }));
  });

  it('Gestor DENY create incident for another UID', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    const newLogRef = gestorDb.ref('logs').push();
    await assertFails(newLogRef.set({
      uid: 'other_gestor',
      type: 'Novedad',
      title: 'Spoofed incident',
      detail: 'Bad ownership',
      timestamp: Date.now(),
      status: 'Abierto'
    }));
  });

  it('Unauth DENY create incident', async () => {
    const unauthDb = testEnv.unauthenticatedContext().database();
    const newLogRef = unauthDb.ref('logs').push();
    await assertFails(newLogRef.set({
      type: 'Novedad',
      title: 'Hacked',
      detail: 'Bad',
      timestamp: Date.now(),
      status: 'Abierto'
    }));
  });

  it('Gestor DENY modify existing incident', async () => {
    // First create an incident as admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('logs/existing_log').set({
        type: 'Novedad',
        title: 'Original',
        detail: 'Original detail',
        reportedBy: 'Other',
        timestamp: 100,
        status: 'Abierto'
      });
    });
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(gestorDb.ref('logs/existing_log').update({ title: 'XSS payload' }));
  });

  it('Gestor DENY delete existing incident', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('logs/to_delete').set({
        type: 'Novedad',
        title: 'Delete me',
        detail: 'test',
        timestamp: 100,
        status: 'Abierto'
      });
    });
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(gestorDb.ref('logs/to_delete').remove());
  });

  it('Gestor DENY read /logs (restricted to Admin/Supervisor)', async () => {
    const gestorDb = testEnv.authenticatedContext('gestor_789').database();
    await assertFails(gestorDb.ref('logs').once('value'));
  });

  it('Admin ALLOW read /logs', async () => {
    const adminDb = testEnv.authenticatedContext('admin_123').database();
    await assertSucceeds(adminDb.ref('logs').once('value'));
  });

  it('Supervisor ALLOW read /logs', async () => {
    const supDb = testEnv.authenticatedContext('sup_456').database();
    await assertSucceeds(supDb.ref('logs').once('value'));
  });
});
