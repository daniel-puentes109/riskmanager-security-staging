// XSS Sanitizer Helper
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

// Encode dynamic values before placing them inside single-quoted inline handlers.
// encodeURIComponent intentionally leaves apostrophes untouched, so encode them too.
function encodeInlineHandlerArg(value) {
    return encodeURIComponent(String(value)).replace(/'/g, '%27');
}

const ANNOUNCEMENT_ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a']);
const ANNOUNCEMENT_DROP_CONTENT_TAGS = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'
]);

function sanitizeAnnouncementHref(value) {
    if (!value) return '';

    const trimmed = String(value).trim();
    const normalized = trimmed.replace(/[\u0000-\u0020\u007F]+/g, '');
    if (!normalized || normalized.startsWith('//')) return '';

    const schemeMatch = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch && !['http', 'https', 'mailto'].includes(schemeMatch[1].toLowerCase())) {
        return '';
    }

    return trimmed;
}

function sanitizeAnnouncementHTML(value) {
    if (value === null || value === undefined) return '';

    const template = document.createElement('template');
    template.innerHTML = String(value);
    const output = document.createElement('div');
    const tagAliases = { b: 'strong', i: 'em', div: 'p' };

    function appendSanitizedNode(sourceNode, targetParent) {
        if (sourceNode.nodeType === Node.TEXT_NODE) {
            targetParent.appendChild(document.createTextNode(sourceNode.textContent || ''));
            return;
        }

        if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;

        const sourceTag = sourceNode.tagName.toLowerCase();
        if (ANNOUNCEMENT_DROP_CONTENT_TAGS.has(sourceTag)) return;

        const cleanTag = tagAliases[sourceTag] || sourceTag;
        if (!ANNOUNCEMENT_ALLOWED_TAGS.has(cleanTag)) {
            Array.from(sourceNode.childNodes).forEach(child => appendSanitizedNode(child, targetParent));
            return;
        }

        const cleanNode = document.createElement(cleanTag);
        if (cleanTag === 'a') {
            const safeHref = sanitizeAnnouncementHref(sourceNode.getAttribute('href'));
            if (safeHref) cleanNode.setAttribute('href', safeHref);
        }

        Array.from(sourceNode.childNodes).forEach(child => appendSanitizedNode(child, cleanNode));
        targetParent.appendChild(cleanNode);
    }

    Array.from(template.content.childNodes).forEach(node => appendSanitizedNode(node, output));
    return output.innerHTML;
}
window.sanitizeAnnouncementHTML = sanitizeAnnouncementHTML;

// Auth Check
const currentUserObj = localStorage.getItem('riskOps_currentUser');
if (!currentUserObj && !window.location.href.includes('login.html')) {
    window.location.href = 'login.html';
}

let currentUser = null;
let currentTaskRef = null;
let activeSessionRef = null;

// Helper Functions for Custom Multi-Select Dropdowns
function setupCustomMultiSelect(containerId, optionsList, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selectedValues = new Set();

    container.innerHTML = `
        <div class="custom-multiselect-btn" tabindex="0">
            <span class="multiselect-label">Todos los gestores</span>
            <i class='bx bx-chevron-down'></i>
        </div>
        <div class="custom-multiselect-dropdown">
            <div class="custom-multiselect-actions">
                <button type="button" class="btn-select-all">Seleccionar Todos</button>
                <button type="button" class="btn-clear-all">Desmarcar Todos</button>
            </div>
            <div style="padding: 4px 6px; margin-bottom: 6px;">
                <input type="text" placeholder="Buscar gestor..." class="multiselect-search-input modern-input" style="width: 100%; height: 32px; font-size: 12px; padding: 4px 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            </div>
            <div class="multiselect-options-list"></div>
        </div>
    `;

    const trigger = container.querySelector('.custom-multiselect-btn');
    const menu = container.querySelector('.custom-multiselect-dropdown');
    const labelSpan = container.querySelector('.multiselect-label');
    const optionsListEl = container.querySelector('.multiselect-options-list');
    const searchInput = container.querySelector('.multiselect-search-input');
    const btnSelectAll = container.querySelector('.btn-select-all');
    const btnClearAll = container.querySelector('.btn-clear-all');

    function updateLabel() {
        if (selectedValues.size === 0 || selectedValues.size === optionsList.length) {
            labelSpan.textContent = "Todos los gestores";
        } else if (selectedValues.size === 1) {
            labelSpan.textContent = Array.from(selectedValues)[0];
        } else {
            labelSpan.textContent = `${selectedValues.size} gestores seleccionados`;
        }
    }

    function renderOptions(filter = "") {
        optionsListEl.innerHTML = "";
        const cleanFilter = filter.toLowerCase().trim();
        optionsList.forEach(opt => {
            if (cleanFilter && !opt.toLowerCase().includes(cleanFilter)) return;

            const item = document.createElement('label');
            item.className = 'custom-multiselect-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = opt;
            checkbox.checked = selectedValues.has(opt);

            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedValues.add(opt);
                } else {
                    selectedValues.delete(opt);
                }
                updateLabel();
                if (onChangeCallback) onChangeCallback(Array.from(selectedValues));
            });

            const span = document.createElement('span');
            span.textContent = opt;

            item.appendChild(checkbox);
            item.appendChild(span);
            optionsListEl.appendChild(item);
        });
    }

    renderOptions();
    updateLabel();

    // Toggle menu
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        document.querySelectorAll('.custom-multiselect').forEach(m => m.classList.remove('open'));
        if (!isOpen) {
            container.classList.add('open');
            if (searchInput) searchInput.focus();
        }
    };

    if (searchInput) {
        searchInput.oninput = (e) => {
            renderOptions(e.target.value);
        };
        searchInput.onclick = (e) => e.stopPropagation();
    }

    btnSelectAll.onclick = (e) => {
        e.stopPropagation();
        optionsList.forEach(opt => selectedValues.add(opt));
        renderOptions(searchInput ? searchInput.value : "");
        updateLabel();
        if (onChangeCallback) onChangeCallback(Array.from(selectedValues));
    };

    btnClearAll.onclick = (e) => {
        e.stopPropagation();
        selectedValues.clear();
        renderOptions(searchInput ? searchInput.value : "");
        updateLabel();
        if (onChangeCallback) onChangeCallback(Array.from(selectedValues));
    };

    // Close on outside click
    if (!container._outsideClickListenerAdded) {
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('open');
            }
        });
        container._outsideClickListenerAdded = true;
    }

    container._selectedValuesRef = selectedValues;
    container._setValues = (newValuesArray) => {
        selectedValues.clear();
        newValuesArray.forEach(v => selectedValues.add(v));
        renderOptions(searchInput ? searchInput.value : "");
        updateLabel();
    };
}

function getSelectedMultiSelectValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !container._selectedValuesRef) return [];
    return Array.from(container._selectedValuesRef);
}

function resetCustomMultiSelect(containerId) {
    const container = document.getElementById(containerId);
    if (container && container._selectedValuesRef) {
        container._selectedValuesRef.clear();
        if (container._setValues) container._setValues([]);
    }
}

function setCustomMultiSelectValues(containerId, newValuesArray) {
    const container = document.getElementById(containerId);
    if (container && container._setValues) {
        container._setValues(newValuesArray);
    }
}

// --- INACTIVITY & LUNCH TRACKING GLOBALS ---
let lastLocalActivityTimestamp = Date.now();
let lastSyncLoopTimestamp = Date.now();
let isLunchBreak = false;
let lunchStartTime = null;
let totalLunchTimeMs = 0;
let isBreakfastBreak = false;
let breakfastStartTime = null;
let totalBreakfastTimeMs = 0;
let globalIdleState = false; // Tracks if the OS/PC is idle or locked via IdleDetector

function saveBreakState() {
    localStorage.setItem('riskOps_breakState', JSON.stringify({
        isLunchBreak, lunchStartTime, totalLunchTimeMs,
        isBreakfastBreak, breakfastStartTime, totalBreakfastTimeMs
    }));
}

function loadBreakState() {
    try {
        const savedState = localStorage.getItem('riskOps_breakState');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            isLunchBreak = parsed.isLunchBreak || false;
            lunchStartTime = parsed.lunchStartTime || null;
            totalLunchTimeMs = parsed.totalLunchTimeMs || 0;
            isBreakfastBreak = parsed.isBreakfastBreak || false;
            breakfastStartTime = parsed.breakfastStartTime || null;
            totalBreakfastTimeMs = parsed.totalBreakfastTimeMs || 0;
        }
    } catch(e) {}
}

loadBreakState();

window.addEventListener('storage', (e) => {
    if (e.key === 'riskOps_breakState') {
        loadBreakState();
    }
});

let shiftTimeline = [];
let localStatus = 'En Línea';

try {
    const savedTimeline = localStorage.getItem('riskOps_timeline');
    if (savedTimeline) {
        shiftTimeline = JSON.parse(savedTimeline);
        let changed = false;
        
        // Limpiador automático: Eliminar eventos de Inactividad que se crucen con Almuerzo o Desayuno
        const breaks = shiftTimeline.filter(e => e.type === 'Almuerzo' || e.type === 'Desayuno');
        const originalLength = shiftTimeline.length;
        shiftTimeline = shiftTimeline.filter(e => {
            if (e.type !== 'Inactividad') return true;
            let eStart = e.start;
            let eEnd = e.end || Date.now();
            // Ignorar inactividades inválidas o duraciones menores a 30 segundos
            if (eEnd - eStart < 30000) return false;
            let overlaps = breaks.some(b => {
                let bStart = b.start;
                let bEnd = b.end || Date.now();
                return (eStart < bEnd && eEnd > bStart);
            });
            return !overlaps;
        });
        if (shiftTimeline.length !== originalLength) changed = true;

        shiftTimeline.forEach(ev => {
            if (ev.type === 'Inactividad' && ev.end === null) {
                ev.end = Date.now();
                changed = true;
            }
        });
        if (changed) {
            localStorage.setItem('riskOps_timeline', JSON.stringify(shiftTimeline));
        }
    }
} catch(e) {}

function pushTimelineEvent(type, action) {
    const now = Date.now();
    if (action === 'start') {
        // Cerrar cualquier evento sin finalizar antes de iniciar uno nuevo
        shiftTimeline.forEach(ev => {
            if (ev.end === null) ev.end = now;
        });
        shiftTimeline.push({ type, start: now, end: null });
    } else if (action === 'end') {
        for (let i = shiftTimeline.length - 1; i >= 0; i--) {
            if (shiftTimeline[i].type === type && shiftTimeline[i].end === null) {
                shiftTimeline[i].end = now;
                break;
            }
        }
    }
    localStorage.setItem('riskOps_timeline', JSON.stringify(shiftTimeline));
}

let screenLockTimer = null;

async function checkAndStartIdleDetector() {
    if ('IdleDetector' in window) {
        try {
            const status = await navigator.permissions.query({ name: 'idle-detection' });
            if (status.state === 'granted') {
                window.idleDetectorGranted = true;
                startIdleDetectorLogic();
            }
        } catch (e) {
            console.error('Permission query error:', e);
        }
    }
}

async function requestIdlePermission() {
    if ('IdleDetector' in window) {
        try {
            const state = await IdleDetector.requestPermission();
            if (state === 'granted') {
                window.idleDetectorGranted = true;
                startIdleDetectorLogic();
            } else {
                const warningBanner = document.getElementById('idleDetectorWarning');
                if (warningBanner) warningBanner.style.display = 'flex';
            }
        } catch (e) {
            console.error('Request permission error:', e);
            const warningBanner = document.getElementById('idleDetectorWarning');
            if (warningBanner) warningBanner.style.display = 'flex';
        }
    }
}

async function startIdleDetectorLogic() {
    if (window.idleDetectorStarted) return;
    window.idleDetectorStarted = true;
    
    const idleDetector = new IdleDetector();
    idleDetector.addEventListener('change', () => {
        const isLocked = idleDetector.screenState === 'locked';
        const isIdle = idleDetector.userState === 'idle';
        
        if (isLocked) {
            if (!screenLockTimer) {
                screenLockTimer = setTimeout(() => {
                    globalIdleState = true;
                    applyIdleStateChange();
                }, 10000);
            }
        } else if (isIdle) {
            globalIdleState = true;
            applyIdleStateChange();
        } else {
            if (screenLockTimer) {
                clearTimeout(screenLockTimer);
                screenLockTimer = null;
            }
            globalIdleState = false;
            applyIdleStateChange();
        }
    });
    
    try {
        await idleDetector.start({ threshold: 3 * 60 * 1000 }); // 3 minutos
        const warningBanner = document.getElementById('idleDetectorWarning');
        if (warningBanner) warningBanner.style.display = 'none';
    } catch (e) {
        console.error('IdleDetector start failed:', e);
    }
}

function applyIdleStateChange() {
    loadBreakState();
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Gestor') {
        if (isLunchBreak || isBreakfastBreak) return;

        if (globalIdleState && currentUser.status === 'Activo') {
            currentUser.status = 'Inactivo';
            if (typeof database !== 'undefined') database.ref(`users/${currentUser.uid}/status`).set('Inactivo');
            if (typeof updateStatusDisplay === 'function') updateStatusDisplay();
            if (typeof syncActiveSessionToFirebase === 'function') syncActiveSessionToFirebase();
        } else if (!globalIdleState && currentUser.status === 'Inactivo') {
            currentUser.status = 'Activo';
            lastLocalActivityTimestamp = Date.now();
            if (typeof database !== 'undefined') database.ref(`users/${currentUser.uid}/status`).set('Activo');
            if (typeof updateStatusDisplay === 'function') updateStatusDisplay();
            if (typeof syncActiveSessionToFirebase === 'function') syncActiveSessionToFirebase();
        }
    }
}

checkAndStartIdleDetector();

window.requestIdlePermissionManual = function() {
    requestIdlePermission().then(() => {
        if (window.idleDetectorGranted) {
            alert("¡Permiso otorgado! RiskOps ahora podrá registrar tu inactividad correctamente.");
        } else {
            alert("El permiso sigue denegado. Por favor haz clic en el icono del candado junto a la URL en tu navegador y permite 'Conocer cuando usas tu dispositivo'.");
        }
    });
};

document.addEventListener('click', () => {
    if (!window.idleDetectorGranted && !window.idleDetectorRequested) {
        window.idleDetectorRequested = true;
        requestIdlePermission();
    }
}, { once: true });

// Activity listeners
function updateActivity() {
    loadBreakState();
    const now = Date.now();
    const timeSinceLast = now - lastLocalActivityTimestamp;
    lastLocalActivityTimestamp = now;
    
    // Si somos Gestor y estábamos inactivos, volver a Activo inmediatamente
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Gestor') {
        const INACTIVE_THRESHOLD = 3 * 60 * 1000;
        
        // Si ya estábamos marcados inactivos localmente, o pasó más tiempo del umbral en silencio (browser throttling)
        if (currentUser.status === 'Inactivo' || timeSinceLast > INACTIVE_THRESHOLD) {
            currentUser.status = 'Activo';
            if (typeof database !== 'undefined') {
                database.ref(`users/${currentUser.uid}/status`).set('Activo');
            }
            if (typeof updateStatusDisplay === 'function') updateStatusDisplay();
            if (typeof syncActiveSessionToFirebase === 'function') syncActiveSessionToFirebase();
        }
    }
}
document.addEventListener('mousemove', updateActivity);
document.addEventListener('keydown', updateActivity);
document.addEventListener('click', updateActivity);
document.addEventListener('scroll', updateActivity);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateActivity();
    }
});

// Fast checker loop to apply 10s inactivity exactly on time
setInterval(() => {
    loadBreakState();
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Gestor') {
        if (window.idleDetectorGranted) return; // Si hay detector nativo, no usar el fallback
        
        const timeSinceLastActivity = Date.now() - lastLocalActivityTimestamp;
        const INACTIVE_THRESHOLD = 3 * 60 * 1000; // 3 min fallback
        
        // Si superamos el umbral y aún estamos marcados como Activos
        if (timeSinceLastActivity > INACTIVE_THRESHOLD && currentUser.status === 'Activo') {
            // Ignorar si está en pausa global o breaks
            if (typeof globalIdleState !== 'undefined' && globalIdleState) return;
            if (typeof isLunchBreak !== 'undefined' && isLunchBreak) return;
            if (typeof isBreakfastBreak !== 'undefined' && isBreakfastBreak) return;

            currentUser.status = 'Inactivo';
            if (typeof database !== 'undefined') {
                database.ref(`users/${currentUser.uid}/status`).set('Inactivo');
            }
            if (typeof updateStatusDisplay === 'function') updateStatusDisplay();
            if (typeof syncActiveSessionToFirebase === 'function') syncActiveSessionToFirebase();
        }
    }
}, 1000);

try {
    currentUser = currentUserObj ? JSON.parse(currentUserObj) : null;
    if (currentUser) {
        if (!currentUser.status) currentUser.status = 'Activo';
        // Mobile / Role handling
        if (window.innerWidth <= 768) {
            if (['Admin', 'Supervisor'].includes(currentUser.role)) {
                // Admin/Supervisor: hide mobile blocker and allow horizontal scroll
                const mob = document.getElementById('mobileBlocker');
                if (mob) mob.style.display = 'none';
                document.documentElement.style.overflowX = 'auto';
                document.body.style.minWidth = '1200px';
                document.body.style.overflowX = 'auto';
            } else {
                // Gestor: enforce mobile block
                const enforceMobileBlock = () => {
                    const mob = document.getElementById('mobileBlocker');
                    if (mob) mob.style.display = 'flex';
                    const app = document.querySelector('.app-container');
                    if (app) app.style.display = 'none';
                };
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', enforceMobileBlock);
                } else {
                    enforceMobileBlock();
                }
            }
        }
        // (Old visibilitychange logic removed, handled by new interval and mouse events)


        if (currentUser.loginLogId) {
            // Eliminar cualquier falso logoutTime que se haya generado si el usuario simplemente refrescó la página (F5) o perdió red temporalmente
            database.ref(`login_logs/${currentUser.loginLogId}/logoutTime`).remove();
            
            database.ref(`login_logs/${currentUser.loginLogId}`).onDisconnect().update({
                logoutTime: firebase.database.ServerValue.TIMESTAMP
            });
        }
        if (currentUser.uid && currentUser.role === 'Gestor') {
            // We removed the aggressive onDisconnect hook because it was triggering falsely when Chrome paused the background tab
            // The admin dashboard's 2-minute lastActive timeout serves as a perfect fallback if the user actually closes the tab
            
            // --- PATCH CLEAR FALSE INACTIVITY (JUNE 17 3PM & 7PM SHIFTS) ---
            if (!localStorage.getItem('inactivity_cleared_june17_v1')) {
                if (currentUser.shift === '3pm - 11pm' || currentUser.shift === '7pm - 2am') {
                    let tStr = localStorage.getItem('riskOps_timeline');
                    if (tStr) {
                        let t = JSON.parse(tStr);
                        t = t.filter(ev => ev.type !== 'Inactividad');
                        localStorage.setItem('riskOps_timeline', JSON.stringify(t));
                        if (typeof shiftTimeline !== 'undefined') shiftTimeline = t;
                    }
                    localStorage.setItem('inactivity_cleared_june17_v1', 'true');
                }
            }
            // -------------------------------------
        }
    }
    

    
} catch(e) {
    localStorage.removeItem('riskOps_currentUser');
    window.location.href = 'login.html';
}
let globalScheduleRows = null;
let globalScheduleBlocks = null;
// Helper to remove accents and normalize names for comparison and file paths
function normalizeName(name) {
    if (!name) return "";
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// Robust comparison to prevent greedy matching across similar names and support both parameter orders
function namesMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let parts1 = normalizeName(name1).split(' ').filter(p => p.length > 2);
    let parts2 = normalizeName(name2).split(' ').filter(p => p.length > 2);
    
    if (parts1.length === 0 || parts2.length === 0) return false;

    // Identificar cuál es el nombre corto y cuál es el largo
    const [shorter, longer] = parts1.length <= parts2.length ? [parts1, parts2] : [parts2, parts1];

    // Si el nombre corto tiene varias palabras (Ej: "Sebastian Arango"), el largo debe tenerlas TODAS.
    if (shorter.length > 1) {
        return shorter.every(p => longer.includes(p));
    }
    
    // Si el nombre corto es una sola palabra ("Daniel", "Alejandra"):
    const pShort = shorter[0];
    
    // Prevenir que Josue (Josue Daniel) herede lo de Daniel
    if (pShort === 'daniel' && longer.includes('josue')) return false;
    
    // Si la única palabra del corto coincide con la primera palabra del largo, es un match seguro
    if (longer[0] === pShort) return true;
    
    // De lo contrario, permitimos coincidencia si está en otra parte (ej: "Alejandra" en "Marilyn Alejandra")
    return longer.includes(pShort);
}

// Helpers for date calculations in schedules
function excelToJSDate(serial) {
    if(!serial || isNaN(serial)) return null;
    const epochUTC = Date.UTC(1899, 11, 30);
    return new Date(epochUTC + serial * 86400000);
}

function isSameDate(excelDate, jsDate) {
    if (!excelDate || !jsDate) return false;
    // Compare the UTC date from Excel (which is timezone-naive) with the browser's local date
    return excelDate.getUTCDate()   === jsDate.getDate() &&
           excelDate.getUTCMonth()  === jsDate.getMonth() &&
           excelDate.getUTCFullYear() === jsDate.getFullYear();
}

function getShiftCategory(shiftText) {
    if (!shiftText) return "";
    const clean = shiftText.trim().toLowerCase();
    
    // Exact or partial category matches
    if (clean.includes("manana") || clean.includes("mañana")) return "Mañana";
    if (clean.includes("tarde")) return "Tarde";
    if (clean.includes("noche")) return "Noche";
    if (clean.includes("master")) return "Master";
    
    // Parse time ranges (e.g. "8am - 4pm", "3pm - 11pm", "10pm - 6am")
    // Match the starting hour
    const match = clean.match(/^(\d+)\s*(am|pm)/i);
    if (match) {
        let hour = parseInt(match[1]);
        const ampm = match[2].toLowerCase();
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        // Define classifications based on starting hour
        if (hour >= 6 && hour < 14) return "Mañana";
        if (hour >= 14 && hour < 22) return "Tarde";
        return "Noche";
    }
    
    return "";
}

function cleanText(text) {
    if (!text || typeof text !== 'string') return "";
    let cleaned = text.toLowerCase();
    cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    cleaned = cleaned.replace(/[^a-z0-9\s]/g, " ");
    cleaned = cleaned.split(/\s+/).join(" ").trim();
    return cleaned;
}

function normalizeTaskName(name) {
    const cleaned = cleanText(name);
    if (cleaned.includes("conciliacion de pasarelas")) {
        return "conciliacion de pasarelas";
    }
    if (cleaned.includes("revision de billetera") || cleaned.includes("billetera usuarios")) {
        return "revision de billetera usuarios pdv";
    }
    if (cleaned.includes("revision de eventos") || cleaned.includes("revision de evento")) {
        return "revision de eventos";
    }
    return cleaned;
}

function taskNamesMatch(cronTask, masterTask) {
    if (!cronTask || !masterTask) return false;
    const normCron = normalizeTaskName(cronTask);
    const normMaster = normalizeTaskName(masterTask);
    return normCron === normMaster || normMaster.includes(normCron) || normCron.includes(normMaster);
}

function setNamesMatch(set1, set2) {
    if (!set1 || !set2) return false;
    const s1 = cleanText(set1);
    const s2 = cleanText(set2);
    return s1 === s2 || s1.includes(s2) || s2.includes(s1);
}

const MONTHS_MAP = {
    "ene": 0, "enero": 0,
    "feb": 1, "febrero": 1,
    "mar": 2, "marzo": 2,
    "abr": 3, "abril": 3,
    "may": 4, "mayo": 4,
    "jun": 5, "junio": 5,
    "jul": 6, "julio": 6,
    "ago": 7, "agosto": 7,
    "sep": 8, "set": 8, "septiembre": 8,
    "oct": 9, "octubre": 9,
    "nov": 10, "noviembre": 10,
    "dic": 11, "diciembre": 11
};

function parseSheetRange(sheetName, year = 2026, fallbackMonth = 0) {
    if (!sheetName) return null;
    let clean = sheetName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    let m = clean.match(/Semana\s+\d+\s*-\s*(\d+)\s+(?:de\s+)?(\w+)\s+(?:al|a|-)\s+(\d+)\s+(?:de\s+)?(\w+)/i);
    if (m) {
        let startDay = parseInt(m[1], 10);
        let startMStr = m[2].substring(0, 3).toLowerCase();
        let endDay = parseInt(m[3], 10);
        let endMStr = m[4].substring(0, 3).toLowerCase();
        
        let startMonth = MONTHS_MAP[startMStr] !== undefined ? MONTHS_MAP[startMStr] : fallbackMonth;
        let endMonth = MONTHS_MAP[endMStr] !== undefined ? MONTHS_MAP[endMStr] : fallbackMonth;
        
        let startDate = new Date(year, startMonth, startDay, 0, 0, 0);
        let endDate = new Date(year, endMonth, endDay, 23, 59, 59);
        return { start: startDate, end: endDate };
    }
    
    m = clean.match(/Semana\s+\d+\s*-\s*(\d+)\s+(?:al|a|-)\s+(\d+)\s+(?:de\s+)?(\w+)/i);
    if (m) {
        let startDay = parseInt(m[1], 10);
        let endDay = parseInt(m[2], 10);
        let mStr = m[3].substring(0, 3).toLowerCase();
        
        let month = MONTHS_MAP[mStr] !== undefined ? MONTHS_MAP[mStr] : fallbackMonth;
        let startDate = new Date(year, month, startDay, 0, 0, 0);
        let endDate = new Date(year, month, endDay, 23, 59, 59);
        return { start: startDate, end: endDate };
    }

    m = clean.match(/Semana\s+\d+\s*-\s*(\d+)\s+al\s+(\d+)/i);
    if (m) {
        let startDay = parseInt(m[1], 10);
        let endDay = parseInt(m[2], 10);
        let startMonth = fallbackMonth;
        let endMonth = fallbackMonth;
        
        if (endDay < startDay) {
            endMonth = startMonth + 1;
        }
        
        let startDate = new Date(year, startMonth, startDay, 0, 0, 0);
        let endDate = new Date(year, endMonth, endDay, 23, 59, 59);
        return { start: startDate, end: endDate };
    }
    
    return null;
}

function getWeekSheet(sheetNames, targetDate) {
    if (!sheetNames || sheetNames.length === 0) return null;
    const year = targetDate.getFullYear();
    const currentMonth = targetDate.getMonth();
    for (let name of sheetNames) {
        let r = parseSheetRange(name, year, currentMonth);
        if (r) {
            if (targetDate >= r.start && targetDate <= r.end) {
                return name;
            }
        }
    }
    // Fallback: Find the first sheet that looks like a weekly schedule
    for (let name of sheetNames) {
        if (name.toLowerCase().includes('semana')) {
            return name;
        }
    }
    // Last resort: Return the very first sheet
    return sheetNames[0];
}

function getCronogramaColumnsForToday(targetDate, shiftText, rows = []) {
    const day = targetDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    let cols = { manana: [], tarde: [], sabado: [], domingo: [] };
    
    for (let rIdx = 0; rIdx < Math.min(5, rows.length); rIdx++) {
        const row = rows[rIdx];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || "").trim().toLowerCase();
            if (val.includes("mañana") && !val.includes("sabado") && !val.includes("sábado") && !val.includes("domingo") && cols.manana.length === 0) {
                if (c + 1 < row.length) cols.manana = [c, c + 1];
            }
            if (val.includes("tarde") && cols.tarde.length === 0) {
                if (c + 1 < row.length) cols.tarde = [c, c + 1];
            }
            if ((val.includes("sábado") || val.includes("sabado")) && cols.sabado.length === 0) {
                if (c + 1 < row.length) cols.sabado = [c, c + 1];
            }
            if (val.includes("domingo") && cols.domingo.length === 0) {
                if (c + 1 < row.length) cols.domingo = [c, c + 1];
            }
        }
    }
    
    // Fallback si no se encuentran
    if (cols.manana.length === 0) cols.manana = [1, 2];
    if (cols.tarde.length === 0) cols.tarde = [4, 5];
    if (cols.sabado.length === 0) cols.sabado = [7, 8];
    if (cols.domingo.length === 0) cols.domingo = [10, 11];

    if (day === 0) { // Sunday
        return [cols.domingo];
    } else if (day === 6) { // Saturday
        return [cols.sabado];
    } else { // Monday to Friday
        return [cols.manana, cols.tarde];
    }
}

let globalCronogramaData = null;
async function preloadCronograma() {
    try {
        const todayForFile = new Date();
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let monthName = monthNames[todayForFile.getMonth()];
        if (todayForFile.getFullYear() === 2026 && todayForFile.getMonth() === 6 && todayForFile.getDate() < 6) {
            monthName = "Junio";
        }
        const cronogramaFile = `Cronograma ${monthName}.xlsx`;
        const url = encodeURI('Cronograma de Tareas/' + cronogramaFile) + '?t=' + Date.now();
        const response = await fetch(url);
        console.log(`XLSX_FETCH url=${url} status=${response.status}`);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type: 'array'});
        const today = new Date();
        const sheetName = getWeekSheet(workbook.SheetNames, today);
        if (sheetName) {
            globalCronogramaData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
            // Re-render dashboard just in case it loaded before this finished
            const viewMonitoreo = document.getElementById('view-monitoreo');
            if (viewMonitoreo && viewMonitoreo.style.display !== 'none') {
                if (typeof renderActiveSessionsDashboard === 'function') {
                    renderActiveSessionsDashboard();
                }
            }
        }
    } catch(e) {
        console.error("preloadCronograma error", e);
    }
}

function getAssignedTasksForGestor(gestorName, shiftText) {
    if (!globalCronogramaData) return [];
    let assignments = [];
    const today = new Date();
    const colGroups = getCronogramaColumnsForToday(today, shiftText, globalCronogramaData);
    
    for (let colGroup of colGroups) {
        const tCol = colGroup[0];
        const gCol = colGroup[1];
        for (let rIdx = 0; rIdx < globalCronogramaData.length; rIdx++) {
            const row = globalCronogramaData[rIdx];
            if (!row) continue;
            const taskVal = row[tCol];
            const gestorVal = row[gCol];
            if (taskVal !== undefined && taskVal !== null && String(taskVal).trim() !== "") {
                const tStrLower = String(taskVal).trim().toLowerCase();
                if (!tStrLower.startsWith("set ") && !tStrLower.includes("cronograma") && gestorVal !== "Gestor") {
                    if (gestorVal !== undefined && gestorVal !== null && namesMatch(String(gestorVal).trim(), gestorName)) {
                        assignments.push(String(taskVal).trim());
                    }
                }
            }
        }
    }
    return assignments;
}

let gestorCronogramaAssignments = null;

async function loadCronogramaAssignments(gestorName, gestorShift) {
    try {
        const todayForFile = new Date();
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let monthName = monthNames[todayForFile.getMonth()];
        if (todayForFile.getFullYear() === 2026 && todayForFile.getMonth() === 6 && todayForFile.getDate() < 6) {
            monthName = "Junio";
        }
        const cronogramaFile = `Cronograma ${monthName}.xlsx`;
        const url = encodeURI('Cronograma de Tareas/' + cronogramaFile) + '?t=' + Date.now();
        const response = await fetch(url);
        console.log(`XLSX_FETCH url=${url} status=${response.status}`);
        if (!response.ok) throw new Error("Fallo al cargar cronograma");
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type: 'array'});
        
        const today = new Date();
        const sheetName = getWeekSheet(workbook.SheetNames, today);
        if (!sheetName) return;
        
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        const colGroups = getCronogramaColumnsForToday(today, gestorShift, rows);
        
        gestorCronogramaAssignments = [];
        
        for (let colGroup of colGroups) {
            const tCol = colGroup[0];
            const gCol = colGroup[1];
            
            let currentSet = "";
            for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                if (!row) continue;
                
                const taskVal = row[tCol];
                const gestorVal = row[gCol];
                
                if (taskVal !== undefined && taskVal !== null && String(taskVal).trim() !== "") {
                    const tStr = String(taskVal).trim();
                    const tStrLower = tStr.toLowerCase();
                    
                    if (tStrLower.startsWith("set ")) {
                        currentSet = tStr;
                    } else if (!tStrLower.includes("cronograma") && gestorVal !== "Gestor") {
                        if (gestorVal !== undefined && gestorVal !== null && namesMatch(String(gestorVal).trim(), gestorName)) {
                            gestorCronogramaAssignments.push({
                                set: currentSet || "Otros",
                                task: tStr
                            });
                        }
                    }
                }
            }
        }
        console.log("Cargadas asignaciones de cronograma para " + gestorName + ":", gestorCronogramaAssignments);
    } catch (e) {
        console.error("Error al cargar Cronograma de Tareas:", e);
        gestorCronogramaAssignments = [];
    }
}

function getScheduledGestoresCountForShift(shiftName, targetDate = new Date()) {
    if (!globalScheduleRows || !globalScheduleBlocks || globalScheduleBlocks.length === 0) {
        return 0;
    }
    
    let targetBlock = null;
    let targetColIndex = -1;
    
    for (let block of globalScheduleBlocks) {
        const dateRow = globalScheduleRows[block.startRow];
        for (let c = 1; c < dateRow.length; c++) {
            const serial = dateRow[c];
            if (serial && !isNaN(serial)) {
                const cellDate = excelToJSDate(serial);
                if (cellDate && isSameDate(cellDate, targetDate)) {
                    targetBlock = block;
                    targetColIndex = c;
                    break;
                }
            }
        }
        if (targetBlock) break;
    }
    
    if (!targetBlock) {
        targetBlock = globalScheduleBlocks[globalScheduleBlocks.length - 1];
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayRow = globalScheduleRows[targetBlock.startRow + 1];
        const targetDayName = dayNames[targetDate.getDay()];
        
        for (let c = 1; c < dayRow.length; c++) {
            const dayName = String(dayRow[c] || '').trim();
            if (normalizeName(dayName) === normalizeName(targetDayName)) {
                targetColIndex = c;
                break;
            }
        }
        
        if (targetColIndex === -1) {
            let jsDay = targetDate.getDay();
            targetColIndex = jsDay === 0 ? 7 : jsDay;
        }
    }
    
    let count = 0;
    const blockStartRow = targetBlock.startRow;
    for (let rIdx = blockStartRow + 2; rIdx < globalScheduleRows.length; rIdx++) {
        const r = globalScheduleRows[rIdx];
        if (!r || !r[0] || String(r[0]).trim() === '' || String(r[0]).trim().toUpperCase() === 'GESTOR') break;
        
        const rawShift = r[targetColIndex] || 'Descansa';
        const category = getShiftCategory(rawShift);
        if (category === shiftName) {
            count++;
        }
    }
    
    return count;
}

function getShiftForDate(rows, allScheduleBlocks, gestorName, date) {
    if (!rows || rows.length === 0 || !allScheduleBlocks || allScheduleBlocks.length === 0) {
        return 'Por Asignar';
    }
    
    let targetBlock = null;
    let targetColIndex = -1;
    
    for (let block of allScheduleBlocks) {
        const dateRow = rows[block.startRow];
        for (let c = 1; c < dateRow.length; c++) {
            const serial = dateRow[c];
            if (serial) {
                let cellDate = null;
                if (!isNaN(serial)) {
                    cellDate = excelToJSDate(serial);
                } else if (typeof serial === 'string' && (serial.includes('-') || serial.includes('/'))) {
                    const parsed = new Date(serial);
                    if (!isNaN(parsed.getTime())) {
                        cellDate = parsed;
                    }
                }
                
                if (cellDate && isSameDate(cellDate, date)) {
                    targetBlock = block;
                    targetColIndex = c;
                    break;
                }
            }
        }
        if (targetBlock) break;
    }
    
    if (!targetBlock) {
        targetBlock = allScheduleBlocks[allScheduleBlocks.length - 1];
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayRow = rows[targetBlock.startRow + 1];
        const targetDayName = dayNames[date.getDay()];
        
        for (let c = 1; c < dayRow.length; c++) {
            const dayName = String(dayRow[c] || '').trim();
            if (normalizeName(dayName) === normalizeName(targetDayName)) {
                targetColIndex = c;
                break;
            }
        }
        
        if (targetColIndex === -1) {
            let jsDay = date.getDay();
            targetColIndex = jsDay === 0 ? 7 : jsDay;
        }
    }
    
    const blockStartRow = targetBlock.startRow;
    for (let rIdx = blockStartRow + 2; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        if (!r || !r[0] || String(r[0]).trim() === '' || String(r[0]).trim().toUpperCase() === 'GESTOR') break;
        
        if (namesMatch(r[0], gestorName)) {
            return r[targetColIndex] || 'Descansa';
        }
    }
    
    return 'Por Asignar';
}

// Mapeo de URLs para documentos (especialmente videos pesados alojados en Google Drive)
const privateGitHubDocs = {
  "Guia Jira EGT - Proveedor de Casino.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Guia%20Jira%20EGT%20-%20Proveedor%20de%20Casino.pdf",
  "Instructivo de revisión de apuestas casino.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Instructivo%20de%20revisi%C3%B3n%20de%20apuestas%20casino.pdf",
  "Instructivo de validación de GGR Casino.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Instructivo%20de%20validaci%C3%B3n%20de%20GGR%20Casino.pdf",
  "Política Procedimiento De Aprobación De Retiros.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Pol%C3%ADtica%20Procedimiento%20De%20Aprobaci%C3%B3n%20De%20Retiros.pdf",
  "Procedimiento Identificación de jineteo.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Procedimiento%20Identificaci%C3%B3n%20de%20jineteo.pdf",
  "Proceso de Eliminación de Cuentas - Implementaciones.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/Proceso%20de%20Eliminaci%C3%B3n%20de%20Cuentas%20-%20Implementaciones.pdf",
  "VALIDACIÓN DE ABUSO DE BONOS EN CAMPAÑAS DE CRM.pdf": "https://github.com/RiesgoVirtualsoft/riskmanager-internal-docs/blob/main/Procedimientos/VALIDACI%C3%93N%20DE%20ABUSO%20DE%20BONOS%20EN%20CAMPA%C3%91AS%20DE%20CRM.pdf"
};

const documentUrls = {
    "Revisión de Eventos Deportivos.mp4": "https://drive.google.com/file/d/1UqccsnUwTG6tgPcDYdUeLnf9XqvGzSoc/view?usp=sharing",
    "Revisión de Eventos.mp4": "https://drive.google.com/file/d/1SB9ePi1EOJU05hzOsxOyl7BeNvCN1hOh/view?usp=sharing",
    "Validación SEON.mp4": "https://drive.google.com/file/d/1JFf5basGD0gmrAVIy5AlMK1DBHYgE6JC/view?usp=sharing"
};

function getDocUrl(fileName) {
    if (privateGitHubDocs[fileName]) {
        return privateGitHubDocs[fileName];
    }
    if (fileName.endsWith('.mp4') && !documentUrls[fileName]) {
        return "#PENDING_PRIVATE_DOCUMENT_MIGRATION";
    }
    if (documentUrls[fileName]) {
        return documentUrls[fileName];
    }
    return "Procesos/" + fileName;
}

let taskStateCache = {};
try {
    const cached = localStorage.getItem('riskOps_cache');
    if(cached) taskStateCache = JSON.parse(cached);
} catch(e) {}

