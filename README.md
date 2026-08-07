# Risk Manager Security Staging

## Nombre del Entorno
**Risk Manager Security Staging**

## Propósito
Entorno transitorio y desechable destinado **exclusivamente a la validación humana** (QA) de las remediaciones de seguridad, flujos de aislamiento y corrección de regresiones funcionales antes de pasarlas a producción.

## URL de GitHub Pages
[https://daniel-puentes109.github.io/riskmanager-security-staging/](https://daniel-puentes109.github.io/riskmanager-security-staging/)

## ⚠️ ADVERTENCIA: NO ES PRODUCCIÓN ⚠️
**Este entorno NO es de producción.** No debe almacenar datos reales recientes, ni credenciales activas, ni utilizarse para operativa real del negocio.

## Fuente de Verdad
La única fuente de verdad para el desarrollo y remediación es la rama `security/remediation` del repositorio principal `riesgovirtualsoft`. **Cualquier cambio directo en el repositorio de staging será sobreescrito y perdido.**

## Restricciones de Seguridad
Este repositorio **NUNCA** debe recibir ni contener:
- Archivos de variables de entorno (`.env`)
- Secretos, Tokens o Credenciales
- Volcados de base de datos (Dumps SQL/JSON)
- Reglas de Firebase
- Código fuente backend o de administración
- Mapeos de UIDs reales (`uid_mapping.json`)

## Activos Permitidos (Allowlist Resumida)
- Archivos raíz web estáticos: `index.html`, `login.html`, `app.js`, `login.js`, `styles.css`, `login.css`, `firebase-config.js`
- Carpetas estáticas: `js/`, `assets/`
- Documentos base sin PII (e.g. `procesos_list.json`, `Manual_Usuario_Penka.html`)

**Nota Excepcional (ACCEPTED_RISK_PHASE_1):**
Algunos archivos `.xlsx` operativos (como Tareas de Riesgo, Horarios, Cronogramas y Teletrabajo) permanecen temporalmente públicos en este entorno para asegurar la compatibilidad y evaluar el rendimiento UI. Esta deuda técnica será solucionada en la Fase 2 migrándolos a una base de datos autenticada.

## Procedimiento de Actualización
1. Todo cambio en código debe realizarse **primero** en el repositorio `riesgovirtualsoft` (rama `security/remediation`).
2. Se debe ejecutar localmente el script de construcción seguro (allowlist) para generar el artefacto `_site/`.
3. El script automáticamente empujará (push) el resultado a este repositorio (STAGING).

## Prohibición de Desarrollo Local
**ESTÁ TOTALMENTE PROHIBIDO usar este repositorio como origen o fuente de desarrollo.** Su único propósito es alojar los entregables de Staging generados automáticamente para GitHub Pages.
