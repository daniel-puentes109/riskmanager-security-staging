const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const PROJECT_ID = 'demo-risk-manager-qa';
const DATABASE_NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const EXPECTED_R0_SHA256 = '3730f88e2b3f65841bf8ac92d6d53ac761a0449396da6294fb6f1dae53d7fe2d';
const EXPECTED_R1_SHA256 = '73da618eaa770025306a74521daea4a1ceb852d0169c83ca45cfa48251c991fd';
const F0_SHA = '7046de65c52245294fa5cdfdce8e40dde5f0fa34';
const F1_SHA = 'cb6eade8d924dcd3ea597d5de13c3d8c5a1c3c07';
const STATUS = {
  VERIFIED: 'VERIFIED_EXECUTED',
  FAILED: 'FAIL_VERIFIED_EXECUTED',
  PREVIOUS: 'PREVIOUS_EVIDENCE',
  NOT_TESTED: 'NOT_TESTED',
};
let qaStage = 'BOOTSTRAP';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';

const qaUsers = [
  { uid: 'QA_GESTOR', email: 'qa-gestor@example.invalid', password: 'QaOnly-42!' },
  { uid: 'QA_OTHER_GESTOR', email: 'qa-other@example.invalid', password: 'QaOnly-42!' },
  { uid: 'QA_SUPERVISOR', email: 'qa-supervisor@example.invalid', password: 'QaOnly-42!' },
  { uid: 'QA_ADMIN', email: 'qa-admin@example.invalid', password: 'QaOnly-42!' },
  { uid: 'QA_CONFIRMED_OWNER', email: 'qa-owner@example.invalid', password: 'QaOnly-42!' },
];

const requiredPaths = [
  'users',
  'permissions',
  'login_logs',
  'logs',
  'shift_reports',
  'active_sessions',
  'announcements',
];

