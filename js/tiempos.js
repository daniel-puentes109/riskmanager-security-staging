let chartTopAlertaInstance = null;
let chartTopExcelenciaInstance = null;
let chartTopInactividadInstance = null;
let chartScatterInstance = null;

function parseShiftStart(shiftStr) {
    if (!shiftStr) return null;
    
    const s = shiftStr.toLowerCase();
    
    // Explicit format matching (e.g. "8:00 am")
    const m = shiftStr.match(/(\d{1,2}):(\d{2})\s*([ap]\.?\s*m\.?)?/i);
    if (m) {
        let h = parseInt(m[1], 10);
        let min = parseInt(m[2], 10);
        let ampm = m[3] ? m[3].toLowerCase().replace(/[^apm]/g, '') : null;
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        return { h, min };
    }

    // Heuristics based on historical sets
    if (s.includes('tarde')) {
        if (s.includes('set 1') || s.includes('soporte 1')) return { h: 15, min: 0 };
        if (s.includes('set 2') || s.includes('soporte 2')) return { h: 19, min: 0 };
    } else if (s.includes('sábado') || s.includes('sabado') || s.includes('domingo')) {
        if (s.includes('set 1')) return { h: 8, min: 0 };
        if (s.includes('set 2')) return { h: 15, min: 0 };
        if (s.includes('set 3')) return { h: 19, min: 0 };
    } else if (s.includes('mañana') || s.includes('manana')) {
        return { h: 8, min: 0 };
    }
    
    // General fallback
    if (s.includes('set 1') || s.includes('soporte 1')) return { h: 8, min: 0 };
    if (s.includes('set 2') || s.includes('soporte 2')) return { h: 14, min: 0 };
    if (s.includes('set 3')) return { h: 15, min: 0 };
    if (s.includes('set 4')) return { h: 22, min: 0 };
    return null;
}

function parseTimeFromLocaleString(timeStr) {
    if (!timeStr) return null;
    // Soporta: "16/6/2026, 14:05:00" o "6/16/2026, 2:05:00 p. m."
    const m = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?\s*m\.?)?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let min = parseInt(m[2], 10);
    let ampm = m[3] ? m[3].toLowerCase().replace(/[^apm]/g, '') : null;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return { h, min };
}

function getTardiness(loginLocaleStr, shiftStr, permisos = []) {
    if (!shiftStr || shiftStr === 'Por Asignar' || shiftStr === 'Descansa' || shiftStr === 'N/A') return 0;
    
    let sched = parseShiftStart(shiftStr);
    const actual = parseTimeFromLocaleString(loginLocaleStr);
    
    if (!sched || !actual) return 0;
    
    // Adjust schedule based on approved permissions
    if (permisos && permisos.length > 0) {
        for (const p of permisos) {
            const hFin = p.horaFin || p.Hora_Fin;
            if (hFin) {
                const parts = hFin.split(':');
                if (parts.length >= 2) {
                    const ph = parseInt(parts[0], 10);
                    const pm = parseInt(parts[1], 10);
                    if (!isNaN(ph) && !isNaN(pm)) {
                        const pTotal = ph * 60 + pm;
                        const sTotal = sched.h * 60 + sched.min;
                        // If permission extends their start time, move the scheduled time to the permission's end time
                        if (pTotal > sTotal) {
                            sched = { h: ph, min: pm };
                        }
                    }
                }
            } else if (p.tipo === 'Vacaciones' || p.tipo === 'Falta Justificada' || p.tipo === 'Calamidad') {
                // If it's a full day absence without specific hours, they can't be late.
                return 0;
            }
        }
    }
    
    let diff = (actual.h * 60 + actual.min) - (sched.h * 60 + sched.min);
    
    if (diff < -12 * 60) {
        diff += 24 * 60; // Cross-midnight late login
    }
    
    // Ignore early logins (diff < 0) or extremely late logins (> 12 hours)
    if (diff > 0 && diff < 12 * 60) {
        return diff;
    }
    return 0;
}