let currentActiveTaskId = null;

// Live Clock Logic
function updateClock() {
    const clockElement = document.getElementById('liveClock');
    if (!clockElement) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    clockElement.textContent = `${hours}:${minutes}:${seconds}`;
}

// Update clock every second
setInterval(updateClock, 1000);
updateClock(); // Initial call

// Data source real
let allTasks = [];
let currentSelectedTask = null;

// Initialize Excel fetching
async function loadExcelTasks() {
    const container = document.querySelector('.tree-container');
    if(container) container.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);"><i class="bx bx-loader-alt bx-spin"></i> Cargando Tareas...</div>';
    
    try {
        const url = encodeURI('Tareas Riesgo/Tareas de Riesgo.xlsx') + '?t=' + new Date().getTime();
        const response = await fetch(url);
        console.log(`XLSX_FETCH url=${url} status=${response.status}`);
        if(!response.ok) throw new Error("Error HTTP " + response.status);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        // Assign ID to all master tasks in json
        json.forEach((row, idx) => {
            row.id = idx;
        });
        
        let processedRows = [];
        
        if (currentUser && currentUser.role === 'Gestor') {
            // Resolve today's real shift from the parsed schedule (globalScheduleRows/globalScheduleBlocks)
            // This ensures the filter uses the actual shift for today, not a stale value from localStorage
            let resolvedShift = currentUser.shift || 'Por Asignar';
            if (globalScheduleRows && globalScheduleBlocks && globalScheduleBlocks.length > 0) {
                const todayShift = getShiftForDate(globalScheduleRows, globalScheduleBlocks, currentUser.name, new Date());
                if (todayShift && todayShift !== 'Por Asignar' && todayShift !== 'Descansa') {
                    resolvedShift = todayShift;
                }
            }
            // Load cronograma assignments using the resolved real shift
            await loadCronogramaAssignments(currentUser.name, resolvedShift);
            
            if (gestorCronogramaAssignments && gestorCronogramaAssignments.length > 0) {
                // Filter the master json rows
                const filteredMasterRows = json.filter(row => {
                    const set = row['Set '] || row['Set'] || 'Otros';
                    const taskName = row['Tarea'];
                    return gestorCronogramaAssignments.some(assign => 
                        taskNamesMatch(assign.task, taskName) && setNamesMatch(assign.set, set)
                    );
                });
                
                // Generate mock tasks for assignments that aren't in the master sheet
                const generatedMocks = [];
                let mockId = 10000;
                gestorCronogramaAssignments.forEach(assign => {
                    const hasMasterMatch = json.some(row => 
                        taskNamesMatch(assign.task, row['Tarea']) && setNamesMatch(assign.set, row['Set '] || row['Set'] || 'Otros')
                    );
                    
                    if (!hasMasterMatch) {
                        const mockRow = {
                            'Set ': assign.set,
                            'Tarea': assign.task,
                            'Detalle de Tarea': `Tarea de control rutinario: ${assign.task}. Realizar las verificaciones correspondientes según los lineamientos de Riesgo.`,
                            'Horario': 'Durante el turno',
                            'Día': 'Diario',
                            'Instrucciones': '1. Realizar la validación de la tarea de acuerdo con el procedimiento estándar.\n2. Registrar cualquier anomalía en los canales oficiales.\n3. Marcar como completada en esta plataforma al finalizar.',
                            'Documento / Video de Apoyo': '',
                            id: mockId++
                        };
                        generatedMocks.push(mockRow);
                    }
                });
                
                processedRows = [...filteredMasterRows, ...generatedMocks];
            } else {
                processedRows = [];
            }
        } else {
            // Admin/Supervisor or other roles see everything
            processedRows = json;
        }
        
        // Transform the data, group by Set
        const tasksBySet = {};
        allTasks = []; // Clear global allTasks
        
        processedRows.forEach((row, index) => {
            const set = row['Set '] || row['Set'] || 'Otros';
            const taskName = row['Tarea'];
            const taskId = row.id !== undefined ? row.id : index;
            
            if (!tasksBySet[set]) tasksBySet[set] = [];
            
            // Check for duplicates in the visual tree
            const isDuplicate = tasksBySet[set].some(t => t.name === taskName);
            
            if (!isDuplicate) {
                tasksBySet[set].push({
                    id: taskId,
                    name: taskName,
                    detail: row['Detalle de Tarea'],
                    time: row['Horario'],
                    day: row['Día']
                });
            }
            allTasks.push({ ...row, id: taskId });
        });
        
        // Populate Set Selector
        const select = document.getElementById('activeSetSelect');
        if(select) {
            select.innerHTML = '<option value="" disabled selected>Selecciona tu SET a trabajar...</option><option value="Todos">Mostrar Todos</option>';
            const setsKeys = Object.keys(tasksBySet).sort();
            setsKeys.forEach(set => {
                select.innerHTML += `<option value="${escapeHTML(set)}">${escapeHTML(set)}</option>`;
            });
            
            // Clone select to remove old event listeners
            const newSelect = select.cloneNode(true);
            select.parentNode.replaceChild(newSelect, select);
            
            newSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if(val === 'Todos') {
                    renderTree(tasksBySet);
                } else {
                    const filtered = {};
                    filtered[val] = tasksBySet[val];
                    renderTree(filtered);
                }
            });

            if (setsKeys.length === 1) {
                newSelect.value = setsKeys[0];
                const filtered = {};
                filtered[setsKeys[0]] = tasksBySet[setsKeys[0]];
                renderTree(filtered);
            } else if (setsKeys.length === 0) {
                const container = document.querySelector('.tree-container');
                if(container) container.innerHTML = '<div style="padding: 20px; color: var(--text-secondary); text-align: center;">No hay tareas asignadas en tu cronograma para el día de hoy.</div>';
            } else {
                // No renderizar todos por defecto, esperar selección
                const container = document.querySelector('.tree-container');
                if(container) container.innerHTML = '<div style="padding: 20px; color: var(--text-secondary); text-align: center;">Selecciona un SET en el menú desplegable para ver las tareas.</div>';
            }
        }
        
    } catch(err) {
        console.error("Error loading tasks:", err);
        const container = document.querySelector('.tree-container');
        if(container) container.innerHTML = `<div style="padding: 20px; color: var(--danger);"><i class="bx bx-error-circle"></i> Error cargando tareas: ${escapeHTML(err.message)}</div>`;
    }
}

// Initializar parseo del Horario Personal
async function loadSchedule() {
    try {
        const url = encodeURI('Horario/Horario 2026.xlsx') + '?t=' + Date.now();
        const response = await fetch(url);
        console.log(`XLSX_FETCH url=${url} status=${response.status}`);
        if(!response.ok) throw new Error("Fallo red");
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        function formatExcelDate(serial) {
            if(!serial) return "";
            const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            
            // Si ya es un string que parece fecha (ej: "2026-06-08" o "2026-06-08T00:00...")
            if (typeof serial === 'string' && (serial.includes('-') || serial.includes('/'))) {
                const d = new Date(serial);
                if (!isNaN(d.getTime())) {
                    return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
                }
            }
            
            // Si es un número (serial de Excel)
            if (!isNaN(serial)) {
                const epochUTC = Date.UTC(1899, 11, 30);
                const d = new Date(epochUTC + parseFloat(serial) * 86400000);
                return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
            }
            
            return "";
        }
        
        let allScheduleBlocks = [];
        if (rows && rows.length > 2) {
            for(let rIdx = 0; rIdx < rows.length; rIdx++) {
                const testRow = rows[rIdx];
                if (!testRow || testRow.length < 2) continue;
                
                if (formatExcelDate(testRow[1]) !== "") {
                    const nextR = rows[rIdx+1];
                    if (nextR && nextR.length > 1 && (nextR[1] === 'Lunes' || nextR[1] === 'Martes')) {
                        // Encontramos un bloque, vamos a ver la fecha inicial y final
                        let firstDate = formatExcelDate(testRow[1]);
                        let lastDate = firstDate;
                        for(let c = 1; c < testRow.length; c++) {
                            if(formatExcelDate(testRow[c])) lastDate = formatExcelDate(testRow[c]);
                        }
                        
                        allScheduleBlocks.push({
                            startRow: rIdx,
                            label: `Semana del ${firstDate} al ${lastDate}`
                        });
                        rIdx++; // Saltar la fila de días
                    }
                }
            }
        }

        globalScheduleRows = rows;
        globalScheduleBlocks = allScheduleBlocks;
        
        if (allScheduleBlocks.length === 0) return; // No hay datos válidos

        const tableHead = document.getElementById('scheduleTableHead');
        const tableBody = document.getElementById('scheduleTableBody');
        
        if(tableHead && tableBody && rows.length > 2) {
            
            const weekSelector = document.getElementById('weekSelector');
            
            // Encontrar el bloque correspondiente a hoy
            let defaultBlockRow = null;
            const today = new Date();
            for (let block of allScheduleBlocks) {
                const dateRow = rows[block.startRow];
                for (let c = 1; c < dateRow.length; c++) {
                    const serial = dateRow[c];
                    if (serial) {
                        let cellDate = null;
                        if (!isNaN(serial)) {
                            cellDate = excelToJSDate(serial);
                        } else if (typeof serial === 'string' && (serial.includes('-') || serial.includes('/'))) {
                            const parsed = new Date(serial);
                            if (!isNaN(parsed.getTime())) {
                                cellDate = parsed;
                            }
                        }
                        
                        if (cellDate && isSameDate(cellDate, today)) {
                            defaultBlockRow = block.startRow;
                            break;
                        }
                    }
                }
                if (defaultBlockRow !== null) break;
            }
            
            if (defaultBlockRow === null) {
                defaultBlockRow = allScheduleBlocks[allScheduleBlocks.length - 1].startRow;
            }
            
            const scheduleGestorFilter = document.getElementById('scheduleGestorFilter');
            let selectedGestor = '';

            // Extraer lista única de gestores de la hoja de cálculo
            const allGestoresSet = new Set();
            allScheduleBlocks.forEach(block => {
                for (let rIdx = block.startRow + 2; rIdx < rows.length; rIdx++) {
                    const row = rows[rIdx];
                    if (!row || !row[0] || String(row[0]).trim() === '' || String(row[0]).trim().toUpperCase() === 'GESTOR') break;
                    allGestoresSet.add(String(row[0]).trim());
                }
            });
            const sortedGestores = Array.from(allGestoresSet).sort((a, b) => a.localeCompare(b));

            setupCustomMultiSelect('scheduleGestorMultiSelect', sortedGestores, (selectedList) => {
                renderScheduleBlock(parseInt(weekSelector ? weekSelector.value : defaultBlockRow));
            });

            if (weekSelector) {
                weekSelector.innerHTML = '';
                allScheduleBlocks.forEach(block => {
                    weekSelector.innerHTML += `<option value="${escapeHTML(String(block.startRow))}">${escapeHTML(block.label)}</option>`;
                });
                
                weekSelector.value = defaultBlockRow;
                
                weekSelector.addEventListener('change', (e) => {
                    renderScheduleBlock(parseInt(e.target.value));
                });
            }
            
            // Renderizar el bloque inicial
            renderScheduleBlock(defaultBlockRow);
            
            function renderScheduleBlock(blockStartRow) {
                const dateRow = rows[blockStartRow];
                const dayRow = rows[blockStartRow + 1];
                const selectedList = getSelectedMultiSelectValues('scheduleGestorMultiSelect');
                
                let numCols = 0;
                for(let i=1; i<dateRow.length; i++) {
                    if(formatExcelDate(dateRow[i])) numCols = i;
                }
                if(numCols === 0) numCols = 7; // fallback
                
                let headHTML = '<tr style="border-bottom: 1px solid var(--glass-border);">';
                headHTML += `<th style="padding: 12px; color: var(--accent-primary); text-align: left; position: sticky; left: 0; background: var(--bg-panel); z-index: 2;">GESTOR <i class='bx bx-refresh' style='cursor:pointer; margin-left:5px;' onclick='loadSchedule()' title='Refrescar Horario'></i></th>`;
                for(let i = 1; i <= numCols; i++) {
                    const dayName = dayRow[i] || `Día ${i}`;
                    const dateParsed = formatExcelDate(dateRow[i]);
                    const subText = dateParsed ? `<br><span style="font-size: 11px; font-weight: normal; color: var(--text-secondary);">${dateParsed}</span>` : '';
                    headHTML += `<th style="padding: 12px; color: var(--accent-primary); text-align: center;">${escapeHTML(String(dayName))}${subText}</th>`;
                }
                headHTML += '</tr>';
                tableHead.innerHTML = headHTML;
                
                tableBody.innerHTML = '';
                for(let rowIndex = blockStartRow + 2; rowIndex < rows.length; rowIndex++) {
                    const r = rows[rowIndex];
                    if (!r || !r[0] || String(r[0]).trim() === '' || String(r[0]).trim().toUpperCase() === 'GESTOR') break;
                    
                    const gestorName = String(r[0]).trim();
                    if (selectedList.length > 0 && !selectedList.some(sel => normalizeName(gestorName) === normalizeName(sel))) {
                        continue;
                    }

                    let isCurrentUser = (currentUser && namesMatch(gestorName, currentUser.name));
                    if (isCurrentUser) console.log('current user matched = true');
                    
                    if (currentUser && currentUser.role === 'Gestor' && !isCurrentUser) continue;

                    let bgClass = isCurrentUser ? 'rgba(59,130,246,0.1)' : 'transparent';
                    
                    let trHTML = `<tr class="hover-highlight" style="border-bottom: 1px solid var(--glass-border); background: ${bgClass};">`;
                    trHTML += `<td style="padding: 12px; font-weight: 600; text-align: left; color: ${isCurrentUser ? 'var(--accent-primary)' : 'var(--text-primary)'}; position: sticky; left: 0; background: ${isCurrentUser ? 'var(--bg-dark)' : 'var(--bg-panel)'}; z-index: 1;">${escapeHTML(gestorName)}</td>`;
                    
                    // Encontrar el turno para mostrar en el badge principal (corresponde a hoy)
                    let badgeShift = getShiftForDate(rows, allScheduleBlocks, gestorName, new Date());
                    
                    for(let i = 1; i <= numCols; i++) {
                        const shift = r[i] || 'Descansa';
                        
                        let badgeClass = 'pending';
                        const sLower = normalizeName(shift);
                        if(/\d\s*(am|pm)/i.test(shift)) badgeClass = 'in-progress';
                        else if(sLower.includes('vacacion')) badgeClass = 'vacaciones-badge';
                        else if(sLower.includes('descansa')) badgeClass = 'descanso-badge';
                        else if(sLower.includes('familia')) badgeClass = 'familia-badge';
                        
                        trHTML += `<td style="padding: 12px; text-align: center; white-space: nowrap;"><span class="badge ${badgeClass}">${escapeHTML(String(shift))}</span></td>`;
                    }
                    
                    if (isCurrentUser && badgeShift) {
                        const userRoleEl = document.getElementById('userRole');
                        if (userRoleEl) userRoleEl.textContent = `${currentUser.role} | Turno: ${badgeShift}`;
                        const headerShiftBadge = document.querySelector('.shift-badge');
                        if (headerShiftBadge) headerShiftBadge.textContent = `TURNO: ${badgeShift}`;
                        
                        // Guardar el turno en currentUser y sincronizar a Firebase
                        if (currentUser.shift !== badgeShift) {
                            currentUser.shift = badgeShift;
                            localStorage.setItem('riskOps_currentUser', JSON.stringify(currentUser));
                            syncActiveSessionToFirebase();
                            loadExcelTasks();
                        }
                    }
                    trHTML += '</tr>';
                    tableBody.innerHTML += trHTML;
                }
            }
        }
    } catch(e) {
        console.log("No se pudo cargar el horario", e);
    }
}

function loadTeletrabajo() {
    fetch('Teletrabajo/Teletrabajo.xlsx?v=' + Date.now())
        .then(res => { console.log(`XLSX_TELEWORK_FETCH status=${res.status}`); return res; })
        .then(res => {
            if(!res.ok) throw new Error("No se encontró el archivo de Teletrabajo");
            return res.arrayBuffer();
        })
        .then(data => {
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, {header: 1, defval: ""});
            
            let allBlocks = [];
            
            for(let r = 0; r < rows.length; r++) {
                for(let c = 0; c < rows[r].length; c++) {
                    // Bloque mejorado: busca etiquetas claras de calendario
                    const cellVal = String(rows[r][c]).trim();
                    const lowCell = cellVal.toLowerCase();
                    if(lowCell.includes('semana') || lowCell.includes('teletrabajo') || /^\d{1,2}\/\d{1,2}/.test(cellVal)) {
                        let block = {
                            label: cellVal,
                            startRow: r,
                            colIndex: c,
                            data: []
                        };
                        
                        // Buscamos filas debajo de este título que tengan nombres
                        for(let i = r + 1; i < rows.length; i++) {
                            const gestor = rows[i] ? rows[i][c] : null;
                            const dia = rows[i] ? rows[i][c+1] : null;
                            
                            if(!gestor || String(gestor).trim() === '') break;
                            if(String(gestor).trim().toUpperCase() === 'GESTOR') continue; 
                            
                            block.data.push({
                                gestor: String(gestor).trim(),
                                dia: String(dia || '').trim()
                            });
                        }
                        
                        if(block.data.length > 0) allBlocks.push(block);
                    }
                }
            }
            
            if(allBlocks.length === 0) return;
            
            const weekSelector = document.getElementById('teletrabajoWeekSelector');
            const tableHead = document.getElementById('teletrabajoTableHead');
            const tableBody = document.getElementById('teletrabajoTableBody');
            
            const allTeleGestores = new Set();
            allBlocks.forEach(b => {
                b.data.forEach(r => {
                    if (r.gestor) allTeleGestores.add(String(r.gestor).trim());
                });
            });
            const sortedTeleGestores = Array.from(allTeleGestores).sort((a,b) => a.localeCompare(b));

            let defaultBlockIdx = allBlocks.length - 1;

            setupCustomMultiSelect('teletrabajoGestorMultiSelect', sortedTeleGestores, () => {
                renderTeletrabajoBlock(allBlocks[weekSelector ? weekSelector.value : defaultBlockIdx]);
            });

            if(weekSelector) {
                weekSelector.innerHTML = '';
                allBlocks.forEach((block, idx) => {
                    weekSelector.innerHTML += `<option value="${escapeHTML(String(idx))}">${escapeHTML(block.label)}</option>`;
                });
                
                weekSelector.value = defaultBlockIdx;
                
                weekSelector.addEventListener('change', (e) => {
                    renderTeletrabajoBlock(allBlocks[e.target.value]);
                });
                
                renderTeletrabajoBlock(allBlocks[defaultBlockIdx]);
            }
            
            function renderTeletrabajoBlock(block) {
                const selectedList = getSelectedMultiSelectValues('teletrabajoGestorMultiSelect');
                tableHead.innerHTML = `
                    <tr style="border-bottom: 1px solid var(--glass-border);">
                        <th style="padding: 12px; color: var(--accent-primary); text-align: left; position: sticky; left: 0; background: var(--bg-panel); z-index: 2;">GESTOR <i class='bx bx-refresh' style='cursor:pointer; margin-left:5px;' onclick='loadTeletrabajo()' title='Refrescar Teletrabajo'></i></th>
                        <th style="padding: 12px; color: var(--accent-primary); text-align: center;">DÍA</th>
                        <th style="padding: 12px; color: var(--accent-primary); text-align: center;">MODALIDAD</th>
                    </tr>
                `;
                
                tableBody.innerHTML = '';
                block.data.forEach(row => {
                    if (selectedList.length > 0 && !selectedList.some(sel => normalizeName(row.gestor) === normalizeName(sel))) {
                        return;
                    }

                    let isCurrentUser = (currentUser && namesMatch(row.gestor, currentUser.name));
                    
                    if (currentUser && currentUser.role === 'Gestor' && !isCurrentUser) return;

                    let bgClass = isCurrentUser ? 'rgba(59,130,246,0.1)' : 'transparent';
                    
                    let isTeletrabajo = row.dia && row.dia.toLowerCase() !== 'nan';
                    let estadoHtml = isTeletrabajo ? `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success);">HOME OFFICE</span>` : `<span class="badge pending">PRESENCIAL</span>`;
                    
                    tableBody.innerHTML += `
                        <tr class="hover-highlight" style="border-bottom: 1px solid var(--glass-border); background: ${bgClass};">
                            <td style="padding: 12px; font-weight: 600; text-align: left; color: ${isCurrentUser ? 'var(--accent-primary)' : 'var(--text-primary)'}; position: sticky; left: 0; background: ${isCurrentUser ? 'var(--bg-dark)' : 'var(--bg-panel)'}; z-index: 1;">${escapeHTML(row.gestor)}</td>
                            <td style="padding: 12px; text-align: center;">${isTeletrabajo ? escapeHTML(row.dia) : '-'}</td>
                            <td style="padding: 12px; text-align: center;">${estadoHtml}</td>
                        </tr>
                    `;
                });
            }
        })
        .catch(err => {
            console.error("Error cargando Teletrabajo:", err);
            const tb = document.getElementById('teletrabajoTableBody');
            if(tb) tb.innerHTML = `<tr><td colspan="3" style="padding: 20px; color: var(--danger); text-align: center;">No se pudo cargar Teletrabajo.xlsx o no existe.</td></tr>`;
        });
}

let allLoadedPermissions = [];

// Cargar Histórico de Permisos desde Firebase
async function loadPermisos() {
    try {
        let permissionsRef = database.ref('permissions');
        if (currentUser && currentUser.role !== 'Admin' && currentUser.role !== 'Supervisor') {
            const authUid = currentUser.uid || (firebase.auth().currentUser && firebase.auth().currentUser.uid);
            if (!authUid) throw new Error('No se pudo determinar el UID del usuario autenticado');
            permissionsRef = permissionsRef.orderByChild('uid').equalTo(authUid);
        }
        const snapshot = await permissionsRef.once('value');
        const historicoContainer = document.getElementById('historicoPermisosList');
        if(!historicoContainer) return;
        
        historicoContainer.innerHTML = '';
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            let permisos = Object.keys(data).map(k => ({...data[k], fb_id: k}));
            allLoadedPermissions = permisos;
            
            // Filtro de privacidad: Gestor solo ve lo suyo. Admin ve todo.
            if (currentUser && currentUser.role !== 'Admin' && currentUser.role !== 'Supervisor') {
                permisos = permisos.filter(p => p.gestor === currentUser.name);
            }
            
            // Ordenar por ID descendente (más nuevos primero)
            permisos.sort((a,b) => b.id - a.id);
            
            if (permisos.length === 0) {
                historicoContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay permisos en el historial.</p>';
                return;
            }
            
            permisos.forEach(p => {
                let icon = 'bx-time';
                let badgeClass = 'pending';
                if(p.status === 'Aprobado') { badgeClass = 'in-progress'; icon = 'bx-check-double'; }
                if(p.status === 'Rechazado') { badgeClass = 'not-done'; icon = 'bx-x'; }
                
                let rejectionHtml = p.rejectionReason ? `<br><small style="color:var(--danger)">Razón/Obs: ${escapeHTML(p.rejectionReason)}</small>` : '';
                
                let createdTimeText = p.horaSolicitud;
                if (!createdTimeText && p.id) {
                    try {
                        const d = new Date(p.id);
                        createdTimeText = `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:true})}`;
                    } catch(err) { createdTimeText = 'N/A'; }
                }

                historicoContainer.innerHTML += `
                    <div class="tree-item" style="margin-top: 10px; cursor: pointer; transition: all 0.2s ease; border-radius: 8px;" onclick="openPermisoDetailModal(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))" title="Haz clic para ver el detalle completo de este permiso">
                        <div class="tree-header" style="padding: 12px; display: flex; align-items: center; gap: 10px;">
                            <i class='bx ${icon}' style="font-size: 20px;"></i>
                            <div style="display:flex; flex-direction:column; flex: 1;">
                                <strong style="font-size: 14px; color: var(--text-primary);">${escapeHTML(p.tipo)}</strong>
                                <small style="font-size:11px; opacity:0.8; color: var(--text-secondary); margin-top: 2px;">
                                    ${escapeHTML(p.gestor)} | ${escapeHTML(p.fecha)} (${escapeHTML(p.horaInicio)} a ${escapeHTML(p.horaFin)})${rejectionHtml}
                                </small>
                                <small style="font-size:10px; color: var(--accent-primary); margin-top: 2px; font-weight: 500;">
                                    <i class='bx bx-calendar-event'></i> Solicitado el: ${escapeHTML(createdTimeText || 'N/A')}
                                </small>
                            </div>
                            <span class="badge ${badgeClass}" style="margin-left: auto; padding: 4px 10px; font-size: 11px;">${escapeHTML(p.status)}</span>
                            <i class='bx bx-chevron-right' style="font-size: 18px; color: var(--text-secondary); opacity: 0.6;"></i>
                        </div>
                    </div>
                `;
            });
        } else {
            historicoContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hay permisos registrados.</p>';
        }
    } catch(e) {
        console.error("No se pudo cargar permisos desde Firebase", e);
    }
}

