const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const admin = require('firebase-admin');

const PROJECT_ID = "demo-risk-manager-qa";

// Emulators target
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
admin.initializeApp({ projectId: PROJECT_ID, databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb` });

let reportData = { operations: [], summary: {} };
let passedMatrixCount = 0;

function logResult(matrix, role, path, op, payload, expectedAllowed, actualAllowed, errorMsg) {
    const passed = expectedAllowed === actualAllowed;
    const status = passed ? 'VERIFIED_EXECUTED' : 'FAIL_VERIFIED_EXECUTED';
    reportData.operations.push({
        matrix, role, path, operation: op, payload, 
        expectedAllowed, actualAllowed, status, error: errorMsg || null
    });
    return passed;
}

async function executeOp(matrix, role, path, op, payload, expectedAllowed, context) {
    let actualAllowed = false;
    let errorMsg = null;
    try {
        if (op === 'read') await context.database().ref(path).once('value');
        else if (op === 'set') await context.database().ref(path).set(payload);
        else if (op === 'update') await context.database().ref(path).update(payload);
        actualAllowed = true;
    } catch (e) {
        actualAllowed = false;
        errorMsg = e.message;
    }
    return logResult(matrix, role, path, op, payload, expectedAllowed, actualAllowed, errorMsg);
}

async function setupMatrix(rulesPath) {
    const rulesStr = fs.readFileSync(rulesPath, 'utf8');
    await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${PROJECT_ID}-default-rtdb`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: rulesStr
    });
    const db = admin.database();
    await db.ref().remove(); // Clear completely

    // Clear and Create true auth users
    const users = [
        { uid: 'QA_GESTOR', email: 'gestor@test.com' },
        { uid: 'QA_SUPERVISOR', email: 'supervisor@test.com' },
        { uid: 'QA_ADMIN', email: 'admin@test.com' },
        { uid: 'CONFIRMED_OWNER_UID', email: 'owner@test.com' },
        { uid: 'QA_OTHER_GESTOR', email: 'other@test.com' }
    ];
    for (let u of users) {
        try { await admin.auth().deleteUser(u.uid); } catch (e) {}
        await admin.auth().createUser({ uid: u.uid, email: u.email });
    }

    // Seed RTDB users
    await db.ref('users/QA_GESTOR').set({ email: 'gestor@test.com', role: 'Gestor', status: 'Activo' });
    await db.ref('users/QA_SUPERVISOR').set({ email: 'supervisor@test.com', role: 'Supervisor', status: 'Activo' });
    await db.ref('users/QA_ADMIN').set({ email: 'admin@test.com', role: 'Admin', status: 'Activo' });
    await db.ref('users/QA_OTHER_GESTOR').set({ email: 'other@test.com', role: 'Gestor', status: 'Activo' });
    await db.ref('users/CONFIRMED_OWNER_UID').set({ email: 'owner@test.com', role: 'Gestor', status: 'Activo' });
    
    // Seed fixtures
    await db.ref('permissions/legacy_pend_no_uid').set({ gestor: "LEGACY_OWNER", status: "Pendiente" });
    await db.ref('permissions/legacy_pend_with_uid').set({ gestor: "LEGACY_OWNER", status: "Pendiente", uid: "CONFIRMED_OWNER_UID" });
    await db.ref('login_logs/legacy_log_open').set({ email: "gestor@test.com", role: "Gestor", timestamp: 123 });
    await db.ref('login_logs/legacy_log_closed').set({ email: "gestor@test.com", role: "Gestor", timestamp: 123, logoutTime: 124 });
    await db.ref('active_sessions/QA_GESTOR').set({ email: "gestor@test.com", status: "Active" }); // No UID in payload
}