window.toggleTiemposCustomDates = function() {
    const filter = document.getElementById('tiemposDateFilter').value;
    const container = document.getElementById('tiemposCustomDateContainer');
    if (filter === 'custom') {
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
};

async function loadTiemposMetrics() {
    try {
        // Asegurarnos de que el horario global esté cargado para resolver turnos históricos
        if (!globalScheduleRows) {
            await loadSchedule();
        }
        
        const [snapshot, permSnapshot] = await Promise.all([
            database.ref('shift_reports').once('value'),
            database.ref('permissions').once('value')
        ]);
        const data = snapshot.val();
        if (!data) return;
        
        const permsData = permSnapshot.val() || {};
        const allPermisos = Object.values(permsData).filter(p => p.status === 'Aprobado');
        
        const dateFilter = document.getElementById('tiemposDateFilter').value;
        const gestorFilter = document.getElementById('tiemposGestorFilter').value;
        const gestorDropdown = document.getElementById('tiemposGestorFilter');
        
        const gestorStats = {};
        const uniqueGestores = new Set();
        
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfDay - (24 * 60 * 60 * 1000);
        const sevenDaysAgo = startOfDay - (7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = startOfDay - (30 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();

        const customStartStr = document.getElementById('tiemposDateStart') ? document.getElementById('tiemposDateStart').value : null;
        const customEndStr = document.getElementById('tiemposDateEnd') ? document.getElementById('tiemposDateEnd').value : null;
        let customStartTs = null;
        let customEndTs = null;
        if (customStartStr) customStartTs = new Date(customStartStr + 'T00:00:00').getTime();
        if (customEndStr) customEndTs = new Date(customEndStr + 'T23:59:59').getTime();
        
        Object.values(data).forEach(report => {
            if (report.rol !== 'Gestor') return;
            
            const gestorName = report.gestor;
            uniqueGestores.add(gestorName);
            
            // Apply Date Filter
            const reportDate = report.timestamp ? new Date(report.timestamp) : new Date();
            const reportTime = reportDate.getTime();
            
            if (dateFilter === 'today' && reportTime < startOfDay) return;
            if (dateFilter === 'yesterday' && (reportTime < startOfYesterday || reportTime >= startOfDay)) return;
            if (dateFilter === '7' && reportTime < sevenDaysAgo) return;
            if (dateFilter === '30' && reportTime < thirtyDaysAgo) return;
            if (dateFilter === 'thisMonth' && reportTime < startOfMonth) return;
            if (dateFilter === 'lastMonth' && (reportTime < startOfLastMonth || reportTime > endOfLastMonth)) return;
            if (dateFilter === 'custom') {
                if (customStartTs && reportTime < customStartTs) return;
                if (customEndTs && reportTime > customEndTs) return;
            }
            
            // Apply Gestor Filter
            if (gestorFilter !== 'all' && gestorName !== gestorFilter) return;
            
            // Format reportDate to YYYY-MM-DD for permission matching
            const yyyy = reportDate.getFullYear();
            const mm = String(reportDate.getMonth() + 1).padStart(2, '0');
            const dd = String(reportDate.getDate()).padStart(2, '0');
            const reportDateStr = `${yyyy}-${mm}-${dd}`;
            
            const gestorPermisos = allPermisos.filter(p => p.gestor === gestorName && p.fecha === reportDateStr);
            
            // Determine grouping key
            let groupKey = gestorName;
            if (gestorFilter !== 'all') {
                const d = new Date(reportDate);
                groupKey = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
            }
            
            if (!gestorStats[groupKey]) {
                gestorStats[groupKey] = {
                    Dias_Laborados: 0,
                    Dias_Tarde: 0,
                    Minutos_Tarde_Total: 0,
                    Minutos_Inactividad_Total: 0,
                    gestorName: gestorName // Keep for reference
                };
            }
            
            // Determinar turno programado (historico vs nuevo formato)
            let turno = report.turnoProgramado || report.setTrabajado;
            if (!turno || turno === 'Por Asignar') {
                turno = getShiftForDate(globalScheduleRows, globalScheduleBlocks, gestorName, reportDate);
            }
            
            // Tardanza
            const tardiness = getTardiness(report.horaInicio, turno, gestorPermisos);
            
            gestorStats[groupKey].Dias_Laborados++;
            gestorStats[groupKey].Minutos_Inactividad_Total += (report.inactividadTotalMins || 0);
            
            if (tardiness > 0) {
                gestorStats[groupKey].Dias_Tarde++;
                gestorStats[groupKey].Minutos_Tarde_Total += tardiness;
            }
        });
        
        // Populate Gestor Dropdown if it only has the 'all' option
        if (gestorDropdown && gestorDropdown.options.length <= 1) {
            const sortedGestores = Array.from(uniqueGestores).sort();
            sortedGestores.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = g;
                gestorDropdown.appendChild(opt);
            });
            // Keep the selected value if it was previously set
            gestorDropdown.value = gestorFilter;
        }

        // Final calculations
        const metrics = [];
        let grandTotalDias = 0;
        let grandTotalTarde = 0;
        let grandTotalInact = 0;
        
        Object.keys(gestorStats).forEach(key => {
            const stats = gestorStats[key];
            if (stats.Dias_Laborados === 0) return;
            
            const Prom_Minutos_Tarde = stats.Minutos_Tarde_Total / stats.Dias_Laborados;
            const Porcentaje_Frecuencia_Tarde = (stats.Dias_Tarde / stats.Dias_Laborados) * 100;
            const Prom_Inactividad_Diaria = stats.Minutos_Inactividad_Total / stats.Dias_Laborados;
            
            let Score_Tardanza = 40;
            if (Prom_Minutos_Tarde <= 3) Score_Tardanza = 100;
            else if (Prom_Minutos_Tarde <= 10) Score_Tardanza = 70;
            
            let Score_Inactividad = 20;
            if (Prom_Inactividad_Diaria <= 20) Score_Inactividad = 100;
            else if (Prom_Inactividad_Diaria <= 45) Score_Inactividad = 60;
            
            metrics.push({
                gestor: key,
                gestorName: stats.gestorName,
                ...stats,
                Prom_Minutos_Tarde,
                Porcentaje_Frecuencia_Tarde,
                Prom_Inactividad_Diaria,
                Score_Tardanza,
                Score_Inactividad
            });
            
            grandTotalDias += stats.Dias_Laborados;
            grandTotalTarde += stats.Minutos_Tarde_Total;
            grandTotalInact += stats.Minutos_Inactividad_Total;
        });
        
        // Update top global KPIs
        document.getElementById('tiemposTotalDias').textContent = grandTotalDias;
        document.getElementById('tiemposTotalMinsTarde').textContent = Math.round(grandTotalTarde) + ' min';
        document.getElementById('tiemposTotalMinsInact').textContent = Math.round(grandTotalInact) + ' min';
        
        renderTiemposDashboard(metrics);
        
    } catch(e) {
        console.error("Error loading Tiempos metrics", e);
    }
}

function renderTiemposDashboard(metrics) {
    if (typeof Chart === 'undefined') return;
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }
    
    // Sort logic
    const topAlerta = [...metrics].sort((a, b) => b.Minutos_Tarde_Total - a.Minutos_Tarde_Total).slice(0, 5);
    const topExcelencia = [...metrics].sort((a, b) => a.Minutos_Tarde_Total - b.Minutos_Tarde_Total).slice(0, 5).reverse();
    const topInactividad = [...metrics].sort((a, b) => b.Minutos_Inactividad_Total - a.Minutos_Inactividad_Total);
    
    // Clean old instances
    if(chartTopAlertaInstance) chartTopAlertaInstance.destroy();
    if(chartTopExcelenciaInstance) chartTopExcelenciaInstance.destroy();
    if(chartTopInactividadInstance) chartTopInactividadInstance.destroy();
    if(chartScatterInstance) chartScatterInstance.destroy();
    
    const gestorFilterEl = document.getElementById('tiemposGestorFilter');
    const isSingleGestor = gestorFilterEl && gestorFilterEl.value !== 'all';
    
    const labelTardanza = isSingleGestor ? 'Días con Más Tardanza' : 'Más Tarde al Turno';
    const labelExcelencia = isSingleGestor ? 'Días con Menos Tardanza' : 'Más Temprano al Turno';
    const labelInactividad = isSingleGestor ? 'Inactividad por Día' : 'Promedio Inactividad Diaria';
    
    // 1. Chart Top Alerta
    const ctxAlerta = document.getElementById('chartTopAlerta').getContext('2d');
    chartTopAlertaInstance = new Chart(ctxAlerta, {
        type: 'bar',
        data: {
            labels: topAlerta.map(m => {
                let parts = m.gestor.split(' ');
                if (parts.length >= 3) {
                    return parts[0] + ' ' + parts[parts.length - 2];
                }
                return m.gestor;
            }),
            datasets: [{
                label: labelTardanza,
                data: topAlerta.map(m => m.Minutos_Tarde_Total),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: '#ef4444',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { right: 40 } },
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    color: '#ef4444',
                    font: { weight: 'bold', size: 11 },
                    formatter: function(value) { return Math.round(value) + ' m'; }
                }
            }, 
            scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#6B7280' } }, y: { grid: { display: false }, ticks: { color: '#4B5563', font: { weight: 'bold' } } } } 
        }
    });

    // 2. Chart Top Excelencia
    const ctxExcelencia = document.getElementById('chartTopExcelencia').getContext('2d');
    chartTopExcelenciaInstance = new Chart(ctxExcelencia, {
        type: 'bar',
        data: {
            labels: topExcelencia.map(m => {
                let parts = m.gestor.split(' ');
                if (parts.length >= 3) {
                    return parts[0] + ' ' + parts[parts.length - 2];
                }
                return m.gestor;
            }),
            datasets: [{
                label: labelExcelencia,
                data: topExcelencia.map(m => m.Minutos_Tarde_Total),
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: '#10b981',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { right: 40 } },
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    color: '#10b981',
                    font: { weight: 'bold', size: 11 },
                    formatter: function(value) { return Math.round(value) + ' m'; }
                }
            }, 
            scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#6B7280' } }, y: { grid: { display: false }, ticks: { color: '#4B5563', font: { weight: 'bold' } } } } 
        }
    });

    // 3. Chart Top Inactividad Diaria
    const ctxInactividad = document.getElementById('chartTopInactividad').getContext('2d');
    chartTopInactividadInstance = new Chart(ctxInactividad, {
        type: 'bar',
        data: {
            labels: topInactividad.map(m => {
                let parts = m.gestor.split(' ');
                if (parts.length >= 3) {
                    return parts[0] + ' ' + parts[parts.length - 2];
                }
                return m.gestor;
            }),
            datasets: [{
                label: labelInactividad,
                data: topInactividad.map(m => m.Minutos_Inactividad_Total),
                backgroundColor: topInactividad.map(m => {
                    if(m.Minutos_Inactividad_Total > 45) return 'rgba(239, 68, 68, 0.7)';
                    if(m.Minutos_Inactividad_Total > 20) return 'rgba(245, 158, 11, 0.7)';
                    return 'rgba(16, 185, 129, 0.7)';
                }),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 25 } },
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    color: '#4B5563',
                    font: { weight: 'bold', size: 11 },
                    formatter: function(value) { return Math.round(value) + ' min'; }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#6B7280' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#4B5563', font: { weight: 'bold' }, autoSkip: false, maxRotation: 45, minRotation: 45 }
                }
            }
        }
    });

    // 4. Scatter Plot Cuadrantes
    const ctxScatter = document.getElementById('chartScatterCuadrantes').getContext('2d');
    chartScatterInstance = new Chart(ctxScatter, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Gestores',
                data: metrics.map(m => ({
                    x: m.Minutos_Tarde_Total,
                    y: m.Minutos_Inactividad_Total,
                    name: m.gestor.split(' ')[0]
                })),
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: '#3b82f6',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20, right: 20 } },
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `${ctx.raw.name}: Tarde ${ctx.raw.x}m, Inact ${ctx.raw.y}m`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Total Tardanza (min)', color: '#6B7280', font: { weight: 'bold' } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#6B7280' }
                },
                y: {
                    title: { display: true, text: 'Total Inactividad (min)', color: '#6B7280', font: { weight: 'bold' } },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#6B7280' }
                }
            }
        }
    });

    // 5. Llenar la tabla del Leaderboard
    const tbody = document.getElementById('tiemposLeaderboardBody');
    const tableTitle = document.getElementById('tiemposLeaderboardTitle');
    
    if (tableTitle) {
        tableTitle.innerHTML = isSingleGestor ? `<i class='bx bx-calendar-event'></i> Desglose por Día` : `<i class='bx bx-list-ol'></i> Ranking Detallado de Cumplimiento Operativo`;
    }

    if (tbody) {
        tbody.innerHTML = '';
        
        if (isSingleGestor && metrics.length > 0) {
            // Desglose por Día para un solo gestor
            let dailyMetrics = metrics[0].Detalle_Dias || [];
            // Ordenar por fecha descendente
            dailyMetrics.sort((a, b) => b.fecha.localeCompare(a.fecha));
            
            if (dailyMetrics.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay datos suficientes</td></tr>';
            } else {
                dailyMetrics.forEach(d => {
                    let Score_Tardanza = 40;
                    if (d.tardeMins <= 3) Score_Tardanza = 100;
                    else if (d.tardeMins <= 10) Score_Tardanza = 70;
                    
                    let Score_Inactividad = 20;
                    if (d.inactMins <= 20) Score_Inactividad = 100;
                    else if (d.inactMins <= 45) Score_Inactividad = 60;
                    
                    const totalScore = Score_Tardanza + Score_Inactividad;
                    let badgeColor = 'var(--success)';
                    if (totalScore < 140) badgeColor = 'var(--warning)';
                    if (totalScore < 100) badgeColor = 'var(--danger)';

                    let tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <i class='bx bx-calendar' style="color: var(--accent-primary); font-size: 18px;"></i>
                            ${d.fecha}
                        </td>
                        <td style="text-align: center; color: var(--text-secondary);">1 turno</td>
                        <td style="text-align: center;">
                            <span style="color: ${d.tardeMins > 10 ? 'var(--danger)' : 'var(--text-primary)'};">
                                ${Math.round(d.tardeMins)} min
                            </span>
                        </td>
                        <td style="text-align: center;">
                            <span style="color: ${d.inactMins > 45 ? 'var(--danger)' : 'var(--text-primary)'};">
                                ${Math.round(d.inactMins)} min
                            </span>
                        </td>
                        <td style="text-align: center;">
                            <span class="badge" style="background-color: ${badgeColor}; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 10px;">
                                ${totalScore} pts
                            </span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } else {
            // Ranking global de todos los gestores
            let sortedMetrics = [...metrics];
            sortedMetrics.sort((a, b) => {
                const scoreA = a.Score_Tardanza + a.Score_Inactividad;
                const scoreB = b.Score_Tardanza + b.Score_Inactividad;
                return scoreB - scoreA;
            });

            if (sortedMetrics.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay datos suficientes</td></tr>';
            } else {
                sortedMetrics.forEach(m => {
                    const totalScore = m.Score_Tardanza + m.Score_Inactividad;
                    let badgeColor = 'var(--success)';
                    if (totalScore < 140) badgeColor = 'var(--warning)';
                    if (totalScore < 100) badgeColor = 'var(--danger)';

                    let tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <i class='bx bx-user-circle' style="color: var(--accent-primary); font-size: 18px;"></i>
                            ${m.gestor}
                        </td>
                        <td style="text-align: center; color: var(--text-secondary);">${m.Dias_Laborados} días</td>
                        <td style="text-align: center;">
                            <span style="color: ${m.Prom_Minutos_Tarde > 10 ? 'var(--danger)' : 'var(--text-primary)'};">
                                ${Math.round(m.Prom_Minutos_Tarde)} min/día
                            </span>
                        </td>
                        <td style="text-align: center;">
                            <span style="color: ${m.Prom_Inactividad_Diaria > 45 ? 'var(--danger)' : 'var(--text-primary)'};">
                                ${Math.round(m.Prom_Inactividad_Diaria)} min/día
                            </span>
                        </td>
                        <td style="text-align: center;">
                            <span class="badge" style="background-color: ${badgeColor}; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 10px;">
                                ${totalScore} pts
                            </span>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }
    }
}