// Modal de detalle completo de permiso
window.openPermisoDetailModal = async function(fb_id) {
    let perm = allLoadedPermissions.find(p => p.fb_id === fb_id);
    if (!perm) {
        try {
            const snap = await database.ref('permissions/' + fb_id).once('value');
            if (snap.exists()) perm = { ...snap.val(), fb_id };
        } catch(e) { console.error(e); }
    }
    
    if (!perm) {
        alert("No se encontró información del permiso.");
        return;
    }
    
    const body = document.getElementById('permDetailModalBody');
    if (!body) return;
    
    let statusColor = 'var(--warning)';
    let statusIcon = 'bx-time';
    if (perm.status === 'Aprobado') { statusColor = 'var(--success)'; statusIcon = 'bx-check-circle'; }
    if (perm.status === 'Rechazado') { statusColor = 'var(--danger)'; statusIcon = 'bx-x-circle'; }
    
    let fechaRange = perm.fecha;
    if (perm.fechaDesde && perm.fechaHasta && perm.fechaDesde !== perm.fechaHasta) {
        fechaRange = `Desde ${perm.fechaDesde} hasta ${perm.fechaHasta}`;
    }
    
    let createdTimeText = perm.horaSolicitud;
    if (!createdTimeText && perm.id) {
        try {
            const d = new Date(perm.id);
            createdTimeText = `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:true})}`;
        } catch(err) { createdTimeText = 'N/A'; }
    }

    body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 15px; border-radius: 10px; border: 1px solid var(--glass-border);">
                <div>
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-secondary); display: block;">Estado de Solicitud</span>
                    <strong style="font-size: 16px; color: ${statusColor}; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                        <i class='bx ${statusIcon}'></i> ${escapeHTML(perm.status)}
                    </strong>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-secondary); display: block;">Tipo de Permiso</span>
                    <strong style="font-size: 14px; color: var(--accent-primary); margin-top: 2px; display: block;">${escapeHTML(perm.tipo)}</strong>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Gestor Solicitante</small>
                    <strong style="font-size: 13px; color: var(--text-primary); margin-top: 3px; display: block;">${escapeHTML(perm.gestor)}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Fecha de Solicitud (Creación)</small>
                    <strong style="font-size: 13px; color: var(--accent-primary); margin-top: 3px; display: block;">${escapeHTML(createdTimeText || 'N/A')}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Fecha del Permiso</small>
                    <strong style="font-size: 13px; color: var(--text-primary); margin-top: 3px; display: block;">${escapeHTML(fechaRange)}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Horario Solicitado</small>
                    <strong style="font-size: 13px; color: var(--text-primary); margin-top: 3px; display: block;">${escapeHTML(perm.horaInicio || 'N/A')} a ${escapeHTML(perm.horaFin || 'N/A')}</strong>
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.03); padding: 12px 15px; border-radius: 10px; border: 1px solid var(--glass-border);">
                <small style="color: var(--accent-primary); display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Motivo / Justificación del Gestor:</small>
                <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
                    ${escapeHTML(perm.motivo || 'Sin justificación detallada.')}
                </div>
            </div>

            ${perm.rejectionReason ? `
                <div style="background: rgba(239, 68, 68, 0.08); padding: 12px 15px; border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.3);">
                    <small style="color: var(--danger); display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Observación / Razón de Respuesta:</small>
                    <div style="font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
                        ${escapeHTML(perm.rejectionReason)}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    const modal = document.getElementById('permDetailModal');
    if (modal) {
        modal.classList.add('active');
    }
};

function renderTree(tasksBySet) {
    const container = document.querySelector('.tree-container');
    if(!container) return;
    
    container.innerHTML = ''; // clear mock
    
    // Sort keys logically
    const sets = Object.keys(tasksBySet).sort();
    const shouldAutoExpand = sets.length === 1;
    
    sets.forEach(set => {
        const setDiv = document.createElement('div');
        setDiv.className = 'tree-item';
        
        const total = tasksBySet[set].length;
        const headerClass = shouldAutoExpand ? 'tree-header open' : 'tree-header';
        const childrenClass = shouldAutoExpand ? 'tree-children show' : 'tree-children';
        
        setDiv.innerHTML = `
            <div class="${headerClass}" onclick="toggleTree(this)">
                <i class='bx bx-chevron-right'></i>
                <span>${escapeHTML(set)}</span>
                <span class="badge pending">${total} Tareas</span>
            </div>
            <div class="${childrenClass}">
                ${tasksBySet[set].map(task => {
                    let statusClass = 'status-pending';
                    if (taskStateCache[task.id]) {
                        const statusText = taskStateCache[task.id].status;
                        if (statusText === 'Finalizada') statusClass = 'status-completed';
                        else if (statusText === 'En Proceso') statusClass = 'status-in-progress';
                        else if (statusText === 'No Realizada') statusClass = 'status-not-done';
                    }
                    return `
                    <div class="task-item" onclick="selectTask(decodeURIComponent('${encodeInlineHandlerArg(task.id)}'))">
                        <i class='bx bx-file-blank'></i> ${escapeHTML(task.name)}
                        <div class="task-status ${statusClass}"></div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
        container.appendChild(setDiv);
    });
    
    // Update KPI whenever tree is rendered
    updateKPI();
}

function syncActiveSessionToFirebase() {
    if (!currentUser || currentUser.role !== 'Gestor') return;
    const uid = currentUser.uid;
    if (!uid) return;
    
    // Si la sesin fue cerrada en otra pestaa, localStorage estar vaco
    if (!localStorage.getItem('riskOps_currentUser')) {
        currentUser = null;
        window.location.href = 'login.html';
        return;
    }

    const totalTasks = document.querySelectorAll('.task-item').length;
    const completedTasks = document.querySelectorAll('.task-item .status-completed').length;
    const notDoneTasks = document.querySelectorAll('.task-item .status-not-done').length;
    const finalized = completedTasks + notDoneTasks;

    let percentage = 0;
    if (totalTasks > 0) {
        percentage = Math.round((finalized / totalTasks) * 100);
    }

    // Use local currentUser.loginTime, avoiding any database reads that could hang
    const loginTime = currentUser.loginTime || new Date().toISOString();
    
    // --- INACTIVITY LOGIC ---
    let nowMs = Date.now();
    lastSyncLoopTimestamp = nowMs;
    loadBreakState();

    let newLastActive = Date.now();
    let currentStatus = 'Activo';
    
    const timeSinceLastActivity = Date.now() - lastLocalActivityTimestamp;
    const idleThreshold = (currentUser && currentUser.role === 'Gestor') ? (3 * 60 * 1000) : (5 * 60 * 1000);
    const isDomIdle = timeSinceLastActivity > idleThreshold;
    
    let isInactive = false;
    if (window.idleDetectorGranted) {
        isInactive = globalIdleState;
    } else {
        if (globalIdleState || isDomIdle) {
            isInactive = true;
        }
    }
    
    if (isLunchBreak) {
        currentStatus = 'En Almuerzo';
    } else if (isBreakfastBreak) {
        currentStatus = 'En Desayuno';
    } else if (isInactive) {
        currentStatus = 'Inactivo';
    } else {
        currentStatus = 'En Línea';
    }
    
    if (currentStatus === 'Inactivo' && localStatus !== 'Inactivo') {
        pushTimelineEvent('Inactividad', 'start');
    } else if (currentStatus !== 'Inactivo' && localStatus === 'Inactivo') {
        pushTimelineEvent('Inactividad', 'end');
    }
    localStatus = currentStatus;
    
    const payload = {
        name: currentUser.name,
        email: currentUser.email,
        shift: currentUser.shift || 'Por Asignar',
        loginTime: loginTime,
        lastActive: newLastActive,
        status: currentStatus,
        totalTasks: totalTasks,
        finalizedTasks: finalized,
        completedTasks: completedTasks,
        notDoneTasks: notDoneTasks,
        percentage: percentage,
        tasks: taskStateCache || {},
        timeline: shiftTimeline || [],
        appVersion: 'v104'
    };
    
    database.ref(`active_sessions/${uid}`).update(payload).catch(e => console.error("Error syncing active session via SDK:", e));
}

function updateKPI() {
    const totalTasks = document.querySelectorAll('.task-item').length;
    const completedTasks = document.querySelectorAll('.task-item .status-completed').length;
    const notDoneTasks = document.querySelectorAll('.task-item .status-not-done').length;
    
    // Finalizadas = completed + not-done
    const finalized = completedTasks + notDoneTasks; 
    const pending = totalTasks - finalized;
    
    let completedPercentage = 0;
    let notDonePercentage = 0;
    let totalPercentage = 0;
    
    if (totalTasks > 0) {
        completedPercentage = Math.round((completedTasks / totalTasks) * 100);
        notDonePercentage = Math.round((notDoneTasks / totalTasks) * 100);
        totalPercentage = completedPercentage + notDonePercentage;
    }
    
    const kpiContainer = document.querySelector('.kpi-card');
    if (kpiContainer) {
        kpiContainer.innerHTML = `
            <div class="kpi-circle">
                <svg viewBox="0 0 36 36" class="circular-chart" style="width: 100%; height: 100%;">
                    <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" style="fill: none; stroke: var(--glass-border); stroke-width: 3.8;"/>
                    <path class="circle" stroke-dasharray="${completedPercentage}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" style="fill: none; stroke-width: 3.8; stroke-linecap: round; stroke: var(--success); transition: stroke-dasharray 1s ease-out;"/>
                    <path class="circle-not-done" stroke-dasharray="${notDonePercentage}, 100" stroke-dashoffset="-${completedPercentage}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" style="fill: none; stroke-width: 3.8; stroke-linecap: round; stroke: var(--danger); transition: stroke-dasharray 1s ease-out, stroke-dashoffset 1s ease-out;"/>
                    <text x="18" y="20.35" class="percentage" style="fill: var(--text-primary); font-family: 'Inter'; font-size: 8px; font-weight: bold; text-anchor: middle;">${totalPercentage}%</text>
                </svg>
            </div>
            <div class="kpi-stats">
                <p><strong>${totalTasks}</strong> Asignadas</p>
                <p><strong style="color: var(--success);">${completedTasks}</strong> Realizadas</p>
                <p><strong style="color: var(--danger);">${notDoneTasks}</strong> No Realizadas</p>
                <p><strong>${pending}</strong> Pendientes</p>
            </div>
        `;
    }

    // Sincronizar sesión activa si es gestor
    if (currentUser && currentUser.role === 'Gestor') {
        syncActiveSessionToFirebase();
    }
}

function toggleTree(element) {
    element.classList.toggle('open');
    const childrenContainer = element.nextElementSibling;
    if (childrenContainer) {
        childrenContainer.classList.toggle('show');
    }
}

// Renderizar documentos en el panel de accesos rápidos
function renderQuickDocs(selectedTaskName) {
    const container = document.getElementById('quickDocsList');
    if (!container) return;

    const archivos = [
        "Instructivo de revisión de apuestas casino.pdf",
        "Instructivo de validación de GGR Casino.pdf",
        "Política Procedimiento De Aprobación De Retiros.pdf",
        "Procedimiento Identificación de jineteo.pdf",
        "Proceso de Eliminación de Cuentas - Implementaciones.pdf",
        "VALIDACIÓN DE ABUSO DE BONOS EN CAMPAÑAS DE CRM.pdf",
        "Revisión de Eventos Deportivos.mp4",
        "Revisión de Eventos.mp4",
        "Validación SEON.mp4"
    ];

    let matchedDoc = null;
    if (selectedTaskName) {
        const taskNameLower = selectedTaskName.toLowerCase();
        if (taskNameLower.includes('ggr')) matchedDoc = "Instructivo de validación de GGR Casino.pdf";
        else if (taskNameLower.includes('apuesta')) matchedDoc = "Instructivo de revisión de apuestas casino.pdf";
        else if (taskNameLower.includes('retiro')) matchedDoc = "Política Procedimiento De Aprobación De Retiros.pdf";
        else if (taskNameLower.includes('jineteo') || taskNameLower.includes('jineteo')) matchedDoc = "Procedimiento Identificación de jineteo.pdf";
        else if (taskNameLower.includes('eliminaci')) matchedDoc = "Proceso de Eliminación de Cuentas - Implementaciones.pdf";
        else if (taskNameLower.includes('bonos')) matchedDoc = "VALIDACIÓN DE ABUSO DE BONOS EN CAMPAÑAS DE CRM.pdf";
        else if (taskNameLower.includes('deportiv')) matchedDoc = "Revisión de Eventos Deportivos.mp4";
        else if (taskNameLower.includes('evento')) matchedDoc = "Revisión de Eventos.mp4";
        else if (taskNameLower.includes('seon')) matchedDoc = "Validación SEON.mp4";
    }

    container.innerHTML = '';

    // Si hay un documento que coincide, mostrarlo destacado arriba
    if (matchedDoc) {
        const isVideo = matchedDoc.toLowerCase().endsWith('.mp4');
        const isWord = matchedDoc.toLowerCase().endsWith('.docx') || matchedDoc.toLowerCase().endsWith('.doc');
        const isExcel = matchedDoc.toLowerCase().endsWith('.xlsx') || matchedDoc.toLowerCase().endsWith('.xls');
        
        let icon = 'bx-file-pdf';
        let color = '#FF5A5A'; // PDF red
        
        if (isVideo) { icon = 'bx-video'; color = '#3B82F6'; }
        else if (isWord) { icon = 'bx-file-blank'; color = '#2563EB'; } // Word blue
        else if (isExcel) { icon = 'bx-table'; color = '#10B981'; } // Excel green

        container.innerHTML += `
            <div style="margin-bottom: 12px; background: rgba(0, 180, 216, 0.1); padding: 10px; border-radius: var(--radius-md); border: 1px dashed var(--accent-primary);">
                <span style="font-size: 10px; color: var(--accent-primary); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                    <i class='bx bxs-star'></i> Sugerido para esta tarea
                </span>
                <a href="${getDocUrl(matchedDoc)}" target="_blank" rel="noopener noreferrer" class="doc-link" style="background: transparent; padding: 0; display: flex; align-items: center; gap: 10px;">
                    <i class='bx ${icon}' style="font-size: 20px; color: ${color};"></i>
                    <span style="color: var(--text-primary); font-weight: 500; font-size: 13px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${matchedDoc.replace(/\.[^/.]+$/, "")}</span>
                </a>
            </div>
            <div style="height: 1px; background: var(--glass-border); margin: 10px 0;"></div>
        `;
    }

    // Listar todos los demás documentos
    archivos.forEach(file => {
        if (file === matchedDoc) return; // Omitir el destacado ya listado

        const isVideo = file.toLowerCase().endsWith('.mp4');
        const isWord = file.toLowerCase().endsWith('.docx') || file.toLowerCase().endsWith('.doc');
        const isExcel = file.toLowerCase().endsWith('.xlsx') || file.toLowerCase().endsWith('.xls');
        
        let icon = 'bx-file-pdf';
        let color = '#FF5A5A'; // PDF red
        
        if (isVideo) { icon = 'bx-video'; color = '#3B82F6'; }
        else if (isWord) { icon = 'bx-file-blank'; color = '#2563EB'; } // Word blue
        else if (isExcel) { icon = 'bx-table'; color = '#10B981'; } // Excel green

        container.innerHTML += `
            <a href="${getDocUrl(file)}" target="_blank" rel="noopener noreferrer" class="doc-link" style="margin-bottom: 8px;">
                <i class='bx ${icon}' style="font-size: 18px; color: ${color};"></i>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;">${file.replace(/\.[^/.]+$/, "")}</span>
            </a>
        `;
    });
}

// Global scope logic for onclick elements
window.selectTask = function(taskId) {
    currentActiveTaskId = taskId;
    // Remove active
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
    // Add active
    const eventTarget = window.event && window.event.currentTarget;
    if(eventTarget) eventTarget.classList.add('active');
    
    const task = allTasks.find(t => t.id === taskId);
    if(task) {
        const titleElement = document.getElementById('currentTaskTitle');
        if (titleElement) titleElement.textContent = task['Tarea'];
        currentSelectedTask = task;
        
        // Renderizar accesos rápidos destacando el documento de esta tarea
        renderQuickDocs(task['Tarea']);
        
        // Populate instructions text area if we want to
        const textArea = document.getElementById('taskObservation');
        
        if (currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Supervisor')) {
            if (textArea) {
                // Show task detail and instructions for admin/supervisor review
                let detailText = `Detalle: ${task['Detalle de Tarea'] || 'Sin detalle'}\n\n`;
                detailText += `Horario: ${task['Horario'] || 'No especificado'}\n`;
                detailText += `Día: ${task['Día'] || 'No especificado'}\n\n`;
                detailText += `Instrucciones:\n${task['Instrucciones'] || 'Sin instrucciones'}`;
                textArea.value = detailText;
            }
        } else {
            if(textArea) {
               textArea.value = task['Detalle de Tarea'] || "";
            }

            // Restore from cache if exists
            document.querySelectorAll('.btn-status').forEach(el => el.classList.remove('active'));
            if(taskStateCache[taskId]) {
                if(textArea) textArea.value = taskStateCache[taskId].observation;
                
                const cachedStatus = taskStateCache[taskId].status;
                let found = false;
                document.querySelectorAll('.btn-status').forEach(el => {
                    if(el.textContent.trim() === cachedStatus) {
                        el.classList.add('active');
                        found = true;
                    }
                });
                if(!found) document.querySelector('.btn-status.pending').classList.add('active');
            } else {
                if(textArea) textArea.value = ""; // Limpiar nota de otras tareas
                document.querySelector('.btn-status.pending').classList.add('active');
            }
        }
    }
}

// Task Status Buttons Interaction
async function initApp() {
    // Carga de Excel Inicial
    try {
        await loadSchedule();
    } catch(e) {
        console.error("Error al cargar el horario en la inicialización:", e);
    }
    
    try {
        await loadExcelTasks();
    } catch(e) {
        console.error("Error al cargar las tareas en la inicialización:", e);
    }
    
    loadTeletrabajo();
    loadPermisos();
    renderQuickDocs(null);

    // Theme logic
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        const savedTheme = localStorage.getItem('riskOps_theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        themeToggleBtn.innerHTML = savedTheme === 'dark' ? "<i class='bx bx-moon'></i>" : "<i class='bx bx-sun'></i>";
        
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('riskOps_theme', newTheme);
            themeToggleBtn.innerHTML = newTheme === 'dark' ? "<i class='bx bx-moon'></i>" : "<i class='bx bx-sun'></i>";
        });
    }

    // Populate user UI
    if (currentUser) {
        const userNameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');
        const shiftBadgeEl = document.querySelector('.shift-badge');
        
        if (userNameEl) userNameEl.textContent = currentUser.name;
        if (roleEl) roleEl.textContent = currentUser.role;
        if (shiftBadgeEl) shiftBadgeEl.textContent = 'Turno ' + currentUser.shift;
        
        const avatarEl = document.querySelector('.avatar');
        if (avatarEl && currentUser.name) {
            const availableAvatars = [
                "Alexander Villada.png",
                "Camilo Espinosa.png",
                "Daniel Benavides.png",
                "Josue Alvarez.png",
                "Juan Jose Diaz.png",
                "Luis Fuentes.png",
                "Maria Sanchez.png",
                "Marilyn Jimenez.png",
                "Oriana Borja.png",
                "Samuel Cruz.png",
                "Sara Santamaria.png",
                "Sebastian Arango.png",
                "Sebastian Hincapie.png",
                "Yefferson Giraldo.png"
            ];
            
            const fullName = currentUser.name.trim();
            // Buscar una imagen que coincida con el nombre registrado
            let matchedAvatar = availableAvatars.find(img => namesMatch(fullName, img.replace('.png', '')));
            console.log("DEBUG_AVATAR: fullName =", fullName, "matchedAvatar =", matchedAvatar);
            
            if (matchedAvatar) {
                avatarEl.src = `assets/src/img/${matchedAvatar}`;
                // Fallback por si la imagen se borra o falla
                avatarEl.onerror = function() {
                    this.onerror = null;
                    this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;
                };
            } else {
                avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;
            }
        }

        if (currentUser.role === 'Gestor') {
            syncActiveSessionToFirebase();
            
            // Use a Web Worker to ensure the 30s ping is NOT throttled by Chrome when the tab is in the background
            const workerCode = `
                setInterval(() => {
                    postMessage('ping');
                }, 30000);
            `;
            const blob = new Blob([workerCode], {type: 'application/javascript'});
            window.pingWorker = new Worker(URL.createObjectURL(blob));
            window.pingWorker.onmessage = () => {
                syncActiveSessionToFirebase();
            };
        }

        // Setup programmatical sidebar ordering for roles
        setupSidebar();

        // Show Aprobaciones tab for Supervisor/Admin
        if (currentUser.role === 'Admin' || currentUser.role === 'Supervisor') {
            const navAprobaciones = document.getElementById('navAprobaciones');
            const navTurnos = document.getElementById('navTurnos');
            const navMonitoreo = document.getElementById('navMonitoreo');
            const navWorkspace = document.getElementById('navWorkspace');
            const viewWorkspace = document.getElementById('view-workspace');
            const viewAprobaciones = document.getElementById('view-aprobaciones');
            const viewTurnos = document.getElementById('view-turnos');
            const permissionForm = document.getElementById('permissionForm');
            const endShiftBtn = document.getElementById('endShiftBtn');

            if(navAprobaciones) navAprobaciones.style.display = 'flex';
            if(navTurnos) navTurnos.style.display = 'flex';
            if(navMonitoreo) navMonitoreo.style.display = 'flex';

            const navEficienciaOperativa = document.getElementById('navEficienciaOperativa');
            if(navEficienciaOperativa) navEficienciaOperativa.style.display = 'flex';

            if(navWorkspace) navWorkspace.style.display = 'none'; // Hide Mis Tareas for Admin/Supervisor
            
            // Ocultar el panel de Progreso del Turno / Documentos de Acceso Rápido en Mis Tareas para Admin o Supervisor
            const rightPanel = document.querySelector('.right-panel');
            if (rightPanel) rightPanel.style.display = 'none';
            const workspaceGrid = document.querySelector('.workspace-grid');
            if (workspaceGrid) workspaceGrid.classList.add('no-right-panel');

            // Restringir el panel de tareas para Admin/Supervisor (solo lectura)
            const taskControls = document.querySelector('.task-controls');
            if (taskControls) taskControls.style.display = 'none';
            const actionBar = document.querySelector('.action-bar');
            if (actionBar) actionBar.style.display = 'none';
            const taskObservation = document.getElementById('taskObservation');
            if (taskObservation) {
                taskObservation.readOnly = true;
                taskObservation.placeholder = "Detalles de la tarea...";
            }

            // Forzar vista de Monitoreo Realtime como inicial
            const viewMonitoreo = document.getElementById('view-monitoreo');
            if (viewMonitoreo && navMonitoreo) {
                document.querySelectorAll('.view-panel').forEach(v => v.style.display = 'none');
                viewMonitoreo.style.display = 'block';
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                navMonitoreo.classList.add('active');
            }

            // Iniciar sincronización en tiempo real para Monitoreo
            startActiveSessionsListener();
            populateGestoresDropdown();

            // Listeners for Monitoreo filters
            const searchInput = document.getElementById('monitoreoSearchInput');
            const shiftSelect = document.getElementById('filterShiftSelect');
            const statusSelect = document.getElementById('filterStatusSelect');
            const clearMonitoreoFiltersBtn = document.getElementById('clearMonitoreoFiltersBtn');

            if (searchInput) searchInput.addEventListener('change', renderActiveSessionsDashboard);
            if (shiftSelect) shiftSelect.addEventListener('change', renderActiveSessionsDashboard);
            if (statusSelect) statusSelect.addEventListener('change', renderActiveSessionsDashboard);

            if (clearMonitoreoFiltersBtn) {
                clearMonitoreoFiltersBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (shiftSelect) shiftSelect.value = '';
                    if (statusSelect) statusSelect.value = '';
                    renderActiveSessionsDashboard();
                });
            }

            // Close Monitoreo modal listeners
            const closeBtn = document.getElementById('closeMonitoreoModalBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    const modal = document.getElementById('monitoreoModal');
                    if (modal) modal.classList.remove('active');
                });
            }
            const modalOverlay = document.getElementById('monitoreoModal');
            if (modalOverlay) {
                modalOverlay.addEventListener('click', (e) => {
                    if (e.target === modalOverlay) {
                        modalOverlay.classList.remove('active');
                    }
                });
            }
            
            // Ocultar formulario de pedir permiso
            const crearPermisoPanel = document.getElementById('crearPermisoPanel');
            const permisosLayout = document.getElementById('permisosLayout');
            if(crearPermisoPanel) crearPermisoPanel.style.display = 'none';
            if(permisosLayout) permisosLayout.style.gridTemplateColumns = '1fr';
            if(permissionForm) permissionForm.style.display = 'none';
            
            // Cambiar Finalizar Turno por Cerrar Sesión
            if(endShiftBtn) {
                endShiftBtn.innerHTML = "<i class='bx bx-log-out'></i> Cerrar Sesión";
                endShiftBtn.onclick = function(e) {
                    e.preventDefault();
                    if(confirm("¿Seguro que deseas cerrar sesión?")) {
                        localStorage.removeItem('riskOps_currentUser');
                        firebase.auth().signOut().catch(err => console.error(err));
                        window.location.href = 'login.html';
                    }
                };
            }
            
            // Ocultar el badge del turno para Admin/Supervisor
            const headerShiftBadgeAdmin = document.querySelector('.shift-badge');
            if (headerShiftBadgeAdmin) headerShiftBadgeAdmin.style.display = 'none';

            if (currentUser.role === 'Admin') {
                renderPendingUsers();
            }
            
            const notifList = document.getElementById('notificationList');
            const notifCount = document.getElementById('notificationCount');

            database.ref('permissions').on('value', (snapshot) => {
                let unreadCount = 0;
                let notifsHtml = '';
                
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const perms = Object.keys(data).map(k => ({...data[k], fb_id: k}));
                    const pending = perms.filter(p => p.status === 'Pendiente');
                    pending.sort((a,b) => b.id - a.id);
                    
                    pending.forEach(p => {
                        if (p.notified_admin === false) unreadCount++;
                        let bg = p.notified_admin === false ? 'rgba(59,130,246,0.1)' : 'transparent';
                        
                        notifsHtml += `
                            <div style="background: ${bg}; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); display: flex; gap: 10px; align-items: start; cursor: pointer; transition: background 0.2s;" onclick="document.getElementById('navAprobaciones').click(); document.getElementById('notificationDropdown').style.display = 'none';">
                                <i class='bx bx-time' style="color: var(--warning); font-size: 18px; margin-top: 2px;"></i>
                                <div style="flex-grow: 1;">
                                    <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">Nuevo Permiso Solicitado</div>
                                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHTML(p.gestor)} - ${escapeHTML(p.tipo)}</div>
                                </div>
                            </div>
                        `;
                    });
                }
                
                if (notifsHtml === '') {
                    notifList.innerHTML = '<p style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px;">No tienes notificaciones nuevas.</p>';
                } else {
                    notifList.innerHTML = notifsHtml;
                }
                
                if (unreadCount > 0) {
                    notifCount.textContent = unreadCount;
                    notifCount.style.display = 'block';
                } else {
                    notifCount.style.display = 'none';
                }
            });
            
        } else {
            // Escuchar notificaciones en tiempo real para el Gestor
            const notifList = document.getElementById('notificationList');
            const notifCount = document.getElementById('notificationCount');

            const authUid = currentUser.uid || (firebase.auth().currentUser && firebase.auth().currentUser.uid);
            if (!authUid) return;
            database.ref('permissions').orderByChild('uid').equalTo(authUid).on('value', (snapshot) => {
                let unreadCount = 0;
                let notifsHtml = '';
                
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const perms = Object.keys(data).map(k => ({...data[k], fb_id: k}));
                    // Solo finalizados
                    const finished = perms.filter(p => p.status !== 'Pendiente');
                    finished.sort((a,b) => b.id - a.id);
                    
                    finished.forEach(p => {
                        if (p.notified === false) unreadCount++;
                        let bg = p.notified === false ? 'rgba(59,130,246,0.1)' : 'transparent';
                        let iconColor = p.status === 'Aprobado' ? 'var(--success)' : 'var(--danger)';
                        let icon = p.status === 'Aprobado' ? 'bx-check-double' : 'bx-x';
                        let reasonHtml = p.rejectionReason ? `<div style="font-size:11px; color:var(--danger); margin-top:2px;">Razón: ${escapeHTML(p.rejectionReason)}</div>` : '';
                        
                        notifsHtml += `
                            <div style="background: ${bg}; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); display: flex; gap: 10px; align-items: start; cursor: pointer; transition: background 0.2s;" onclick="document.getElementById('navPermisos').click(); document.getElementById('notificationDropdown').style.display = 'none';">
                                <i class='bx ${icon}' style="color: ${iconColor}; font-size: 18px; margin-top: 2px;"></i>
                                <div style="flex-grow: 1;">
                                    <div style="font-size: 12px; font-weight: 500; color: var(--text-primary);">Permiso ${escapeHTML(p.status)}</div>
                                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHTML(p.fecha)} (${escapeHTML(p.horaInicio)} a ${escapeHTML(p.horaFin)})</div>
                                    ${reasonHtml}
                                </div>
                            </div>
                        `;
                    });
                }
                
                if (notifsHtml === '') {
                    notifList.innerHTML = '<p style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px;">No tienes notificaciones nuevas.</p>';
                } else {
                    notifList.innerHTML = notifsHtml;
                }
                
                if (unreadCount > 0) {
                    notifCount.textContent = unreadCount;
                    notifCount.style.display = 'block';
                } else {
                    notifCount.style.display = 'none';
                }
            });
        }
    }

    const statusBtns = document.querySelectorAll('.btn-status');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            // Only toggle if it's not the 'No Realizada', as it opens a modal
            if(!this.classList.contains('not-done')) {
                statusBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });

    // Help Button (Instructivo)
    const helpBtn = document.getElementById('helpBtn');
    if(helpBtn) {
        helpBtn.addEventListener('click', () => {
            if(!currentSelectedTask) {
                alert("Selecciona una tarea primero.");
                return;
            }
            
            const taskName = (currentSelectedTask['Tarea'] || currentSelectedTask.name || '').toLowerCase();
            const archivos = [
                "Instructivo de revisión de apuestas casino.pdf",
                "Instructivo de validación de GGR Casino.pdf",
                "Política Procedimiento De Aprobación De Retiros.pdf",
                "Procedimiento Identificación de jineteo.pdf",
                "Proceso de Eliminación de Cuentas - Implementaciones.pdf",
                "VALIDACIÓN DE ABUSO DE BONOS EN CAMPAÑAS DE CRM.pdf",
                "Revisión de Eventos Deportivos.mp4",
                "Revisión de Eventos.mp4",
                "Validación SEON.mp4"
            ];
            
            let matchedDoc = null;
            if (taskName.includes('ggr')) matchedDoc = "Instructivo de validación de GGR Casino.pdf";
            else if (taskName.includes('apuesta')) matchedDoc = "Instructivo de revisión de apuestas casino.pdf";
            else if (taskName.includes('retiro')) matchedDoc = "Política Procedimiento De Aprobación De Retiros.pdf";
            else if (taskName.includes('jineteo')) matchedDoc = "Procedimiento Identificación de jineteo.pdf";
            else if (taskName.includes('eliminaci')) matchedDoc = "Proceso de Eliminación de Cuentas - Implementaciones.pdf";
            else if (taskName.includes('bonos')) matchedDoc = "VALIDACIÓN DE ABUSO DE BONOS EN CAMPAÑAS DE CRM.pdf";
            else if (taskName.includes('deportiv')) matchedDoc = "Revisión de Eventos Deportivos.mp4";
            else if (taskName.includes('evento')) matchedDoc = "Revisión de Eventos.mp4";
            else if (taskName.includes('seon')) matchedDoc = "Validación SEON.mp4";
            
            if (matchedDoc) {
                window.open(getDocUrl(matchedDoc), "_blank");
            } else {
                alert("No se encontró un documento específico para esta tarea. Por favor, búscalo en la pestaña Documentación.");
            }
        });
    }

    // Listeners para filtros de historial de turnos
    const filterGestorInput = document.getElementById('filterGestorInput');
    const filterFechaInput = document.getElementById('filterFechaInput');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (filterGestorInput) filterGestorInput.addEventListener('input', applyShiftReportsFilters);
    if (filterFechaInput) filterFechaInput.addEventListener('change', applyShiftReportsFilters);
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            resetCustomMultiSelect('turnosGestorMultiSelect');
            if (filterFechaInput) filterFechaInput.value = '';
            applyShiftReportsFilters();
        });
    }

    // Navegación de Vistas (Tabs)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Evitar redirigir erróneamente en el botón soporte real
            if(item.id === 'navSoporte' || item.textContent.includes('Soporte')) {
                alert("Redirigiendo al IT HelpDesk...");
                return;
            }

            // UI
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Ocultar todas las vistas
            document.querySelectorAll('.view-panel').forEach(v => v.style.display = 'none');
            
            // Mostrar por defecto el top-header para todas las vistas (se oculta en casos específicos)
            const topHeader = document.querySelector('.top-header');
            if (topHeader) topHeader.style.display = 'flex';

            // Mostrar la correcta
            if (item.id === 'navWorkspace') {
                document.getElementById('view-workspace').style.display = 'block';
            } else if (item.id === 'navHorario') {
                document.getElementById('view-horario').style.display = 'block';
                loadSchedule();
                loadTeletrabajo();
            } else if (item.id === 'navTeletrabajo') {
                document.getElementById('view-teletrabajo').style.display = 'block';
            } else if (item.id === 'navDocs') {
                document.getElementById('view-docs').style.display = 'block';
            } else if (item.id === 'navPermisos') {
                document.getElementById('view-permisos').style.display = 'block';
            } else if (item.id === 'navTurnos') {
                document.getElementById('view-turnos').style.display = 'block';
                renderShiftReports();
            } else if (item.id === 'navAprobaciones') {
                document.getElementById('view-aprobaciones').style.display = 'block';
                if (currentUser && currentUser.role === 'Admin') {
                    renderPendingUsers();
                }
                renderPendingPermissions();
            } else if (item.id === 'navMonitoreo') {
                const viewMonitoreo = document.getElementById('view-monitoreo');
                if (viewMonitoreo) viewMonitoreo.style.display = 'block';
                renderActiveSessionsDashboard();
            } else if (item.id === 'navEficienciaOperativa') {
                const viewEficiencia = document.getElementById('view-eficiencia-operativa');
                if (viewEficiencia) viewEficiencia.style.display = 'block';
                if (topHeader) topHeader.style.display = 'none';
                loadControlOperativoData();
            } else if (item.id === 'navTiempos') {
                const viewTiempos = document.getElementById('view-tiempos');
                if (viewTiempos) viewTiempos.style.display = 'block';
                if (topHeader) topHeader.style.display = 'none';
                loadTiemposMetrics();
            } else if (item.id === 'navComunicados') {
                const viewComunicados = document.getElementById('view-comunicados');
                if (viewComunicados) viewComunicados.style.display = 'block';
                renderGestorComunicados();
            } else if (item.id === 'navAdminComunicados') {
                const viewAdminComunicados = document.getElementById('view-gestion-comunicados');
                if (viewAdminComunicados) viewAdminComunicados.style.display = 'block';
                renderAdminComunicados();
            }
        });
    });

    // Inyectar documentos reales de la carpeta "Procesos" en el Módulo de Docs
    const docsGrid = document.querySelector('.docs-grid');
    if(docsGrid) {
        fetch('procesos_list.json?t=' + Date.now())
        .then(res => res.json())
        .then(archivos => {
            archivos.forEach(file => {
                const isVideo = file.toLowerCase().endsWith('.mp4');
                const isWord = file.toLowerCase().endsWith('.docx') || file.toLowerCase().endsWith('.doc');
                const isExcel = file.toLowerCase().endsWith('.xlsx') || file.toLowerCase().endsWith('.xls');
                const isHtml = file.toLowerCase().endsWith('.html');
                
                let icon = 'bx-file-pdf';
                let color = '#FF5A5A'; // PDF red
                
                if(isVideo) { icon = 'bx-video'; color = '#3B82F6'; }
                else if(isWord) { icon = 'bx-file-blank'; color = '#2563EB'; } // Word blue
                else if(isExcel) { icon = 'bx-table'; color = '#10B981'; } // Excel green
                else if(isHtml) { icon = 'bx-globe'; color = '#F59E0B'; } // HTML orange

                docsGrid.innerHTML += `
                    <a href="${escapeHTML(getDocUrl(file))}" target="_blank" rel="noopener noreferrer" class="glass-panel" style="padding: 20px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; transition: transform 0.2s;">
                        <i class='bx ${icon}' style="font-size: 40px; color: ${color};"></i>
                        <span style="font-size: 14px; color: var(--text-primary); font-weight: 500;">${escapeHTML(file.replace(/\.[^/.]+$/, ""))}</span>
                    </a>
                `;
            });
        })
        .catch(err => console.error("Error cargando la lista de procesos:", err));
    }

    // Poblar nombre en form de permisos y manejar envío por AJAX
    if(currentUser) {
        const pName = document.getElementById('permisoGestorName');
        if(pName) pName.value = currentUser.name;
    }
    
    // Botón de guardar progreso en tarea
    const saveTaskBtn = document.getElementById('saveTaskBtn');
    if(saveTaskBtn) {
        saveTaskBtn.addEventListener('click', () => {
            const selectedStatusBtn = document.querySelector('.btn-status.active');
            
            // Validación obligatoria para todas las tareas
            const obsField = document.getElementById('taskObservation');
            if(!obsField || !obsField.value.trim()) {
                alert("OBLIGATORIO: Debes detallar la gestión realizada en las Notas Técnicas antes de guardar.");
                return;
            }

            const btn = saveTaskBtn;
            const prevText = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
            btn.disabled = true;

            setTimeout(() => {
                btn.innerHTML = "<i class='bx bx-check'></i> Guardado Exitosamente";
                btn.classList.add('btn-success');
                
                // Actualizar estado visual de la tarea activa en el árbol
                const activeTask = document.querySelector('.task-item.active .task-status');
                const selectedStatusBtn = document.querySelector('.btn-status.active');
                
                if(activeTask && selectedStatusBtn) {
                    // Limpiar clases anteriores
                    activeTask.classList.remove('status-pending', 'status-completed', 'status-not-done', 'status-in-progress');
                    
                    if(selectedStatusBtn.classList.contains('completed')) {
                        activeTask.classList.add('status-completed');
                    } else if(selectedStatusBtn.classList.contains('in-progress')) {
                        activeTask.classList.add('status-in-progress');
                    } else if(selectedStatusBtn.classList.contains('not-done')) {
                        activeTask.classList.add('status-not-done');
                    } else {
                        activeTask.classList.add('status-pending');
                    }
                    
                    // Save to cache
                    const obsValue = document.getElementById('taskObservation') ? document.getElementById('taskObservation').value : '';
                    if(currentActiveTaskId !== null) {
                        taskStateCache[currentActiveTaskId] = {
                            name: currentSelectedTask ? currentSelectedTask['Tarea'] : 'Tarea ' + currentActiveTaskId,
                            status: selectedStatusBtn.textContent.trim(),
                            observation: obsValue
                        };
                        localStorage.setItem('riskOps_cache', JSON.stringify(taskStateCache));
                    }
                    
                    updateKPI();
                }

                setTimeout(() => {
                    btn.innerHTML = prevText;
                    btn.disabled = false;
                    btn.classList.remove('btn-success');
                }, 2000);
            }, 800);
        });
    }

    const pForm = document.getElementById('permisosForm');
    
    // Toggle para la opción "Otro"
    const pSelect = document.getElementById('tipoPermisoSelect');
    const pOtroCont = document.getElementById('otroPermisoContainer');
    const pOtroInp = document.getElementById('otroPermisoInput');
    const stdDateCont = document.getElementById('standardDateContainer');
    const vacDateCont = document.getElementById('vacacionesDateContainer');
    if(pSelect && pOtroCont && pOtroInp) {
        pSelect.addEventListener('change', (e) => {
            if(e.target.value === 'Otro') {
                pOtroCont.style.display = 'block';
                pOtroInp.required = true;
            } else {
                pOtroCont.style.display = 'none';
                pOtroInp.required = false;
                pOtroInp.value = '';
            }
            
            if(stdDateCont && vacDateCont) {
                if(e.target.value === 'Vacaciones') {
                    stdDateCont.style.display = 'none';
                    vacDateCont.style.display = 'grid';
                    document.getElementById('permisoFecha').required = false;
                    document.getElementById('permisoHoraInicio').required = false;
                    document.getElementById('permisoHoraFin').required = false;
                    document.getElementById('permisoFechaDesde').required = true;
                    document.getElementById('permisoFechaHasta').required = true;
                } else {
                    stdDateCont.style.display = 'block';
                    vacDateCont.style.display = 'none';
                    document.getElementById('permisoFecha').required = true;
                    document.getElementById('permisoHoraInicio').required = true;
                    document.getElementById('permisoHoraFin').required = true;
                    document.getElementById('permisoFechaDesde').required = false;
                    document.getElementById('permisoFechaHasta').required = false;
                }
            }
        });
    }

    if(pForm) {
        pForm.addEventListener('submit', async function(e) {
            e.preventDefault(); // Evitar recarga
            
            const formData = new FormData(pForm);
            formData.append("_cc", "sara.santamaria@virtualsoft.tech");
            
            const tipo = formData.get("Tipo_Permiso");
            const especifico = formData.get("Especificacion_Otro");
            const finalTipo = tipo === 'Otro' ? `Otro (${especifico})` : tipo;

            let finalFecha = formData.get("Fecha");
            let finalHoraInicio = formData.get("Hora_Inicio");
            let finalHoraFin = formData.get("Hora_Fin");
            
            if (tipo === 'Vacaciones') {
                finalFecha = `Desde: ${formData.get("Fecha_Desde")} - Hasta: ${formData.get("Fecha_Hasta")}`;
                finalHoraInicio = 'N/A';
                finalHoraFin = 'N/A';
            }

            const now = new Date();
            const fechaSolicitudStr = now.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const horaSolicitudStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const timestampSolicitud = `${fechaSolicitudStr} ${horaSolicitudStr}`;

            const userUid = (currentUser && currentUser.uid) || (firebase.auth().currentUser ? firebase.auth().currentUser.uid : null);
            const userEmail = (currentUser && currentUser.email) || (firebase.auth().currentUser ? firebase.auth().currentUser.email : '');

            const newPermiso = {
                id: now.getTime(),
                uid: userUid,
                email: userEmail,
                gestor: formData.get("Gestor"),
                tipo: finalTipo,
                fecha: finalFecha,
                horaInicio: finalHoraInicio,
                horaFin: finalHoraFin,
                horaSolicitud: timestampSolicitud,
                motivo: formData.get("Justificacion"),
                status: 'Pendiente',
                approved: false,
                notified: false,
                notified_admin: false
            };
            
            const btn = pForm.querySelector('button[type="submit"]');
            const prevText = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Enviando solicitud...";
            btn.disabled = true;

            try {
                await database.ref('permissions').push(newPermiso);
            } catch(e) {
                console.error("Error Firebase local", e);
            }

            fetch(pForm.action, {
                method: pForm.method,
                body: formData,
                headers: { 'Accept': 'application/json' }
            }).then(response => {
                if(response.ok) {
                    alert('¡Permiso solicitado exitosamente! Está pendiente de aprobación.');
                    pForm.reset();
                    if(currentUser) pForm.querySelector('#permisoGestorName').value = currentUser.name;
                    loadPermisos(); // Refresh local permissions UI if they are an admin looking at it
                } else {
                    alert('Hubo un error contactando el servidor de correos.');
                }
            }).catch(err => {
                alert('No hay Internet. Se simula envío exitoso.');
            }).finally(() => {
                btn.innerHTML = prevText;
                btn.disabled = false;
            });
        });
    }
}

// Lógica de Desayuno
function toggleBreakfastBreak() {
    if (!currentUser) return;
    const btn = document.getElementById('toggleBreakfastBtn');
    
    if (!isBreakfastBreak) {
        if (isLunchBreak) { alert("Debes volver del almuerzo primero."); return; }
        isBreakfastBreak = true;
        breakfastStartTime = Date.now();
        pushTimelineEvent('Desayuno', 'start');
        saveBreakState();
        if(btn) {
            btn.innerHTML = "<i class='bx bx-check-circle'></i> Volver del Desayuno";
            btn.classList.remove('btn-outline');
            btn.style.backgroundColor = "rgba(255, 152, 0, 0.15)";
            btn.style.color = "#ff9800";
            btn.style.borderColor = "rgba(255, 152, 0, 0.5)";
            btn.style.boxShadow = "0 0 15px rgba(255, 152, 0, 0.2)";
        }
        syncActiveSessionToFirebase();
    } else {
        isBreakfastBreak = false;
        if(breakfastStartTime) {
            totalBreakfastTimeMs += (Date.now() - breakfastStartTime);
        }
        breakfastStartTime = null;
        pushTimelineEvent('Desayuno', 'end');
        saveBreakState();
        if(btn) {
            btn.innerHTML = "<i class='bx bx-coffee'></i> Tomar Desayuno";
            btn.classList.add('btn-outline');
            btn.style.backgroundColor = "";
            btn.style.color = "var(--text-primary)";
            btn.style.borderColor = "rgba(255,255,255,0.2)";
            btn.style.boxShadow = "";
        }
        updateActivity();
        syncActiveSessionToFirebase();
    }
}

// Lógica de Almuerzo
function toggleLunchBreak() {
    if (!currentUser) return;
    const btn = document.getElementById('toggleLunchBtn');
    
    if (!isLunchBreak) {
        if (isBreakfastBreak) { alert("Debes volver del desayuno primero."); return; }
        isLunchBreak = true;
        lunchStartTime = Date.now();
        pushTimelineEvent('Almuerzo', 'start');
        saveBreakState();
        if(btn) {
            btn.innerHTML = "<i class='bx bx-check-circle'></i> Volver del Almuerzo/Cena";
            btn.classList.remove('btn-outline');
            btn.style.backgroundColor = "rgba(0, 188, 212, 0.15)";
            btn.style.color = "#00bcd4";
            btn.style.borderColor = "rgba(0, 188, 212, 0.5)";
            btn.style.boxShadow = "0 0 15px rgba(0, 188, 212, 0.2)";
        }
        syncActiveSessionToFirebase();
    } else {
        isLunchBreak = false;
        if(lunchStartTime) {
            totalLunchTimeMs += (Date.now() - lunchStartTime);
        }
        lunchStartTime = null;
        pushTimelineEvent('Almuerzo', 'end');
        saveBreakState();
        if(btn) {
            btn.innerHTML = "<i class='bx bx-restaurant'></i> Tomar Almuerzo/Cena";
            btn.classList.add('btn-outline');
            btn.style.backgroundColor = "";
            btn.style.color = "var(--text-primary)";
            btn.style.borderColor = "rgba(255,255,255,0.2)";
            btn.style.boxShadow = "";
        }
        updateActivity();
        syncActiveSessionToFirebase();
    }
}

async function persistShiftClosureCore(reportUid, loginLogId, shiftReportObject) {
    if (!reportUid) throw new Error('Missing authenticated UID for shift closure');
    if (!loginLogId) throw new Error('Missing login log ID for shift closure');

    const reportRef = database.ref('shift_reports').push();
    if (!reportRef.key) throw new Error('Unable to allocate shift report ID');

    const updates = {};
    updates[`shift_reports/${reportRef.key}`] = shiftReportObject;
    updates[`active_sessions/${reportUid}`] = null;
    updates[`login_logs/${loginLogId}/logoutTime`] = firebase.database.ServerValue.TIMESTAMP;

    await database.ref().update(updates);
    return reportRef.key;
}

async function handleEndShift() {
    if(confirm("¿Estás seguro que deseas finalizar tu turno actual? Se enviará un resumen al supervisor.")) {
        // Cerrar almuerzo o desayuno si quedó abierto
        if (isLunchBreak) toggleLunchBreak();
        if (isBreakfastBreak) toggleBreakfastBreak();

        
        let localUser = null;
        try { localUser = JSON.parse(localStorage.getItem('riskOps_currentUser')); } catch(e) {}
        
        if (localUser) {
            // Build task report
            const setSelect = document.getElementById('activeSetSelect');
            if(setSelect && setSelect.value === 'Todos') {
                alert("OBLIGATORIO: Debes seleccionar el SET específico en el que trabajaste antes de finalizar el turno (Arriba a la derecha).");
                return;
            }

            const formData = new FormData();
            
            // Format login time
            const loginDate = new Date(localUser.loginTime);
            const endDate = new Date();
            
            // Calculo de tiempos tomados
            const lunchMinutes = parseFloat((totalLunchTimeMs / (1000 * 60)).toFixed(1));
            const breakfastMinutes = parseFloat((totalBreakfastTimeMs / (1000 * 60)).toFixed(1));
            
            // Calculo de penalidades (excesos)
            const allowedLunch = 60;
            const allowedBreakfast = 15;
            
            let extraLunch = Math.max(0, lunchMinutes - allowedLunch);
            let extraBreakfast = Math.max(0, breakfastMinutes - allowedBreakfast);
            
            let inactividadMins = 0;
            if (shiftTimeline && shiftTimeline.length > 0) {
                shiftTimeline.forEach(ev => {
                    if (ev.type === 'Inactividad') {
                        let eTime = ev.end ? ev.end : Date.now();
                        inactividadMins += (eTime - ev.start) / (1000 * 60);
                    }
                });
            }
            
            let penalidadConectividadMins = parseFloat((extraLunch + extraBreakfast + inactividadMins).toFixed(1));

            // Calculo de tiempo efectivo
            const totalShiftMs = endDate.getTime() - loginDate.getTime();
            // Restamos TODAS las pausas, pero además la penalidad adicional sobre las horas efectivas
            const effectiveShiftMs = totalShiftMs - totalLunchTimeMs - totalBreakfastTimeMs - (penalidadConectividadMins * 60 * 1000);
            const effectiveHours = Math.max(0, (effectiveShiftMs / (1000 * 60 * 60))).toFixed(2);
            
            formData.append("Usuario", localUser.name);
            formData.append("Rol", localUser.role);
            formData.append("Reporte", "CIERRE DE TURNO Y RESUMEN DE TAREAS");
            formData.append("Hora_Inicio_Turno", loginDate.toLocaleString());
            formData.append("Hora_Fin_Turno", endDate.toLocaleString());
            formData.append("Tiempo_Almuerzo_Descontado", lunchMinutes + " minutos");
            formData.append("Tiempo_Desayuno_Descontado", breakfastMinutes + " minutos");
            formData.append("Exceso_Pausas_Penalidad", penalidadConectividadMins + " minutos");
            formData.append("Horas_Efectivas_Trabajadas", effectiveHours + " hrs");
            
            // Consolidar eventos duplicados o superpuestos en shiftTimeline antes de armar la bitácora
            let cleanTimeline = [];
            if (shiftTimeline && shiftTimeline.length > 0) {
                // Separar pausas programadas (Desayuno / Almuerzo) de inactividades automáticas
                const breaks = shiftTimeline.filter(b => b.type === 'Desayuno' || b.type === 'Almuerzo');
                let sortedEvs = [...shiftTimeline].sort((a, b) => a.start - b.start);
                
                sortedEvs.forEach(ev => {
                    let evStart = ev.start;
                    let evEnd = ev.end || endDate.getTime();
                    if (evEnd <= evStart) return;

                    // Si es Inactividad, descartar si dura menos de 30s o si cae totalmente dentro de un Desayuno/Almuerzo
                    if (ev.type === 'Inactividad') {
                        if (evEnd - evStart < 30000) return;
                        let insideBreak = breaks.some(b => {
                            let bStart = b.start;
                            let bEnd = b.end || endDate.getTime();
                            return evStart >= bStart && evEnd <= bEnd;
                        });
                        if (insideBreak) return;
                    }

                    if (cleanTimeline.length === 0) {
                        cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                    } else {
                        let prev = cleanTimeline[cleanTimeline.length - 1];
                        if (prev.type === ev.type && evStart <= prev.end + 60000) {
                            // Unificar si es del mismo tipo y continuo (o con menos de 1 min de diferencia)
                            prev.end = Math.max(prev.end, evEnd);
                        } else if (evStart < prev.end) {
                            // Si se traslapan eventos de distinto tipo:
                            if (ev.type === 'Inactividad') {
                                // Ajustar el inicio de la inactividad después de que termina el evento anterior
                                if (evEnd > prev.end) {
                                    evStart = prev.end;
                                    if (evEnd - evStart >= 30000) {
                                        cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                                    }
                                }
                            } else {
                                cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                            }
                        } else {
                            cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                        }
                    }
                });
            }

            // Construir reporte de bitácora
            let bitacoraTexto = "";
            if (cleanTimeline.length > 0) {
                cleanTimeline.forEach(ev => {
                    const s = new Date(ev.start).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
                    const eTime = ev.end ? new Date(ev.end).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'}) : "No regresó";
                    bitacoraTexto += `- ${ev.type}: inicio ${s} fin ${eTime}\n`;
                });
            } else {
                bitacoraTexto = "No se registraron pausas o inactividades.";
            }
            formData.append("Bitacora_de_Tiempos", bitacoraTexto);
            
            if(setSelect) {
                formData.append("SET_Principal_Trabajado", setSelect.value);
            }
            
            formData.append("_subject", `Reporte de Turno: ${localUser.name}`);
            formData.append("_captcha", "false");
            formData.append("_cc", "sara.santamaria@virtualsoft.tech");
            
            // Build task report
            let report = "";
            let keys = Object.keys(taskStateCache);
            if(keys.length === 0) {
                report = "El gestor no marcó ninguna tarea explícitamente durante este turno.";
            } else {
                keys.forEach(id => {
                    let t = taskStateCache[id];
                    report += `\n[ ${t.status.toUpperCase()} ] - ${t.name}\nObservación: ${t.observation || 'N/A'}\n`;
                });
            }
            report += "\n\n=== BITÁCORA DE TIEMPOS ===\n" + bitacoraTexto;
            formData.append("Resumen_de_Tareas", report);
            
            // Reemplazar texto del botón para feedback visual
            const btn = document.getElementById('endShiftBtn');
            const prevHtml = btn ? btn.innerHTML : '';
            if(btn) {
                btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Notificando...";
                btn.disabled = true;
            }

            // Recalcular inactividadTotalMins usando cleanTimeline limpio sin superposiciones ni duplicados
            let inactividadMinsLimpia = 0;
            if (cleanTimeline && cleanTimeline.length > 0) {
                cleanTimeline.forEach(ev => {
                    if (ev.type === 'Inactividad') {
                        let eTime = ev.end ? ev.end : endDate.getTime();
                        inactividadMinsLimpia += (eTime - ev.start) / (1000 * 60);
                    }
                });
            }
            inactividadMinsLimpia = parseFloat(inactividadMinsLimpia.toFixed(1));

            // --- RESPALDO SEGURO EN FIREBASE ---
            const reportUid = localUser.uid || (currentUser && currentUser.uid) || (firebase.auth().currentUser ? firebase.auth().currentUser.uid : null);
            const shiftReportObject = {
                uid: reportUid,
                gestor: localUser.name,
                rol: localUser.role,
                horaInicio: loginDate.toLocaleString(),
                horaFin: new Date().toLocaleString(),
                turnoProgramado: localUser.shift || 'Por Asignar',
                setTrabajado: setSelect ? setSelect.value : 'N/A',
                reporte: report,
                tasks: taskStateCache,
                timeline: cleanTimeline,
                penalidadConectividadMins: penalidadConectividadMins,
                inactividadTotalMins: inactividadMinsLimpia,
                tiempoAlmuerzoMins: lunchMinutes,
                tiempoDesayunoMins: breakfastMinutes,
                timestamp: Date.now()
            };

            // Persistencia central atómica: reporte, cierre de sesión activa y logoutTime.
            // Si cualquiera falla, no se limpia la sesión local ni se intenta enviar correo.
            try {
                await persistShiftClosureCore(reportUid, localUser.loginLogId, shiftReportObject);
            } catch (coreError) {
                console.error('CORE_SHIFT_CLOSE_FAILED', {
                    code: coreError && coreError.code ? coreError.code : 'unknown',
                    message: coreError && coreError.message ? coreError.message : 'unknown'
                });
                if (btn) {
                    btn.innerHTML = prevHtml;
                    btn.disabled = false;
                }
                alert('No fue posible finalizar el turno porque el reporte o el cierre de sesión no quedó guardado. Intenta nuevamente.');
                return;
            }

            // El cierre central ya quedó persistido; ahora se limpia la sesión local.
            localStorage.removeItem('riskOps_currentUser');
            localStorage.removeItem('riskOps_cache');
            localStorage.removeItem('riskOps_breakState');
            localStorage.removeItem('riskOps_timeline');
            
            // Set the global currentUser to null so syncActiveSessionToFirebase stops firing
            currentUser = null;

            try {
                await firebase.auth().signOut();
            } catch (signOutError) {
                console.error('SHIFT_SIGNOUT_FAILED', {
                    code: signOutError && signOutError.code ? signOutError.code : 'unknown',
                    message: signOutError && signOutError.message ? signOutError.message : 'unknown'
                });
                alert('El turno quedó guardado, pero no fue posible cerrar la autenticación. Recarga la página antes de volver a ingresar.');
                window.location.href = 'login.html';
                return;
            }

            // El correo es una notificación best-effort y nunca revierte el cierre persistido.
            let emailSent = false;
            let emailStatus = null;
            let emailErrorMessage = null;
            try {
                const emailResponse = await fetch('https://formsubmit.co/ajax/maria.sanchez@virtualsoft.tech', {
                    method: 'POST',
                    body: formData,
                    headers: { 'Accept': 'application/json' }
                });
                emailStatus = emailResponse.status;
                emailSent = emailResponse.ok;
            } catch (emailError) {
                emailErrorMessage = emailError && emailError.message ? emailError.message : 'network error';
            }

            if (emailSent) {
                alert('Turno finalizado correctamente y reporte enviado al supervisor.');
            } else {
                console.warn('EMAIL_NOTIFICATION_FAILED', {
                    status: emailStatus,
                    message: emailErrorMessage
                });
                alert('Turno finalizado correctamente. No fue posible enviar la notificación por correo.');
            }
            window.location.href = 'login.html';
        } else {
            alert("Turno finalizado.");
            if (localUser && localUser.loginLogId) {
                database.ref('login_logs/' + localUser.loginLogId).update({
                    logoutTime: firebase.database.ServerValue.TIMESTAMP
                });
            }
            localStorage.removeItem('riskOps_currentUser');
            localStorage.removeItem('riskOps_cache');
            firebase.auth().signOut().catch(err => console.error(err));
            window.location.href = 'login.html';
        }
    }
}

// Inicializar inmediatamente ya que el script está al final del DOM
initApp();

// Modal Logic
function openExceptionModal() {
    // Set 'not-done' active visually
    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-status.not-done').classList.add('active');
    
    // Clear previous exception inputs!
    const exReason = document.getElementById('exceptionReason');
    if(exReason) exReason.value = "";
    const exDetails = document.getElementById('exceptionDetails');
    if(exDetails) exDetails.value = "";
    
    // Open Modal
    const modal = document.getElementById('exceptionModal');
    if(modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        modal.classList.remove('active');
    }
}

function confirmException() {
    const select = document.getElementById('exceptionReason');
    const reasonText = select.options[select.selectedIndex].text;
    const details = document.getElementById('exceptionDetails').value.trim();
    
    if(!select.value) {
        alert('Por favor seleccione una razón principal.');
        return;
    }
    
    if(!details) {
        alert('Por favor detalle el problema obligatoriamente.');
        return;
    }
    
    const obsText = `Excepción: ${reasonText}${details ? ' - ' + details : ''}`;
    document.getElementById('taskObservation').value = obsText;
    closeModal('exceptionModal');
}

function openExtraTaskModal() {
    const modal = document.getElementById('extraTaskModal');
    if (modal) {
        document.getElementById('extraTaskName').value = '';
        document.getElementById('extraTaskStatus').value = 'Finalizada';
        document.getElementById('extraTaskObs').value = '';
        modal.classList.add('active');
    }
}

function saveExtraTask() {
    const name = document.getElementById('extraTaskName').value.trim();
    const status = document.getElementById('extraTaskStatus').value;
    const obs = document.getElementById('extraTaskObs').value.trim();
    
    if (!name) {
        alert("OBLIGATORIO: Debes ingresar el nombre de la tarea extra.");
        return;
    }
    
    if (!obs) {
        alert("OBLIGATORIO: Debes detallar la gestión realizada en las Notas Técnicas.");
        return;
    }
    
    // Generar un ID único para esta tarea extra
    const extraId = 'extra_' + Date.now();
    
    // Guardar en la caché local
    taskStateCache[extraId] = {
        name: "[EXTRA] " + name,
        status: status,
        observation: obs
    };
    localStorage.setItem('riskOps_cache', JSON.stringify(taskStateCache));
    
    updateKPI(); // Actualizar el anillo de progreso
    closeModal('extraTaskModal');
    
    alert(`Tarea Adicional "${name}" agregada exitosamente y se incluirá en tu reporte de turno.`);
}

// Logic for Approving Users
async function renderPendingUsers() {
    const tbody = document.getElementById('pendingUsersTableBody');
    if (!tbody) return;
    
    let users = [];
    try { 
        const snapshot = await database.ref('users').once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            users = Object.keys(data).map(k => ({...data[k], id: k}));
        }
    } catch(e) {
        console.error(e);
    }
    
    const pending = users.filter(u => u.approved === false);
    const approved = users.filter(u => u.approved === true && u.email !== 'maria.sanchez@virtualsoft.tech');
    
    tbody.innerHTML = '';
    
    const searchInput = document.getElementById('filterAprobacionesSearch');
    const statusSelect = document.getElementById('filterAprobacionesStatus');
    const searchVal = searchInput ? normalizeName(searchInput.value) : '';
    const statusVal = statusSelect ? statusSelect.value : 'Todos';

    // Mostramos primero los pendientes, luego los aprobados, ordenados por fecha de registro (más reciente a más antiguo)
    let allDisplayUsers = [...pending, ...approved].sort((a, b) => {
        const dateA = a.registrationDate ? new Date(a.registrationDate).getTime() : 0;
        const dateB = b.registrationDate ? new Date(b.registrationDate).getTime() : 0;
        return dateB - dateA;
    });
    
    // Apply filters
    const hasFilter = searchVal !== '' || statusVal !== 'Todos';
    allDisplayUsers = allDisplayUsers.filter(u => {
        const matchSearch = searchVal === '' || normalizeName(u.name || '').includes(searchVal) || normalizeName(u.email || '').includes(searchVal);
        let matchStatus = true;
        if (statusVal === 'Pendiente') matchStatus = (u.approved === false);
        if (statusVal === 'Aprobado') matchStatus = (u.approved === true);
        return matchSearch && matchStatus;
    });
    
    // Only show top 5 if no filters are active to keep UI clean
    if (!hasFilter && allDisplayUsers.length > 5) {
        allDisplayUsers = allDisplayUsers.slice(0, 5);
        // Add a fake row to indicate there are more
        const total = [...pending, ...approved].length;
        setTimeout(() => {
            if(document.getElementById('pendingUsersTableBody')) {
                document.getElementById('pendingMostrandoMsg') ? document.getElementById('pendingMostrandoMsg').remove() : null;
                const msg = document.createElement('div');
                msg.id = 'pendingMostrandoMsg';
                msg.style = 'text-align: center; font-size: 11px; color: var(--text-secondary); margin-top: 10px; margin-bottom: 15px; font-style: italic;';
                msg.innerText = `Mostrando los 5 registros más recientes de ${total} en total. Usa los filtros arriba para buscar más.`;
                document.getElementById('pendingUsersTableBody').parentElement.parentElement.appendChild(msg);
            }
        }, 100);
    } else {
        setTimeout(() => {
            if(document.getElementById('pendingMostrandoMsg')) document.getElementById('pendingMostrandoMsg').remove();
        }, 100);
    }
    
    if (allDisplayUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-secondary);">No hay usuarios que coincidan con los filtros.</td></tr>`;
        return;
    }
    
    allDisplayUsers.forEach(user => {
        let actionHtml = '';
        if (user.approved === true) {
            actionHtml = `<span style="color: var(--success); font-weight: bold;"><i class='bx bx-check'></i> Aprobado</span>`;
        } else if (user.approved === 'Rechazado') {
            actionHtml = `<span style="color: var(--danger); font-weight: bold;"><i class='bx bx-x'></i> Rechazado</span>`;
        } else {
            actionHtml = `
                <div id="user-action-btns-${escapeHTML(user.id)}" style="display:flex; justify-content:center; gap:5px;">
                    <button class="btn btn-success" style="padding: 5px 10px; font-size: 12px;" onclick="approveUser(decodeURIComponent('${encodeInlineHandlerArg(user.id)}'))">Aprobar</button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="showUserRejectBox(decodeURIComponent('${encodeInlineHandlerArg(user.id)}'))">Rechazar</button>
                </div>
                <div id="user-reject-box-${escapeHTML(user.id)}" style="display:none; flex-direction:column; gap:5px; margin-top:5px;">
                    <input type="text" id="user-reason-${escapeHTML(user.id)}" placeholder="Motivo de rechazo" class="modern-input" style="padding:4px; font-size:11px; width:100%;">
                    <div style="display:flex; gap:5px; justify-content:center;">
                        <button class="btn btn-danger" style="padding: 2px 5px; font-size: 10px;" onclick="confirmRejectUser(decodeURIComponent('${encodeInlineHandlerArg(user.id)}'))">Confirmar</button>
                        <button class="btn btn-outline" style="padding: 2px 5px; font-size: 10px;" onclick="cancelRejectUser(decodeURIComponent('${encodeInlineHandlerArg(user.id)}'))">Cancelar</button>
                    </div>
                </div>
            `;
        }
        
        let statusBadge = user.approved ? `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success);">${user.role}</span>` : `<span class="badge pending">${user.role}</span>`;

        const regDateStr = user.registrationDate ? new Date(user.registrationDate).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Desconocida';
        const appDateStr = user.approvalDate ? new Date(user.approvalDate).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : (user.approved === true ? 'Desconocida' : '-');
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 12px;">${escapeHTML(user.name)}</td>
                <td style="padding: 12px; color: var(--text-secondary);">${escapeHTML(user.email)}</td>
                <td style="padding: 12px;">${statusBadge}</td>
                <td style="padding: 12px; font-size: 12px;">${escapeHTML(regDateStr)}</td>
                <td style="padding: 12px; font-size: 12px;">${escapeHTML(appDateStr)}</td>
                <td style="padding: 12px; text-align: center;">
                    ${actionHtml}
                </td>
            </tr>
        `;
    });
}

async function approveUser(userId) {
    if(!confirm(`¿Estás seguro de aprobar el acceso para este usuario?`)) return;
    
    try {
        await database.ref('users/' + userId).update({
            approved: true,
            approvalDate: new Date().toISOString()
        });
        alert('Usuario aprobado exitosamente. Ahora puede iniciar sesión.');
        renderPendingUsers(); // Reload table
    } catch(e) {
        alert('Error al contactar al servidor');
    }
}

function showUserRejectBox(id) {
    document.getElementById('user-action-btns-' + id).style.display = 'none';
    document.getElementById('user-reject-box-' + id).style.display = 'flex';
}

function cancelRejectUser(id) {
    document.getElementById('user-reject-box-' + id).style.display = 'none';
    document.getElementById('user-action-btns-' + id).style.display = 'flex';
    document.getElementById('user-reason-' + id).value = '';
}

async function confirmRejectUser(userId) {
    const reason = document.getElementById('user-reason-' + userId).value.trim();
    if (!reason) {
        alert("Debes escribir un motivo de rechazo.");
        return;
    }
    
    try {
        await database.ref('users/' + userId).update({
            approved: 'Rechazado',
            rejectionReason: reason
        });
        alert('Usuario rechazado exitosamente.');
        renderPendingUsers(); // Reload table
    } catch(e) {
        alert('Error al contactar al servidor');
    }
}

// Logic for Approving Permissions
async function renderPendingPermissions() {
    const tbody = document.getElementById('pendingPermissionsTableBody');
    if (!tbody) return;
    
    let permisos = [];
    try { 
        const snapshot = await database.ref('permissions').once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            permisos = Object.keys(data).map(k => ({...data[k], fb_id: k}));
        }
    } catch(e) {
        console.error(e);
    }
    
    const searchInput = document.getElementById('filterPermisosSearch');
    const searchVal = searchInput ? normalizeName(searchInput.value) : '';

    let pending = permisos.filter(p => p.status === 'Pendiente');
    
    // Sort so most recent is first
    pending.sort((a,b) => {
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });
    
    // Limit to 5
    if (pending.length > 5) {
        const total = pending.length;
        pending = pending.slice(0, 5);
        setTimeout(() => {
            if(document.getElementById('pendingPermsMostrandoMsg')) document.getElementById('pendingPermsMostrandoMsg').remove();
            const msg = document.createElement('div');
            msg.id = 'pendingPermsMostrandoMsg';
            msg.style = 'text-align: center; font-size: 11px; color: var(--text-secondary); margin-top: 10px; margin-bottom: 15px; font-style: italic;';
            msg.innerText = `Mostrando los 5 permisos más recientes de ${total} pendientes.`;
            document.getElementById('pendingPermissionsTableBody').parentElement.parentElement.appendChild(msg);
        }, 100);
    } else {
        setTimeout(() => {
            if(document.getElementById('pendingPermsMostrandoMsg')) document.getElementById('pendingPermsMostrandoMsg').remove();
        }, 100);
    }
    
    tbody.innerHTML = '';
    
    if (pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-secondary);">No hay permisos pendientes de aprobación.</td></tr>`;
        return;
    }
    
    pending.forEach(p => {
        let createdTimeText = p.horaSolicitud;
        if (!createdTimeText && p.id) {
            try {
                const d = new Date(p.id);
                createdTimeText = `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:true})}`;
            } catch(err) { createdTimeText = 'N/A'; }
        }

        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 12px; font-weight: 600; color: var(--text-primary);">${escapeHTML(p.gestor)}</td>
                <td style="padding: 12px;">
                    <span class="badge pending">${escapeHTML(p.tipo)}</span>
                    <br><small style="font-size:10px; color:var(--accent-primary); font-weight:500;"><i class='bx bx-time-five'></i> ${escapeHTML(createdTimeText)}</small>
                </td>
                <td style="padding: 12px; color: var(--text-secondary); font-size: 12px; white-space: nowrap;"><strong>${escapeHTML(p.fecha)}</strong><br><span style="opacity: 0.85;">${escapeHTML(p.horaInicio)} a ${escapeHTML(p.horaFin)}</span></td>
                <td style="padding: 12px; font-size: 13px; min-width: 250px;">
                    <div style="background: rgba(255, 255, 255, 0.04); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-primary); line-height: 1.45; word-break: break-word; white-space: pre-wrap;">
                        ${escapeHTML(p.motivo || 'Sin observación')}
                    </div>
                </td>
                <td style="padding: 12px; text-align: center; min-width: 220px;">
                    <div id="perm-action-btns-${escapeHTML(p.fb_id)}" style="display:flex; justify-content:center; gap:8px;">
                        <button class="btn btn-success" style="padding: 6px 14px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;" onclick="showPermApproveBox(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))"><i class='bx bx-check' style="font-size:16px;"></i> Aprobar</button>
                        <button class="btn btn-danger" style="padding: 6px 14px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;" onclick="showPermRejectBox(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))"><i class='bx bx-x' style="font-size:16px;"></i> Rechazar</button>
                    </div>
                    <div id="perm-approve-box-${escapeHTML(p.fb_id)}" style="display:none; flex-direction:column; gap:8px; margin-top:5px; background: rgba(16, 185, 129, 0.08); padding: 10px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3);">
                        <label style="font-size:11px; font-weight:600; color:var(--success); text-align:left;">Observación de aprobación:</label>
                        <textarea id="perm-approve-reason-${escapeHTML(p.fb_id)}" placeholder="Escribe un comentario u observación para el gestor..." class="modern-input" style="padding:8px; font-size:12px; width:100%; min-height:60px; resize:vertical; box-sizing:border-box; border-radius:6px; font-family:inherit;"></textarea>
                        <div style="display:flex; gap:6px; justify-content:flex-end;">
                            <button class="btn btn-success" style="padding: 5px 12px; font-size: 11px;" onclick="confirmApprovePerm(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))">Confirmar Aprobar</button>
                            <button class="btn btn-outline" style="padding: 5px 10px; font-size: 11px;" onclick="cancelApprovePerm(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))">Cancelar</button>
                        </div>
                    </div>
                    <div id="perm-reject-box-${escapeHTML(p.fb_id)}" style="display:none; flex-direction:column; gap:8px; margin-top:5px; background: rgba(239, 68, 68, 0.08); padding: 10px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">
                        <label style="font-size:11px; font-weight:600; color:var(--danger); text-align:left;">Motivo de rechazo:</label>
                        <textarea id="perm-reason-${escapeHTML(p.fb_id)}" placeholder="Escribe la razón por la cual se rechaza..." class="modern-input" style="padding:8px; font-size:12px; width:100%; min-height:60px; resize:vertical; box-sizing:border-box; border-radius:6px; font-family:inherit;"></textarea>
                        <div style="display:flex; gap:6px; justify-content:flex-end;">
                            <button class="btn btn-danger" style="padding: 5px 12px; font-size: 11px;" onclick="confirmRejectPerm(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))">Confirmar Rechazo</button>
                            <button class="btn btn-outline" style="padding: 5px 10px; font-size: 11px;" onclick="cancelRejectPerm(decodeURIComponent('${encodeInlineHandlerArg(p.fb_id)}'))">Cancelar</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    
    const historyBody = document.getElementById('historyPermissionsTableBody');
    if(historyBody) {
        historyBody.innerHTML = '';
        const history = permisos.filter(p => p.status !== 'Pendiente');
        
        if (history.length === 0) {
            historyBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-secondary);">No hay historial de permisos procesados.</td></tr>`;
        } else {
            // Ordenar los más recientes primero
            history.sort((a, b) => b.id - a.id);
            history.forEach(p => {
                let statusBadge = p.status === 'Aprobado' ? `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success);"><i class='bx bx-check'></i> Aprobado</span>` : `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: var(--danger);"><i class='bx bx-x'></i> Rechazado</span>`;
                historyBody.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--glass-border);">
                        <td style="padding: 12px; font-weight: 500;">${escapeHTML(p.gestor)}</td>
                        <td style="padding: 12px;">${escapeHTML(p.tipo)}</td>
                        <td style="padding: 12px;">${statusBadge}</td>
                        <td style="padding: 12px; color: var(--text-secondary); font-size: 13px;">${escapeHTML(p.fecha)}</td>
                        <td style="padding: 12px; font-size: 13px; color: var(--text-secondary);">${escapeHTML(p.rejectionReason || '-')}</td>
                    </tr>
                `;
            });
        }
    }
}

function showPermRejectBox(id) {
    document.getElementById('perm-action-btns-' + id).style.display = 'none';
    document.getElementById('perm-reject-box-' + id).style.display = 'flex';
}

function cancelRejectPerm(id) {
    document.getElementById('perm-reject-box-' + id).style.display = 'none';
    document.getElementById('perm-action-btns-' + id).style.display = 'flex';
    document.getElementById('perm-reason-' + id).value = '';
}

async function confirmRejectPerm(id) {
    const reason = document.getElementById('perm-reason-' + id).value.trim();
    if (!reason) {
        alert("Debes escribir un motivo de rechazo.");
        return;
    }
    await updatePermissionStatus(id, 'Rechazado', reason);
}

function showPermApproveBox(id) {
    document.getElementById('perm-action-btns-' + id).style.display = 'none';
    document.getElementById('perm-approve-box-' + id).style.display = 'flex';
}

function cancelApprovePerm(id) {
    document.getElementById('perm-approve-box-' + id).style.display = 'none';
    document.getElementById('perm-action-btns-' + id).style.display = 'flex';
    document.getElementById('perm-approve-reason-' + id).value = '';
}

function cancelRejectPerm(id) {
    document.getElementById('perm-reject-box-' + id).style.display = 'none';
    document.getElementById('perm-action-btns-' + id).style.display = 'flex';
    document.getElementById('perm-reason-' + id).value = '';
}

async function confirmApprovePerm(id) {
    const reason = document.getElementById('perm-approve-reason-' + id).value.trim();
    await updatePermissionStatus(id, 'Aprobado', reason || 'Aprobado sin observaciones adicionales');
}

async function updatePermissionStatus(fb_id, newStatus, reason = null) {
    try {
        const updates = { status: newStatus, notified: false };
        if (reason) {
            updates.rejectionReason = reason;
        }
        
        await database.ref('permissions/' + fb_id).update(updates);
        
        alert(`Permiso ${newStatus} exitosamente.`);
        renderPendingPermissions(); // Reload table
        loadPermisos(); // Reload historical permissions if looking at it
    } catch(e) {
        alert('Error al contactar al servidor');
    }
}

// Exportar Reporte a PDF
window.exportShiftReport = async function(fb_id) {
    try {
        let reportObj = allShiftReports.find(r => r.fb_id === fb_id);
        if (!reportObj) {
            const snapshot = await database.ref('shift_reports/' + fb_id).once('value');
            if(snapshot.exists()) reportObj = snapshot.val();
        }
        if(!reportObj) return alert("No se encontró el reporte en la base de datos.");
        
        let reportText = reportObj.reporte || 'Sin reporte detallado';
        let bitacoraLines = [];
        if (reportText.includes('=== BITÁCORA DE TIEMPOS ===')) {
            const parts = reportText.split('=== BITÁCORA DE TIEMPOS ===');
            reportText = parts[0].trim();
            const rawBitacora = parts[1].trim();
            if (rawBitacora) {
                const lines = rawBitacora.split('\n').map(l => l.trim()).filter(Boolean);
                lines.forEach(l => {
                    if (!bitacoraLines.includes(l)) bitacoraLines.push(l);
                });
            }
        }

        const formattedReportText = reportText.replace(/\n/g, '<br>').replace(/\[(.*?)\]/g, '<span style="background: #E0E7FF; color: #3730A3; padding: 2px 6px; border-radius: 4px; font-weight: 600;">$1</span>');

        let bitacoraHtml = '';
        if (bitacoraLines.length > 0) {
            bitacoraHtml = bitacoraLines.map(l => `<div style="padding: 6px 10px; background: #F1F5F9; border-radius: 4px; font-family: monospace; font-size: 11px; color: #334155; margin-bottom: 4px; border-left: 3px solid #3B82F6;">${l}</div>`).join('');
        } else {
            bitacoraHtml = '<div style="color: #64748B; font-size: 12px; font-style: italic;">No se registraron pausas o inactividades en este turno.</div>';
        }

        // Crear elemento HTML temporal limpio para renderizado PDF
        const pdfContainer = document.createElement('div');
        pdfContainer.style = "width: 750px; padding: 25px; background: #FFFFFF; font-family: 'Inter', sans-serif; color: #0F172A;";
        pdfContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3B82F6; padding-bottom: 12px; margin-bottom: 20px;">
                <div>
                    <h1 style="margin: 0; font-size: 22px; color: #1E293B; font-weight: 700;">RISK MANAGER</h1>
                    <span style="font-size: 12px; color: #64748B;">Detalle de Turno y Control Operativo</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 11px; color: #64748B; display: block;">Fecha de Generación</span>
                    <strong style="font-size: 12px; color: #0F172A;">${new Date().toLocaleDateString('es-CO')}</strong>
                </div>
            </div>

            <!-- Encabezado Gestor y Rol -->
            <div style="display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; padding: 16px; border-radius: 8px; border: 1px solid #E2E8F0; margin-bottom: 15px;">
                <div>
                    <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748B; display: block;">GESTOR</span>
                    <strong style="font-size: 18px; color: #0F172A; margin-top: 2px; display: block;">${reportObj.gestor}</strong>
                    <span style="font-size: 12px; color: #2563EB; font-weight: 600;">Rol: ${reportObj.rol || 'Gestor'}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748B; display: block;">SET PRINCIPAL TRABAJADO</span>
                    <strong style="font-size: 15px; color: #059669; margin-top: 2px; display: block;">${reportObj.setTrabajado || 'N/A'}</strong>
                </div>
            </div>

            <!-- Tiempos e Indicadores -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px;">
                <div style="background: #F8FAFC; padding: 10px 12px; border-radius: 6px; border: 1px solid #E2E8F0;">
                    <small style="color: #64748B; display: block; font-size: 10px;">Hora Inicio Turno</small>
                    <strong style="font-size: 12px; color: #0F172A; margin-top: 2px; display: block;">${reportObj.horaInicio || 'N/A'}</strong>
                </div>
                <div style="background: #F8FAFC; padding: 10px 12px; border-radius: 6px; border: 1px solid #E2E8F0;">
                    <small style="color: #64748B; display: block; font-size: 10px;">Hora Fin Turno</small>
                    <strong style="font-size: 12px; color: #0F172A; margin-top: 2px; display: block;">${reportObj.horaFin || 'N/A'}</strong>
                </div>
                <div style="background: #F8FAFC; padding: 10px 12px; border-radius: 6px; border: 1px solid #E2E8F0;">
                    <small style="color: #64748B; display: block; font-size: 10px;">Almuerzo Descontado</small>
                    <strong style="font-size: 12px; color: #059669; margin-top: 2px; display: block;">${reportObj.tiempoAlmuerzoMins != null ? reportObj.tiempoAlmuerzoMins + ' minutos' : 'N/A'}</strong>
                </div>
                <div style="background: #F8FAFC; padding: 10px 12px; border-radius: 6px; border: 1px solid #E2E8F0;">
                    <small style="color: #64748B; display: block; font-size: 10px;">Desayuno Descontado</small>
                    <strong style="font-size: 12px; color: #D97706; margin-top: 2px; display: block;">${reportObj.tiempoDesayunoMins != null ? reportObj.tiempoDesayunoMins + ' minutos' : 'N/A'}</strong>
                </div>
                <div style="background: #F8FAFC; padding: 10px 12px; border-radius: 6px; border: 1px solid #E2E8F0; grid-column: span 2;">
                    <small style="color: #64748B; display: block; font-size: 10px;">Inactividad / Exceso Pausas</small>
                    <strong style="font-size: 12px; color: #DC2626; margin-top: 2px; display: block;">${reportObj.inactividadTotalMins != null ? reportObj.inactividadTotalMins + ' minutos' : 'N/A'}</strong>
                </div>
            </div>

            <!-- Bitácora de Tiempos -->
            <div style="background: #F8FAFC; padding: 12px 14px; border-radius: 8px; border: 1px solid #E2E8F0; margin-bottom: 15px;">
                <h4 style="font-size: 12px; color: #2563EB; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">Bitácora de Tiempos</h4>
                <div>${bitacoraHtml}</div>
            </div>

            <!-- Resumen de Tareas -->
            <div style="background: #F8FAFC; padding: 14px; border-radius: 8px; border: 1px solid #E2E8F0;">
                <h4 style="font-size: 12px; color: #2563EB; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Resumen de Tareas y Observaciones</h4>
                <div style="font-size: 12px; color: #1E293B; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">${formattedReportText}</div>
            </div>
        `;

        document.body.appendChild(pdfContainer);

        const safeName = (reportObj.gestor || 'Gestor').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const dateStr = (reportObj.timestamp ? new Date(reportObj.timestamp).toLocaleDateString('es-CO') : 'fecha').replace(/[^a-z0-9]/gi, '_');

        const opt = {
            margin:       10,
            filename:     `Reporte_Turno_${safeName}_${dateStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        if (window.html2pdf) {
            await window.html2pdf().set(opt).from(pdfContainer).save();
        } else {
            alert("Cargando motor de generación PDF, por favor intenta en unos segundos.");
        }

        document.body.removeChild(pdfContainer);
        
    } catch(e) {
        alert("Hubo un error al intentar exportar el reporte.");
        console.error(e);
    }
};

// Logic for Shift Reports History
let allShiftReports = [];

async function renderShiftReports() {
    const tbody = document.getElementById('shiftReportsTableBody');
    if (!tbody) return;
    
    // Si ya tenemos los reportes precargados, aplicamos filtros rápido
    if (allShiftReports.length > 0) {
        applyShiftReportsFilters();
    } else {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 30px; text-align: center; color: var(--accent-primary);"><i class='bx bx-loader-alt bx-spin' style='font-size: 24px;'></i><br><span style='font-size:12px; margin-top:5px; display:inline-block;'>Cargando historial de turnos...</span></td></tr>`;
    }
    
    try { 
        const snapshot = await database.ref('shift_reports').once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            allShiftReports = Object.keys(data).map(k => ({...data[k], fb_id: k}));
        } else {
            allShiftReports = [];
        }

        const gestoresTurnosSet = new Set();
        allShiftReports.forEach(r => {
            if (r.gestor) gestoresTurnosSet.add(String(r.gestor).trim());
        });
        const sortedTurnosGestores = Array.from(gestoresTurnosSet).sort((a,b) => a.localeCompare(b));
        setupCustomMultiSelect('turnosGestorMultiSelect', sortedTurnosGestores, () => {
            applyShiftReportsFilters();
        });
    } catch(e) {
        console.error("Error cargando historial de turnos:", e);
    }
    
    applyShiftReportsFilters();
}

function applyShiftReportsFilters() {
    const tbody = document.getElementById('shiftReportsTableBody');
    if (!tbody) return;

    const selectedGestores = getSelectedMultiSelectValues('turnosGestorMultiSelect');
    const fechaQuery = document.getElementById('filterFechaInput') ? document.getElementById('filterFechaInput').value : '';

    let filtered = [...allShiftReports];

    const hasExplicitFilter = selectedGestores.length > 0 || fechaQuery;

    // Filter by Gestor name
    if (selectedGestores.length > 0) {
        filtered = filtered.filter(r => selectedGestores.some(g => normalizeName(r.gestor) === normalizeName(g)));
    }

    // Filter by Date (comparing local YYYY-MM-DD format)
    if (fechaQuery) {
        filtered = filtered.filter(r => {
            if (r.timestamp) {
                const d = new Date(r.timestamp);
                const localYear = d.getFullYear();
                const localMonth = String(d.getMonth() + 1).padStart(2, '0');
                const localDay = String(d.getDate()).padStart(2, '0');
                const localDateStr = `${localYear}-${localMonth}-${localDay}`;
                if (localDateStr === fechaQuery) return true;
            }
            if (r.horaInicio && r.horaInicio.includes(fechaQuery)) return true;
            if (r.horaFin && r.horaFin.includes(fechaQuery)) return true;
            return false;
        });
    } else if (!hasExplicitFilter) {
        // Si no hay filtro de fecha ni gestor, limitar por defecto a los últimos 2 días para máxima velocidad
        const now = new Date();
        const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0).getTime(); // inicio de ayer
        filtered = filtered.filter(r => {
            const reportTime = r.timestamp || (r.horaInicio ? new Date(r.horaInicio).getTime() : 0);
            return reportTime >= twoDaysAgo;
        });
    }

    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        const emptyMsg = hasExplicitFilter ? 'No hay historial de turnos registrados con los filtros seleccionados.' : 'No hay turnos registrados en los últimos 2 días. Selecciona una fecha o escribe un gestor para consultar turnos anteriores.';
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-secondary);">${escapeHTML(emptyMsg)}</td></tr>`;
        return;
    }
    
    // Sort descending by timestamp
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    filtered.forEach(r => {
        let reportText = r.reporte || 'Sin reporte';
        let bitacoraHTML = '';
        if (reportText.includes('=== BITÁCORA DE TIEMPOS ===')) {
            const parts = reportText.split('=== BITÁCORA DE TIEMPOS ===');
            reportText = parts[0].trim();
            const rawBitacora = parts[1].trim();
            if (rawBitacora) {
                // Filtrar y desduplicar líneas de la bitácora textual
                const lines = rawBitacora.split('\n').map(l => l.trim()).filter(Boolean);
                const uniqueLines = [];
                lines.forEach(line => {
                    if (!uniqueLines.includes(line)) {
                        uniqueLines.push(line);
                    }
                });
                const bitacoraContent = uniqueLines.map(l => escapeHTML(l)).join('<br>');
                bitacoraHTML = `
                    <details style="margin-top: 8px; border-top: 1px dashed var(--glass-border); padding-top: 6px;">
                        <summary style="cursor: pointer; color: var(--accent-primary); font-weight: 600; font-size: 11px; outline: none; list-style: none; display: flex; align-items: center; gap: 4px;">
                            <i class='bx bx-chevron-down'></i> Ver Bitácora de Tiempos
                        </summary>
                        <div style="font-size: 11px; margin-top: 5px; color: var(--text-secondary); line-height: 1.5; background: rgba(0,0,0,0.15); padding: 6px; border-radius: 4px;">
                            ${bitacoraContent}
                        </div>
                    </details>
                `;
            }
        }
        const safeReport = escapeHTML(reportText).replace(/\n/g, '<br>').replace(/\[(.*?)\]/g, '<strong>[$1]</strong>') + bitacoraHTML;
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 12px; font-weight: 500;">
                    ${escapeHTML(r.gestor)}
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHTML(r.rol)}</div>
                </td>
                <td style="padding: 12px; color: var(--accent-primary);">${escapeHTML(r.setTrabajado)}</td>
                <td style="padding: 12px; font-size: 13px;">${escapeHTML(r.horaInicio)}</td>
                <td style="padding: 12px; font-size: 13px;">${escapeHTML(r.horaFin)}</td>
                <td style="padding: 12px; font-size: 12px; color: var(--text-secondary); max-width: 350px; text-align: left;">
                    <div style="max-height: 120px; overflow-y: auto; background: var(--bg-dark); padding: 8px; border-radius: 6px;">
                        ${safeReport}
                    </div>
                </td>
                <td style="padding: 12px; text-align: center; white-space: nowrap;">
                    <div style="display: flex; gap: 6px; justify-content: center;">
                        <button class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="openShiftDetailModal(decodeURIComponent('${encodeInlineHandlerArg(r.fb_id)}'))" title="Ver todo el informe igual al correo">
                            <i class='bx bx-show'></i> Ver Todo
                        </button>
                        <button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px;" onclick="exportShiftReport(decodeURIComponent('${encodeInlineHandlerArg(r.fb_id)}'))" title="Exportar PDF">
                            <i class='bx bx-file-blank'></i> PDF
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

window.openShiftDetailModal = function(fb_id) {
    const reportObj = allShiftReports.find(r => r.fb_id === fb_id);
    if (!reportObj) return alert("No se encontró la información del turno.");
    
    const body = document.getElementById('shiftDetailModalBody');
    const exportBtn = document.getElementById('exportPdfModalBtn');
    if (exportBtn) {
        exportBtn.onclick = function() { exportShiftReport(fb_id); };
    }

    let reportText = reportObj.reporte || 'Sin reporte detallado';
    let bitacoraLines = [];
    if (reportText.includes('=== BITÁCORA DE TIEMPOS ===')) {
        const parts = reportText.split('=== BITÁCORA DE TIEMPOS ===');
        reportText = parts[0].trim();
        const rawBitacora = parts[1].trim();
        if (rawBitacora) {
            const lines = rawBitacora.split('\n').map(l => l.trim()).filter(Boolean);
            lines.forEach(l => {
                if (!bitacoraLines.includes(l)) bitacoraLines.push(l);
            });
        }
    }

    const formattedReportText = reportText.replace(/\n/g, '<br>').replace(/\[(.*?)\]/g, '<span style="background: rgba(139, 92, 246, 0.15); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">$1</span>');

    let bitacoraHtml = '';
    if (bitacoraLines.length > 0) {
        bitacoraHtml = bitacoraLines.map(l => `<div style="padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-family: monospace; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;"><i class='bx bx-time-five' style="color: var(--accent-primary);"></i> ${l}</div>`).join('');
    } else {
        bitacoraHtml = '<div style="color: var(--text-secondary); font-size: 12px; font-style: italic;">No se registraron pausas o inactividades en este turno.</div>';
    }

    body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <!-- Encabezado Gestor y Rol -->
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 14px 18px; border-radius: 12px; border: 1px solid var(--glass-border);">
                <div>
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-secondary); display: block;">Gestor</span>
                    <strong style="font-size: 18px; color: var(--text-primary); margin-top: 2px; display: block;">${reportObj.gestor}</strong>
                    <span style="font-size: 12px; color: var(--accent-primary); font-weight: 500;">Rol: ${reportObj.rol || 'Gestor'}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-secondary); display: block;">SET Principal Trabajado</span>
                    <strong style="font-size: 15px; color: var(--success); margin-top: 2px; display: block;"><i class='bx bx-layer'></i> ${reportObj.setTrabajado || 'N/A'}</strong>
                </div>
            </div>

            <!-- Tiempos de Turno e Indicadores (Igual al correo) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Hora Inicio Turno</small>
                    <strong style="font-size: 13px; color: var(--text-primary); margin-top: 4px; display: block;"><i class='bx bx-log-in-circle' style="color: var(--accent-primary);"></i> ${reportObj.horaInicio || 'N/A'}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Hora Fin Turno</small>
                    <strong style="font-size: 13px; color: var(--text-primary); margin-top: 4px; display: block;"><i class='bx bx-log-out-circle' style="color: var(--warning);"></i> ${reportObj.horaFin || 'N/A'}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Tiempo Almuerzo Descontado</small>
                    <strong style="font-size: 13px; color: var(--success); margin-top: 4px; display: block;"><i class='bx bx-restaurant'></i> ${reportObj.tiempoAlmuerzoMins != null ? reportObj.tiempoAlmuerzoMins + ' minutos' : 'N/A'}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Tiempo Desayuno Descontado</small>
                    <strong style="font-size: 13px; color: var(--warning); margin-top: 4px; display: block;"><i class='bx bx-coffee'></i> ${reportObj.tiempoDesayunoMins != null ? reportObj.tiempoDesayunoMins + ' minutos' : 'N/A'}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--glass-border);">
                    <small style="color: var(--text-secondary); display: block; font-size: 11px;">Inactividad / Exceso Pausas</small>
                    <strong style="font-size: 13px; color: var(--danger); margin-top: 4px; display: block;"><i class='bx bx-stopwatch'></i> ${reportObj.inactividadTotalMins != null ? reportObj.inactividadTotalMins + ' minutos' : 'N/A'}</strong>
                </div>
            </div>

            <!-- Bitácora de Tiempos -->
            <div style="background: rgba(0,0,0,0.15); padding: 14px; border-radius: 10px; border: 1px solid var(--glass-border);">
                <h4 style="font-size: 13px; color: var(--accent-primary); margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;">
                    <i class='bx bx-list-ul'></i> Bitácora de Tiempos
                </h4>
                <div style="max-height: 180px; overflow-y: auto; padding-right: 5px;">
                    ${bitacoraHtml}
                </div>
            </div>

            <!-- Resumen de Tareas y Observaciones -->
            <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 10px; border: 1px solid var(--glass-border);">
                <h4 style="font-size: 13px; color: var(--accent-primary); margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;">
                    <i class='bx bx-task'></i> Resumen de Tareas y Observaciones
                </h4>
                <div style="font-size: 13px; color: var(--text-primary); line-height: 1.6; white-space: pre-wrap; word-break: break-word; font-family: inherit;">
                    ${formattedReportText}
                </div>
            </div>
        </div>
    `;

    document.getElementById('shiftDetailModal').classList.add('active');
};

    if (!hasExplicitFilter) {
        setTimeout(() => {
            if (document.getElementById('shiftReportsMostrandoMsg')) document.getElementById('shiftReportsMostrandoMsg').remove();
            const msg = document.createElement('div');
            msg.id = 'shiftReportsMostrandoMsg';
            msg.style = 'text-align: center; font-size: 11px; color: var(--text-secondary); margin-top: 10px; font-style: italic;';
            msg.innerText = `Mostrando turnos de los últimos 2 días (${filtered.length} turnos). Selecciona una fecha o escribe un gestor para consultar el historial antiguo complete.`;
            tbody.parentElement.parentElement.appendChild(msg);
        }, 50);
    } else {
        setTimeout(() => {
            if (document.getElementById('shiftReportsMostrandoMsg')) document.getElementById('shiftReportsMostrandoMsg').remove();
        }, 50);
    }
}



// Helper Notification function
function toggleNotifications() {
    const drop = document.getElementById('notificationDropdown');
    if (drop) {
        if (drop.style.display === 'none' || drop.style.display === '') {
            drop.style.display = 'block';
        } else {
            drop.style.display = 'none';
        }
    }
}

async function markAllAsRead() {
    if (!currentUser) return;
    try {
        if (currentUser.role === 'Admin' || currentUser.role === 'Supervisor') {
            const snapshot = await database.ref('permissions').once('value');
            if (snapshot.exists()) {
                const data = snapshot.val();
                const updates = {};
                for (let key in data) {
                    if (data[key].notified_admin === false && data[key].status === 'Pendiente') {
                        updates[key + '/notified_admin'] = true;
                    }
                }
                if (Object.keys(updates).length > 0) {
                    await database.ref('permissions').update(updates);
                }
            }
        } else {
            const authUid = currentUser.uid || (firebase.auth().currentUser && firebase.auth().currentUser.uid);
            if (!authUid) return;
            const snapshot = await database.ref('permissions').orderByChild('uid').equalTo(authUid).once('value');
            if (snapshot.exists()) {
                const data = snapshot.val();
                const updates = {};
                for (let key in data) {
                    if (data[key].notified === false && data[key].status !== 'Pendiente') {
                        updates[key + '/notified'] = true;
                    }
                }
                if (Object.keys(updates).length > 0) {
                    await database.ref('permissions').update(updates);
                }
            }
        }
    } catch(e) {
        console.error(e);
    }
}

// Funciones del Modal de Perfil
function openProfileModal() {
    const avatarEl = document.querySelector('.user-profile .avatar');
    const modalImg = document.getElementById('modalProfileAvatar');
    if (avatarEl && modalImg) {
        modalImg.src = avatarEl.src;
    }
    
    if (currentUser) {
        const modalName = document.getElementById('modalProfileName');
        if (modalName) modalName.textContent = currentUser.name || 'Usuario';
        
        const modalRole = document.getElementById('modalProfileRole');
        if (modalRole) modalRole.textContent = currentUser.role || 'Rol';
    }

    document.getElementById('profileModal').classList.add('active');
    document.getElementById('newPasswordInput').value = '';
    const msg = document.getElementById('passwordChangeMsg');
    if (msg) msg.style.display = 'none';
}

function toggleProfilePassword(iconElement) {
    const input = document.getElementById('newPasswordInput');
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.remove('bx-show');
        iconElement.classList.add('bx-hide');
    } else {
        input.type = 'password';
        iconElement.classList.remove('bx-hide');
        iconElement.classList.add('bx-show');
    }
}

async function changePassword() {
    const newPass = document.getElementById('newPasswordInput').value;
    const msg = document.getElementById('passwordChangeMsg');
    
    if(!newPass || newPass.trim() === '') {
        msg.textContent = 'Por favor ingresa una contraseña válida.';
        msg.style.color = 'var(--danger)';
        msg.style.display = 'block';
        return;
    }
    
    msg.textContent = 'Actualizando...';
    msg.style.color = 'var(--text-primary)';
    msg.style.display = 'block';
    
    try {
        const user = firebase.auth().currentUser;
        if (user) {
            await user.updatePassword(newPass);
            msg.textContent = '¡Contraseña actualizada exitosamente en Firebase Auth!';
            msg.style.color = 'var(--success)';
            setTimeout(() => closeModal('profileModal'), 2000);
        } else {
            msg.textContent = 'Error: No hay sesión activa en Firebase Auth. Por favor, vuelve a iniciar sesión.';
            msg.style.color = 'var(--danger)';
        }
    } catch(e) {
        msg.textContent = 'Error al actualizar contraseña.';
        if (e.code === 'auth/requires-recent-login') {
            msg.textContent = 'Por seguridad, debes cerrar sesión e iniciar sesión nuevamente para cambiar tu contraseña.';
        } else if (e.code === 'auth/weak-password') {
            msg.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        }
        msg.style.color = 'var(--danger)';
        console.error("Error al actualizar la contraseña:", e);
    }
}

// --- PROGRAMMATIC SIDEBAR ORDER & MONITOREO REALTIME ---

function alignAdministrativeControlsByRole() {
    if (!currentUser) return;

    const isAdmin = currentUser.role === 'Admin';
    const pendingUsersBody = document.getElementById('pendingUsersTableBody');
    const userTablePanel = pendingUsersBody ? pendingUsersBody.closest('.glass-panel') : null;
    const userSearch = document.getElementById('filterAprobacionesSearch');
    const userFilterPanel = userSearch ? userSearch.closest('.glass-panel') : null;
    const userSectionTitle = userFilterPanel ? userFilterPanel.previousElementSibling : null;

    [userSectionTitle, userFilterPanel, userTablePanel].forEach(element => {
        if (element) element.style.display = isAdmin ? '' : 'none';
    });

    const adminAnnouncementsView = document.getElementById('view-gestion-comunicados');
    if (adminAnnouncementsView && !isAdmin) adminAnnouncementsView.style.display = 'none';
}

function setupSidebar() {
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebarNav) return;
    
    const navWorkspace = document.getElementById('navWorkspace');
    const navHorario = document.getElementById('navHorario');
    const navTeletrabajo = document.getElementById('navTeletrabajo');
    const navDocs = document.getElementById('navDocs');
    const navPermisos = document.getElementById('navPermisos');
    const navComunicados = document.getElementById('navComunicados');
    
    const adminNavGroup = document.getElementById('adminNavGroup');
    const navAdminComunicados = document.getElementById('navAdminComunicados');
    const navTurnos = document.getElementById('navTurnos');
    const navAprobaciones = document.getElementById('navAprobaciones');
    const navMonitoreo = document.getElementById('navMonitoreo');
    const navTiempos = document.getElementById('navTiempos');
    
    const navSoporte = document.getElementById('navSoporte');

    // Unify Horario and Teletrabajo into one tab for all roles
    if (navHorario) {
        navHorario.style.display = 'flex';
        navHorario.innerHTML = "<i class='bx bx-calendar'></i> Horario y Teletrabajo";
    }
    if (navTeletrabajo) {
        navTeletrabajo.style.display = 'none';
    }

    // Merge Teletrabajo view content into Horario view for everyone
    const viewHorario = document.getElementById('view-horario');
    const viewTeletrabajo = document.getElementById('view-teletrabajo');
    if (viewHorario && viewTeletrabajo) {
        const teletrabajoContent = viewTeletrabajo.querySelector('.glass-panel');
        if (teletrabajoContent && !document.getElementById('mergedTeletrabajoPanel')) {
            teletrabajoContent.id = 'mergedTeletrabajoPanel';
            
            // Update main view title
            const panelTitle = viewHorario.querySelector('.panel-title');
            if (panelTitle) panelTitle.innerHTML = "<i class='bx bx-calendar'></i> Horario y Teletrabajo";
            
            // Add sub-section headers
            const hrPanel = viewHorario.querySelector('.glass-panel');
            if (hrPanel && !hrPanel.querySelector('.section-header')) {
                const h3Horario = document.createElement('h3');
                h3Horario.className = 'section-header';
                h3Horario.style.cssText = "color: var(--accent-primary); margin-bottom: 15px; font-size: 16px;";
                h3Horario.innerText = "Horario Semanal";
                hrPanel.insertBefore(h3Horario, hrPanel.firstChild);
            }
            
            if (!teletrabajoContent.querySelector('.section-header')) {
                const h3Tele = document.createElement('h3');
                h3Tele.className = 'section-header';
                h3Tele.style.cssText = "color: var(--success); margin-bottom: 15px; font-size: 16px;";
                h3Tele.innerText = "Cronograma de Teletrabajo";
                teletrabajoContent.insertBefore(h3Tele, teletrabajoContent.firstChild);
            }

            viewHorario.appendChild(teletrabajoContent);
        }
    }

    if (currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Supervisor')) {
        // Admin/Supervisor Order
        const hFilter = document.getElementById('horarioGestorFilterContainer');
        if (hFilter) hFilter.style.display = 'flex';
        const tFilter = document.getElementById('teletrabajoGestorFilterContainer');
        if (tFilter) tFilter.style.display = 'flex';

        if (navWorkspace) { navWorkspace.style.display = 'none'; } // HIDE Mis Tareas for Admin and Supervisor
        if (navComunicados) {
            if (currentUser.role === 'Supervisor') {
                navComunicados.style.display = 'flex';
                sidebarNav.appendChild(navComunicados);
            } else {
                navComunicados.style.display = 'none';
            }
        }

        if (adminNavGroup) { adminNavGroup.style.display = 'block'; sidebarNav.appendChild(adminNavGroup); }
        if (navMonitoreo) { navMonitoreo.style.display = 'flex'; adminNavGroup.appendChild(navMonitoreo); }

        if (navTiempos) { navTiempos.style.display = 'none'; }
        if (navAdminComunicados) {
            if (currentUser.role === 'Admin') {
                navAdminComunicados.style.display = 'flex';
                adminNavGroup.appendChild(navAdminComunicados);
            } else {
                navAdminComunicados.style.display = 'none';
            }
        }
        if (navTurnos) { navTurnos.style.display = 'flex'; adminNavGroup.appendChild(navTurnos); }
        if (navAprobaciones) { navAprobaciones.style.display = 'flex'; adminNavGroup.appendChild(navAprobaciones); }
        
        if (navHorario) { sidebarNav.appendChild(navHorario); }
        if (navDocs) { navDocs.style.display = 'flex'; sidebarNav.appendChild(navDocs); }
        if (navPermisos) { navPermisos.style.display = 'flex'; sidebarNav.appendChild(navPermisos); }
        
        if (navSoporte) { navSoporte.style.display = 'flex'; sidebarNav.appendChild(navSoporte); }
    } else {
        // Gestor Order
        const hFilter = document.getElementById('horarioGestorFilterContainer');
        if (hFilter) hFilter.style.display = 'none';
        const tFilter = document.getElementById('teletrabajoGestorFilterContainer');
        if (tFilter) tFilter.style.display = 'none';

        if (navWorkspace) { navWorkspace.style.display = 'flex'; sidebarNav.appendChild(navWorkspace); }
        if (navComunicados) { navComunicados.style.display = 'flex'; sidebarNav.appendChild(navComunicados); }
        if (navHorario) { sidebarNav.appendChild(navHorario); }
        if (navDocs) { navDocs.style.display = 'flex'; sidebarNav.appendChild(navDocs); }
        if (navPermisos) { navPermisos.style.display = 'flex'; sidebarNav.appendChild(navPermisos); }
        
        // Hide Admin tabs for Gestor
        if (adminNavGroup) adminNavGroup.style.display = 'none';
        
        if (navSoporte) { navSoporte.style.display = 'flex'; sidebarNav.appendChild(navSoporte); }
        
        // --- LUNCH BUTTON VISIBILITY ---
        const toggleLunchBtn = document.getElementById('toggleLunchBtn');
        if (toggleLunchBtn) {
            toggleLunchBtn.style.display = 'flex';
        }
        
        const toggleBreakfastBtn = document.getElementById('toggleBreakfastBtn');
        if (toggleBreakfastBtn) {
            toggleBreakfastBtn.style.display = 'flex';
        }
    }

    alignAdministrativeControlsByRole();
}

let allActiveSessions = {};

const availableAvatars = [
    "Alexander Villada.png",
    "Camilo Espinosa.png",
    "Daniel Benavides.png",
    "Josue Alvarez.png",
    "Juan Jose Diaz.png",
    "Luis Fuentes.png",
    "Maria Sanchez.png",
    "Marilyn Jimenez.png",
    "Oriana Borja.png",
    "Samuel Cruz.png",
    "Sara Santamaria.png",
    "Sebastian Arango.png",
    "Sebastian Hincapie.png",
    "Yefferson Giraldo.png"
];

function startActiveSessionsListener() {
    database.ref('active_sessions').on('value', (snapshot) => {
        if (snapshot.exists()) {
            allActiveSessions = snapshot.val();
        } else {
            allActiveSessions = {};
        }
        renderActiveSessionsDashboard();
    }, (error) => {
        console.error("Error cargando monitoreo en tiempo real:", error);
    });
}

function calculateShiftDelay(session) {
    if (!session.loginTime || !session.shift) return '';
    const shiftStr = session.shift.toLowerCase().trim();
    
    // Parse start time: e.g. "8am - 4pm" -> "8", "am"
    const match = shiftStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) return ''; // Cannot parse shift
    
    let hour = parseInt(match[1], 10);
    let minute = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3].toLowerCase();
    
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    const loginDate = new Date(session.loginTime);
    const expected = new Date(loginDate);
    expected.setHours(hour, minute, 0, 0);
    
    let diffMinutes = (loginDate - expected) / 60000;
    
    if (diffMinutes < -12 * 60) {
        expected.setDate(expected.getDate() - 1);
        diffMinutes = (loginDate - expected) / 60000;
    } else if (diffMinutes > 12 * 60) {
        expected.setDate(expected.getDate() + 1);
        diffMinutes = (loginDate - expected) / 60000;
    }
    
    if (diffMinutes <= 5) {
        return `<span style="background: var(--success); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 5px;" title="Límite: ${expected.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}">A tiempo</span>`;
    } else if (diffMinutes > 240) {
        // Fuera del horario: > 4 horas tarde no se considera "tardanza" de este turno
        return `<span style="background: rgba(139,92,246,0.15); color: #8b5cf6; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 5px;" title="Límite: ${expected.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}">Fuera de Horario</span>`;
    } else {
        const tardanza = Math.round(diffMinutes);
        return `<span style="background: var(--danger); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 5px;" title="Límite: ${expected.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}">+${tardanza}m Tarde</span>`;
    }
}

function renderActiveSessionsDashboard() {
    const grid = document.getElementById('monitoreoGrid');
    if (!grid) return;

    grid.innerHTML = '';
    
    // Get filter queries
    const searchInputEl = document.getElementById('monitoreoSearchInput');
    const searchQuery = searchInputEl ? normalizeName(searchInputEl.value) : '';
    const shiftSelectEl = document.getElementById('filterShiftSelect');
    const shiftQuery = shiftSelectEl ? shiftSelectEl.value : '';
    const statusSelectEl = document.getElementById('filterStatusSelect');
    const statusQuery = statusSelectEl ? statusSelectEl.value : '';

    const uids = Object.keys(allActiveSessions);
    
    // Filtering active sessions
    let filteredUids = uids.filter(uid => {
        const session = allActiveSessions[uid];
        if (!session || !session.name) return false;
        
        const fullName = (session.name || '').trim();
        const email = (session.email || '');
        const shift = session.shift || 'Mañana';
        let isOnline = session.lastActive ? ((Date.now() - session.lastActive) < 120000) : false;
        if (session.status === 'En Almuerzo' || session.status === 'En Desayuno' || session.status === 'Inactivo') {
            isOnline = false;
        }

        // Search match (accent-insensitive substring)
        if (searchQuery && !normalizeName(fullName).includes(searchQuery) && !normalizeName(email).includes(searchQuery)) {
            return false;
        }

        // Shift match using getShiftCategory helper
        const sessionShiftCat = getShiftCategory(shift);
        if (shiftQuery && sessionShiftCat !== shiftQuery) {
            return false;
        }

        // Status match
        if (statusQuery) {
            if (statusQuery === 'online' && !isOnline) return false;
            if (statusQuery === 'offline' && isOnline) return false;
        }

        return true;
    });

    if (filteredUids.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: var(--text-secondary);">
                <i class='bx bx-devices' style="font-size: 48px; margin-bottom: 15px; color: var(--text-secondary); opacity: 0.5;"></i>
                <p style="font-size: 16px; font-weight: 500;">No se encontraron gestores en el turno con los filtros aplicados.</p>
                <p style="font-size: 12px; margin-top: 5px; opacity: 0.7;">Los gestores activos se listarán aquí automáticamente al ingresar.</p>
            </div>
        `;
        return;
    }

    filteredUids.forEach(uid => {
        const session = allActiveSessions[uid];
        if (!session) return;
        
        let isOnline = session.lastActive ? ((Date.now() - session.lastActive) < 120000) : false;
        
        // Fix: If they stopped pinging Firebase for over 2 minutes and aren't on break, force them to Inactivo locally
        if (!isOnline && session.status !== 'En Almuerzo' && session.status !== 'En Desayuno') {
            session.status = 'Inactivo';
        }

        let displayStatus = isOnline ? 'En Línea' : 'Inactivo';
        
        let statusBadge = '';
        let statusDot = isOnline ? '<div class="pulse-dot"></div>' : '<div class="pulse-dot offline"></div>';

        if (session.status === 'En Almuerzo') {
            statusBadge = '<span style="background: rgba(40,167,69,0.2); color: #28a745; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500;"><i class="bx bx-restaurant"></i> Almuerzo/Cena</span>';
            displayStatus = 'En Almuerzo/Cena 🍽️';
            statusDot = '<div style="width: 8px; height: 8px; border-radius: 50%; background: #28a745; margin-right: 6px;"></div>';
        } else if (session.status === 'En Desayuno') {
            statusBadge = '<span style="background: rgba(255,193,7,0.2); color: #ffc107; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500;"><i class="bx bx-coffee"></i> Desayuno</span>';
            displayStatus = 'En Desayuno ☕';
            statusDot = '<div style="width: 8px; height: 8px; border-radius: 50%; background: #ffc107; margin-right: 6px;"></div>';
        } else if (session.status === 'Inactivo') {
            isOnline = false;
            displayStatus = 'Inactivo 💤';
            statusDot = '<div class="pulse-dot offline"></div>';
        } else if (session.status === 'En Línea') {
            displayStatus = 'En Línea';
        }
        
        const lastActiveTime = session.lastActive ? new Date(session.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Nunca';
        const loginTimeStr = session.loginTime ? new Date(session.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Pendiente (Falta actualizar)';
        const delayBadge = calculateShiftDelay(session);
        
        const fullName = (session.name || '').trim();
        let matchedAvatar = availableAvatars.find(img => namesMatch(fullName, img.replace('.png', '')));
        let avatarSrc = matchedAvatar ? `assets/src/img/${matchedAvatar}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;

        let completedCount = session.completedTasks !== undefined ? session.completedTasks : 0;
        let notDoneCount = session.notDoneTasks !== undefined ? session.notDoneTasks : 0;
        const totalTasks = session.totalTasks || 0;
        
        // Fallback for older sessions that haven't synced the new variables yet
        if (session.completedTasks === undefined && session.tasks) {
            completedCount = Object.values(session.tasks).filter(t => t.status === 'Finalizada').length;
            notDoneCount = Object.values(session.tasks).filter(t => t.status === 'No Realizada').length;
        }

        const compPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
        const notDonePct = totalTasks > 0 ? Math.round((notDoneCount / totalTasks) * 100) : 0;
        const totalPct = compPct + notDonePct;

        const tasks = session.tasks || {};
        
        let assignedTasks = [];
        if (globalCronogramaData) {
            assignedTasks = getAssignedTasksForGestor(fullName, session.shift || 'Mañana');
        }

        let displayTasks = [];
        if (assignedTasks && assignedTasks.length > 0) {
            assignedTasks.forEach(taskName => {
                let taskStatus = 'Pendiente';
                for (let key in tasks) {
                    if (tasks[key].name === taskName) {
                        taskStatus = tasks[key].status;
                        break;
                    }
                }
                displayTasks.push({ name: taskName, status: taskStatus });
            });
        }
        
        // Agregar las tareas extras
        for (let key in tasks) {
            if (key.startsWith('extra_')) {
                displayTasks.push({ name: tasks[key].name, status: tasks[key].status });
            }
        }

        let tasksHtml = '';
        if (displayTasks.length > 0) {
            tasksHtml = '<div style="margin-top: 15px; max-height: 80px; overflow-y: auto; font-size: 11px; border: 1px solid var(--glass-border); border-radius: 4px; padding: 5px; background: rgba(0,0,0,0.02);">';
            displayTasks.forEach(t => {
                let icon = "<i class='bx bx-radio-circle' style='color: var(--text-secondary)'></i>";
                
                let textStyle = '';
                if (t.status === 'Finalizada') {
                    icon = "<i class='bx bx-check-circle' style='color: var(--success)'></i>";
                    textStyle = "color: var(--success); font-weight: bold;";
                } else if (t.status === 'En Proceso') {
                    icon = "<i class='bx bx-time-five' style='color: var(--warning)'></i>";
                    textStyle = "color: var(--warning);";
                } else if (t.status === 'No Realizada') {
                    icon = "<i class='bx bx-x-circle' style='color: var(--danger)'></i>";
                    textStyle = "color: var(--danger); text-decoration: line-through;";
                }

                tasksHtml += `<div style="display: flex; align-items: center; gap: 5px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: ${t.status==='Pendiente'?0.7:1};">${icon} <span title="${escapeHTML(t.name)}" style="${textStyle}">${escapeHTML(t.name)}</span></div>`;
            });
            tasksHtml += '</div>';
        } else {
            tasksHtml = '<div style="margin-top: 15px; font-size: 11px; color: var(--text-secondary); text-align: center; font-style: italic;">' + 
                        (globalCronogramaData ? 'No tiene tareas asignadas en este turno' : 'Cargando cronograma...') + '</div>';
        }

        const card = document.createElement('div');
        card.className = 'monitoreo-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div class="monitoreo-user-info">
                    <img class="monitoreo-avatar">
                    <div class="monitoreo-details">
                        <span class="monitoreo-name">${escapeHTML(fullName)}</span>
                        <span class="monitoreo-meta">${escapeHTML(session.email || '')}</span>
                    </div>
                </div>
                <div class="status-indicator-badge ${isOnline ? 'status-online' : 'status-offline'}">
                    <div class="pulse-dot ${isOnline ? '' : 'offline'}"></div>
                    ${displayStatus}
                </div>
            </div>
            
            <div style="margin-top: 10px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);"><i class='bx bx-calendar-check'></i> Turno:</span>
                    <strong style="color: var(--text-primary);">${escapeHTML(session.shift || 'Mañana')}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);"><i class='bx bx-time'></i> Inicio de Turno:</span>
                    <div style="display: flex; align-items: center;">
                        <span style="color: var(--text-primary); font-size: 12px;">${loginTimeStr}</span>
                        ${delayBadge}
                    </div>
                </div>
            </div>

            <div class="progress-container">
                <div class="progress-label-row">
                    <span>Avance de Tareas</span>
                    <div style="display: flex; gap: 6px; font-size: 11px;">
                        <strong style="color: var(--success);" title="Realizadas">${completedCount} <i class='bx bx-check'></i></strong>
                        <strong style="color: var(--danger);" title="No Realizadas">${notDoneCount} <i class='bx bx-x'></i></strong>
                        <strong style="color: var(--text-secondary); margin-left: 4px;">/ ${totalTasks} (${totalPct}%)</strong>
                    </div>
                </div>
                <div class="progress-bar-bg" style="display: flex; overflow: hidden; background: rgba(255,255,255,0.05);">
                    <div class="progress-bar-fill" style="width: ${compPct}%; border-radius: 0; background: linear-gradient(90deg, var(--success), #34d399); transition: width 0.5s;"></div>
                    <div style="width: ${notDonePct}%; background: linear-gradient(90deg, var(--danger), #fb7185); transition: width 0.5s;"></div>
                </div>
            </div>

            ${tasksHtml}

            <div style="margin-top: 15px; display: flex; gap: 5px; justify-content: flex-end;">
                <button class="btn btn-outline" style="flex: 1; padding: 6px 10px; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="openMonitoreoDetails(decodeURIComponent('${encodeInlineHandlerArg(uid)}'))">
                    <i class='bx bx-search-alt-2'></i> Detalles
                </button>
                <button class="btn btn-outline" style="flex: 1; padding: 6px 10px; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 4px; border-color: var(--warning); color: var(--warning);" onclick="viewTimelineInMonitoreo(decodeURIComponent('${encodeInlineHandlerArg(uid)}'))">
                    <i class='bx bx-time'></i> Bitácora
                </button>
            </div>
        `;
        const avatarElement = card.querySelector('.monitoreo-avatar');
        if (avatarElement) {
            const fallbackAvatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;
            avatarElement.alt = fullName;
            avatarElement.addEventListener('error', () => {
                avatarElement.src = fallbackAvatarSrc;
            }, { once: true });
            avatarElement.src = avatarSrc;
        }
        grid.appendChild(card);
    });
}

function viewTimelineInMonitoreo(uid) {
    const session = allActiveSessions[uid];
    if (!session) return;
    
    const modal = document.getElementById('timelineModal');
    const tbody = document.getElementById('timelineTableBody');
    if (!modal || !tbody) return;
    
    document.getElementById('timelineModalName').innerText = session.name || 'Gestor';
    
    const timeline = session.timeline || [];
    tbody.innerHTML = '';
    
    // Filter out very short glitches (under 60 seconds) that have already ended
    let validTimeline = timeline.filter(ev => {
        if (ev.end && (ev.end - ev.start) < 60000) return false;
        return true;
    });

    // Inyectar dinámicamente el bloque de inactividad actual si el gestor perdió conexión (PC suspendido) y no está en pausa
    const lastPing = session.lastActive ? new Date(session.lastActive).getTime() : 0;
    const now = Date.now();
    if (lastPing && (now - lastPing) > 120000 && session.status !== 'En Almuerzo' && session.status !== 'En Desayuno') { // más de 2 minutos sin dar señal y no está en break
        const hasOngoingInactividad = validTimeline.some(ev => ev.type === 'Inactividad' && !ev.end);
        if (!hasOngoingInactividad) {
            validTimeline.push({
                type: 'Inactividad',
                start: lastPing,
                end: null // En curso
            });
        }
    }

    if (validTimeline.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">No hay pausas ni inactividades registradas en este turno.</td></tr>';
    } else {
        validTimeline.forEach(ev => {
            const s = new Date(ev.start).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
            let eTime = "No regresó";
            let durationStr = "En curso...";
            if (ev.end) {
                eTime = new Date(ev.end).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
                const mins = Math.max(1, Math.round((ev.end - ev.start) / 60000));
                durationStr = `${mins} min`;
            }
            
            let icon = "<i class='bx bx-time'></i>";
            if (ev.type === 'Almuerzo') icon = "<i class='bx bx-restaurant' style='color: var(--success)'></i>";
            if (ev.type === 'Desayuno') icon = "<i class='bx bx-coffee' style='color: var(--warning)'></i>";
            if (ev.type === 'Inactividad') icon = "<i class='bx bx-sleepy' style='color: var(--danger)'></i>";

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--glass-border);">
                    <td style="padding: 10px; font-weight: 500;">${icon} ${ev.type}</td>
                    <td style="padding: 10px; font-size: 13px;">${s} - ${eTime}</td>
                    <td style="padding: 10px; text-align: center;"><span class="badge" style="background: rgba(255,255,255,0.05);">${durationStr}</span></td>
                </tr>
            `;
        });
    }
    
    modal.classList.add('active');
}
window.viewTimelineInMonitoreo = viewTimelineInMonitoreo;


window.openMonitoreoDetails = function(uid) {
    const session = allActiveSessions[uid];
    if (!session) return;

    const fullName = (session.name || '').trim();
    let matchedAvatar = availableAvatars.find(img => namesMatch(fullName, img.replace('.png', '')));
    let avatarSrc = matchedAvatar ? `assets/src/img/${matchedAvatar}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;

    const avatarEl = document.getElementById('monitoreoModalAvatar');
    if (avatarEl) {
        avatarEl.src = avatarSrc;
        avatarEl.onerror = function() {
            this.onerror = null;
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff`;
        };
    }

    const nameEl = document.getElementById('monitoreoModalName');
    if (nameEl) nameEl.textContent = "Detalle de Tareas: " + fullName;
    
    const lastActiveTime = session.lastActive ? new Date(session.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Nunca';
    const loginTimeStr = session.loginTime ? new Date(session.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pendiente';
    const infoEl = document.getElementById('monitoreoModalInfo');
    if (infoEl) infoEl.textContent = `Turno: ${session.shift || 'Mañana'} | Inicio: ${loginTimeStr} | Actividad: ${lastActiveTime}`;

    const tasksList = document.getElementById('monitoreoModalTasksList');
    if (tasksList) {
        tasksList.innerHTML = '';

        const tasks = session.tasks || {};
        
        let assignedTasks = [];
        if (typeof globalCronogramaData !== 'undefined' && globalCronogramaData) {
            assignedTasks = getAssignedTasksForGestor(fullName, session.shift || 'Mañana');
        }

        let displayTasks = [];
        if (assignedTasks && assignedTasks.length > 0) {
            assignedTasks.forEach(taskName => {
                let taskStatus = 'Pendiente';
                let obs = '';
                for (let key in tasks) {
                    if (tasks[key].name === taskName) {
                        taskStatus = tasks[key].status;
                        obs = tasks[key].observation || '';
                        break;
                    }
                }
                displayTasks.push({ name: taskName, status: taskStatus, observation: obs });
            });
        }

        // Extras
        for (let key in tasks) {
            if (key.startsWith('extra_')) {
                displayTasks.push({ 
                    name: tasks[key].name, 
                    status: tasks[key].status || 'Pendiente', 
                    observation: tasks[key].observation || 'Tarea extra agregada durante el turno.' 
                });
            }
        }

        // Direct tasks fallback if displayTasks is empty
        if (displayTasks.length === 0 && Object.keys(tasks).length > 0) {
            for (let key in tasks) {
                displayTasks.push({
                    name: tasks[key].name || key,
                    status: tasks[key].status || 'Pendiente',
                    observation: tasks[key].observation || ''
                });
            }
        }

        if (displayTasks.length === 0) {
            tasksList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
                    Este gestor aún no tiene tareas asignadas en este turno.
                </div>
            `;
        } else {
            displayTasks.forEach(t => {
                let badgeClass = 'pending';
                let badgeStyle = 'background: rgba(148,163,184,0.15); color: #94a3b8;';
                if (t.status === 'Finalizada') {
                    badgeClass = 'completed';
                    badgeStyle = 'background: rgba(16,185,129,0.15); color: var(--success);';
                } else if (t.status === 'En Proceso') {
                    badgeClass = 'in-progress';
                    badgeStyle = 'background: rgba(245,158,11,0.15); color: var(--warning);';
                } else if (t.status === 'No Realizada') {
                    badgeClass = 'not-done';
                    badgeStyle = 'background: rgba(239,68,68,0.15); color: var(--danger);';
                }

                const observationText = t.observation ? escapeHTML(t.observation.trim()) : 'Sin observaciones cargadas.';

                tasksList.innerHTML += `
                    <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--glass-border); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                            <span style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">${escapeHTML(t.name)}</span>
                            <span class="monitoreo-task-badge ${badgeClass}" style="padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; ${badgeStyle}">${escapeHTML(t.status)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); background: rgba(0,0,0,0.03); padding: 8px 10px; border-radius: 6px; border-left: 3px solid var(--accent-primary);">
                            <strong>Notas u Observaciones:</strong> ${observationText}
                        </div>
                    </div>
                `;
            });
        }
    }

    const modal = document.getElementById('monitoreoModal');
    if (modal) modal.classList.add('active');
};

function populateGestoresDropdown() {
    const selectEl = document.getElementById('monitoreoSearchInput');
    if (!selectEl) return;
    
    selectEl.innerHTML = '<option value="">Todos los Gestores</option>';
    
    database.ref('users').once('value').then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const gestores = Object.keys(data)
                .map(k => data[k])
                .filter(u => u && u.role === 'Gestor' && u.approved === true)
                .map(u => u.name.trim())
                .sort((a, b) => a.localeCompare(b));
            
            const uniqueGestores = [...new Set(gestores)];
            
            uniqueGestores.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                selectEl.appendChild(opt);
            });
        }
    }).catch(err => {
        console.error("Error populating gestores dropdown:", err);
    });
}