const report = {
  metadata: {
    projectId: PROJECT_ID,
    productionAccess: false,
    rules: {},
    frontend: {
      F0_SHA,
      F1_SHA,
      mode: 'STATIC_CONTRACT',
      browserSmoke: STATUS.NOT_TESTED,
    },
  },
  operations: [],
  matrices: {},
  roles: {},
  legacy: {},
  summary: {},
};

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function redactError(error) {
  if (!error) return null;
  const code = typeof error.code === 'string' ? error.code : 'UNKNOWN';
  if (/permission.denied/i.test(code) || /permission_denied/i.test(String(error.message))) {
    return 'PERMISSION_DENIED';
  }
  if (code !== 'UNKNOWN') return code.replace(/[^A-Z0-9_.-]/gi, '_').slice(0, 80);
  return String(error.message || 'UNKNOWN')
    .replace(/https?:\/\/\S+/gi, 'LOCAL_ENDPOINT')
    .replace(/[^A-Z0-9_. -]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function matrixRuleGeneration(matrix) {
  return matrix.endsWith('_R0') ? 'R0' : 'R1';
}

function expected(matrix, r0Allowed, r1Allowed) {
  return matrixRuleGeneration(matrix) === 'R0' ? r0Allowed : r1Allowed;
}

function publicOperation(operation) {
  return {
    id: operation.id,
    matrix: operation.matrix,
    role: operation.role,
    pathGroup: operation.pathGroup,
    operation: operation.operation,
    expectedAllowed: operation.expectedAllowed,
    actualAllowed: operation.actualAllowed,
    assertionPassed: operation.assertionPassed,
    compatibilityRequirement: operation.compatibilityRequirement,
    compatibilityPassed: operation.compatibilityPassed,
    status: operation.status,
    errorCode: operation.errorCode,
  };
}

async function deleteAllAuthUsers() {
  let pageToken;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    if (page.users.length) {
      await getAuth().deleteUsers(page.users.map((user) => user.uid));
    }
    pageToken = page.pageToken;
  } while (pageToken);
}

async function assertCleanState() {
  const snapshot = await getDatabase().ref().once('value');
  if (snapshot.exists()) throw new Error('RTDB emulator did not reset');
  const users = await getAuth().listUsers(1);
  if (users.users.length !== 0) throw new Error('Auth emulator did not reset');
}

async function setRules(rulesPath) {
  const response = await fetch(
    `http://127.0.0.1:9000/.settings/rules.json?ns=${DATABASE_NAMESPACE}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: fs.readFileSync(rulesPath, 'utf8'),
    },
  );
  if (!response.ok) throw new Error(`RULE_LOAD_${response.status}`);
}

async function seedState() {
  const db = getDatabase();
  await db.ref().set({
    users: {
      QA_GESTOR: { role: 'Gestor', status: 'Activo' },
      QA_OTHER_GESTOR: { role: 'Gestor', status: 'Activo' },
      QA_SUPERVISOR: { role: 'Supervisor', status: 'Activo' },
      QA_ADMIN: { role: 'Admin', status: 'Activo' },
      QA_CONFIRMED_OWNER: { role: 'Gestor', status: 'Activo' },
    },
    permissions: {
      legacy_pending_without_uid: { gestor: 'LEGACY_OWNER', status: 'Pendiente', approved: false },
      legacy_approved_without_uid: { gestor: 'LEGACY_OWNER', status: 'Aprobado', approved: true },
      legacy_rejected_without_uid: { gestor: 'LEGACY_OWNER', status: 'Rechazado', approved: false },
      pending_with_uid: { gestor: 'LEGACY_OWNER', uid: 'QA_CONFIRMED_OWNER', status: 'Pendiente', approved: false },
      other_permission: { uid: 'QA_OTHER_GESTOR', status: 'Pendiente', approved: false },
    },
    login_logs: {
      legacy_open_without_uid: { loginTime: 100 },
      legacy_closed_without_uid: { loginTime: 100, logoutTime: 200 },
      modern_owned: { uid: 'QA_GESTOR', loginTime: 100 },
      modern_other: { uid: 'QA_OTHER_GESTOR', loginTime: 100 },
    },
    logs: {
      existing_other: { uid: 'QA_OTHER_GESTOR', type: 'Synthetic', status: 'Abierto' },
    },
    shift_reports: {
      own_report: { uid: 'QA_GESTOR', gestor: 'QA_GESTOR', timestamp: 100 },
      other_report: { uid: 'QA_OTHER_GESTOR', gestor: 'QA_OTHER_GESTOR', timestamp: 100 },
    },
    active_sessions: {
      QA_GESTOR: { status: 'Activo' },
      QA_OTHER_GESTOR: { status: 'Activo', uid: 'QA_OTHER_GESTOR' },
    },
    announcements: {
      existing: { author: 'QA_ADMIN', text: 'Synthetic announcement', readBy: {} },
    },
  });
}

async function resetMatrix(rulesPath) {
  await getDatabase().ref().remove();
  await deleteAllAuthUsers();
  await assertCleanState();
  await setRules(rulesPath);
  for (const user of qaUsers) await getAuth().createUser(user);
  const created = await getAuth().listUsers(100);
  if (created.users.length !== qaUsers.length) throw new Error('Auth fixture count mismatch');
  await seedState();
}

async function perform(spec) {
  try {
    if (spec.operation === 'auth-login') {
      const response = await fetch(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-emulator-key',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: spec.email, password: spec.password, returnSecureToken: true }),
        },
      );
      if (!response.ok) throw new Error(`AUTH_LOGIN_${response.status}`);
      const result = await response.json();
      if (!result.idToken || result.localId !== spec.uid) throw new Error('AUTH_LOGIN_INVALID_RESPONSE');
      return { allowed: true, errorCode: null };
    }
    const db = spec.context.database();
    if (spec.operation === 'read') await db.ref(spec.path).once('value');
    else if (spec.operation === 'query-own') {
      await db.ref(spec.path).orderByChild('uid').equalTo(spec.uid).once('value');
    } else if (spec.operation === 'set') await db.ref(spec.path).set(spec.payload);
    else if (spec.operation === 'update') await db.ref(spec.path).update(spec.payload);
    else if (spec.operation === 'remove') await db.ref(spec.path).remove();
    else if (spec.operation === 'root-update') await db.ref().update(spec.payload);
    else throw new Error(`Unknown operation ${spec.operation}`);
    return { allowed: true, errorCode: null };
  } catch (error) {
    return { allowed: false, errorCode: redactError(error) };
  }
}

async function runOperation(matrix, spec) {
  const outcome = await perform(spec);
  const assertionPassed = outcome.allowed === spec.expectedAllowed;
  const compatibilityRequirement = spec.compatibilityRequirement || 'NOT_APPLICABLE';
  const compatibilityPassed = compatibilityRequirement === 'MUST_ALLOW'
    ? outcome.allowed
    : compatibilityRequirement === 'MUST_DENY'
      ? !outcome.allowed
      : null;
  report.operations.push(publicOperation({
    ...spec,
    matrix,
    actualAllowed: outcome.allowed,
    assertionPassed,
    compatibilityRequirement,
    compatibilityPassed,
    status: assertionPassed ? STATUS.VERIFIED : STATUS.FAILED,
    errorCode: outcome.errorCode,
  }));
}

function buildSpecs(matrix, contexts) {
  const { unauth, gestor, other, supervisor, admin, owner } = contexts;
  const modernLogin = { uid: 'QA_GESTOR', loginTime: 300 };
  const legacyLogin = { loginTime: 300 };
  const loginPayload = matrix.startsWith('F0_') ? legacyLogin : modernLogin;
  const r0 = matrixRuleGeneration(matrix) === 'R0';
  return [
    { id: 'gestor_auth_login', role: 'QA_GESTOR', pathGroup: 'users', operation: 'auth-login', email: 'qa-gestor@example.invalid', password: 'QaOnly-42!', uid: 'QA_GESTOR', expectedAllowed: true },
    { id: 'other_gestor_auth_login', role: 'QA_OTHER_GESTOR', pathGroup: 'users', operation: 'auth-login', email: 'qa-other@example.invalid', password: 'QaOnly-42!', uid: 'QA_OTHER_GESTOR', expectedAllowed: true },
    { id: 'supervisor_auth_login', role: 'QA_SUPERVISOR', pathGroup: 'users', operation: 'auth-login', email: 'qa-supervisor@example.invalid', password: 'QaOnly-42!', uid: 'QA_SUPERVISOR', expectedAllowed: true },
    { id: 'admin_auth_login', role: 'QA_ADMIN', pathGroup: 'users', operation: 'auth-login', email: 'qa-admin@example.invalid', password: 'QaOnly-42!', uid: 'QA_ADMIN', expectedAllowed: true },
    { id: 'owner_auth_login', role: 'QA_CONFIRMED_OWNER', pathGroup: 'users', operation: 'auth-login', email: 'qa-owner@example.invalid', password: 'QaOnly-42!', uid: 'QA_CONFIRMED_OWNER', expectedAllowed: true },
    { id: 'unauth_users_read_denied', role: 'UNAUTH', pathGroup: 'users', path: 'users', operation: 'read', expectedAllowed: false, context: unauth },
    { id: 'gestor_own_profile_read', role: 'QA_GESTOR', pathGroup: 'users', path: 'users/QA_GESTOR', operation: 'read', expectedAllowed: true, context: gestor },
    { id: 'gestor_other_profile_read', role: 'QA_GESTOR', pathGroup: 'users', path: 'users/QA_OTHER_GESTOR', operation: 'read', expectedAllowed: r0, context: gestor },
    { id: 'gestor_role_escalation_denied', role: 'QA_GESTOR', pathGroup: 'users', path: 'users/QA_GESTOR', operation: 'update', payload: { role: 'Admin' }, expectedAllowed: false, context: gestor },
    { id: 'supervisor_users_read', role: 'QA_SUPERVISOR', pathGroup: 'users', path: 'users', operation: 'read', expectedAllowed: true, context: supervisor },
    { id: 'supervisor_admin_escalation_denied', role: 'QA_SUPERVISOR', pathGroup: 'users', path: 'users/QA_SUPERVISOR', operation: 'update', payload: { role: 'Admin' }, expectedAllowed: false, context: supervisor },
    { id: 'admin_user_create', role: 'QA_ADMIN', pathGroup: 'users', path: 'users/QA_NEW_GESTOR', operation: 'set', payload: { role: 'Gestor', status: 'Activo', approved: true }, expectedAllowed: true, context: admin },

    { id: 'gestor_permissions_collection_read', role: 'QA_GESTOR', pathGroup: 'permissions', path: 'permissions', operation: 'read', expectedAllowed: r0, context: gestor },
    { id: 'gestor_own_permissions_query', role: 'QA_GESTOR', pathGroup: 'permissions', path: 'permissions', operation: 'query-own', uid: 'QA_GESTOR', expectedAllowed: true, context: gestor },
    { id: 'gestor_other_permission_read', role: 'QA_GESTOR', pathGroup: 'permissions', path: 'permissions/other_permission', operation: 'read', expectedAllowed: r0, context: gestor },
    { id: 'owner_legacy_permission_without_uid', role: 'QA_CONFIRMED_OWNER', pathGroup: 'permissions', path: 'permissions/legacy_pending_without_uid', operation: 'read', expectedAllowed: r0, compatibilityRequirement: 'MUST_ALLOW', context: owner },
    { id: 'owner_permission_with_uid', role: 'QA_CONFIRMED_OWNER', pathGroup: 'permissions', path: 'permissions/pending_with_uid', operation: 'read', expectedAllowed: true, compatibilityRequirement: 'MUST_ALLOW', context: owner },
    { id: 'supervisor_legacy_permission_read', role: 'QA_SUPERVISOR', pathGroup: 'permissions', path: 'permissions/legacy_pending_without_uid', operation: 'read', expectedAllowed: true, context: supervisor },
    { id: 'supervisor_legacy_permission_approve', role: 'QA_SUPERVISOR', pathGroup: 'permissions', path: 'permissions/legacy_pending_without_uid', operation: 'update', payload: { status: 'Aprobado' }, expectedAllowed: true, context: supervisor },
    { id: 'admin_legacy_permission_reject', role: 'QA_ADMIN', pathGroup: 'permissions', path: 'permissions/legacy_rejected_without_uid', operation: 'update', payload: { status: 'Rechazado' }, expectedAllowed: true, context: admin },

    { id: 'frontend_login_payload', role: 'QA_GESTOR', pathGroup: 'login_logs', path: `login_logs/${matrix}_new`, operation: 'set', payload: loginPayload, expectedAllowed: r0 || matrix.startsWith('F1_'), compatibilityRequirement: 'MUST_ALLOW', context: gestor },
    { id: 'legacy_open_logout_update', role: 'QA_GESTOR', pathGroup: 'login_logs', path: 'login_logs/legacy_open_without_uid', operation: 'update', payload: { logoutTime: 999 }, expectedAllowed: r0, compatibilityRequirement: 'MUST_ALLOW', context: gestor },
    { id: 'legacy_closed_admin_read', role: 'QA_ADMIN', pathGroup: 'login_logs', path: 'login_logs/legacy_closed_without_uid', operation: 'read', expectedAllowed: true, compatibilityRequirement: 'MUST_ALLOW', context: admin },
    { id: 'gestor_other_login_mutation', role: 'QA_GESTOR', pathGroup: 'login_logs', path: 'login_logs/modern_other', operation: 'update', payload: { logoutTime: 999 }, expectedAllowed: r0, context: gestor },

    { id: 'gestor_own_log_create', role: 'QA_GESTOR', pathGroup: 'logs', path: `logs/${matrix}_own`, operation: 'set', payload: { uid: 'QA_GESTOR', type: 'Synthetic', status: 'Abierto' }, expectedAllowed: true, context: gestor },
    { id: 'gestor_spoofed_log_create', role: 'QA_GESTOR', pathGroup: 'logs', path: `logs/${matrix}_spoofed`, operation: 'set', payload: { uid: 'QA_OTHER_GESTOR', type: 'Synthetic', status: 'Abierto' }, expectedAllowed: r0, context: gestor },
    { id: 'gestor_existing_log_update_denied', role: 'QA_GESTOR', pathGroup: 'logs', path: 'logs/existing_other', operation: 'update', payload: { status: 'Cerrado' }, expectedAllowed: r0, context: gestor },
    { id: 'supervisor_logs_read', role: 'QA_SUPERVISOR', pathGroup: 'logs', path: 'logs', operation: 'read', expectedAllowed: true, context: supervisor },
    { id: 'admin_logs_read', role: 'QA_ADMIN', pathGroup: 'logs', path: 'logs', operation: 'read', expectedAllowed: true, context: admin },

    { id: 'gestor_own_shift_report_read', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: 'shift_reports/own_report', operation: 'read', expectedAllowed: true, context: gestor },
    { id: 'gestor_other_shift_report_read', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: 'shift_reports/other_report', operation: 'read', expectedAllowed: r0, context: gestor },
    { id: 'gestor_own_shift_report_create', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: `shift_reports/${matrix}_own`, operation: 'set', payload: { uid: 'QA_GESTOR', gestor: 'QA_GESTOR', timestamp: 300 }, expectedAllowed: true, context: gestor },
    { id: 'gestor_spoofed_shift_report_create', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: `shift_reports/${matrix}_spoofed`, operation: 'set', payload: { uid: 'QA_OTHER_GESTOR', gestor: 'QA_OTHER_GESTOR', timestamp: 300 }, expectedAllowed: r0, context: gestor },
    { id: 'supervisor_shift_reports_read', role: 'QA_SUPERVISOR', pathGroup: 'shift_reports', path: 'shift_reports', operation: 'read', expectedAllowed: true, context: supervisor },

    { id: 'legacy_active_session_owner_read', role: 'QA_GESTOR', pathGroup: 'active_sessions', path: 'active_sessions/QA_GESTOR', operation: 'read', expectedAllowed: true, compatibilityRequirement: 'MUST_ALLOW', context: gestor },
    { id: 'legacy_active_session_owner_update', role: 'QA_GESTOR', pathGroup: 'active_sessions', path: 'active_sessions/QA_GESTOR', operation: 'update', payload: { lastHeartbeat: 300 }, expectedAllowed: true, compatibilityRequirement: 'MUST_ALLOW', context: gestor },
    { id: 'gestor_other_active_session_read', role: 'QA_GESTOR', pathGroup: 'active_sessions', path: 'active_sessions/QA_OTHER_GESTOR', operation: 'read', expectedAllowed: r0, context: gestor },
    { id: 'gestor_other_active_session_write', role: 'QA_GESTOR', pathGroup: 'active_sessions', path: 'active_sessions/QA_OTHER_GESTOR', operation: 'update', payload: { status: 'Inactivo' }, expectedAllowed: r0, context: gestor },
    { id: 'supervisor_active_sessions_read', role: 'QA_SUPERVISOR', pathGroup: 'active_sessions', path: 'active_sessions', operation: 'read', expectedAllowed: true, context: supervisor },
    { id: 'admin_active_sessions_read', role: 'QA_ADMIN', pathGroup: 'active_sessions', path: 'active_sessions', operation: 'read', expectedAllowed: true, context: admin },

    { id: 'gestor_announcements_read', role: 'QA_GESTOR', pathGroup: 'announcements', path: 'announcements', operation: 'read', expectedAllowed: true, context: gestor },
    { id: 'gestor_announcement_admin_write', role: 'QA_GESTOR', pathGroup: 'announcements', path: 'announcements/new_admin', operation: 'set', payload: { author: 'QA_GESTOR', text: 'Synthetic' }, expectedAllowed: r0, context: gestor },
    { id: 'gestor_own_read_receipt', role: 'QA_GESTOR', pathGroup: 'announcements', path: 'announcements/existing/readBy/QA_GESTOR', operation: 'set', payload: { readAt: 300 }, expectedAllowed: true, context: gestor },
    { id: 'gestor_other_read_receipt', role: 'QA_GESTOR', pathGroup: 'announcements', path: 'announcements/existing/readBy/QA_OTHER_GESTOR', operation: 'set', payload: { readAt: 300 }, expectedAllowed: r0, context: gestor },
    { id: 'supervisor_announcement_admin_write', role: 'QA_SUPERVISOR', pathGroup: 'announcements', path: 'announcements/supervisor_admin', operation: 'set', payload: { author: 'QA_SUPERVISOR', text: 'Synthetic' }, expectedAllowed: r0, context: supervisor },
    { id: 'admin_announcement_write', role: 'QA_ADMIN', pathGroup: 'announcements', path: 'announcements/admin', operation: 'set', payload: { author: 'QA_ADMIN', text: 'Synthetic' }, expectedAllowed: true, context: admin },

    { id: 'atomic_shift_close', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: '/', operation: 'root-update', payload: { [`shift_reports/${matrix}_atomic`]: { uid: 'QA_GESTOR', gestor: 'QA_GESTOR', timestamp: 400 }, 'active_sessions/QA_GESTOR': null, 'login_logs/modern_owned/logoutTime': 400 }, expectedAllowed: true, context: gestor },
    { id: 'atomic_shift_close_other_denied', role: 'QA_GESTOR', pathGroup: 'shift_reports', path: '/', operation: 'root-update', payload: { [`shift_reports/${matrix}_atomic_bad`]: { uid: 'QA_GESTOR', gestor: 'QA_GESTOR', timestamp: 401 }, 'active_sessions/QA_OTHER_GESTOR': null, 'login_logs/modern_other/logoutTime': 401 }, expectedAllowed: r0, context: gestor },

    { id: 'other_gestor_own_profile_read', role: 'QA_OTHER_GESTOR', pathGroup: 'users', path: 'users/QA_OTHER_GESTOR', operation: 'read', expectedAllowed: true, context: other },
  ];
}

function aggregate() {
  for (const matrix of ['F0_R0', 'F1_R0', 'F1_R1', 'F0_R1']) {
    const operations = report.operations.filter((op) => op.matrix === matrix);
    const covered = new Set(operations.map((op) => op.pathGroup));
    const complete = requiredPaths.every((item) => covered.has(item));
    const assertionsPass = operations.length > 0 && operations.every((op) => op.assertionPassed);
    const compatibilityFindings = operations.filter((op) => op.compatibilityPassed === false).map((op) => op.id);
    report.matrices[matrix] = {
      status: complete && assertionsPass ? STATUS.VERIFIED : STATUS.FAILED,
      requiredPathsCovered: complete,
      operationCount: operations.length,
      assertionFailures: operations.filter((op) => !op.assertionPassed).map((op) => op.id),
      compatibilityFindings,
      compatibilityStatus: compatibilityFindings.length ? STATUS.FAILED : STATUS.VERIFIED,
    };
  }

  for (const role of ['QA_GESTOR', 'QA_OTHER_GESTOR', 'QA_SUPERVISOR', 'QA_ADMIN', 'QA_CONFIRMED_OWNER']) {
    const operations = report.operations.filter((op) => op.role === role);
    report.roles[role] = operations.length > 0 && operations.every((op) => op.assertionPassed)
      ? STATUS.VERIFIED
      : STATUS.FAILED;
  }

  function operationStatus(matrix, id) {
    const operation = report.operations.find((item) => item.matrix === matrix && item.id === id);
    if (!operation) return STATUS.NOT_TESTED;
    return operation.compatibilityPassed === false ? STATUS.FAILED : operation.status;
  }

  report.legacy = {
    ORIANA_WITHOUT_UID: operationStatus('F1_R1', 'owner_legacy_permission_without_uid'),
    ORIANA_WITH_UID: operationStatus('F1_R1', 'owner_permission_with_uid'),
    OPEN_LOGIN_LOG_WITHOUT_UID: operationStatus('F1_R1', 'legacy_open_logout_update'),
    CLOSED_LOGIN_LOG_WITHOUT_UID: operationStatus('F1_R1', 'legacy_closed_admin_read'),
    LEGACY_ACTIVE_SESSION: operationStatus('F1_R1', 'legacy_active_session_owner_update'),
  };

  const compatibilityFailures = Object.values(report.matrices)
    .flatMap((matrix) => matrix.compatibilityFindings);
  const harnessFailures = report.operations.filter((op) => !op.assertionPassed);
  report.summary = {
    QA_NETWORK_ISOLATION: process.env.QA_NETWORK_ISOLATION === STATUS.VERIFIED ? STATUS.VERIFIED : STATUS.FAILED,
    PRODUCTION_NETWORK_REQUESTS: Number(process.env.PRODUCTION_NETWORK_REQUESTS || '1'),
    QA_GESTOR: report.roles.QA_GESTOR,
    QA_SUPERVISOR: report.roles.QA_SUPERVISOR,
    QA_ADMIN: report.roles.QA_ADMIN,
    F0_R0: report.matrices.F0_R0.compatibilityStatus,
    F1_R0: report.matrices.F1_R0.compatibilityStatus,
    F1_R1: report.matrices.F1_R1.compatibilityStatus,
    F0_R1: report.matrices.F0_R1.compatibilityStatus,
    ...report.legacy,
    LOGIN_LOGS_WITHOUT_UID_OPEN: STATUS.NOT_TESTED,
    LOGIN_LOGS_WITHOUT_UID_CLOSED: STATUS.NOT_TESTED,
    ACTIVE_SESSIONS_MATCHING_OPEN_LOGIN_LOG: STATUS.NOT_TESTED,
    DATA_MIGRATION_REQUIRED: compatibilityFailures.length ? 'YES' : 'NO',
    DATA_MIGRATION_SCOPE: compatibilityFailures.length ? [...new Set(compatibilityFailures)].sort().join(',') : 'NONE',
    RULE_CHANGE_REQUIRED: 'REVIEW_REQUIRED',
    FRONTEND_CHANGE_REQUIRED: compatibilityFailures.some((id) => id === 'frontend_login_payload') ? 'YES' : 'NOT_DETERMINED',
    CACHE_CHANGE_REQUIRED: STATUS.NOT_TESTED,
    PAGES_CHANGE_REQUIRED: STATUS.NOT_TESTED,
    NEW_RELEASE_CANDIDATE_REQUIRED: compatibilityFailures.length ? 'YES' : 'NO',
    FRONTEND_SMOKE: STATUS.NOT_TESTED,
    F0_F1_STATIC_CONTRACT: process.env.F0_F1_STATIC_CONTRACT === STATUS.VERIFIED
      ? STATUS.VERIFIED
      : STATUS.FAILED,
    REMAINING_BLOCKERS: compatibilityFailures.length
      ? `COMPATIBILITY_FINDINGS:${[...new Set(compatibilityFailures)].sort().join(',')}`
      : 'NONE',
    PRODUCTION_RELEASE_RECOMMENDATION:
      compatibilityFailures.length
        || harnessFailures.length
        || process.env.QA_NETWORK_ISOLATION !== STATUS.VERIFIED
        || process.env.F0_F1_STATIC_CONTRACT !== STATUS.VERIFIED
        ? 'NO-GO'
        : 'GO',
  };
}

function writeReports() {
  fs.writeFileSync('phase1-qa-report.json', `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    `PRODUCTION_R0_SHA256 = ${report.metadata.rules.R0.sha256}`,
    `R1_SHA256 = ${report.metadata.rules.R1.sha256}`,
    ...Object.entries(report.summary).map(([key, value]) => `${key} = ${value}`),
  ];
  fs.writeFileSync('phase1-qa-report.txt', `${lines.join('\n')}\n`);
}

async function main() {
  qaStage = 'INPUT_VALIDATION';
  const r0Path = process.env.R0_PATH;
  const r1Path = process.env.R1_PATH;
  if (!r0Path || !r1Path) throw new Error('R0_PATH and R1_PATH are required');
  report.metadata.rules.R0 = { sha256: sha256(r0Path) };
  report.metadata.rules.R1 = { sha256: sha256(r1Path) };
  if (report.metadata.rules.R0.sha256 !== EXPECTED_R0_SHA256) throw new Error('R0_SHA256_MISMATCH');
  if (report.metadata.rules.R1.sha256 !== EXPECTED_R1_SHA256) throw new Error('R1_SHA256_MISMATCH');

  qaStage = 'ADMIN_INITIALIZATION';
  const adminApp = initializeApp({
    projectId: PROJECT_ID,
    databaseURL: `http://127.0.0.1:9000/?ns=${DATABASE_NAMESPACE}`,
  });
  qaStage = 'RULES_TEST_ENVIRONMENT_INITIALIZATION';
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: '127.0.0.1', port: 9000 },
  });

  try {
    for (const matrix of ['F0_R0', 'F1_R0', 'F1_R1', 'F0_R1']) {
      qaStage = `MATRIX_${matrix}_RESET`;
      await resetMatrix(matrixRuleGeneration(matrix) === 'R0' ? r0Path : r1Path);
      const contexts = {
        unauth: testEnv.unauthenticatedContext(),
        gestor: testEnv.authenticatedContext('QA_GESTOR'),
        other: testEnv.authenticatedContext('QA_OTHER_GESTOR'),
        supervisor: testEnv.authenticatedContext('QA_SUPERVISOR'),
        admin: testEnv.authenticatedContext('QA_ADMIN'),
        owner: testEnv.authenticatedContext('QA_CONFIRMED_OWNER'),
      };
      qaStage = `MATRIX_${matrix}_OPERATIONS`;
      for (const spec of buildSpecs(matrix, contexts)) await runOperation(matrix, spec);
    }
    qaStage = 'AGGREGATION';
    aggregate();
    writeReports();
  } finally {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  }

  const harnessFailed = report.operations.some((operation) => !operation.assertionPassed);
  const coverageFailed = Object.values(report.matrices).some((matrix) => !matrix.requiredPathsCovered);
  const isolationFailed = report.summary.QA_NETWORK_ISOLATION !== STATUS.VERIFIED
    || report.summary.PRODUCTION_NETWORK_REQUESTS !== 0;
  if (harnessFailed || coverageFailed || isolationFailed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`QA_FAILURE_STAGE=${qaStage}`);
  console.error(`QA_FAILURE=${redactError(error)}`);
  process.exitCode = 1;
});
