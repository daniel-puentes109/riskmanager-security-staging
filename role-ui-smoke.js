const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

assert.match(
  appSource,
  /if \(currentUser && currentUser\.role === 'Admin'\) \{\s*renderPendingUsers\(\);\s*\}\s*renderPendingPermissions\(\);/,
  'Supervisor must not trigger the Admin-only pending-user renderer.'
);

assert.match(
  appSource,
  /if \(currentUser\.role === 'Admin'\) \{\s*renderPendingUsers\(\);\s*\}\s*const notifList/,
  'Initial user-management rendering must only run for Admin.'
);

assert.match(
  appSource,
  /const isAdmin = currentUser\.role === 'Admin';[\s\S]*?\[userSectionTitle, userFilterPanel, userTablePanel\]\.forEach\([\s\S]*?element\.style\.display = isAdmin \? '' : 'none';/,
  'User and role management controls must be hidden for non-Admin roles.'
);

assert.match(
  appSource,
  /if \(currentUser\.role === 'Supervisor'\) \{\s*navComunicados\.style\.display = 'flex';\s*sidebarNav\.appendChild\(navComunicados\);/,
  'Supervisor must receive the read-only announcements view.'
);

assert.match(
  appSource,
  /if \(currentUser\.role === 'Admin'\) \{\s*navAdminComunicados\.style\.display = 'flex';\s*adminNavGroup\.appendChild\(navAdminComunicados\);\s*\} else \{\s*navAdminComunicados\.style\.display = 'none';/,
  'Announcement writing controls must only be active for Admin.'
);

assert.match(
  appSource,
  /if \(navAprobaciones\) \{ navAprobaciones\.style\.display = 'flex'; adminNavGroup\.appendChild\(navAprobaciones\); \}/,
  'Supervisor and Admin must retain the permissions supervision view.'
);

console.log('SUPERVISOR_UI_ALIGNMENT=PASS');
console.log('ADMIN_WRITE_CONTROLS=PASS');
console.log('GESTOR_ADMIN_CONTROLS=PASS');