// --- Lógica del Portal de Indicadores de Gestión (KPIs) ---

window.kpiUsersData = {}; // email -> name
window.retirosGlobalData = null; // Carga automática del backend
window.kpiTaskLists = { finalizadas: [], no_realizadas: [], pendientes: [] };

// Cargar data de retiros automáticamente (JSON pre-procesado por el bat)
function loadRetirosData() {
    fetch('Retiros/retiros_data.json')
        .then(response => {
            if (!response.ok) throw new Error('No se encontró el JSON');
            return response.json();
        })
        .then(data => {
            window.retirosGlobalData = data;
            console.log("Data de retiros cargada automáticamente:", Object.keys(data).length, "gestores");
        })
        .catch(err => {
            console.warn("No hay data de retiros automatizada o hubo un error:", err);
            window.retirosGlobalData = null;
        });
}

function loadGestoresForKPIs() {
    const selectEl = document.getElementById('kpiGestorSelect');
    if (!selectEl) return;
    
    if (selectEl.options.length > 2) {
        // If already loaded, just return. We don't want to overwrite and re-trigger calculation
        return;
    }
    
    selectEl.innerHTML = '<option value="todos" selected>Todos los gestores</option><option value="">Selecciona un gestor...</option>';
    
    database.ref('users').once('value').then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            window.kpiUsersData = {};
            
            const targetGestores = [
                "oriana borja",
                "marilyn",
                "sebastian hincapie",
                "sebastian arango",
                "sebastiana",
                "juan jose diaz",
                "yefferson",
                "alexander villada",
                "daniel",
                "josue alvarez",
                "luis"
            ];
            
            const gestores = Object.keys(data)
                .map(k => {
                    const u = data[k];
                    if (u && u.email && u.name) {
                        window.kpiUsersData[u.email.toLowerCase()] = u.name.trim();
                    }
                    return u;
                })
                .filter(u => {
                    if (!u || u.role !== 'Gestor' || u.approved !== true) return false;
                    const nameLower = u.name.toLowerCase();
                    return targetGestores.some(t => nameLower.includes(t));
                })
                .map(u => u.name.trim())
                .sort((a, b) => a.localeCompare(b));
            
            const uniqueGestores = [...new Set(gestores)];
            
            uniqueGestores.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                selectEl.appendChild(opt);
            });
            
            // Auto-trigger KPI calculation once loaded to map the global view
            calcularIndicadores();
        }
    }).catch(err => console.error("Error populating KPI gestores dropdown:", err));
}

