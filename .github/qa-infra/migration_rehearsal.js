function normalizeIdentity(value) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return normalized || null;
}

function addToIndex(index, value, uid) {
  const key = normalizeIdentity(value);
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(uid);
}

function buildIdentityIndex(users) {
  const byName = new Map();
  const byEmail = new Map();
  for (const [uid, user] of Object.entries(users || {})) {
    addToIndex(byName, user && user.name, uid);
    addToIndex(byEmail, user && user.email, uid);
  }
  return { byName, byEmail };
}

function lookup(index, value) {
  const key = normalizeIdentity(value);
  return key && index.has(key) ? new Set(index.get(key)) : new Set();
}

function intersect(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function resolveIdentity(record, index, nameFields) {
  const evidence = [];
  if (record && record.email) evidence.push(lookup(index.byEmail, record.email));
  for (const field of nameFields) {
    if (record && record[field]) evidence.push(lookup(index.byName, record[field]));
  }
  if (!evidence.length || evidence.some((set) => set.size === 0)) {
    return { uid: null, reason: 'NO_MATCH' };
  }
  const candidates = evidence.slice(1).reduce(intersect, evidence[0]);
  if (candidates.size === 1) return { uid: [...candidates][0], reason: 'UNIQUE_MATCH' };
  return { uid: null, reason: candidates.size > 1 ? 'AMBIGUOUS' : 'CONFLICTING_EVIDENCE' };
}

function activeSessionSupports(uid, log, users, activeSessions) {
  const session = activeSessions && activeSessions[uid];
  const user = users && users[uid];
  if (!session || !user) return false;

  const comparisons = [
    [log && log.email, session.email || user.email],
    [log && (log.name || log.gestor), session.name || session.gestor || user.name],
  ].filter(([left]) => normalizeIdentity(left));

  return comparisons.length > 0 && comparisons.every(([left, right]) => (
    normalizeIdentity(left) === normalizeIdentity(right)
  ));
}

function addSkipped(plan, pathGroup, id, reason) {
  plan.skipped.push({ pathGroup, id, reason });
  plan.counts.skipped += 1;
  if (reason === 'AMBIGUOUS' || reason === 'CONFLICTING_EVIDENCE') plan.counts.ambiguous += 1;
  else plan.counts.unmatched += 1;
}

function planUidMigration(state) {
  const users = state.users || {};
  const permissions = state.permissions || {};
  const loginLogs = state.login_logs || {};
  const activeSessions = state.active_sessions || {};
  const index = buildIdentityIndex(users);
  const plan = {
    updates: {},
    selected: [],
    skipped: [],
    counts: {
      permissions: 0,
      loginLogsOpen: 0,
      loginLogsClosed: 0,
      selected: 0,
      skipped: 0,
      ambiguous: 0,
      unmatched: 0,
      activeSessionsWithoutPayloadUid: Object.values(activeSessions)
        .filter((session) => session && !session.uid).length,
    },
  };

  for (const [id, permission] of Object.entries(permissions)) {
    if (!permission || permission.uid) continue;
    const resolution = resolveIdentity(permission, index, ['gestor', 'name']);
    if (!resolution.uid) {
      addSkipped(plan, 'permissions', id, resolution.reason);
      continue;
    }
    plan.updates[`permissions/${id}/uid`] = resolution.uid;
    plan.selected.push({ pathGroup: 'permissions', id, evidence: 'UNIQUE_IDENTITY' });
    plan.counts.permissions += 1;
  }

  for (const [id, log] of Object.entries(loginLogs)) {
    if (!log || log.uid) continue;
    const resolution = resolveIdentity(log, index, ['name', 'gestor']);
    if (!resolution.uid) {
      addSkipped(plan, 'login_logs', id, resolution.reason);
      continue;
    }
    const isOpen = log.logoutTime === null || typeof log.logoutTime === 'undefined';
    if (isOpen && !activeSessionSupports(resolution.uid, log, users, activeSessions)) {
      addSkipped(plan, 'login_logs', id, 'OPEN_LOG_WITHOUT_MATCHING_ACTIVE_SESSION');
      continue;
    }
    plan.updates[`login_logs/${id}/uid`] = resolution.uid;
    plan.selected.push({
      pathGroup: 'login_logs',
      id,
      evidence: isOpen ? 'UNIQUE_IDENTITY_AND_ACTIVE_SESSION' : 'UNIQUE_IDENTITY',
    });
    if (isOpen) plan.counts.loginLogsOpen += 1;
    else plan.counts.loginLogsClosed += 1;
  }

  plan.counts.selected = plan.selected.length;
  return plan;
}

module.exports = {
  normalizeIdentity,
  planUidMigration,
};
