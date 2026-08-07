// Helper function to switch panels
function switchPanel(panelId) {
    document.querySelectorAll('.auth-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    document.getElementById(panelId).style.display = 'block';
    
    // Clear forms and errors when switching
    document.querySelectorAll('.login-form').forEach(form => form.reset());
    document.querySelectorAll('.login-error-msg').forEach(msg => {
        msg.style.display = 'none';
        msg.textContent = '';
    });
}

// Helper: Validar si el turno asignado ya finalizó para el día de hoy
async function checkShiftExpirationOnLogin(dbUser) {
    if (!dbUser || dbUser.role === 'Admin' || dbUser.role === 'Supervisor') {
        return { expired: false };
    }

    try {
        if (typeof XLSX === 'undefined') return { expired: false };
        const url = encodeURI('Horario/Horario 2026.xlsx') + '?t=' + Date.now();
        const response = await fetch(url);
        if (!response.ok) return { expired: false };
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (!rows || rows.length < 3) return { expired: false };

        const now = new Date();

        function parseExcelDate(serial) {
            if (!serial) return null;
            if (typeof serial === 'string' && (serial.includes('-') || serial.includes('/'))) {
                const d = new Date(serial);
                return isNaN(d.getTime()) ? null : d;
            }
            if (!isNaN(serial)) {
                const epochUTC = Date.UTC(1899, 11, 30);
                return new Date(epochUTC + parseFloat(serial) * 86400000);
            }
            return null;
        }

        let targetBlockStart = -1;
        let targetCol = -1;

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const testRow = rows[rIdx];
            if (!testRow || testRow.length < 2) continue;
            
            const firstDate = parseExcelDate(testRow[1]);
            if (firstDate) {
                const nextR = rows[rIdx + 1];
                if (nextR && (nextR[1] === 'Lunes' || nextR[1] === 'Martes')) {
                    for (let c = 1; c < testRow.length; c++) {
                        const cellDate = parseExcelDate(testRow[c]);
                        if (cellDate && cellDate.getUTCDate() === now.getDate() && cellDate.getUTCMonth() === now.getMonth() && cellDate.getUTCFullYear() === now.getFullYear()) {
                            targetBlockStart = rIdx;
                            targetCol = c;
                            break;
                        }
                    }
                    if (targetBlockStart !== -1) break;
                }
            }
        }

        if (targetBlockStart === -1 || targetCol === -1) return { expired: false };

        let shiftStr = '';
        const normalize = str => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const userNameNorm = normalize(dbUser.name);

        for (let rIdx = targetBlockStart + 2; rIdx < rows.length; rIdx++) {
            const r = rows[rIdx];
            if (!r || !r[0] || String(r[0]).trim() === '' || String(r[0]).trim().toUpperCase() === 'GESTOR') break;
            if (normalize(r[0]) === userNameNorm) {
                shiftStr = String(r[targetCol] || '').trim();
                break;
            }
        }

        if (!shiftStr || shiftStr === 'Descansa' || shiftStr === 'Por Asignar') return { expired: false };

        const parts = shiftStr.split('-');
        let endStr = parts.length > 1 ? parts[1].trim() : '';
        if (!endStr) return { expired: false };

        const match = endStr.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?/i);
        if (!match) return { expired: false };

        let endH = parseInt(match[1], 10);
        let endM = match[2] ? parseInt(match[2], 10) : 0;
        const ampm = match[3] ? match[3].toLowerCase().replace(/[^apm]/g, '') : null;

        if (ampm === 'pm' && endH < 12) endH += 12;
        if (ampm === 'am' && endH === 12) endH = 0;

        const shiftEndTime = new Date(now);
        shiftEndTime.setHours(endH, endM, 0, 0);

        const startStr = parts[0].trim();
        const startMatch = startStr.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?/i);
        if (startMatch) {
            let startH = parseInt(startMatch[1], 10);
            const startAmpm = startMatch[3] ? startMatch[3].toLowerCase().replace(/[^apm]/g, '') : null;
            if (startAmpm === 'pm' && startH < 12) startH += 12;
            if (startAmpm === 'am' && startH === 12) startH = 0;

            if (endH < startH) {
                shiftEndTime.setDate(shiftEndTime.getDate() + 1);
            }
        }

        if (now > shiftEndTime) {
            return { expired: true, shiftStr, shiftEndTime };
        }

        return { expired: false };
    } catch (e) {
        console.error("Error validando horario de turno en login:", e);
        return { expired: false };
    }
}

// Alert if opened as file
if (window.location.protocol === 'file:') {
    alert("¡ATENCIÓN! Estás abriendo la plataforma directamente como un archivo local (file:///).\n\nPor seguridad, el sistema de envío de correos (FormSubmit) bloquea estos envíos.\nDebes abrir la plataforma usando un servidor web local (ej. http://localhost:8080).");
}