async function calcularIndicadores() {
    const selectedGestores = getSelectedMultiSelectValues('operativoGestorMultiSelect');
    const fechaEl = document.getElementById('filtroFechaOperativo');
    if (!fechaEl) return;

    let gestorName = 'todos';
    if (selectedGestores.length > 0) {
        gestorName = selectedGestores.length === 1 ? selectedGestores[0] : 'multiple';
    }

    const selectedFecha = fechaEl.value;
    let periodo = 'general';
    if (selectedFecha === 'today') periodo = 'hoy';
    else if (selectedFecha === 'yesterday') periodo = 'ayer';
    else if (selectedFecha === '7') periodo = 'semanal';
    else if (selectedFecha === '30') periodo = '30dias';
    else if (selectedFecha === 'thisMonth') periodo = 'mes';
    else if (selectedFecha === 'lastMonth') periodo = 'lastMonth';
    else if (selectedFecha === 'Todas') periodo = 'general';
    else if (selectedFecha === 'custom') periodo = 'custom';

    // Resetear listas de detalle
    window.kpiTaskLists = { finalizadas: [], no_realizadas: [], pendientes: [] };
    window.kpiBitacoraHTML = "";

    // Limpiar UI anterior
    const resultsContainer = document.getElementById('kpiResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
    
    if (!gestorName) {
        return;
    }
    
    let shiftReports = [];
    try {
        let snapshotReports, snapshotActive;
        
        if (gestorName === 'todos' || selectedGestores.length > 0) {
            snapshotReports = await database.ref('shift_reports').once('value');
            snapshotActive = await database.ref('active_sessions').once('value');
        }
        
        if (snapshotReports.exists()) {
            const data = snapshotReports.val();
            shiftReports = shiftReports.concat(Object.values(data));
        }
        
        if (snapshotActive.exists()) {
            const data = snapshotActive.val();
            // Normalizar active_sessions para que coincida con el formato de shift_reports
            const activeArr = Object.values(data).map(session => ({
                ...session,
                gestor: session.name, // Asegurar que exista el campo gestor
                timestamp: typeof session.loginTime === 'string' ? new Date(session.loginTime).getTime() : session.loginTime
            }));
            shiftReports = shiftReports.concat(activeArr);
        }
        
        if (selectedGestores.length > 0 && gestorName !== 'todos') {
            const checkGestorMatch = (fbGestor, mstrGestoresList) => {
                if (!fbGestor) return false;
                const normFb = fbGestor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return mstrGestoresList.some(sel => {
                    const normMstr = sel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const mstrParts = normMstr.split(' ');
                    return mstrParts.every(p => normFb.includes(p));
                });
            };
            shiftReports = shiftReports.filter(report => checkGestorMatch(report.gestor, selectedGestores));
        }
    } catch(e) {
        console.error("Error cargando shift reports para KPIs", e);
        return;
    }
    
    // Filtro por fecha
    const now = Date.now();
    
    const getTimestamp = (r) => {
        let t = r.timestamp || r.loginTime;
        if (typeof t === 'string') return new Date(t).getTime();
        return t;
    };
    
    if (periodo === 'hoy') {
        const hoyStart = new Date().setHours(0,0,0,0);
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= hoyStart; });
    } else if (periodo === 'ayer') {
        const hoyStart = new Date().setHours(0,0,0,0);
        const ayerStart = hoyStart - (24 * 60 * 60 * 1000);
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= ayerStart && t < hoyStart; });
    } else if (periodo === 'semanal') {
        const unaSemanaAtras = now - (7 * 24 * 60 * 60 * 1000);
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= unaSemanaAtras; });
    } else if (periodo === '30dias') {
        const unMesAtras = now - (30 * 24 * 60 * 60 * 1000);
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= unMesAtras; });
    } else if (periodo === 'mes') {
        const esteMesStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= esteMesStart; });
    } else if (periodo === 'lastMonth') {
        const d = new Date();
        const startLast = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
        const endLast = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= startLast && t < endLast; });
    } else if (periodo === 'custom') {
        const dateStartStr = document.getElementById('operativoDateStart')?.value;
        const dateEndStr = document.getElementById('operativoDateEnd')?.value;
        if (dateStartStr && dateEndStr) {
            const startParts = dateStartStr.split('-');
            const endParts = dateEndStr.split('-');
            const customStart = new Date(startParts[0], startParts[1]-1, startParts[2]).getTime();
            const customEnd = new Date(endParts[0], endParts[1]-1, endParts[2]).getTime() + 86400000;
            shiftReports = shiftReports.filter(r => { const t = getTimestamp(r); return t && t >= customStart && t < customEnd; });
        } else {
            return;
        }
    }
    
    // The shiftReports are already filtered by gestor using checkGestorMatch above.
    if (shiftReports.length === 0) {
        console.warn(`No hay reportes de turno para ${gestorName} en esta fecha/periodo.`);
        // No hacer return, permitir que el código continúe para cargar los datos de Retiros
    }

    let totalFinalizadas = 0;
    let totalNoRealizadas = 0;
    let totalPendientes = 0;
    let turnosAnalizados = shiftReports.length;
    let totalMinutosConectados = 0;
    let turnosValidosParaTiempo = 0;
    
    shiftReports.forEach(report => {
        // Calcular duración del turno
        if (report.horaInicio && report.horaFin) {
            const baseMs = report.timestamp || report.loginTime || Date.now();
            
            const parseTime = (timeStr, baseDateMs) => {
                if (typeof timeStr === 'string') {
                    timeStr = timeStr.replace(/a\.\s*m\./i, 'AM').replace(/p\.\s*m\./i, 'PM');
                }
                let d = new Date(timeStr);
                if (!isNaN(d.getTime())) return d.getTime();
                
                if (typeof timeStr === 'string' && timeStr.includes(':')) {
                    const parts = timeStr.match(/(\d+):(\d+)/);
                    if (parts) {
                        const base = new Date(baseDateMs);
                        let hours = parseInt(parts[1], 10);
                        if (timeStr.toUpperCase().includes('PM') && hours < 12) hours += 12;
                        if (timeStr.toUpperCase().includes('AM') && hours === 12) hours = 0;
                        base.setHours(hours, parseInt(parts[2], 10), 0, 0);
                        return base.getTime();
                    }
                }
                return NaN;
            };

            const startMs = parseTime(report.horaInicio, baseMs);
            const endMs = parseTime(report.horaFin, baseMs);
            
            if (!isNaN(startMs) && !isNaN(endMs)) {
                let diffMins = (endMs - startMs) / 60000;
                if (diffMins < 0) diffMins += 1440; // Cruzó la medianoche
                
                if (diffMins > 0 && diffMins <= 1440) {
                    totalMinutosConectados += diffMins;
                    turnosValidosParaTiempo++;
                }
            }
        }

        // Construir HTML de bitácora para el modal/tarjeta
        const shiftDateStr = new Date(report.timestamp || report.loginTime || Date.now()).toLocaleDateString('es-CO');
        let html = `<div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">`;
        html += `<div style="font-weight: 600; color: var(--accent-primary); font-size: 14px;"><i class='bx bx-calendar-event'></i> Turno del ${shiftDateStr}</div>`;
        html += `<div style="font-size: 12px; color: var(--text-primary); background: var(--glass-border); padding: 5px 12px; border-radius: 20px; font-weight: 500;"><i class='bx bx-user'></i> ${report.gestor || 'Desconocido'}</div>`;
        html += `</div>`;
        
        let horaI = report.horaInicio ? report.horaInicio : (report.loginTime ? new Date(report.loginTime).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'}) : 'N/A');
        let horaF = report.horaFin || (report.status === "En Línea" ? "<span style='color:var(--success)'><i class='bx bx-radio-circle-marked bx-flashing'></i> En Curso</span>" : 'N/A');
        
        html += `<div style="display: flex; gap: 15px; font-size: 13px; color: var(--text-secondary); margin-bottom: 15px; flex-wrap: wrap;">`;
        html += `<div style="background: var(--bg-primary); border: 1px solid var(--glass-border); padding: 8px 15px; border-radius: 8px;"><i class='bx bx-log-in-circle' style="color: var(--accent-primary);"></i> Ingreso: <span style="color: var(--text-primary); font-weight: 600;">${horaI}</span></div>`;
        html += `<div style="background: var(--bg-primary); border: 1px solid var(--glass-border); padding: 8px 15px; border-radius: 8px;"><i class='bx bx-log-out-circle' style="color: var(--warning);"></i> Salida: <span style="color: var(--text-primary); font-weight: 600;">${horaF}</span></div>`;
        html += `</div>`;

        html += `<div style="display: flex; flex-direction: column; gap: 10px;">`;
        
        if (report.timeline && report.timeline.length > 0) {
            report.timeline.forEach(ev => {
                const s = new Date(ev.start).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
                const eTime = ev.end ? new Date(ev.end).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'}) : "<span style='color:var(--warning)'>En Pausa</span>";
                let icon = ev.type === 'Desayuno' ? "<i class='bx bx-coffee'></i>" : (ev.type === 'Almuerzo' ? "<i class='bx bx-restaurant'></i>" : "<i class='bx bx-time-five'></i>");
                let color = ev.type === 'Desayuno' ? "var(--warning)" : (ev.type === 'Almuerzo' ? "var(--success)" : "var(--danger)");
                let bgLight = ev.type === 'Desayuno' ? "var(--warning-bg)" : (ev.type === 'Almuerzo' ? "var(--success-bg)" : "var(--danger-bg)");
                
                html += `<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-primary); padding: 12px 16px; border-radius: 10px; border-left: 4px solid ${color}; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">`;
                html += `<div style="display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 13px; color: var(--text-primary);"><div style="background: ${bgLight}; color: ${color}; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 16px;">${icon}</div> ${escapeHTML(String(ev.type))}</div>`;
                html += `<div style="font-family: monospace; font-size: 12px; color: var(--text-primary); background: var(--bg-secondary); border: 1px solid var(--glass-border); padding: 5px 12px; border-radius: 8px; font-weight: 500;"><i class='bx bx-time' style="color: var(--text-secondary);"></i> ${s} - ${eTime}</div>`;
                html += `</div>`;
            });
        } else if (report.reporte && report.reporte.includes("=== BITÁCORA DE TIEMPOS ===")) {
            const parts = report.reporte.split("=== BITÁCORA DE TIEMPOS ===");
            if (parts.length > 1) {
                const rawBitacora = parts[1].trim();
                const lines = rawBitacora.split('\n').map(l => l.trim()).filter(Boolean);
                const uniqueLines = [];
                lines.forEach(line => {
                    if (!uniqueLines.includes(line)) {
                        uniqueLines.push(line);
                    }
                });
                html += `<div style="font-family: monospace; font-size: 13px; color: var(--text-secondary); white-space: pre-wrap; background: var(--bg-primary); border: 1px solid var(--glass-border); padding: 15px; border-radius: 10px;">${escapeHTML(uniqueLines.join('\n'))}</div>`;
            }
        } else {
            html += `<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 13px; background: var(--bg-primary); border-radius: 10px; border: 1px dashed var(--glass-border);"><i class='bx bx-info-circle' style="font-size: 18px; display: block; margin-bottom: 5px; opacity: 0.5;"></i> No se registraron pausas en este turno</div>`;
        }
        html += `</div></div>`;
        
        window.kpiBitacoraHTML = (window.kpiBitacoraHTML || "") + html;
        
        let tasks = report.tasks;
        if (!tasks && report.reporte) {
            tasks = {};
            const regex = /\[\s*([A-Za-z_]+)\s*\]\s*-\s*([^\n]+)(?:\nObservación:\s*([^\n]+))?/g;
            let match;
            let i = 0;
            while ((match = regex.exec(report.reporte)) !== null) {
                tasks[`parsed_${i++}`] = {
                    status: match[1].toLowerCase(),
                    name: match[2].trim(),
                    observation: match[3] ? match[3].trim() : 'N/A'
                };
            }
        }
        
        if (!tasks) return;
        
        // Contar tareas
        for (let taskId in tasks) {
            const task = tasks[taskId];
            const shiftDateStr = new Date(report.timestamp || report.loginTime || Date.now()).toLocaleDateString();
            const taskObj = { name: task.name, date: shiftDateStr, type: task.type || 'N/A', observation: task.observation || 'N/A' };
            
            if (!task.status) continue;
            const tStatus = task.status.toLowerCase().trim();
            
            if (tStatus === 'finalizada') {
                totalFinalizadas++;
                window.kpiTaskLists.finalizadas.push(taskObj);
            } else if (tStatus === 'no_realizada' || tStatus === 'no realizada') {
                totalNoRealizadas++;
                window.kpiTaskLists.no_realizadas.push(taskObj);
            } else if (tStatus === 'pendiente' || tStatus === 'en_proceso' || tStatus === 'en proceso') {
                totalPendientes++;
                window.kpiTaskLists.pendientes.push(taskObj);
            }
        }
    });
    
    const totalTareas = totalFinalizadas + totalNoRealizadas + totalPendientes;
    let porcentajeActividades = 0;
    
    if (totalTareas > 0) {
        porcentajeActividades = (totalFinalizadas / totalTareas) * 100;
    } else {
        porcentajeActividades = 0; // Regla confirmada: 0% si no marcó nada
    }
    
    porcentajeActividades = Math.round(porcentajeActividades);
    
    // Calcular Penalidad de Conectividad e Inactividad
    let totalInactividadMins = 0;
    let totalPenalidadConectividad = 0;
    let validInactivitySessions = 0;
    shiftReports.forEach(report => {
        let isFueraDeHorario = false;
        if (report.turnoProgramado) {
            let loginDateObj = report.loginTime ? new Date(report.loginTime) : (report.timestamp ? new Date(report.timestamp) : null);
            if (!loginDateObj || isNaN(loginDateObj) && report.horaInicio) {
                try {
                    let parts = report.horaInicio.split(',');
                    if (parts.length > 0) {
                        let dParts = parts[0].trim().split('/');
                        if (dParts.length === 3) {
                            let day = parseInt(dParts[0]), month = parseInt(dParts[1]), year = parseInt(dParts[2]);
                            if (month > 12) { let t = day; day = month; month = t; }
                            let tStr = parts.length > 1 ? parts[1].trim().replace(/\./g, '').replace(/a\s*m/i, 'AM').replace(/p\s*m/i, 'PM') : "00:00:00";
                            loginDateObj = new Date(`${month}/${day}/${year} ${tStr}`);
                        }
                    }
                } catch(e) {}
            }
            if (loginDateObj && !isNaN(loginDateObj)) {
                let shiftStr = report.turnoProgramado.toLowerCase().trim();
                let match = shiftStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
                if (match) {
                    let h = parseInt(match[1]); let m = match[2] ? parseInt(match[2]) : 0;
                    let ampm = match[3];
                    if (ampm === 'pm' && h < 12) h += 12;
                    if (ampm === 'am' && h === 12) h = 0;
                    let exp = new Date(loginDateObj);
                    exp.setHours(h, m, 0, 0);
                    let diffMin = (loginDateObj - exp) / 60000;
                    if (diffMin < -720) { exp.setDate(exp.getDate() - 1); diffMin = (loginDateObj - exp) / 60000; }
                    else if (diffMin > 720) { exp.setDate(exp.getDate() + 1); diffMin = (loginDateObj - exp) / 60000; }
                    if (diffMin > 240) isFueraDeHorario = true;
                }
            }
        }
        
        if (isFueraDeHorario) return;
        validInactivitySessions++;
        
        if (report.penalidadConectividadMins) {
            // Regla confirmada: 1% menos por cada minuto sobrepasado
            totalPenalidadConectividad += report.penalidadConectividadMins;
        }
        
        if (report.timeline && report.timeline.length > 0) {
            // Limpiar y unificar timeline de reportes pasados para ignorar inactividades duplicadas/superpuestas
            let cleanTimeline = [];
            const breaks = report.timeline.filter(b => b.type === 'Desayuno' || b.type === 'Almuerzo');
            let sortedEvs = [...report.timeline].sort((a, b) => a.start - b.start);
            const reportEndTs = report.timestamp || Date.now();

            sortedEvs.forEach(ev => {
                let evStart = ev.start;
                let evEnd = ev.end || reportEndTs;
                if (evEnd <= evStart) return;

                if (ev.type === 'Inactividad') {
                    if (evEnd - evStart < 30000) return;
                    let insideBreak = breaks.some(b => {
                        let bStart = b.start;
                        let bEnd = b.end || reportEndTs;
                        return evStart >= bStart && evEnd <= bEnd;
                    });
                    if (insideBreak) return;
                }

                if (cleanTimeline.length === 0) {
                    cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                } else {
                    let prev = cleanTimeline[cleanTimeline.length - 1];
                    if (prev.type === ev.type && evStart <= prev.end + 60000) {
                        prev.end = Math.max(prev.end, evEnd);
                    } else if (evStart < prev.end) {
                        if (ev.type === 'Inactividad') {
                            if (evEnd > prev.end) {
                                evStart = prev.end;
                                if (evEnd - evStart >= 30000) {
                                    cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                                }
                            }
                        } else {
                            cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                        }
                    } else {
                        cleanTimeline.push({ type: ev.type, start: evStart, end: evEnd });
                    }
                }
            });

            let fallbackMins = 0;
            const loginDate = report.loginTime ? new Date(report.loginTime) : (report.timestamp ? new Date(report.timestamp) : null);
            const maxEndTime = loginDate ? loginDate.getTime() + (10 * 60 * 60 * 1000) : Date.now() + 99999999;

            cleanTimeline.forEach(ev => {
                if (ev.type === 'Inactividad') {
                    if (loginDate && ev.start > maxEndTime) return;
                    let eTime = ev.end ? ev.end : Date.now();
                    if (loginDate && eTime > maxEndTime) eTime = maxEndTime;
                    let mins = (eTime - ev.start) / (1000 * 60);
                    if (mins > 0) fallbackMins += mins;
                }
            });
            totalInactividadMins += Math.min(fallbackMins, 480);
        } else if (report.inactividadTotalMins !== undefined) {
            totalInactividadMins += Math.min(report.inactividadTotalMins, 480);
        }
    });
    let diasTrabajados = validInactivitySessions || (shiftReports.length ? 1 : 0);
    let totalMinutosEsperados = diasTrabajados * 405; // 6:45 horas = 405 minutos por dia
    let porcentajeInactividad = totalMinutosEsperados > 0 ? (totalInactividadMins / totalMinutosEsperados) * 100 : 0;
    
    let porcentajeConectividad = 100 - porcentajeInactividad;
    porcentajeConectividad = Number(porcentajeConectividad.toFixed(2));
    if (porcentajeConectividad < 0) porcentajeConectividad = 0;
    if (porcentajeConectividad > 100) porcentajeConectividad = 100;

    
    // Aplicar penalidad de retiros si existe la data y llenar nuevas tarjetas
    let penalidadRetiros = 0;
    const cardRetiros = document.getElementById('kpiRetirosPenalidadCard');
    const textPenalidad = document.getElementById('kpiPenalidadRetiros');
    const textDemora = document.getElementById('kpiDemoraPromedioText');
    const cardPagados = document.getElementById('kpiRetirosPagados');
    const cardRechazados = document.getElementById('kpiRetirosRechazados');
    const retirosCardsElements = document.querySelectorAll('.retiros-card');
    
    // Asegurar que controlOperativoRawData esté cargado
    if (!window.controlOperativoRawData) {
        try {
            const resp = await fetch(`kpi_operativos_v2.json?v=${new Date().getTime()}`);
            if (resp.ok) window.controlOperativoRawData = await resp.json();
        } catch (e) {
            console.error("Error al cargar datos de operativos", e);
        }
    }
    
    let finalStats = { totalAprobados: 0, totalRechazados: 0, montoProcesado: 0, minutosDemoraTotales: 0, retirosConTiempo: 0 };
    
    if (window.controlOperativoRawData) {
        let targetDates = [];
        const getLocalYYYYMMDD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const addDates = (d) => targetDates.push(getLocalYYYYMMDD(d));

        if (periodo === 'hoy') {
            addDates(todayStart);
        } else if (periodo === 'ayer') {
            addDates(new Date(todayStart.getTime() - 86400000));
        } else if (periodo === 'semanal') {
            for(let i=0; i<7; i++) addDates(new Date(todayStart.getTime() - (i * 86400000)));
        } else if (periodo === '30dias') {
            for(let i=0; i<30; i++) addDates(new Date(todayStart.getTime() - (i * 86400000)));
        } else if (periodo === 'mes') {
            for(let i=1; i<=31; i++){
                const dt = new Date(todayStart.getFullYear(), todayStart.getMonth(), i);
                if (dt.getMonth() === todayStart.getMonth() && dt <= todayStart) addDates(dt);
            }
        } else if (periodo === 'lastMonth') {
            const firstLast = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
            const lastLast = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0);
            for(let d = new Date(firstLast); d <= lastLast; d.setDate(d.getDate() + 1)) {
                addDates(new Date(d));
            }
        } else if (periodo === 'custom') {
            const dateStartStr = document.getElementById('operativoDateStart')?.value;
            const dateEndStr = document.getElementById('operativoDateEnd')?.value;
            if (dateStartStr && dateEndStr) {
                const start = new Date(dateStartStr);
                const end = new Date(dateEndStr);
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    addDates(new Date(d));
                }
            }
        }
        
        let gestoresToCheck = [];
        if (selectedGestores.length === 0) {
            gestoresToCheck = Object.keys(window.controlOperativoRawData);
        } else {
            const rawKeys = Object.keys(window.controlOperativoRawData);
            gestoresToCheck = selectedGestores.map(g => {
                let realGestor = rawKeys.find(k => k === g);
                if (!realGestor) {
                    const parts = g.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ');
                    realGestor = rawKeys.find(k => {
                        const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return parts.every(p => normK.includes(p));
                    });
                }
                return realGestor || g;
            });
        }
        
        for (let g of gestoresToCheck) {
            if (!window.controlOperativoRawData[g]) continue; 
            
            for (let f in window.controlOperativoRawData[g]) {
                if (periodo !== 'general' && !targetDates.includes(f)) continue;
                
                const dayData = window.controlOperativoRawData[g][f];
                finalStats.totalAprobados += dayData.Retiros_Aprobados || 0;
                finalStats.totalRechazados += dayData.Retiros_Rechazados || 0;
                finalStats.minutosDemoraTotales += (dayData.Tiempo_Total_Desde_Creacion_Segundos || 0) / 60;
                finalStats.retirosConTiempo += dayData.Retiros_Procesados || 0;
            }
        }
    }

    if (cardPagados) cardPagados.textContent = finalStats.totalAprobados;
    if (cardRechazados) cardRechazados.textContent = finalStats.totalRechazados;
    
    if (finalStats.retirosConTiempo > 0) {
        const avgDemoraMins = finalStats.minutosDemoraTotales / finalStats.retirosConTiempo;
        
        // Penalidad: si el promedio supera los 15 minutos, restar 1% por cada minuto extra (max 30% de penalidad)
        if (avgDemoraMins > 15) {
            penalidadRetiros = Math.floor(avgDemoraMins - 15);
            if (penalidadRetiros > 30) penalidadRetiros = 30; // Cap
        }
        
        if (cardRetiros) {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Gestor') {
                cardRetiros.style.display = 'none';
            } else {
                cardRetiros.style.display = 'flex';
            }
        }
        if (textPenalidad) textPenalidad.textContent = `-${penalidadRetiros}%`;
        if (textDemora) textDemora.textContent = `Promedio: ${Math.round(avgDemoraMins)} min / ${finalStats.retirosConTiempo} retiros`;
    } else {
        if (cardRetiros) cardRetiros.style.display = 'none';
    }
    
    // Hide Rendimiento Retiros for Gestor
    const kpiRendimientoRetirosCard = document.getElementById('kpiRendimientoRetirosCard'); // we need to make sure this is the right ID
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Gestor') {
        document.querySelectorAll('.retiros-card').forEach(el => el.style.display = 'none');
        if (cardRetiros) cardRetiros.style.display = 'none';
    }
    
    let porcentajeRetiros = 100 - penalidadRetiros;
    if (porcentajeRetiros < 0) porcentajeRetiros = 0;
    
    // Calcular promedio de horas y minutos
    let promedioHoras = 0;
    let promedioMinutosRestantes = 0;
    if (turnosValidosParaTiempo > 0) {
        const avgMinutosTotales = totalMinutosConectados / turnosValidosParaTiempo;
        promedioHoras = Math.floor(avgMinutosTotales / 60);
        promedioMinutosRestantes = Math.round(avgMinutosTotales % 60);
    }
    
    // Update DOM
    document.getElementById('kpiTotalFinalizadas').textContent = totalFinalizadas;
    document.getElementById('kpiTotalNoRealizadas').textContent = totalNoRealizadas;
    document.getElementById('kpiTotalPendientes').textContent = totalPendientes;
    document.getElementById('kpiTurnosAnalizados').textContent = turnosAnalizados;
    document.getElementById('kpiDuracionPromedio').textContent = turnosValidosParaTiempo > 0 ? `${promedioHoras}h ${promedioMinutosRestantes}m` : 'N/A';
    
    // Inactividad
    let inactividadHoras = Math.floor(totalInactividadMins / 60);
    let inactividadMinutos = Math.round(totalInactividadMins % 60);
    let inactividadStr = totalInactividadMins > 0 ? `${inactividadHoras}h ${inactividadMinutos}m` : '0h 0m';
    if(document.getElementById('kpiTiempoInactivo')) {
        document.getElementById('kpiTiempoInactivo').textContent = inactividadStr;
    }
    
    // Mostrar Bitácora integrada
    const cardBitacora = document.getElementById('kpiBitacoraInlineCard');
    const listBitacora = document.getElementById('kpiBitacoraInlineList');
    if (cardBitacora && listBitacora) {
        if (window.kpiBitacoraHTML && window.kpiBitacoraHTML.trim() !== '') {
            listBitacora.innerHTML = window.kpiBitacoraHTML;
            cardBitacora.style.display = 'flex';
        } else {
            cardBitacora.style.display = 'none';
        }
    }
    
    // Animar anillos independientes
    const animateRing = (ringId, textId, badgeId, percentage) => {
        const ring = document.getElementById(ringId);
        const textPercent = document.getElementById(textId);
        const badge = document.getElementById(badgeId);
        if(!ring || !textPercent || !badge) return;
        
        const circumference = 251.2;
        const offset = circumference - (percentage / 100) * circumference;
        
        ring.style.transition = 'none';
        ring.style.strokeDashoffset = circumference;
        
        setTimeout(() => {
            ring.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
            ring.style.strokeDashoffset = offset;
            textPercent.textContent = percentage + '%';
            
            if (percentage >= 90) {
                ring.style.stroke = 'var(--success)';
                badge.style.background = 'rgba(16, 185, 129, 0.2)';
                badge.style.color = 'var(--success)';
                badge.textContent = 'Óptimo';
            } else if (percentage >= 75) {
                ring.style.stroke = 'var(--warning)';
                badge.style.background = 'rgba(245, 158, 11, 0.2)';
                badge.style.color = 'var(--warning)';
                badge.textContent = 'Aceptable';
            } else {
                ring.style.stroke = 'var(--danger)';
                badge.style.background = 'rgba(239, 68, 68, 0.2)';
                badge.style.color = 'var(--danger)';
                badge.textContent = 'Crítico';
            }
        }, 50);
    };

    animateRing('kpiScoreRingActividades', 'kpiScoreTextActividades', 'kpiVerdictBadgeActividades', porcentajeActividades);
    animateRing('kpiScoreRingConectividad', 'kpiScoreTextConectividad', 'kpiVerdictBadgeConectividad', porcentajeConectividad);
    animateRing('kpiScoreRingRetiros', 'kpiScoreTextRetiros', 'kpiVerdictBadgeRetiros', porcentajeRetiros);
    
    resultsContainer.style.display = 'flex';
}