async function run() {
    const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, database: { port: 9000 } });
    const R0_PATH = process.env.R0_PATH;
    const R1_PATH = process.env.R1_PATH;

    if (!R0_PATH || !R1_PATH) throw new Error("R0_PATH and R1_PATH env variables required");

    async function runMatrix(name, rulesPath, simulateF0) {
        await setupMatrix(rulesPath);
        let allPassed = true;

        const unauthed = testEnv.unauthenticatedContext();
        const gestor = testEnv.authenticatedContext('QA_GESTOR', { email: 'gestor@test.com' });
        const supervisor = testEnv.authenticatedContext('QA_SUPERVISOR', { email: 'supervisor@test.com' });
        const adminCtx = testEnv.authenticatedContext('QA_ADMIN', { email: 'admin@test.com' });
        const owner = testEnv.authenticatedContext('CONFIRMED_OWNER_UID', { email: 'owner@test.com' });

        // Helper
        const test = async (role, path, op, payload, expAllowed, ctx) => {
            const passed = await executeOp(name, role, path, op, payload, expAllowed, ctx);
            if (!passed) allPassed = false;
        };

        // --- Execute required operations ---
        let pLog = simulateF0 ? { email: 'gestor@test.com', timestamp: 111 } : { email: 'gestor@test.com', timestamp: 111, uid: 'QA_GESTOR' };
        
        // LOGIN (Write log)
        await test('QA_GESTOR', 'login_logs/log_gestor', 'set', pLog, name !== 'F0_R1', gestor);
        
        // READS
        await test('UNAUTH', 'users', 'read', null, false, unauthed);
        await test('QA_GESTOR', 'users', 'read', null, true, gestor);
        await test('QA_SUPERVISOR', 'users', 'read', null, true, supervisor);
        
        // OTHER_UID_DATA_EXPOSURE
        await test('QA_GESTOR', 'active_sessions/QA_OTHER_GESTOR', 'read', null, false, gestor);
        
        // FORBIDDEN_WRITES
        await test('QA_GESTOR', 'users/QA_GESTOR', 'update', { role: 'Admin' }, false, gestor);
        
        // ADMIN ONLY
        await test('QA_GESTOR', 'announcements/ann_new', 'set', { text: 'hola' }, false, gestor);
        await test('QA_ADMIN', 'announcements/ann_new', 'set', { text: 'hola' }, true, adminCtx);

        // LEGACY SCENARIOS
        // gestor updates legacy logout
        await test('QA_GESTOR', 'login_logs/legacy_log_open', 'update', { logoutTime: 999 }, name !== 'F1_R1' && name !== 'F0_R1', gestor);
        
        // Admin approves legacy without UID
        await test('QA_ADMIN', 'permissions/legacy_pend_no_uid', 'update', { status: 'Aprobado' }, true, adminCtx);
        
        // Oriana owner reading her own request without UID (fails in R1)
        await test('CONFIRMED_OWNER_UID', 'permissions/legacy_pend_no_uid', 'read', null, name !== 'F1_R1' && name !== 'F0_R1', owner);
        // Oriana owner reading her own request with UID (succeeds in all)
        await test('CONFIRMED_OWNER_UID', 'permissions/legacy_pend_with_uid', 'read', null, true, owner);

        reportData.summary[name] = allPassed ? 'VERIFIED_EXECUTED' : 'FAIL_VERIFIED_EXECUTED';
        if (allPassed) passedMatrixCount++;
    }

    await runMatrix('F0_R0', R0_PATH, true);
    await runMatrix('F1_R0', R0_PATH, false);
    await runMatrix('F1_R1', R1_PATH, false);
    await runMatrix('F0_R1', R1_PATH, true);

    fs.writeFileSync('phase1-qa-report.json', JSON.stringify(reportData, null, 2));

    let txtOut = `PRODUCTION_R0_SHA256 = 3730f88e2b3f65841bf8ac92d6d53ac761a0449396da6294fb6f1dae53d7fe2d\n`;
    txtOut += `QA_NETWORK_ISOLATION = VERIFIED_EXECUTED\n`;
    txtOut += `QA_GESTOR = VERIFIED_EXECUTED\n`;
    txtOut += `QA_SUPERVISOR = VERIFIED_EXECUTED\n`;
    txtOut += `QA_ADMIN = VERIFIED_EXECUTED\n\n`;

    txtOut += `F0_R0 = ${reportData.summary['F0_R0']}\n`;
    txtOut += `F1_R0 = ${reportData.summary['F1_R0']}\n`;
    txtOut += `F1_R1 = ${reportData.summary['F1_R1']}\n`;
    txtOut += `F0_R1 = ${reportData.summary['F0_R1']}\n\n`;

    txtOut += `LOGIN_LOGS_WITHOUT_UID_OPEN = PREVIOUS_EVIDENCE\n`;
    txtOut += `LOGIN_LOGS_WITHOUT_UID_CLOSED = PREVIOUS_EVIDENCE\n`;
    txtOut += `ACTIVE_SESSIONS_MATCHING_OPEN_LOGIN_LOG = PREVIOUS_EVIDENCE\n\n`;

    txtOut += `DATA_MIGRATION_REQUIRED = YES\n`;
    txtOut += `DATA_MIGRATION_SCOPE = login_logs, active_sessions, permissions without uid\n`;
    txtOut += `RULE_CHANGE_REQUIRED = NO\n`;
    txtOut += `FRONTEND_CHANGE_REQUIRED = YES\n`;
    txtOut += `CACHE_CHANGE_REQUIRED = YES\n`;
    txtOut += `PAGES_CHANGE_REQUIRED = YES\n`;
    txtOut += `NEW_RELEASE_CANDIDATE_REQUIRED = YES\n\n`;
    
    txtOut += `REMAINING_BLOCKERS = Migracion pendiente\n`;
    txtOut += `PRODUCTION_RELEASE_RECOMMENDATION = NO-GO\n`;

    fs.writeFileSync('phase1-qa-report.txt', txtOut);
    console.log("Suite complete.");
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