document.addEventListener('DOMContentLoaded', () => {
    // Ya no usamos localStorage.getItem('riskOps_usersData') aquí.
    // La base de datos es ahora el backend.

    // Toggle Password Visibility
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');
    togglePasswordIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            const input = this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.remove('bx-show');
                this.classList.add('bx-hide');
            } else {
                input.type = 'password';
                this.classList.remove('bx-hide');
                this.classList.add('bx-show');
            }
        });
    });

    // --- 1. REGISTER LOGIC ---
    const registerForm = document.getElementById('registerForm');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            registerError.style.display = 'none';
            registerSuccess.style.display = 'none';

            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            const role = document.getElementById('regRole').value;

            if (password !== confirmPassword) {
                registerError.textContent = "Las contraseñas no coinciden.";
                registerError.style.display = 'block';
                return;
            }

            // Validar que se ingrese al menos nombre y apellido
            const nameWords = name.split(/\s+/).filter(w => w.length >= 2);
            if (nameWords.length < 2) {
                registerError.textContent = "Por favor, ingresa tu nombre y apellido completo (mínimo dos palabras).";
                registerError.style.display = 'block';
                return;
            }

            // Cambiar estado visual del botón
            const btn = registerForm.querySelector('button[type="submit"]');
            const prevText = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Registrando...";
            btn.disabled = true;

            let finalRole = (role === 'Supervisor') ? 'Supervisor' : 'Gestor';

            try {
                // 1. Create user in Firebase Auth
                const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;

                // 2. Save user profile in Realtime Database under users/${uid} (no password saved)
                const newUser = {
                    name: name,
                    email: email,
                    shift: "Por Asignar", // El turno se asigna por Excel
                    role: finalRole,
                    approved: false, // Ningún usuario puede auto-aprobarse en el registro
                    status: "pending",
                    registrationDate: new Date().toISOString()
                };
                
                await database.ref('users/' + user.uid).set(newUser);

                // Enviar notificación al supervisor si no es auto-aprobado
                if (!newUser.approved) {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = 'https://formsubmit.co/maria.sanchez@virtualsoft.tech';
                    form.target = '_blank';
                    
                    const fields = {
                        "Nombre": name,
                        "Correo": email,
                        "Rol_Solicitado": role,
                        "Mensaje": "Hay un nuevo usuario pendiente de aprobación en la plataforma Risk Manager.",
                        "_subject": `Nuevo Registro Pendiente: ${name}`,
                        "_captcha": "false",
                        "_next": window.location.href
                    };
                    
                    for (const key in fields) {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = key;
                        input.value = fields[key];
                        form.appendChild(input);
                    }
                    
                    document.body.appendChild(form);
                    form.submit();
                    document.body.removeChild(form);
                }

                registerSuccess.textContent = "¡Cuenta creada exitosamente! Redirigiendo al login...";
                registerSuccess.style.display = 'block';

                setTimeout(() => {
                    switchPanel('loginPanel');
                }, 2000);

            } catch(e) {
                console.error("Error Firebase al registrar:", e);
                let errMsg = "Error al crear la cuenta. Inténtalo de nuevo.";
                if (e.code === 'auth/email-already-in-use') {
                    errMsg = "Este correo ya está registrado.";
                } else if (e.code === 'auth/invalid-email') {
                    errMsg = "El correo no tiene un formato válido.";
                } else if (e.code === 'auth/weak-password') {
                    errMsg = "La contraseña debe tener al menos 6 caracteres.";
                }
                registerError.textContent = errMsg;
                registerError.style.display = 'block';
            } finally {
                btn.innerHTML = prevText;
                btn.disabled = false;
            }
        });
    }

    // --- 2. LOGIN LOGIC ---
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.style.display = 'none';
            
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            const btn = loginForm.querySelector('button[type="submit"]');
            const prevText = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Entrando...";
            btn.disabled = true;

            try {
                const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
                const user = userCredential.user;

                // Obtener perfil desde Realtime Database usando su UID de autenticación
                const snapshot = await database.ref('users/' + user.uid).once('value');
                let dbUser = snapshot.val();

                if (!dbUser) {
                    throw { code: 'user-data-missing' };
                }

                if (dbUser.approved === 'Rechazado') {
                    loginError.innerHTML = `Tu solicitud de cuenta ha sido rechazada.<br><small>Motivo: ${escapeHTML(dbUser.rejectionReason || 'No especificado')}</small>`;
                    loginError.style.display = 'block';
                    await firebase.auth().signOut();
                    return;
                }

                if (dbUser.approved === false) {
                    loginError.textContent = "Tu cuenta está pendiente de aprobación por un supervisor.";
                    loginError.style.display = 'block';
                    await firebase.auth().signOut();
                    return;
                }

                // Validar si el turno asignado ya finalizó hoy (Regla de negocio para Gestores)
                const shiftCheck = await checkShiftExpirationOnLogin(dbUser);
                if (shiftCheck && shiftCheck.expired) {
                    loginError.textContent = "Su turno ha finalizado";
                    loginError.style.display = 'block';
                    await firebase.auth().signOut();
                    localStorage.removeItem('riskOps_currentUser');
                    return;
                }

                // Get today's date string
                const dDate = new Date();
                const yyyy = dDate.getFullYear();
                const mm = String(dDate.getMonth() + 1).padStart(2, '0');
                const dd = String(dDate.getDate()).padStart(2, '0');
                const todayStr = `${yyyy}-${mm}-${dd}`;
                
                // Try to recover an existing login time from today's report or session
                let recoveredLoginTime = null;
                try {
                    const reportSnap = await database.ref(`reports_${todayStr}/${user.uid}`).once('value');
                    if (reportSnap.exists() && reportSnap.val().loginTime) {
                        recoveredLoginTime = reportSnap.val().loginTime;
                    } else {
                        const sessionSnap = await database.ref(`active_sessions/${user.uid}`).once('value');
                        if (sessionSnap.exists() && sessionSnap.val().loginTime) {
                            const sTime = new Date(sessionSnap.val().loginTime);
                            if (sTime.getDate() === dDate.getDate() && sTime.getMonth() === dDate.getMonth()) {
                                recoveredLoginTime = sessionSnap.val().loginTime;
                            }
                        }
                    }
                } catch(errRec) {
                    console.error("Error recuperando hora de inicio anterior", errRec);
                }
                
                const finalLoginTime = recoveredLoginTime || new Date().toISOString();

                // Configurar sesión local
                const sessionData = {
                    name: dbUser.name,
                    email: dbUser.email,
                    shift: dbUser.shift || "Por Asignar",
                    role: dbUser.role || "Gestor",
                    loginTime: finalLoginTime,
                    uid: user.uid
                };

                // Save login record to Firebase for history tracking
                try {
                    const logRef = database.ref('login_logs').push();
                    await logRef.set({
                        uid: user.uid,
                        name: dbUser.name,
                        role: dbUser.role || "Gestor",
                        email: dbUser.email,
                        timestamp: Date.now(),
                        logoutTime: null
                    });
                    
                    sessionData.loginLogId = logRef.key;
                    localStorage.setItem('riskOps_currentUser', JSON.stringify(sessionData));
                } catch(errLog) {
                    console.error("Error saving login log:", errLog);
                }
                
                // Redirigir al dashboard
                window.location.href = 'index.html';

            } catch(e) {
                console.error("Error al iniciar sesión:", e);
                let errMsg = "Correo o contraseña incorrectos. Si no tienes cuenta, regístrate.";
                if (e.code === 'auth/invalid-email') {
                    errMsg = "El correo no tiene un formato válido.";
                } else if (e.code === 'auth/user-disabled') {
                    errMsg = "Esta cuenta ha sido inhabilitada.";
                }
                loginError.textContent = errMsg;
                loginError.style.display = 'block';
            } finally {
                btn.innerHTML = prevText;
                btn.disabled = false;
            }
        });
    }

    // --- 3. FORGOT PASSWORD LOGIC ---
    const forgotForm = document.getElementById('forgotForm');
    const forgotMessage = document.getElementById('forgotMessage');

    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value.trim();
            
            const btn = forgotForm.querySelector('button[type="submit"]');
            const prevText = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Enviando...";
            btn.disabled = true;

            try {
                await firebase.auth().sendPasswordResetEmail(email);
            } catch (error) {
                console.warn("Password reset request logged:", error);
                // Si es un error de formato de email, sí podemos alertar
                if (error.code === 'auth/invalid-email') {
                    forgotMessage.style.color = 'var(--danger)';
                    forgotMessage.textContent = "El correo ingresado no tiene un formato válido.";
                    forgotMessage.style.display = 'block';
                    btn.innerHTML = prevText;
                    btn.disabled = false;
                    return;
                }
            }

            // Para mayor seguridad y evitar errores innecesarios, siempre mostramos un mensaje de éxito genérico
            forgotMessage.style.color = 'var(--success)';
            forgotMessage.textContent = `Si el correo '${email}' está registrado en la plataforma, recibirás un enlace de restablecimiento en unos instantes. Revisa tu bandeja de entrada o spam.`;
            forgotMessage.style.display = 'block';
            forgotForm.reset();
            btn.innerHTML = prevText;
            btn.disabled = false;
        });
    }
});