// Modal de Detalle de Tareas (KPIs)
function openKpiTaskDetails(tipo) {
    const modal = document.getElementById('kpiTaskDetailsModal');
    const title = document.getElementById('kpiModalTitle');
    const icon = document.getElementById('kpiModalIcon');
    const list = document.getElementById('kpiModalTaskList');
    
    if (!window.kpiTaskLists) return;
    
    const tasks = window.kpiTaskLists[tipo] || [];
    
    // Configurar cabecera
    if (tipo === 'finalizadas') {
        title.textContent = 'Tareas Finalizadas';
        icon.className = 'bx bx-check-double';
        icon.style.color = 'var(--success)';
    } else if (tipo === 'no_realizadas') {
        title.textContent = 'Tareas No Realizadas';
        icon.className = 'bx bx-x-circle';
        icon.style.color = 'var(--danger)';
    } else if (tipo === 'pendientes') {
        title.textContent = 'Tareas Pendientes';
        icon.className = 'bx bx-time';
        icon.style.color = 'var(--warning)';
    }
    
    list.innerHTML = '';
    
    if (tasks.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No hay tareas en este estado.</div>';
    } else {
        tasks.forEach(t => {
            const tTypeColor = t.type === 'adicional' ? 'var(--warning)' : 'var(--accent-primary)';
            const tTypeBadge = `<span style="font-size: 10px; background: ${tTypeColor}20; color: ${tTypeColor}; padding: 2px 6px; border-radius: 10px; margin-left: 8px;">${t.type === 'adicional' ? 'Adicional' : 'Set'}</span>`;
            
            list.innerHTML += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 10px 15px; border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 13px; color: var(--text-primary); font-weight: 500;">
                            ${escapeHTML(t.name)}
                            ${tTypeBadge}
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                            <i class='bx bx-calendar'></i> ${escapeHTML(t.date)}
                        </div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary); background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; border-left: 2px solid ${tTypeColor};">
                        <strong>Nota:</strong> ${escapeHTML(t.observation)}
                    </div>
                </div>
            `;
        });
    }
    
    modal.classList.add('active');
}

function closeKpiTaskDetails() {
    document.getElementById('kpiTaskDetailsModal').classList.remove('active');
}

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    preloadCronograma();
    loadRetirosData();
    // Iniciar Módulo de Comunicados
    initComunicadosListener();
    // Iniciar listeners en tiempo real adicionales
    if (typeof initAtomicApprovedCounterListener === 'function') initAtomicApprovedCounterListener();
    if (typeof startIncidentsRealtimeListener === 'function') startIncidentsRealtimeListener();
    
    // Restaurar botones de pausas
    const btnLunch = document.getElementById('toggleLunchBtn');
    if (btnLunch && isLunchBreak) {
        btnLunch.innerHTML = "<i class='bx bx-check-circle'></i> Volver del Almuerzo/Cena";
        btnLunch.classList.remove('btn-outline');
        btnLunch.style.backgroundColor = "rgba(0, 188, 212, 0.15)";
        btnLunch.style.color = "#00bcd4";
        btnLunch.style.borderColor = "rgba(0, 188, 212, 0.5)";
        btnLunch.style.boxShadow = "0 0 15px rgba(0, 188, 212, 0.2)";
    }
    const btnBreak = document.getElementById('toggleBreakfastBtn');
    if (btnBreak && isBreakfastBreak) {
        btnBreak.innerHTML = "<i class='bx bx-check-circle'></i> Volver del Desayuno";
        btnBreak.classList.remove('btn-outline');
        btnBreak.style.backgroundColor = "rgba(255, 152, 0, 0.15)";
        btnBreak.style.color = "#ff9800";
        btnBreak.style.borderColor = "rgba(255, 152, 0, 0.5)";
        btnBreak.style.boxShadow = "0 0 15px rgba(255, 152, 0, 0.2)";
    }
    
    const periodoSelect = document.getElementById('kpiPeriodoSelect');
    if (periodoSelect) {
        periodoSelect.addEventListener('change', function(e) {
            const customInput = document.getElementById('kpiCustomDateInput');
            const customContainer = document.getElementById('kpiCustomDateContainer');
            if (customInput) {
                customInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
            }
            if (customContainer) {
                customContainer.style.display = e.target.value === 'custom' ? 'block' : 'none';
            }
        });
    }
});

// Window clicks para cerrar modales
window.onclick = function(event) {
    const modalPermiso = document.getElementById('permisoModal');
    if (event.target == modalPermiso) {
        cerrarModalPermiso();
    }
    
    const taskDetailsModal = document.getElementById('kpiTaskDetailsModal');
    if (event.target == taskDetailsModal) {
        closeKpiTaskDetails();
    }
};

// Cerrar modales con la tecla Escape
window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        activeModals.forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// --- MÓDULO DE COMUNICADOS ---
let globalComunicados = {};

function initComunicadosListener() {
    database.ref('announcements').on('value', snapshot => {
        globalComunicados = snapshot.val() || {};
        updateUnreadBadge();
        checkUnreadUrgentAnnouncements();
        
        // Re-render views if they are open
        const viewGestor = document.getElementById('view-comunicados');
        if (viewGestor && viewGestor.style.display === 'block') {
            renderGestorComunicados();
        }
        
        const viewAdmin = document.getElementById('view-gestion-comunicados');
        if (viewAdmin && viewAdmin.style.display === 'block') {
            renderAdminComunicados();
        }
    });
}

function openNewComunicadoModal() {
    document.getElementById('comunicadoTitle').value = '';
    document.getElementById('comunicadoContent').innerHTML = '';
    document.getElementById('newComunicadoModal').classList.add('active');
}

async function saveNewComunicado() {
    const title = document.getElementById('comunicadoTitle').value.trim();
    const content = sanitizeAnnouncementHTML(document.getElementById('comunicadoContent').innerHTML).trim();
    
    if (!title || !content) {
        alert("Por favor llena todos los campos.");
        return;
    }
    
    try {
        const newRef = database.ref('announcements').push();
        await newRef.set({
            title: title,
            content: content,
            date: new Date().toISOString(),
            author: currentUser.name || 'Admin',
            readBy: {}
        });
        
        alert("Comunicado publicado exitosamente.");
        closeModal('newComunicadoModal');
    } catch(e) {
        console.error(e);
        alert("Error al publicar.");
    }
}

function updateUnreadBadge() {
    if (!currentUser || currentUser.role === 'Admin' || currentUser.role === 'Supervisor') {
        const badge = document.getElementById('unreadAnnouncementsBadge');
        if (badge) badge.style.display = 'none';
        return;
    }
    
    let unreadCount = 0;
    const uid = (currentUser && currentUser.uid) ? currentUser.uid : (firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'unknown');
    
    Object.keys(globalComunicados).forEach(key => {
        const c = globalComunicados[key];
        if (!c.readBy || !c.readBy[uid]) {
            unreadCount++;
        }
    });
    
    const badge = document.getElementById('unreadAnnouncementsBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderGestorComunicados() {
    const list = document.getElementById('gestorComunicadosList');
    if (!list) return;
    
    list.innerHTML = '';
    const keys = Object.keys(globalComunicados).sort((a,b) => {
        return new Date(globalComunicados[b].date) - new Date(globalComunicados[a].date);
    });
    
    if (keys.length === 0) {
        list.innerHTML = `<div class="glass-panel" style="padding: 20px; text-align: center; color: var(--text-secondary);">No hay comunicados activos.</div>`;
        return;
    }
    
    const uid = (currentUser && currentUser.uid) ? currentUser.uid : (firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'unknown');
    
    keys.forEach(key => {
        const c = globalComunicados[key];
        const isRead = c.readBy && c.readBy[uid];
        const formattedDate = new Date(c.date).toLocaleString('es-CO');
        
        let actionsHtml = '';
        if (isRead) {
            actionsHtml = `<div style="color: var(--success); font-size: 13px; margin-top: 15px; font-weight: 500;"><i class='bx bx-check-double'></i> Leído el ${new Date(c.readBy[uid].readAt).toLocaleString('es-CO')}</div>`;
        } else {
            actionsHtml = `<button class="btn btn-primary" style="margin-top: 15px; width: 100%; max-width: 300px; background: var(--success); border-color: var(--success);" onclick="markComunicadoAsRead(decodeURIComponent('${encodeInlineHandlerArg(key)}'))"><i class='bx bx-check'></i> Marcar como Leído y Entendido</button>`;
        }
        
        list.innerHTML += `
            <div class="glass-panel" style="padding: 20px; border-left: 4px solid ${isRead ? 'var(--glass-border)' : 'var(--danger)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h3 style="color: ${isRead ? 'var(--text-primary)' : 'var(--danger)'}; margin: 0; font-size: 18px;">${escapeHTML(c.title)}</h3>
                    <span style="font-size: 11px; color: var(--text-secondary); background: rgba(0,0,0,0.1); padding: 3px 8px; border-radius: 10px;">${formattedDate} por ${escapeHTML(c.author)}</span>
                </div>
                <div class="rich-text" style="font-size: 14px; color: var(--text-secondary); margin-top: 10px; line-height: 1.5; overflow-wrap: break-word; white-space: pre-wrap;">${sanitizeAnnouncementHTML(c.content)}</div>
                ${actionsHtml}
            </div>
        `;
    });
}

async function markComunicadoAsRead(id) {
    try {
        const uid = (currentUser && currentUser.uid) ? currentUser.uid : (firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'unknown');
        await database.ref(`announcements/${id}/readBy/${uid}`).set({
            name: currentUser.name,
            readAt: new Date().toISOString()
        });
    } catch(e) {
        console.error(e);
        alert("Error al marcar como leído.");
    }
}

function checkUnreadUrgentAnnouncements() {
    if (!currentUser || !currentUser.uid) return;
    const uid = currentUser.uid;
    
    const modal = document.getElementById('urgentAnnouncementModal');
    if (modal && modal.classList.contains('active')) return;
    
    const keys = Object.keys(globalComunicados).sort((a,b) => {
        return new Date(globalComunicados[a].date) - new Date(globalComunicados[b].date);
    });
    
    for (let key of keys) {
        const c = globalComunicados[key];
        const isRead = c.readBy && c.readBy[uid];
        
        if (!isRead) {
            document.getElementById('urgentAnnouncementTitle').innerText = c.title || '';
            document.getElementById('urgentAnnouncementAuthor').innerText = c.author || '';
            document.getElementById('urgentAnnouncementDate').innerText = new Date(c.date).toLocaleString('es-CO');
            document.getElementById('urgentAnnouncementBody').innerHTML = sanitizeAnnouncementHTML(c.content);
            
            const btn = document.getElementById('btnUrgentUnderstand');
            btn.onclick = () => markUrgentComunicadoAsRead(key);
            
            modal.classList.add('active');
            return;
        }
    }
}

async function markUrgentComunicadoAsRead(id) {
    const btn = document.getElementById('btnUrgentUnderstand');
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Registrando...";
    btn.disabled = true;
    
    try {
        await markComunicadoAsRead(id);
        
        document.getElementById('urgentAnnouncementModal').classList.remove('active');
        btn.innerHTML = "<i class='bx bx-check-double'></i> He leído y entendido este comunicado";
        btn.disabled = false;
        
        setTimeout(() => {
            checkUnreadUrgentAnnouncements();
        }, 500);
        
    } catch(e) {
        btn.innerHTML = "<i class='bx bx-check-double'></i> He leído y entendido este comunicado";
        btn.disabled = false;
    }
}

function renderAdminComunicados() {
    const tbody = document.getElementById('adminComunicadosTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const keys = Object.keys(globalComunicados).sort((a,b) => {
        return new Date(globalComunicados[b].date) - new Date(globalComunicados[a].date);
    });
    
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-secondary);">No hay comunicados creados.</td></tr>`;
        return;
    }
    
    keys.forEach(key => {
        const c = globalComunicados[key];
        const formattedDate = new Date(c.date).toLocaleString('es-CO');
        const readCount = c.readBy ? Object.keys(c.readBy).length : 0;
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 12px; font-size: 13px;">${formattedDate}</td>
                <td style="padding: 12px; font-weight: 500;">
                    <a href="javascript:void(0)" onclick="viewComunicadoContent(decodeURIComponent('${encodeInlineHandlerArg(key)}'))" style="color: var(--accent-primary); text-decoration: none; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.textDecoration='underline'; this.style.color='var(--text-primary)'" onmouseout="this.style.textDecoration='none'; this.style.color='var(--accent-primary)'">${escapeHTML(c.title)}</a>
                </td>
                <td style="padding: 12px; color: var(--text-secondary); font-size: 13px;">${escapeHTML(c.author)}</td>
                <td style="padding: 12px; text-align: center;"><span class="badge" style="background: var(--success);">${readCount} lecturas</span></td>
                <td style="padding: 12px; text-align: center;">
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px;" onclick="viewComunicadoContent(decodeURIComponent('${encodeInlineHandlerArg(key)}'))"><i class='bx bx-book-open'></i> Leer</button>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;" onclick="viewComunicadoLecturas(decodeURIComponent('${encodeInlineHandlerArg(key)}'))"><i class='bx bx-user-check'></i> Lecturas</button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px; margin-left: 5px;" onclick="deleteComunicado(decodeURIComponent('${encodeInlineHandlerArg(key)}'))"><i class='bx bx-trash'></i></button>
                </td>
            </tr>
        `;
    });
}

function viewComunicadoContent(id) {
    const c = globalComunicados[id];
    if (!c) return;
    
    document.getElementById('viewComunicadoContentTitle').innerText = c.title || '';
    document.getElementById('viewComunicadoContentAuthor').innerText = c.author || '';
    document.getElementById('viewComunicadoContentDate').innerText = new Date(c.date).toLocaleString('es-CO');
    document.getElementById('viewComunicadoContentBody').innerHTML = sanitizeAnnouncementHTML(c.content);
    
    document.getElementById('viewComunicadoContentModal').classList.add('active');
}

async function viewComunicadoLecturas(id) {
    const c = globalComunicados[id];
    if (!c) return;
    
    document.getElementById('comunicadoLecturasModal').classList.add('active');
    const readList = document.getElementById('comunicadoReadList');
    const unreadList = document.getElementById('comunicadoUnreadList');
    
    readList.innerHTML = '';
    unreadList.innerHTML = '<li style="color: var(--text-secondary);">Cargando usuarios...</li>';
    
    // Poblar leídos
    const readers = c.readBy || {};
    const readerUids = Object.keys(readers).sort((a,b) => new Date(readers[b].readAt) - new Date(readers[a].readAt));
    
    const readNames = new Set();
    if (readerUids.length === 0) {
        readList.innerHTML = '<li style="color: var(--text-secondary); margin-bottom: 5px;">Nadie ha leído esto aún.</li>';
    } else {
        readerUids.forEach(uid => {
            const r = readers[uid];
            if (r.name) readNames.add(r.name.trim().toLowerCase());
            readList.innerHTML += `<li style="margin-bottom: 8px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 500; font-size: 13px;">${escapeHTML(r.name)}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">${new Date(r.readAt).toLocaleString('es-CO')}</div>
            </li>`;
        });
    }
    
    // Fetch all active gestores to find who hasn't read
    try {
        const snap = await database.ref('users').once('value');
        if (snap.exists()) {
            const allUsers = snap.val();
            unreadList.innerHTML = '';
            
            let unreadCount = 0;
            Object.keys(allUsers).forEach(uKey => {
                const u = allUsers[uKey];
                // Solo listamos como pendientes a los gestores aprobados
                if (u.approved === true && (u.role === 'Gestor' || u.role === undefined)) {
                    const uName = (u.name || '').trim().toLowerCase();
                    // Verificar que el UID no haya leído Y que el nombre no esté en la lista de los que ya leyeron (evita duplicados de cuentas)
                    if (!readers[uKey] && !readNames.has(uName)) {
                        unreadCount++;
                        unreadList.innerHTML += `<li style="margin-bottom: 8px; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">
                            <div style="font-weight: 500; color: var(--danger); font-size: 13px;"><i class='bx bx-x'></i> ${escapeHTML(u.name || 'Sin nombre')}</div>
                        </li>`;
                        // Añadimos el nombre al set para evitar imprimir al mismo usuario varias veces si tiene múltiples cuentas viejas
                        if (uName) readNames.add(uName);
                    }
                }
            });
            
            if (unreadCount === 0) {
                unreadList.innerHTML = '<li style="color: var(--success); margin-bottom: 5px; text-align: center; font-weight: 500;"><i class="bx bx-check-double"></i> ¡Todos han leído!</li>';
            }
        }
    } catch(e) {
        console.error(e);
        unreadList.innerHTML = '<li style="color: var(--danger);">Error al cargar usuarios.</li>';
    }
}

let pendingDeleteComunicadoId = null;

function deleteComunicado(id) {
    pendingDeleteComunicadoId = id;
    document.getElementById('confirmDeleteModal').classList.add('active');
}

document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
    if (!pendingDeleteComunicadoId) return;
    
    const btn = document.getElementById('confirmDeleteBtn');
    const prevText = btn.innerHTML;
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Eliminando...";
    btn.disabled = true;
    
    try {
        await database.ref('announcements/' + pendingDeleteComunicadoId).remove();
        closeModal('confirmDeleteModal');
    } catch(e) {
        console.error(e);
        alert("No se pudo eliminar.");
    } finally {
        btn.innerHTML = prevText;
        btn.disabled = false;
        pendingDeleteComunicadoId = null;
    }
});

// ==========================================
// CONTROL OPERATIVO Y EFICIENCIA EN RETIROS
// ==========================================
let controlOperativoCharts = {};

function destroyChart(id) {
    if (controlOperativoCharts[id]) {
        controlOperativoCharts[id].destroy();
        delete controlOperativoCharts[id];
    }
}

window.controlOperativoRawData = null;

function toggleOperativoCustomDates() {
    const val = document.getElementById('filtroFechaOperativo').value;
    const container = document.getElementById('operativoCustomDateContainer');
    if (val === 'custom') {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

// ==========================================
// Función para Generar Análisis Textual IA
// ==========================================
function generarAnalisisTextual() {
    if (!window.controlOperativoRawData) {
        alert("Aún no se han cargado los datos. Por favor, espera un momento o haz clic en Actualizar Datos.");
        return;
    }
    
    const excludedGestores = ['Sara Santamaría Foronda', 'Maria Sanchez', 'Sara', 'Maria', 'Camilo Espinosa', 'Camilo'];
    const selectedGestoresPDF = getSelectedMultiSelectValues('operativoGestorMultiSelect');
    const filtroGestor = selectedGestoresPDF.length === 1 ? selectedGestoresPDF[0] : (selectedGestoresPDF.length === 0 ? 'Todos' : 'Varios');
    
    // Calcular fechas del filtro actual (reutilizando la lógica existente o leyendo las fechas)
    const filtroFecha = document.getElementById('filtroFechaOperativo').value;
    const isCustom = filtroFecha === 'custom';
    const dateStart = isCustom ? document.getElementById('operativoDateStart').value : null;
    const dateEnd = isCustom ? document.getElementById('operativoDateEnd').value : null;

    let totalProcesados = 0;
    let totalAprobados = 0;
    let totalRechazados = 0;
    let gestoresStats = {};
    let excludedCount = 0;

    // First pass: aggregate data
    for (const gestor in window.controlOperativoRawData) {
        if (selectedGestoresPDF.length > 0 && !selectedGestoresPDF.includes(gestor)) continue;
        
        // Exclude specific users if we are looking at "Todos"
        if (selectedGestoresPDF.length === 0 && excludedGestores.some(ex => gestor.includes(ex))) {
            excludedCount++;
            continue;
        }

        let gProcesados = 0;
        let gAprobados = 0;
        let gRechazados = 0;
        let gARTTotal = 0;
        let gARTCount = 0;

        for (const date in window.controlOperativoRawData[gestor]) {
            // Apply date filter logic (simplified for the analysis generator)
            let includeDate = true;
            const itemDate = new Date(date + 'T00:00:00');
            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (filtroFecha === 'today') {
                if (itemDate.getTime() !== today.getTime()) includeDate = false;
            } else if (filtroFecha === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                if (itemDate.getTime() !== yesterday.getTime()) includeDate = false;
            } else if (filtroFecha === '7') {
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                if (itemDate < sevenDaysAgo) includeDate = false;
            } else if (filtroFecha === '30') {
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                if (itemDate < thirtyDaysAgo) includeDate = false;
            } else if (filtroFecha === 'thisMonth') {
                if (itemDate.getMonth() !== today.getMonth() || itemDate.getFullYear() !== today.getFullYear()) includeDate = false;
            } else if (filtroFecha === 'lastMonth') {
                const lastMonth = new Date(today);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                if (itemDate.getMonth() !== lastMonth.getMonth() || itemDate.getFullYear() !== lastMonth.getFullYear()) includeDate = false;
            } else if (isCustom && dateStart && dateEnd) {
                const startObj = new Date(dateStart + 'T00:00:00');
                const endObj = new Date(dateEnd + 'T23:59:59');
                if (itemDate < startObj || itemDate > endObj) includeDate = false;
            }

            if (!includeDate) continue;

            const dayData = window.controlOperativoRawData[gestor][date];
            gProcesados += dayData.Retiros_Procesados || 0;
            gAprobados += dayData.Retiros_Aprobados || 0;
            gRechazados += dayData.Retiros_Rechazados || 0;
            if (dayData.ART_Desde_Creacion_Minutos > 0) {
                gARTTotal += dayData.ART_Desde_Creacion_Minutos;
                gARTCount++;
            }
        }

        if (gProcesados > 0) {
            totalProcesados += gProcesados;
            totalAprobados += gAprobados;
            totalRechazados += gRechazados;
            gestoresStats[gestor] = {
                procesados: gProcesados,
                aprobados: gAprobados,
                rechazados: gRechazados,
                artPromedio: gARTCount > 0 ? (gARTTotal / gARTCount) : 0
            };
        }
    }

    let html = ``;
    
    if (Object.keys(gestoresStats).length === 0) {
        html = `<p>No hay suficientes datos procesados para el periodo o gestor seleccionado para generar un análisis.</p>`;
    } else if (filtroGestor !== 'Todos') {
        const stats = gestoresStats[filtroGestor];
        const tasaAprobacion = stats.procesados > 0 ? ((stats.aprobados / stats.procesados) * 100).toFixed(1) : 0;
        const tasaRechazo = stats.procesados > 0 ? ((stats.rechazados / stats.procesados) * 100).toFixed(1) : 0;

        html += `<h3 style="color: var(--accent-primary); border-bottom: 2px solid var(--accent-primary); padding-bottom: 5px; margin-bottom: 15px;">Reporte Individual: ${filtroGestor}</h3>`;
        html += `<p>Resumen de rendimiento operativo para el periodo seleccionado. A continuación se presentan las métricas clave evaluadas:</p>`;
        
        html += `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <thead>
                <tr style="background-color: var(--accent-primary); color: white;">
                    <th style="padding: 10px; border: 1px solid #ddd;">Métrica</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Valor Alcanzado</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Retiros Procesados</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; font-size: 16px;">${stats.procesados}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Retiros Aprobados</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: var(--success);">${stats.aprobados} (${tasaAprobacion}%)</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Retiros Rechazados</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: var(--danger);">${stats.rechazados} (${tasaRechazo}%)</td>
                </tr>
                <tr style="background-color: #f9f9f9;">
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Tiempo Promedio de Resolución (ART)</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold; font-size: 16px;">${stats.artPromedio.toFixed(2)} min</td>
                </tr>
            </tbody>
        </table>`;

        if (stats.artPromedio > 1200) {
            html += `<div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 15px; margin-top: 15px;">
                <strong>⚠️ Área de Oportunidad:</strong> El tiempo de resolución es significativamente alto (más de 20 horas). Se sugiere revisar si hay bloqueos o si los casos asignados son de alta complejidad.
            </div>`;
        } else if (stats.artPromedio < 900) {
            html += `<div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--success); padding: 15px; margin-top: 15px;">
                <strong>🏆 Excelente Velocidad:</strong> El gestor mantiene tiempos de respuesta altamente competitivos, por debajo del estándar de 15 horas.
            </div>`;
        } else {
            html += `<div style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid var(--accent-primary); padding: 15px; margin-top: 15px;">
                <strong>📊 Rendimiento Estable:</strong> El gestor mantiene tiempos de respuesta dentro de los promedios esperados de la operación.
            </div>`;
        }
    } else {
        html += `<h3 style="color: var(--accent-primary);">Resumen Ejecutivo del Equipo</h3>`;
        html += `<p>El equipo procesó un volumen total de <strong>${totalProcesados} solicitudes</strong> en el periodo evaluado. La tasa global de aprobación es altísima (${((totalAprobados/totalProcesados)*100).toFixed(1)}%), sugiriendo flujos estables y predecibles.</p>`;
        
        const sortedByVol = Object.entries(gestoresStats).sort((a,b) => b[1].procesados - a[1].procesados);
        const sortedByART = Object.entries(gestoresStats).filter(a => a[1].artPromedio > 0).sort((a,b) => a[1].artPromedio - b[1].artPromedio);
        
        if (sortedByVol.length > 0) {
            html += `<h4>🏆 Liderazgo en Volumen</h4>`;
            html += `<p>El gestor con mayor carga operativa es <strong>${escapeHTML(sortedByVol[0][0])}</strong> con ${sortedByVol[0][1].procesados} procesados.`;
            if (sortedByVol.length > 1) {
                html += ` Le sigue <strong>${escapeHTML(sortedByVol[1][0])}</strong> con ${sortedByVol[1][1].procesados}.</p>`;
            } else {
                html += `</p>`;
            }
        }

        if (sortedByART.length > 0) {
            html += `<h4>⚡ Rendimiento en Velocidad (ART)</h4>`;
            html += `<p>El gestor más ágil en resolución es <strong>${escapeHTML(sortedByART[0][0])}</strong> con un tiempo promedio de <strong>${sortedByART[0][1].artPromedio.toFixed(2)} minutos</strong>.`;
            if (sortedByART.length > 1) {
                html += ` En segundo lugar destaca <strong>${escapeHTML(sortedByART[1][0])}</strong> con ${sortedByART[1][1].artPromedio.toFixed(2)} mins.</p>`;
            } else {
                html += `</p>`;
            }

            const slowest = sortedByART[sortedByART.length - 1];
            if (slowest[1].artPromedio > 1200) {
                html += `<div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 15px; margin-top: 15px;">
                    <strong>⚠️ Cuello de Botella Detectado:</strong> <strong>${escapeHTML(slowest[0])}</strong> registra un tiempo promedio elevado (${slowest[1].artPromedio.toFixed(2)} min). Se recomienda una intervención para revisar bloqueos operativos o desbalance de cargas.
                </div>`;
            }
        }
    }

    document.getElementById('analysisModalBody').innerHTML = html;
    document.getElementById('analysisModal').classList.add('active');
}

// ==========================================
// Función para Generar Informe Ejecutivo en PDF
// ==========================================
function generarReporteEjecutivoPDF() {
    const selectedGestoresPDF = getSelectedMultiSelectValues('operativoGestorMultiSelect');
    const gestorText = selectedGestoresPDF.length > 0 ? selectedGestoresPDF.join(', ') : 'Todos los gestores';
    
    const periodoSelect = document.getElementById('filtroFechaOperativo');
    let periodoText = periodoSelect.options[periodoSelect.selectedIndex].text;
    
    if (periodoSelect.value === 'custom') {
        const start = document.getElementById('operativoDateStart').value;
        const end = document.getElementById('operativoDateEnd').value;
        periodoText = `Personalizado (${start || 'Inicio'} a ${end || 'Fin'})`;
    }

    const now = new Date();
    document.getElementById('printReportMeta').innerText = `Fecha de generación: ${now.toLocaleString()} | Gestor(es): ${gestorText} | Periodo: ${periodoText}`;

    // 2. Copiar el análisis de IA
    const analisisHtml = document.getElementById('analysisModalBody').innerHTML;
    document.getElementById('printAnalysisText').innerHTML = analisisHtml;

    // 3. Capturar gráficas como imágenes
    const chartExcelencia = controlOperativoCharts['chartTardanzasMejores'];
    const chartPeores = controlOperativoCharts['chartTardanzasPeores'];
    const chartAprobaciones = controlOperativoCharts['chartAprobacionesDia'];
    const chartInactividad = controlOperativoCharts['chartInactividad'];
    const chartEficiencia = controlOperativoCharts['chartEficiencia'];

    const imgChart1 = document.getElementById('printChart1'); // Excelencia
    const imgChart2 = document.getElementById('printChart2'); // Aprobaciones
    const imgChart3 = document.getElementById('printChart3'); // Inactividad
    const imgChart4 = document.getElementById('printChart4'); // Eficiencia
    const imgChart5 = document.getElementById('printChart5'); // Peores

    // Función auxiliar para imprimir chart
    const renderPrintChart = (chartObj, imgEl, titleText) => {
        if (chartObj && imgEl) {
            try {
                imgEl.src = chartObj.toBase64Image();
                imgEl.style.display = 'block';
                if (imgEl.previousElementSibling) {
                    imgEl.previousElementSibling.innerText = titleText;
                    imgEl.previousElementSibling.style.display = 'block';
                }
                imgEl.parentElement.style.display = 'block';
            } catch (e) {
                console.error("Error capturando chart:", titleText, e);
            }
        } else if (imgEl) {
            imgEl.style.display = 'none';
            if (imgEl.previousElementSibling) imgEl.previousElementSibling.style.display = 'none';
            imgEl.parentElement.style.display = 'none';
        }
    };

    renderPrintChart(chartPeores, imgChart5, "Top Alerta Tardanzas (Peores)");
    renderPrintChart(chartExcelencia, imgChart1, "Top Excelencia Puntualidad (Mejores)");
    renderPrintChart(chartAprobaciones, imgChart2, "Evolución Diaria de Retiros");
    renderPrintChart(chartInactividad, imgChart3, "Promedio Inactividad Diaria (Min)");
    renderPrintChart(chartEficiencia, imgChart4, "Eficiencia y Volumen de Retiros");

    // 3.5. Tabla de Resumen
    const printTableContainer = document.getElementById('printTableContainer');
    if (printTableContainer) {
        const tableDiv = document.getElementById('tablaResumenOperativo').parentElement;
        printTableContainer.innerHTML = `<h3 style="color: #000; text-align: center; margin-bottom: 10px; font-size: 14pt; font-weight: bold; page-break-after: avoid;">Resumen de Retiros por Gestor</h3>` + tableDiv.outerHTML;
        printTableContainer.style.display = 'block';
    }

    // 4. Llamar a imprimir
    setTimeout(() => {
        window.print();
    }, 800);
}



async function loadControlOperativoData() {
    try {
        const response = await fetch('kpi_operativos_v2.json?' + new Date().getTime());
        if (!response.ok) throw new Error("No se pudo cargar kpi_operativos_v2.json");
        const data = await response.json();
        window.controlOperativoRawData = data;
        
        // Merge Inactividad from Firebase shift_reports
        try {
            if (database) {
                // Ensure kpiUsersData is populated
                if (!window.kpiUsersData || Object.keys(window.kpiUsersData).length === 0) {
                    const usersSnap = await database.ref('users').once('value');
                    if (usersSnap.exists()) {
                        window.kpiUsersData = {};
                        Object.values(usersSnap.val()).forEach(u => {
                            if (u && u.email && u.name) {
                                window.kpiUsersData[u.email.toLowerCase()] = u.name.trim();
                            }
                        });
                    }
                }
                
                const snapshot = await database.ref('shift_reports').once('value');
                if (snapshot.exists()) {
                    const shifts = snapshot.val();
                    Object.values(shifts).forEach(report => {
                        if (report.rol !== 'Gestor') return;
                        const gestorName = report.gestor;
                        if (!gestorName) return;
                        
                        const reportDate = report.timestamp ? new Date(report.timestamp) : new Date();
                        const reportDateStr = reportDate.toISOString().split('T')[0];
                        
                        // Encontrar el nombre real en controlOperativoRawData ignorando mayúsculas y acentos
                        const rawKeys = Object.keys(window.controlOperativoRawData);
                        const searchName = gestorName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        let realGestor = rawKeys.find(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === searchName);
                        
                        // Fallback: Si no coincide exacto, buscar si contiene al menos el primer nombre y apellido
                        if (!realGestor) {
                            const parts = searchName.split(' ');
                            if (parts.length >= 2) {
                                realGestor = rawKeys.find(k => {
                                    const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                    return normK.includes(parts[0]) && normK.includes(parts[1]);
                                });
                            }
                        }
                        
                        if (!realGestor) {
                            realGestor = gestorName;
                            window.controlOperativoRawData[realGestor] = {};
                        }

                        if (realGestor) {
                            // Ensure date object exists
                            if (!window.controlOperativoRawData[realGestor][reportDateStr]) {
                                window.controlOperativoRawData[realGestor][reportDateStr] = {
                                    Dias_Laborados: 0,
                                    Minutos_Inactividad_Total: 0,
                                    Retiros_Procesados: 0,
                                    Retiros_Aprobados: 0,
                                    Retiros_Rechazados: 0,
                                    ART_Desde_Creacion_Minutos: 0
                                };
                            }
                            
                            // Calculate inactivity for this report using timeline directly to enforce 10-hour max shift
                            let inactMins = 0;
                            let shiftLoginDate = report.loginTime ? new Date(report.loginTime) : (report.timestamp ? new Date(report.timestamp) : null);
                            const maxEndTime = shiftLoginDate ? shiftLoginDate.getTime() + (10 * 60 * 60 * 1000) : Date.now() + 99999999;
                            
                            if (report.timeline && report.timeline.length > 0) {
                                const now = Date.now();
                                report.timeline.forEach(ev => {
                                    if (ev.type === 'Inactividad') {
                                        if (shiftLoginDate && ev.start > maxEndTime) return; // Skip if after 10h
                                        let eTime = ev.end ? ev.end : now;
                                        if (shiftLoginDate && eTime > maxEndTime) eTime = maxEndTime; // Cap if overlaps 10h limit
                                        let mins = (eTime - ev.start) / (1000 * 60);
                                        if (mins > 0) inactMins += mins;
                                    }
                                });
                            } else if (report.inactividadTotalMins !== undefined) {
                                inactMins = report.inactividadTotalMins; // Fallback only if no timeline
                            }
                            
                            // Calculate tardanza
                            // Calculate tardanza
                            let tardMins = 0;
                            let isFueraDeHorario = false;
                            let loginDate = report.loginTime ? new Date(report.loginTime) : null;
                            if (report.tardanzaMins !== undefined) {
                                tardMins = report.tardanzaMins;
                            } else {
                                if (!loginDate && report.horaInicio) {
                                    try {
                                        let parts = report.horaInicio.split(',');
                                        if (parts.length > 0) {
                                            let dParts = parts[0].trim().split('/');
                                            if (dParts.length === 3) {
                                                let day = parseInt(dParts[0]);
                                                let month = parseInt(dParts[1]);
                                                let year = parseInt(dParts[2]);
                                                if (month > 12) { let t = day; day = month; month = t; }
                                                let tStr = parts.length > 1 ? parts[1].trim().replace(/\./g, '').replace(/a\s*m/i, 'AM').replace(/p\s*m/i, 'PM') : "00:00:00";
                                                loginDate = new Date(`${month}/${day}/${year} ${tStr}`);
                                            } else {
                                                loginDate = new Date(report.horaInicio);
                                            }
                                        }
                                    } catch(e) {}
                                }
                                
                                if (loginDate && !isNaN(loginDate.getTime()) && report.turnoProgramado) {
                                    const shiftStr = report.turnoProgramado.toLowerCase().trim();
                                    const match = shiftStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
                                    if (match) {
                                        let hour = parseInt(match[1], 10);
                                        let minute = match[2] ? parseInt(match[2], 10) : 0;
                                        const ampm = match[3].toLowerCase();
                                        
                                        if (ampm === 'pm' && hour < 12) hour += 12;
                                        if (ampm === 'am' && hour === 12) hour = 0;
                                        
                                        const expected = new Date(loginDate);
                                        expected.setHours(hour, minute, 0, 0);
                                        
                                        let diffMinutes = (loginDate - expected) / 60000;
                                        
                                        if (diffMinutes < -12 * 60) {
                                            expected.setDate(expected.getDate() - 1);
                                            diffMinutes = (loginDate - expected) / 60000;
                                        } else if (diffMinutes > 12 * 60) {
                                            expected.setDate(expected.getDate() + 1);
                                            diffMinutes = (loginDate - expected) / 60000;
                                        }
                                        
                                        if (diffMinutes > 240) {
                                            isFueraDeHorario = true;
                                        }
                                        
                                        if (diffMinutes > 5 && !isFueraDeHorario) {
                                            tardMins = Math.round(diffMinutes);
                                        }
                                    }
                                }
                            }
                            
                            // Add to raw data
                            if (!isFueraDeHorario) {
                                // Cap inactivity to max 8 hours (480 mins) per shift to prevent infinite sessions from exploding stats
                                let cappedInactMins = Math.min(inactMins, 480);
                                window.controlOperativoRawData[realGestor][reportDateStr].Minutos_Inactividad_Total = (window.controlOperativoRawData[realGestor][reportDateStr].Minutos_Inactividad_Total || 0) + cappedInactMins;
                            }
                            
                            // Guardar la tardanza considerando el primer ingreso del día (o si reporta tardanza mayor a 0)
                            const currentStoredTard = window.controlOperativoRawData[realGestor][reportDateStr].Minutos_Tarde_Total;
                            if (currentStoredTard === undefined || (tardMins > 0 && currentStoredTard === 0)) {
                                window.controlOperativoRawData[realGestor][reportDateStr].Minutos_Tarde_Total = tardMins;
                                window.controlOperativoRawData[realGestor][reportDateStr].Dias_Tarde = tardMins > 0 ? 1 : 0;
                                if (loginDate) window.controlOperativoRawData[realGestor][reportDateStr]._earliestLogin = loginDate;
                            } else if (loginDate && window.controlOperativoRawData[realGestor][reportDateStr]._earliestLogin && loginDate < window.controlOperativoRawData[realGestor][reportDateStr]._earliestLogin) {
                                window.controlOperativoRawData[realGestor][reportDateStr].Minutos_Tarde_Total = tardMins;
                                window.controlOperativoRawData[realGestor][reportDateStr].Dias_Tarde = tardMins > 0 ? 1 : 0;
                                window.controlOperativoRawData[realGestor][reportDateStr]._earliestLogin = loginDate;
                            }
                            
                            window.controlOperativoRawData[realGestor][reportDateStr].Dias_Laborados = 1; // Un turno reportado = 1 día laborado
                        }
                    });
                }
            }
        } catch (fbErr) {
            console.error("Error fetching shift_reports for inactivity:", fbErr);
        }
        
        // Populate dropdowns
        const gestores = Object.keys(window.controlOperativoRawData).sort();
        setupCustomMultiSelect('operativoGestorMultiSelect', gestores, () => {
            renderControlOperativoFiltered();
        });
        
        renderControlOperativoFiltered();
    } catch (error) {
        console.error("Error loading Control Operativo:", error);
        alert("Error cargando datos operativos. Detalle: " + error.message);
    }
}

function renderControlOperativoFiltered() {
    if (!window.controlOperativoRawData) return;
    
    const selectedGestores = getSelectedMultiSelectValues('operativoGestorMultiSelect');
    const selectedFecha = document.getElementById('filtroFechaOperativo').value;
    
    const getLocalYYYYMMDD = (d) => {
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
    };
    
    const todayStr = getLocalYYYYMMDD(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalYYYYMMDD(yesterday);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = getLocalYYYYMMDD(sevenDaysAgo);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = getLocalYYYYMMDD(thirtyDaysAgo);
    
    const thisMonth = todayStr.substring(0, 7);
    
    const nowD = new Date();
    const lastMonthDate = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
    const lastMonth = getLocalYYYYMMDD(lastMonthDate).substring(0, 7);

    const customStart = document.getElementById('operativoDateStart')?.value;
    const customEnd = document.getElementById('operativoDateEnd')?.value;
    
    // Aggregation logic
    let aggregatedData = {};
    let aggregatedDataGlobal = {};
    let dailyData = {};
    
    const checkGestorMatch = (mstrGestor) => {
        if (selectedGestores.length === 0) return true;
        if (selectedGestores.includes(mstrGestor)) return true;
        const normMstr = mstrGestor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return selectedGestores.some(sel => {
            const parts = sel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ');
            return parts.every(p => normMstr.includes(p));
        });
    };
    
    for (const gestor in window.controlOperativoRawData) {
        
        aggregatedDataGlobal[gestor] = {
            Retiros_Aprobados: 0,
            Retiros_Rechazados: 0,
            Tiempo_Total_Desde_Creacion_Segundos: 0,
            Dias_Tarde: 0,
            Minutos_Tarde_Total: 0,
            Minutos_Inactividad_Total: 0,
            Dias_Laborados: 0
        };

        if (checkGestorMatch(gestor)) {
            aggregatedData[gestor] = {
                Retiros_Aprobados: 0,
                Retiros_Rechazados: 0,
                Tiempo_Total_Desde_Creacion_Segundos: 0,
                Dias_Tarde: 0,
                Minutos_Tarde_Total: 0,
                Minutos_Inactividad_Total: 0,
                Dias_Laborados: 0
            };
        }
        
        for (const fecha in window.controlOperativoRawData[gestor]) {
            let inRange = false;
            if (selectedFecha === 'Todas') {
                inRange = true;
            } else if (selectedFecha === 'today' && fecha === todayStr) {
                inRange = true;
            } else if (selectedFecha === 'yesterday' && fecha === yesterdayStr) {
                inRange = true;
            } else if (selectedFecha === '7' && fecha >= sevenDaysAgoStr && fecha <= todayStr) {
                inRange = true;
            } else if (selectedFecha === '30' && fecha >= thirtyDaysAgoStr && fecha <= todayStr) {
                inRange = true;
            } else if (selectedFecha === 'thisMonth' && fecha.substring(0, 7) === thisMonth) {
                inRange = true;
            } else if (selectedFecha === 'lastMonth' && fecha.substring(0, 7) === lastMonth) {
                inRange = true;
            } else if (selectedFecha === 'custom' && customStart && customEnd && fecha >= customStart && fecha <= customEnd) {
                inRange = true;
            }
            
            if (inRange) {
                const d = window.controlOperativoRawData[gestor][fecha];
                
                // Add to Global Data
                aggregatedDataGlobal[gestor].Retiros_Aprobados += d.Retiros_Aprobados || 0;
                aggregatedDataGlobal[gestor].Retiros_Rechazados += d.Retiros_Rechazados || 0;
                aggregatedDataGlobal[gestor].Tiempo_Total_Desde_Creacion_Segundos += d.Tiempo_Total_Desde_Creacion_Segundos || 0;
                aggregatedDataGlobal[gestor].Dias_Tarde += d.Dias_Tarde || 0;
                aggregatedDataGlobal[gestor].Minutos_Tarde_Total += d.Minutos_Tarde_Total || 0;
                aggregatedDataGlobal[gestor].Minutos_Inactividad_Total += d.Minutos_Inactividad_Total || 0;
                aggregatedDataGlobal[gestor].Dias_Laborados += d.Dias_Laborados || 0;

                // Add to Filtered Data (only if this gestor is selected)
                if (checkGestorMatch(gestor)) {
                    if (!dailyData[fecha]) {
                        dailyData[fecha] = { Aprobados: 0, Rechazados: 0 };
                    }
                    dailyData[fecha].Aprobados += d.Retiros_Aprobados || 0;
                    dailyData[fecha].Rechazados += d.Retiros_Rechazados || 0;
                    
                    aggregatedData[gestor].Retiros_Aprobados += d.Retiros_Aprobados || 0;
                    aggregatedData[gestor].Retiros_Rechazados += d.Retiros_Rechazados || 0;
                    aggregatedData[gestor].Tiempo_Total_Desde_Creacion_Segundos += d.Tiempo_Total_Desde_Creacion_Segundos || 0;
                    aggregatedData[gestor].Dias_Tarde += d.Dias_Tarde || 0;
                    aggregatedData[gestor].Minutos_Tarde_Total += d.Minutos_Tarde_Total || 0;
                    aggregatedData[gestor].Minutos_Inactividad_Total += d.Minutos_Inactividad_Total || 0;
                    aggregatedData[gestor].Dias_Laborados += d.Dias_Laborados || 0;
                }
            }
        }
    }
    
    // Calculate final metrics per gestor
    for (const gestor in aggregatedData) {
        const d = aggregatedData[gestor];
        const dl = d.Dias_Laborados > 0 ? d.Dias_Laborados : 1;
        
        d.Prom_Minutos_Tarde = Math.round((d.Minutos_Tarde_Total / dl) * 100) / 100;
        d.Prom_Inactividad_Diaria = Math.round((d.Minutos_Inactividad_Total / dl) * 100) / 100;
        d.Retiros_Procesados = d.Retiros_Aprobados + d.Retiros_Rechazados;
        d.ART_Desde_Creacion_Minutos = d.Retiros_Procesados > 0 ? Math.round((d.Tiempo_Total_Desde_Creacion_Segundos / d.Retiros_Procesados) / 60 * 100) / 100 : 0;
        d.Porcentaje_Rechazos = d.Retiros_Procesados > 0 ? Math.round((d.Retiros_Rechazados / d.Retiros_Procesados) * 100 * 100) / 100 : 0;
        d.Tasa_Aprobacion_Dia = Math.round((d.Retiros_Aprobados / dl) * 100) / 100;
    }

    // Calculate final metrics per gestor GLOBAL
    for (const gestor in aggregatedDataGlobal) {
        const d = aggregatedDataGlobal[gestor];
        const dl = d.Dias_Laborados > 0 ? d.Dias_Laborados : 1;
        
        d.Prom_Minutos_Tarde = Math.round((d.Minutos_Tarde_Total / dl) * 100) / 100;
        d.Prom_Inactividad_Diaria = Math.round((d.Minutos_Inactividad_Total / dl) * 100) / 100;
        d.Retiros_Procesados = d.Retiros_Aprobados + d.Retiros_Rechazados;
        d.ART_Desde_Creacion_Minutos = d.Retiros_Procesados > 0 ? Math.round((d.Tiempo_Total_Desde_Creacion_Segundos / d.Retiros_Procesados) / 60 * 100) / 100 : 0;
        d.Porcentaje_Rechazos = d.Retiros_Procesados > 0 ? Math.round((d.Retiros_Rechazados / d.Retiros_Procesados) * 100 * 100) / 100 : 0;
        d.Tasa_Aprobacion_Dia = Math.round((d.Retiros_Aprobados / dl) * 100) / 100;
    }
    
    // Render table
    const tbody = document.querySelector('#tablaResumenOperativo tbody');
    tbody.innerHTML = '';
    
    let globalProcesados = 0;
    let globalAprobados = 0;
    let globalRechazados = 0;
    let globalARTTotal = 0;
    let gestoresContados = 0;

    const gestoresArray = Object.keys(aggregatedData).map(gestor => ({ gestor, ...aggregatedData[gestor] }));
    gestoresArray.sort((a, b) => b.Retiros_Aprobados - a.Retiros_Aprobados);

    for (const d of gestoresArray) {
        const gestor = d.gestor;
        if (d.Retiros_Procesados === 0 && d.Dias_Laborados === 0) continue; // Skip empty rows if filtered out
        
        globalProcesados += d.Retiros_Procesados;
        globalAprobados += d.Retiros_Aprobados;
        globalRechazados += d.Retiros_Rechazados;
        globalARTTotal += d.ART_Desde_Creacion_Minutos;
        if (d.Retiros_Procesados > 0) gestoresContados++;
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
        tr.style.transition = 'background 0.2s ease, transform 0.1s ease';
        tr.style.cursor = 'pointer';
        tr.title = 'Haz clic para filtrar o quitar filtro de este gestor';
        tr.onmouseover = () => tr.style.background = 'var(--bg-secondary, #f8f9fa)';
        tr.onmouseout = () => tr.style.background = 'transparent';
        
        tr.onclick = () => {
            const selectId = 'operativoGestorMultiSelect';
            const currentSelected = getSelectedMultiSelectValues(selectId);
            
            // Si el gestor ya está seleccionado de manera única, lo deseleccionamos (Filtro Todos)
            if (currentSelected.length === 1 && currentSelected[0] === gestor) {
                setCustomMultiSelectValues(selectId, []);
            } else {
                // De lo contrario, seleccionamos solo este gestor
                setCustomMultiSelectValues(selectId, [gestor]);
            }
            
            if (typeof renderControlOperativoFiltered === 'function') {
                renderControlOperativoFiltered();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        
        const badgeAprobados = `<span style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 4px 10px; border-radius: 20px; font-weight: 700;">${d.Retiros_Aprobados}</span>`;
        const badgeRechazados = `<span style="background: rgba(239, 68, 68, 0.15); color: var(--danger); padding: 4px 10px; border-radius: 20px; font-weight: 700;">${d.Retiros_Rechazados}</span>`;
        
        tr.innerHTML = `
            <td style="padding: 16px 20px; font-weight: 600; color: var(--text-primary);">${escapeHTML(gestor)}</td>
            <td style="padding: 16px 20px;">${badgeAprobados}</td>
            <td style="padding: 16px 20px;">${badgeRechazados}</td>
            <td style="padding: 16px 20px; font-weight: 600; color: var(--text-secondary);">${d.Retiros_Procesados}</td>
            <td style="padding: 16px 20px; font-weight: 600; color: var(--text-secondary);">${d.Porcentaje_Rechazos}%</td>
            <td style="padding: 16px 20px; font-weight: 600; color: var(--text-secondary);">${d.Tasa_Aprobacion_Dia}</td>
        `;
        tbody.appendChild(tr);
    }
    
    // Update summary widgets
    const avgArt = gestoresContados > 0 ? (globalARTTotal / gestoresContados).toFixed(1) : 0;
    const wTotal = document.getElementById('operativoWidgetTotal');
    const wAprob = document.getElementById('operativoWidgetAprobados');
    const wRech = document.getElementById('operativoWidgetRechazados');
    const wArt = document.getElementById('operativoWidgetART');
    
    if(wTotal) wTotal.textContent = globalProcesados;
    if(wAprob) wAprob.textContent = globalAprobados;
    if(wRech) wRech.textContent = globalRechazados;
    if(wArt) wArt.innerHTML = `${escapeHTML(String(avgArt))}<span style="font-size: 16px; font-weight: 600; margin-left: 4px;">min</span>`;
    
    // Render charts
    // Filter out empty gestores for global charts
    const globalForCharts = {};
    const excludedGestoresGlobal = ['Sara Santamaría', 'Maria Sanchez', 'Camilo Espinosa'];
    for (const gestor in aggregatedDataGlobal) {
        if (excludedGestoresGlobal.some(ex => gestor.includes(ex) || gestor.includes('Sara Santamar'))) continue;
        if (aggregatedDataGlobal[gestor].Retiros_Procesados > 0 || aggregatedDataGlobal[gestor].Dias_Laborados > 0) {
            globalForCharts[gestor] = aggregatedDataGlobal[gestor];
        }
    }
    
    // We pass globalForCharts to the charts so rankings always compare the whole team.
    // However, we pass dailyData which is specific to the selected gestor so the line chart is filtered.
    const selectedGestor = selectedGestores.length === 1 ? selectedGestores[0] : (selectedGestores.length === 0 ? 'Todos' : `${selectedGestores.length} Gestores`);
    renderControlOperativoCharts(globalForCharts, dailyData, selectedGestor);
    
    // Auto-refresh KPI rings every time filters change
    calcularIndicadores();
}

function renderControlOperativoCharts(data, dailyData, selectedGestor) {
    const isGlobal = (selectedGestor === 'Todos' || selectedGestor.includes('Gestores'));
    
    // UI titles update
    const elTitlePeores = document.getElementById('titleTardanzasPeores');
    const elTitleMejores = document.getElementById('titleTardanzasMejores');
    const elTitleInactividad = document.getElementById('titleInactividad');
    const elTitleEficiencia = document.getElementById('titleEficiencia');
    const elTitleMatriz = document.getElementById('titleMatrizFuga');

    if (isGlobal) {
        if (elTitlePeores) elTitlePeores.innerHTML = `<i class='bx bx-alarm-exclamation'></i> Top Alerta Tardanzas (Peores 5)`;
        if (elTitleMejores) elTitleMejores.innerHTML = `<i class='bx bx-medal'></i> Top Excelencia Puntualidad (Mejores 5)`;
        if (elTitleInactividad) elTitleInactividad.innerHTML = `<i class='bx bx-coffee-togo'></i> Promedio Inactividad Diaria (Min)`;
        if (elTitleEficiencia) elTitleEficiencia.innerHTML = `<i class='bx bx-layer'></i> Eficiencia y Volumen de Retiros`;
        if (elTitleMatriz) elTitleMatriz.innerHTML = `<i class='bx bx-bar-chart-alt-2'></i> Ranking de Porcentaje de Rechazos`;
    } else {
        if (elTitlePeores) elTitlePeores.innerHTML = `<i class='bx bx-alarm-exclamation'></i> Fechas con Llegada Tarde - ${escapeHTML(selectedGestor)}`;
        if (elTitleMejores) elTitleMejores.innerHTML = `<i class='bx bx-check-double'></i> Fechas de Conexión a Tiempo - ${escapeHTML(selectedGestor)}`;
        if (elTitleInactividad) elTitleInactividad.innerHTML = `<i class='bx bx-coffee-togo'></i> Inactividad Diaria por Fecha - ${escapeHTML(selectedGestor)}`;
        if (elTitleEficiencia) elTitleEficiencia.innerHTML = `<i class='bx bx-layer'></i> Evolución Diaria de Retiros - ${escapeHTML(selectedGestor)}`;
        if (elTitleMatriz) elTitleMatriz.innerHTML = `<i class='bx bx-target-lock'></i> % Rechazos: ${escapeHTML(selectedGestor)}`;
    }

    let activeData = {};
    const selectedGestoresList = getSelectedMultiSelectValues('operativoGestorMultiSelect');
    if (isGlobal || selectedGestoresList.length === 0) {
        activeData = data;
    } else {
        const rawKeys = Object.keys(data);
        selectedGestoresList.forEach(g => {
            let realGestor = rawKeys.find(k => k === g);
            if (!realGestor) {
                const parts = g.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ');
                realGestor = rawKeys.find(k => {
                    const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return parts.every(p => normK.includes(p));
                });
            }
            if (realGestor && data[realGestor]) {
                activeData[realGestor] = data[realGestor];
            } else if (data[g]) {
                activeData[g] = data[g];
            }
        });
    }
    
    const gestores = Object.keys(activeData);
    const sortedDates = Object.keys(dailyData).sort();
    const sortBy = (key, asc=false) => [...gestores].sort((a,b) => asc ? activeData[a][key] - activeData[b][key] : activeData[b][key] - activeData[a][key]);

    if (isGlobal) {
        // 1. Top Alerta Tardanzas (Peores 5)
        let peoresTardanzas = sortBy('Prom_Minutos_Tarde').filter(g => activeData[g].Prom_Minutos_Tarde > 0).slice(0, 5);
        let peoresColors, peoresBorders, peoresData;
        if (peoresTardanzas.length === 0) {
            peoresTardanzas = ['Equipo 100% Puntual'];
            peoresData = [0];
            peoresColors = ['rgba(103, 194, 58, 0.7)'];
            peoresBorders = ['rgba(103, 194, 58, 1)'];
        } else {
            peoresData = peoresTardanzas.map(g => activeData[g].Prom_Minutos_Tarde);
            peoresColors = peoresTardanzas.map(() => 'rgba(245, 108, 108, 0.7)');
            peoresBorders = peoresTardanzas.map(() => 'rgba(245, 108, 108, 1)');
        }
        drawChart('chartTardanzasPeores', 'bar', peoresTardanzas, peoresData, 'Minutos Tarde (Promedio)', peoresColors, peoresBorders, { indexAxis: 'y' });
        
        // 2. Top Excelencia Puntualidad (Mejores 5)
        let mejoresTardanzas = sortBy('Prom_Minutos_Tarde', true).slice(0, 5).reverse();
        const mejoresColors = mejoresTardanzas.map(() => 'rgba(103, 194, 58, 0.7)');
        const mejoresBorders = mejoresTardanzas.map(() => 'rgba(103, 194, 58, 1)');
        drawChart('chartTardanzasMejores', 'bar', mejoresTardanzas, mejoresTardanzas.map(g => activeData[g].Prom_Minutos_Tarde), 'Minutos Tarde (Promedio)', mejoresColors, mejoresBorders, { indexAxis: 'y' });

        // 3. Promedio Inactividad Diaria
        const inactividadTop = sortBy('Prom_Inactividad_Diaria').slice(0, 10);
        const bgColors = inactividadTop.map(g => {
            let v = activeData[g].Prom_Inactividad_Diaria;
            return v > 45 ? 'rgba(245, 108, 108, 0.7)' : (v > 20 ? 'rgba(230, 162, 60, 0.7)' : 'rgba(103, 194, 58, 0.7)');
        });
        drawChart('chartInactividad', 'bar', inactividadTop, inactividadTop.map(g => activeData[g].Prom_Inactividad_Diaria), 'Minutos Inactividad', bgColors, bgColors);
    
    } else {
        // SINGLE GESTOR:
        let realSelectedGestor = Object.keys(window.controlOperativoRawData).find(k => k === selectedGestor);
        if (!realSelectedGestor) {
            const parts = selectedGestor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ');
            realSelectedGestor = Object.keys(window.controlOperativoRawData).find(k => {
                const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return parts.every(p => normK.includes(p));
            });
        }
        if (!realSelectedGestor) realSelectedGestor = selectedGestor;

        // 1. Fechas con Llegadas Tarde (Show all dates in sortedDates with red bars for late minutes)
        const dailyLateMins = sortedDates.map(date => {
            const raw = window.controlOperativoRawData[realSelectedGestor]?.[date];
            return (raw && (raw.Minutos_Tarde_Total || 0) > 0) ? raw.Minutos_Tarde_Total : 0;
        });

        const hasLate = dailyLateMins.some(v => v > 0);

        if (!hasLate) {
            drawChart('chartTardanzasPeores', 'bar', ['Sin Llegadas Tardes en el Periodo'], [0], 'Minutos Tarde', ['rgba(103, 194, 58, 0.7)'], ['rgba(103, 194, 58, 1)'], {
                maxBarThickness: 36,
                plugins: {
                    datalabels: {
                        formatter: function() { return "🎉 ¡Sin tardanzas!"; },
                        anchor: 'center', align: 'center', color: 'var(--success)', font: { size: 12, weight: 'bold' }
                    }
                }
            });
        } else {
            const lateColors = dailyLateMins.map(v => v > 0 ? 'rgba(245, 108, 108, 0.85)' : 'rgba(0,0,0,0)');
            drawChart('chartTardanzasPeores', 'bar', sortedDates, dailyLateMins, 'Minutos Tarde', lateColors, lateColors, {
                maxBarThickness: 36,
                plugins: {
                    datalabels: {
                        formatter: function(val) { return val > 0 ? `+${val}m` : ''; },
                        anchor: 'end', align: 'top', color: 'var(--danger)', font: { size: 10, weight: 'bold' }
                    }
                },
                scales: {
                    x: { ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 45, minRotation: 0, font: { size: 10 } } },
                    y: { beginAtZero: true, grace: '20%' }
                }
            });
        }

        // 2. Fechas de Conexión a Tiempo (Dates where Dias_Laborados > 0 AND Minutos_Tarde_Total === 0)
        const punctualDates = [];
        sortedDates.forEach(date => {
            const raw = window.controlOperativoRawData[realSelectedGestor]?.[date];
            if (raw && raw.Dias_Laborados > 0 && (raw.Minutos_Tarde_Total || 0) === 0) {
                punctualDates.push(date);
            }
        });

        if (punctualDates.length === 0) {
            drawChart('chartTardanzasMejores', 'bar', ['Sin Conexiones a Tiempo en el Periodo'], [0], 'Conexión a Tiempo', ['rgba(245, 108, 108, 0.7)'], ['rgba(245, 108, 108, 1)'], { maxBarThickness: 36 });
        } else {
            const punctualData = punctualDates.map(() => 0);
            const punctualColors = punctualDates.map(() => 'rgba(103, 194, 58, 0.8)');
            drawPunctualDatesChart('chartTardanzasMejores', punctualDates, punctualData, punctualColors);
        }

        // 3. Inactividad Diaria por Fecha
        const dailyInactivityValues = sortedDates.map(date => {
            return window.controlOperativoRawData[realSelectedGestor]?.[date]?.Minutos_Inactividad_Total || 0;
        });
        const dailyBgColors = dailyInactivityValues.map(v => {
            return v > 45 ? 'rgba(245, 108, 108, 0.7)' : (v > 20 ? 'rgba(230, 162, 60, 0.7)' : 'rgba(103, 194, 58, 0.7)');
        });
        drawChart('chartInactividad', 'bar', sortedDates, dailyInactivityValues, `Inactividad (Min)`, dailyBgColors, dailyBgColors, {
            maxBarThickness: 36,
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 45, minRotation: 0, font: { size: 10 } } }
            }
        });
    }

    // 4. Aprobaciones por Día Chart
    const dailyAprobados = sortedDates.map(date => dailyData[date].Aprobados);
    const dailyRechazados = sortedDates.map(date => dailyData[date].Rechazados);
    
    destroyChart('chartAprobacionesDia');
    const ctxAprobDia = document.getElementById('chartAprobacionesDia').getContext('2d');
    
    const datalabelsDaily = {
        formatter: function(value) {
            if (value === 0 || value === "0") return "";
            return value.toLocaleString('es-CO');
        },
        anchor: 'end', align: 'top', color: '#666', font: { size: 10, weight: 'bold' }
    };

    controlOperativoCharts['chartAprobacionesDia'] = new Chart(ctxAprobDia, {
        type: 'line',
        plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
        data: {
            labels: sortedDates,
            datasets: [
                {
                    label: 'Aprobados',
                    data: dailyAprobados,
                    borderColor: 'rgba(103, 194, 58, 1)',
                    backgroundColor: 'rgba(103, 194, 58, 0.2)',
                    fill: true,
                    tension: 0.3,
                    datalabels: { align: 'top', anchor: 'end', color: '#fff', textStrokeColor: 'rgba(103, 194, 58, 1)', textStrokeWidth: 3 }
                },
                {
                    label: 'Rechazados',
                    data: dailyRechazados,
                    borderColor: 'rgba(245, 108, 108, 1)',
                    backgroundColor: 'rgba(245, 108, 108, 0.2)',
                    fill: true,
                    tension: 0.3,
                    datalabels: { align: 'top', anchor: 'end', color: '#fff', textStrokeColor: 'rgba(245, 108, 108, 1)', textStrokeWidth: 3 }
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                datalabels: datalabelsDaily,
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 45, minRotation: 0, font: { size: 10 } } },
                y: { beginAtZero: true, grace: '15%' }
            }
        }
    });
    
    // 5. Eficiencia y Volumen de Retiros
    if (isGlobal) {
        const volTop = sortBy('Retiros_Procesados');
        drawCombinedChart('chartEficiencia', volTop, activeData);
    } else {
        drawCombinedChartDaily('chartEficiencia', sortedDates, realSelectedGestor);
    }
    
    // 6. Matriz de Riesgo: % Rechazos vs Tasa Aprobación
    drawScatterMatriz('chartMatrizFuga', gestores, activeData, isGlobal);
}

function drawPunctualDatesChart(id, dates, dataArr, bgColors) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    
    const datalabelsConfig = {
        formatter: function() {
            return "✓ 0 min";
        },
        anchor: 'center',
        align: 'center',
        color: '#ffffff',
        font: { size: 10, weight: 'bold' }
    };

    controlOperativoCharts[id] = new Chart(ctx, {
        type: 'bar',
        plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
        data: {
            labels: dates,
            datasets: [{
                label: 'Conexión a Tiempo',
                data: dates.map(() => 100),
                backgroundColor: 'rgba(103, 194, 58, 0.8)',
                borderColor: 'rgba(103, 194, 58, 1)',
                borderWidth: 1,
                maxBarThickness: 36
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 25 }
            },
            plugins: {
                datalabels: datalabelsConfig,
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `${ctx.label}: Conexión a Tiempo (0 min tarde)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 45, minRotation: 0, font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    max: 120,
                    ticks: {
                        callback: function(v) { return v === 100 ? 'A tiempo' : ''; }
                    }
                }
            }
        }
    });
}

function drawChart(id, type, labels, dataArr, labelStr, bgColor, borderColor, extraOptions = {}) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    
    const isHorizontal = extraOptions.indexAxis === 'y';
    const datalabelsConfig = {
        formatter: function(value) {
            if (value === 0 || value === "0") return "0 min";
            const num = Number(value);
            const isInt = Number.isInteger(num);
            return num.toLocaleString('es-CO', { 
                minimumFractionDigits: isInt ? 0 : 2, 
                maximumFractionDigits: isInt ? 0 : 2 
            });
        },
        anchor: 'end',
        align: isHorizontal ? 'right' : 'top',
        color: '#666',
        font: { size: 10, weight: 'bold' }
    };

    if (!extraOptions.plugins) extraOptions.plugins = {};
    if (!extraOptions.plugins.datalabels) extraOptions.plugins.datalabels = datalabelsConfig;

    controlOperativoCharts[id] = new Chart(ctx, {
        type: type,
        plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
        data: {
            labels: labels,
            datasets: [{
                label: labelStr,
                data: dataArr,
                backgroundColor: bgColor,
                borderColor: borderColor,
                borderWidth: 1
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: isHorizontal ? 0 : 20,
                    right: isHorizontal ? 40 : 0
                }
            },
            ...extraOptions
        }
    });
}

function drawCombinedChart(id, labels, data) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    
    const datalabelsConfig = {
        formatter: function(value) {
            if (value === 0 || value === "0") return "";
            const num = Number(value);
            const isInt = Number.isInteger(num);
            return num.toLocaleString('es-CO', { 
                minimumFractionDigits: isInt ? 0 : 2, 
                maximumFractionDigits: isInt ? 0 : 2 
            });
        },
        anchor: 'end',
        align: 'top',
        color: '#666',
        font: { size: 11, weight: 'bold' }
    };

    controlOperativoCharts[id] = new Chart(ctx, {
        type: 'bar',
        plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Aprobados',
                    data: labels.map(g => data[g].Retiros_Aprobados),
                    backgroundColor: 'rgba(103, 194, 58, 0.7)',
                    datalabels: { align: 'center', anchor: 'center', color: '#fff', textStrokeColor: 'rgba(0,0,0,0.5)', textStrokeWidth: 3 }
                },
                {
                    label: 'Rechazados',
                    data: labels.map(g => data[g].Retiros_Rechazados),
                    backgroundColor: 'rgba(245, 108, 108, 0.7)',
                    datalabels: { align: 'center', anchor: 'center', color: '#fff', textStrokeColor: 'rgba(0,0,0,0.6)', textStrokeWidth: 3 }
                },
                {
                    label: 'Tasa Aprobación / Día',
                    data: labels.map(g => data[g].Tasa_Aprobacion_Dia),
                    type: 'line',
                    borderColor: 'rgba(64, 158, 255, 1)',
                    backgroundColor: 'rgba(64, 158, 255, 1)',
                    yAxisID: 'y1',
                    datalabels: { align: 'top', anchor: 'end', color: '#fff', textStrokeColor: 'rgba(64, 158, 255, 1)', textStrokeWidth: 3 }
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                datalabels: datalabelsConfig,
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, position: 'left', grace: '10%' },
                y1: { position: 'right', grid: { drawOnChartArea: false }, grace: '15%' }
            }
        }
    });
}

function drawCombinedChartDaily(id, sortedDates, selectedGestor) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');

    const aprobadosData = sortedDates.map(d => window.controlOperativoRawData[selectedGestor]?.[d]?.Retiros_Aprobados || 0);
    const rechazadosData = sortedDates.map(d => window.controlOperativoRawData[selectedGestor]?.[d]?.Retiros_Rechazados || 0);
    const tasaData = sortedDates.map(d => window.controlOperativoRawData[selectedGestor]?.[d]?.Retiros_Aprobados || 0);

    const datalabelsConfig = {
        formatter: function(value) {
            if (value === 0 || value === "0") return "";
            return Number(value).toLocaleString('es-CO');
        },
        anchor: 'end',
        align: 'top',
        color: '#666',
        font: { size: 11, weight: 'bold' }
    };

    controlOperativoCharts[id] = new Chart(ctx, {
        type: 'bar',
        plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
        data: {
            labels: sortedDates,
            datasets: [
                {
                    label: 'Aprobados',
                    data: aprobadosData,
                    backgroundColor: 'rgba(103, 194, 58, 0.7)',
                    datalabels: { align: 'center', anchor: 'center', color: '#fff', textStrokeColor: 'rgba(0,0,0,0.5)', textStrokeWidth: 3 }
                },
                {
                    label: 'Rechazados',
                    data: rechazadosData,
                    backgroundColor: 'rgba(245, 108, 108, 0.7)',
                    datalabels: { align: 'center', anchor: 'center', color: '#fff', textStrokeColor: 'rgba(0,0,0,0.6)', textStrokeWidth: 3 }
                },
                {
                    label: 'Aprobaciones del Día',
                    data: tasaData,
                    type: 'line',
                    borderColor: 'rgba(64, 158, 255, 1)',
                    backgroundColor: 'rgba(64, 158, 255, 1)',
                    yAxisID: 'y1',
                    datalabels: { align: 'top', anchor: 'end', color: '#fff', textStrokeColor: 'rgba(64, 158, 255, 1)', textStrokeWidth: 3 }
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                datalabels: datalabelsConfig,
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, position: 'left', grace: '10%' },
                y1: { position: 'right', grid: { drawOnChartArea: false }, grace: '15%' }
            }
        }
    });
}

function drawScatterMatriz(id, gestores, data, isGlobal = true) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    
    if (isGlobal) {
        const sortedGestores = [...gestores].sort((a,b) => (data[b].Porcentaje_Rechazos || 0) - (data[a].Porcentaje_Rechazos || 0));
        const rechazosData = sortedGestores.map(g => data[g].Porcentaje_Rechazos || 0);
        const colors = rechazosData.map(v => v > 5 ? 'rgba(245, 108, 108, 0.8)' : (v > 2 ? 'rgba(230, 162, 60, 0.8)' : 'rgba(103, 194, 58, 0.8)'));

        const datalabelsConfig = {
            formatter: function(value) {
                return `${value}%`;
            },
            anchor: 'end',
            align: 'top',
            color: '#666',
            font: { size: 11, weight: 'bold' }
        };

        controlOperativoCharts[id] = new Chart(ctx, {
            type: 'bar',
            plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
            data: {
                labels: sortedGestores,
                datasets: [{
                    label: 'Porcentaje de Rechazos (%)',
                    data: rechazosData,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 30 } },
                plugins: {
                    datalabels: datalabelsConfig,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return `% Rechazos: ${ctx.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grace: '15%', title: { display: true, text: '% Rechazos' } }
                }
            }
        });
    } else {
        const gestor = gestores[0];
        const gData = data[gestor];
        const scatterPoint = gData ? [{
            x: gData.Tasa_Aprobacion_Dia || 0,
            y: gData.Porcentaje_Rechazos || 0,
            name: gestor
        }] : [];

        const datalabelsConfig = {
            formatter: function(value) {
                return `${value.name}
(Tasa: ${value.x}/día, Rechazos: ${value.y}%)`;
            },
            anchor: 'center',
            align: 'top',
            color: '#409EFF',
            font: { size: 11, weight: 'bold' }
        };

        controlOperativoCharts[id] = new Chart(ctx, {
            type: 'scatter',
            plugins: [typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : {}],
            data: {
                datasets: [{
                    label: gestor || 'Gestor',
                    data: scatterPoint,
                    backgroundColor: 'rgba(64, 158, 255, 0.9)',
                    borderColor: 'rgba(64, 158, 255, 1)',
                    pointRadius: 10,
                    pointHoverRadius: 12
                }]
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 45, right: 45 } },
                plugins: {
                    datalabels: datalabelsConfig,
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                let item = ctx.raw;
                                return `${item.name}: Tasa Aprob.= ${item.x}/día, % Rechazos= ${item.y}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Tasa Aprobación / Día' }, grace: '25%' },
                    y: { beginAtZero: true, title: { display: true, text: 'Porcentaje Rechazos (%)' }, grace: '25%' }
                }
            }
        });
    }
}

// ==========================================
// ACTIVE SUPERVISOR BADGE LOGIC
// ==========================================
function updateActiveSupervisorBadge() {
    if (typeof globalScheduleRows === 'undefined' || !globalScheduleRows || globalScheduleRows.length === 0) return;
    
    const badge = document.getElementById('activeSupervisorBadge');
    if (!badge) return;
    
    let activeSups = [];
    let now = new Date();
    let currentHour = now.getHours();
    let currentMin = now.getMinutes();
    let timeFloat = currentHour + (currentMin / 60);

    const supervisors = [
        {name: 'Maria', full: 'Maria Sanchez'}, 
        {name: 'Sara', full: 'Sara Santamaría'}
    ];

    for (let sup of supervisors) {
        let shiftStr = typeof getShiftForDate === 'function' ? getShiftForDate(globalScheduleRows, globalScheduleBlocks, sup.name, now) : null;
        
        if (shiftStr && typeof shiftStr === 'string' && shiftStr !== 'Descansa' && shiftStr !== 'Por Asignar' && shiftStr !== 'Vacaciones') {
            let match = shiftStr.match(/(\d+)(am|pm|a\.m\.|p\.m\.)\s*-\s*(\d+)(am|pm|a\.m\.|p\.m\.)/i);
            if (match) {
                let startH = parseInt(match[1]);
                let startMeridiem = match[2].toLowerCase().replace(/\./g, '');
                if (startMeridiem === 'pm' && startH !== 12) startH += 12;
                if (startMeridiem === 'am' && startH === 12) startH = 0;
                
                let endH = parseInt(match[3]);
                let endMeridiem = match[4].toLowerCase().replace(/\./g, '');
                if (endMeridiem === 'pm' && endH !== 12) endH += 12;
                if (endMeridiem === 'am' && endH === 12) endH = 0;
                
                let startFloat = startH;
                let endFloat = endH;
                
                let isActive = false;
                if (endFloat <= startFloat) {
                    if (timeFloat >= startFloat || timeFloat < endFloat) isActive = true;
                } else {
                    if (timeFloat >= startFloat && timeFloat < endFloat) isActive = true;
                }
                
                if (isActive) {
                    if (!activeSups.includes(sup.full)) activeSups.push(sup.full);
                }
            } else if (shiftStr.toLowerCase().includes('turno')) {
                if (!activeSups.includes(sup.full)) activeSups.push(sup.full);
            }
        }
    }
    
    if (activeSups.length > 0) {
        badge.innerHTML = `<i class='bx bx-support'></i> Sup: ${escapeHTML(activeSups.join(' y '))}`;
    } else {
        badge.innerHTML = `<i class='bx bx-support'></i> Sup: Ninguna (Fuera de turno)`;
    }
    badge.style.display = 'inline-flex';
}

setInterval(updateActiveSupervisorBadge, 60000); // Check every minute
setTimeout(updateActiveSupervisorBadge, 3000); // Initial check after loading


// ==========================================
// HISTORIAL DE ACCESOS LOGIC
// ==========================================
let allLoginHistoryRecords = [];

async function openLoginHistoryModal() {
    const modal = document.getElementById('loginHistoryModal');
    if (!modal) return;

    modal.classList.add('active');
    const tbody = document.getElementById('loginHistoryTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);"><i class='bx bx-loader-alt bx-spin' style="font-size: 24px; margin-bottom: 8px;"></i><br>Cargando historial de accesos...</td></tr>`;
    }

    try {
        const snapActive = await database.ref('active_sessions').once('value');
        const snapReports = await database.ref('shift_reports').once('value');
        const snapLogs = await database.ref('login_history').once('value');

        allLoginHistoryRecords = [];
        const seenKeys = new Set();

        // 1. Current Active Sessions
        if (snapActive.exists()) {
            const activeData = snapActive.val();
            for (let uid in activeData) {
                const s = activeData[uid];
                if (!s || !s.name) continue;
                const loginTimeStr = s.loginTime || s.startTime || (s.lastActive ? new Date(s.lastActive).toISOString() : new Date().toISOString());
                const key = `${s.name.trim().toLowerCase()}_${loginTimeStr.substring(0, 16)}`;
                seenKeys.add(key);

                let isOnline = s.lastActive ? ((Date.now() - s.lastActive) < 120000) : false;
                if (s.status === 'En Almuerzo' || s.status === 'En Desayuno' || s.status === 'Inactivo') isOnline = false;

                allLoginHistoryRecords.push({
                    name: s.name,
                    email: s.email || '',
                    shift: s.shift || 'Mañana',
                    loginTime: loginTimeStr,
                    lastActive: s.lastActive ? new Date(s.lastActive).toLocaleString('es-CO') : 'Reciente',
                    isOnline: isOnline,
                    status: s.status || (isOnline ? 'En Línea' : 'Inactivo'),
                    source: 'En Vivo'
                });
            }
        }

        // 2. Login History Logs
        if (snapLogs.exists()) {
            const logData = snapLogs.val();
            for (let id in logData) {
                const l = logData[id];
                if (!l || !l.name) continue;
                const key = `${l.name.trim().toLowerCase()}_${(l.loginTime||'').substring(0, 16)}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);

                allLoginHistoryRecords.push({
                    name: l.name,
                    email: l.email || '',
                    shift: l.shift || 'General',
                    loginTime: l.loginTime || l.timestamp,
                    lastActive: l.lastActive ? new Date(l.lastActive).toLocaleString('es-CO') : 'Finalizado',
                    isOnline: false,
                    status: l.status || 'Finalizado',
                    source: 'Historial'
                });
            }
        }

        // 3. Past Shift Reports (Bitácoras)
        if (snapReports.exists()) {
            const reportsData = snapReports.val();
            for (let id in reportsData) {
                const r = reportsData[id];
                if (!r) continue;
                const gestorName = (r.gestor || r.name || r.userName || '').trim();
                if (!gestorName) continue;

                const shiftStr = r.turnoProgramado || r.shift || 'General';
                const loginTimeStr = r.horaInicio || r.loginTime || r.startTime || r.reportDate || (r.timestamp ? new Date(r.timestamp).toISOString() : '');
                const endTimeStr = r.horaFin || r.endTime || (r.timestamp ? new Date(r.timestamp).toLocaleString('es-CO') : 'Turno Finalizado');

                const key = `${gestorName.toLowerCase()}_${loginTimeStr.substring(0, 16)}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);

                let statusLabel = 'Turno Completado';
                if (shiftStr.toLowerCase().includes('descansa')) {
                    statusLabel = 'Ingreso en Día de Descanso';
                }

                allLoginHistoryRecords.push({
                    name: gestorName,
                    email: r.email || '',
                    shift: shiftStr,
                    loginTime: loginTimeStr,
                    lastActive: endTimeStr,
                    isOnline: false,
                    status: statusLabel,
                    source: 'Bitácora'
                });
            }
        }

        // Sort descending by loginTime
        allLoginHistoryRecords.sort((a, b) => new Date(b.loginTime || 0) - new Date(a.loginTime || 0));

        renderLoginHistoryTable(allLoginHistoryRecords);

    } catch (e) {
        console.error("Error cargando historial de accesos:", e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--danger);">Error cargando los accesos. Por favor intenta de nuevo.</td></tr>`;
        }
    }
}

function renderLoginHistoryTable(records) {
    const tbody = document.getElementById('loginHistoryTableBody');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);">No se encontraron registros de accesos.</td></tr>`;
        return;
    }

    let html = '';
    records.forEach(r => {
        const loginDateObj = r.loginTime ? new Date(r.loginTime) : null;
        const formattedLogin = loginDateObj && !isNaN(loginDateObj) ? loginDateObj.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' }) : (r.loginTime || 'N/A');
        
        let delayBadge = '';
        if (r.shift && r.shift.toLowerCase().includes('descansa')) {
            delayBadge = `<span style="background: rgba(139,92,246,0.15); color: #8b5cf6; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 6px;">Descanso</span>`;
        } else if (loginDateObj && !isNaN(loginDateObj) && r.shift) {
            const shiftStr = r.shift.toLowerCase().trim();
            const match = shiftStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
            if (match) {
                let hour = parseInt(match[1], 10);
                let minute = match[2] ? parseInt(match[2], 10) : 0;
                const ampm = match[3].toLowerCase();
                if (ampm === 'pm' && hour < 12) hour += 12;
                if (ampm === 'am' && hour === 12) hour = 0;
                
                const expected = new Date(loginDateObj);
                expected.setHours(hour, minute, 0, 0);
                let diffMin = (loginDateObj - expected) / (1000 * 60);

                if (diffMin < -12 * 60) {
                    expected.setDate(expected.getDate() - 1);
                    diffMin = (loginDateObj - expected) / (1000 * 60);
                } else if (diffMin > 12 * 60) {
                    expected.setDate(expected.getDate() + 1);
                    diffMin = (loginDateObj - expected) / (1000 * 60);
                }

                if (diffMin <= 5) {
                    delayBadge = `<span style="background: rgba(16,185,129,0.15); color: var(--success); padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 6px;">A tiempo</span>`;
                } else if (diffMin > 240) {
                    delayBadge = `<span style="background: rgba(139,92,246,0.15); color: #8b5cf6; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 6px;">Fuera de Horario</span>`;
                } else {
                    const tardanza = Math.round(diffMin);
                    delayBadge = `<span style="background: rgba(239,68,68,0.15); color: var(--danger); padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 6px;">+${tardanza}m Tarde</span>`;
                }
            }
        }

        let statusBadge = `<span style="background: rgba(59,130,246,0.15); color: var(--accent-primary); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">${escapeHTML(r.status)}</span>`;
        if (r.isOnline) {
            statusBadge = `<span style="background: rgba(16,185,129,0.15); color: var(--success); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700;"><i class='bx bx-radio-circle-marked'></i> En Línea</span>`;
        } else if (r.status === 'Ingreso en Día de Descanso') {
            statusBadge = `<span style="background: rgba(139,92,246,0.15); color: #8b5cf6; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">Ingreso en Descanso</span>`;
        }

        html += `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                <td style="padding: 12px 16px; font-weight: 600; color: var(--text-primary);">
                    ${escapeHTML(r.name)}
                    ${r.email ? `<div style="font-size: 11px; color: var(--text-secondary); font-weight: 400;">${escapeHTML(r.email)}</div>` : ''}
                </td>
                <td style="padding: 12px 16px; color: var(--text-secondary); font-size: 13px;">${escapeHTML(r.shift)}</td>
                <td style="padding: 12px 16px; color: var(--text-primary); font-size: 13px; font-weight: 500;">
                    ${formattedLogin} ${delayBadge}
                </td>
                <td style="padding: 12px 16px;">${statusBadge}</td>
                <td style="padding: 12px 16px; color: var(--text-secondary); font-size: 12px;">${escapeHTML(r.lastActive)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function filterLoginHistoryTable() {
    const searchInput = document.getElementById('loginHistorySearch');
    const dateFilter = document.getElementById('loginHistoryDateFilter');
    
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const dateVal = dateFilter ? dateFilter.value : 'todos';

    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const filtered = allLoginHistoryRecords.filter(r => {
        if (query && !r.name.toLowerCase().includes(query) && !(r.email && r.email.toLowerCase().includes(query))) {
            return false;
        }

        if (dateVal !== 'todos' && r.loginTime) {
            const rDate = new Date(r.loginTime);
            const rDateStr = rDate.toISOString().substring(0, 10);
            if (dateVal === 'hoy' && rDateStr !== todayStr) return false;
            if (dateVal === '7d' && rDate < sevenDaysAgo) return false;
            if (dateVal === '30d' && rDate < thirtyDaysAgo) return false;
        }

        return true;
    });

    renderLoginHistoryTable(filtered);
}

window.openLoginHistoryModal = openLoginHistoryModal;
window.filterLoginHistoryTable = filterLoginHistoryTable;

// =========================================================================
// --- PARCHES DE DIAGNÓSTICO E2E & REGLAS DE NEGOCIO SLA DE RETIROS ---
// =========================================================================

/**
 * 1. Fórmula Justa de Tiempo de Aprobación de Retiros (SLA Ajustado por Turno)
 * HoraInicioCálculo = MAX(FechaHoraCreaciónRetiro, FechaHoraInicioTurnoGestor)
 * Tiempo de Aprobación = FechaHoraAprobación - HoraInicioCálculo
 */
function calculateEffectiveApprovalTime(creacionTime, aprobacionTime, inicioTurnoTime) {
    if (!aprobacionTime) return 0;
    const creacionMs = new Date(creacionTime).getTime();
    const aprobacionMs = new Date(aprobacionTime).getTime();
    let inicioTurnoMs = inicioTurnoTime ? new Date(inicioTurnoTime).getTime() : 0;
    
    if (isNaN(creacionMs) || isNaN(aprobacionMs)) return 0;
    if (isNaN(inicioTurnoMs)) inicioTurnoMs = 0;

    const horaInicioCalculoMs = Math.max(creacionMs, inicioTurnoMs);
    const diffMins = (aprobacionMs - horaInicioCalculoMs) / 60000;
    return Math.max(0, Math.round(diffMins * 100) / 100);
}

/**
 * 2. Monitoreo y Presencia en Tiempo Real con Firebase Realtime Database
 */
function setupUserPresence(uid) {
    if (!uid || typeof database === 'undefined') return;
    const connectedRef = database.ref('.info/connected');
    const userSessionRef = database.ref(`active_sessions/${uid}`);

    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            userSessionRef.onDisconnect().update({
                status: 'offline',
                lastHeartbeat: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                userSessionRef.update({
                    status: 'online',
                    lastHeartbeat: firebase.database.ServerValue.TIMESTAMP
                });
            });
        }
    });
}

function startMonitoringPresence() {
    if (typeof database === 'undefined') return;
    database.ref('active_sessions').on('value', (snapshot) => {
        if (typeof renderActiveSessionsDashboard === 'function') {
            renderActiveSessionsDashboard();
        }
    });
}

/**
 * 3. Contador Operacional Atómico (ServerValue.increment)
 */
function incrementApprovedWithdrawal(uid, amount = 1) {
    if (typeof database === 'undefined') return;
    const counterRef = database.ref('metrics/approvedCount');
    counterRef.transaction((currentValue) => {
        return (currentValue || 0) + amount;
    }, (error, committed, snapshot) => {
        if (!error && committed) {
            updateApprovedCountUI(snapshot.val());
        }
    });
}

function initAtomicApprovedCounterListener() {
    if (typeof database === 'undefined') return;
    database.ref('metrics/approvedCount').on('value', (snapshot) => {
        if (snapshot.exists()) {
            updateApprovedCountUI(snapshot.val());
        }
    });
}

function updateApprovedCountUI(count) {
    const countEl = document.getElementById('metric-approved-count');
    if (countEl) {
        countEl.textContent = count || 0;
        countEl.style.transform = 'scale(1.25)';
        setTimeout(() => countEl.style.transform = 'scale(1)', 300);
    }
}

/**
 * 4. Módulo de Novedades, Comentarios e Incidentes (/logs)
 */
async function handleNewIncidentSubmit(event) {
    event.preventDefault();
    if (!currentUser) {
        alert("Debes iniciar sesión para registrar una novedad.");
        return;
    }
    
    const type = document.getElementById('incidentType')?.value || 'Novedad Operativa';
    const title = document.getElementById('incidentTitle')?.value?.trim();
    const assignee = document.getElementById('incidentAssignee')?.value?.trim() || currentUser.name;
    const detail = document.getElementById('incidentDetail')?.value?.trim();

    if (!title || !detail) {
        alert("Por favor completa el título y el detalle de la novedad.");
        return;
    }

    try {
        const newLogRef = database.ref('logs').push();
        await newLogRef.set({
            uid: currentUser.uid || firebase.auth().currentUser.uid,
            type: type,
            title: title,
            assignedTo: assignee,
            detail: detail,
            reportedBy: currentUser.name,
            reportedByEmail: currentUser.email || '',
            timestamp: Date.now(),
            status: 'Abierto'
        });

        const form = document.getElementById('incidentForm');
        if (form) form.reset();
        alert("¡Novedad/Incidente registrada exitosamente!");
    } catch(err) {
        console.error("Error registrando novedad en /logs:", err);
        alert("Ocurrió un error al registrar la novedad.");
    }
}

function startIncidentsRealtimeListener() {
    if (typeof database === 'undefined') return;
    database.ref('logs').orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const incidents = [];
        if (snapshot.exists()) {
            snapshot.forEach((childSnap) => {
                incidents.unshift({ id: childSnap.key, ...childSnap.val() });
            });
        }
        renderIncidentsTable(incidents);
    });
}

function renderIncidentsTable(incidents) {
    const tbody = document.getElementById('incidentsTableBody');
    if (!tbody) return;

    if (!incidents || incidents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay novedades ni incidentes registrados.</td></tr>`;
        return;
    }

    let html = '';
    incidents.forEach(inc => {
        const dateStr = inc.timestamp ? new Date(inc.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';
        const typeBadge = `<span class="badge pending" style="font-size: 10px;">${escapeHTML(inc.type || 'Soporte')}</span>`;
        const statusBadge = inc.status === 'Cerrado' 
            ? `<span class="badge status-completed" style="font-size: 10px; background: var(--success); color: white;">Cerrado</span>`
            : `<span class="badge in-progress" style="font-size: 10px; background: var(--warning); color: white;">Abierto</span>`;

        html += `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 10px; font-size: 12px; color: var(--text-secondary);">${dateStr}</td>
                <td style="padding: 10px;">${typeBadge}</td>
                <td style="padding: 10px;">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${escapeHTML(inc.title || '')}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeHTML(inc.detail || '')}</div>
                    ${inc.assignedTo ? `<div style="font-size: 10px; color: var(--accent-primary); margin-top: 2px;">Resp: ${escapeHTML(inc.assignedTo)}</div>` : ''}
                </td>
                <td style="padding: 10px; font-size: 12px; color: var(--text-primary);">${escapeHTML(inc.reportedBy || 'Anónimo')}</td>
                <td style="padding: 10px; text-align: center;">${statusBadge}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

/**
 * 5. Filtro por Responsable Asignado (#filter-assignee)
 */
function renderAssignedTasksFilter() {
    const assigneeSelect = document.getElementById('filter-assignee');
    if (!assigneeSelect) return;
    const selectedAssignee = assigneeSelect.value;
    
    document.querySelectorAll('.task-item').forEach(taskItem => {
        const assigneeAttr = taskItem.getAttribute('data-assignee') || '';
        if (selectedAssignee === 'Todos' || (typeof normalizeName === 'function' && normalizeName(assigneeAttr).includes(normalizeName(selectedAssignee)))) {
            taskItem.style.display = '';
        } else {
            taskItem.style.display = 'none';
        }
    });
}

// Exponer funciones globalmente
window.calculateEffectiveApprovalTime = calculateEffectiveApprovalTime;
window.setupUserPresence = setupUserPresence;
window.startMonitoringPresence = startMonitoringPresence;
window.incrementApprovedWithdrawal = incrementApprovedWithdrawal;
window.initAtomicApprovedCounterListener = initAtomicApprovedCounterListener;
window.handleNewIncidentSubmit = handleNewIncidentSubmit;
window.startIncidentsRealtimeListener = startIncidentsRealtimeListener;
window.renderIncidentsTable = renderIncidentsTable;
window.renderAssignedTasksFilter = renderAssignedTasksFilter;


