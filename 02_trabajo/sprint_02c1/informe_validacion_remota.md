# Informe de validación remota — Sprint 2C.1

Fecha: 2026-11-26. Proyecto autorizado: `parkfinder-dev` (`qerrmfdpxbjwmeprwrbc`). Repositorio de revisión: `gabijelenc/parkfinder`. Rama: `fix/sprint-02c-database-validation`. Base del PR: `improvements`.

## Resumen

Se aplicaron dos migraciones incrementales: `sprint_02c1_payment_extension_hardening` y `sprint_02c1_analytics_grouping_fix`. No se eliminaron tablas ni se relajaron políticas. La segunda migración corrige un error de ejecución que apareció al probar la nueva consulta de analítica mensual.

La auditoría remota final observó PostgreSQL 17.12, 24 tablas en `public`, RLS habilitado en 24/24 (0 sin RLS), 11 estacionamientos activos (8 comerciales y 3 QA), capacidad agregada de 729 y 729 plazas físicas activas. La tabla `booking_extension_quotes` está protegida por RLS y no concede acceso directo a `authenticated`.

## Evidencia

- Suite de regresión remota DB-T01..DB-T12: **12/12 PASS**. Incluye RLS/permisos, seed, creación Auth, disponibilidad, límites, pricing, expiración, aislamiento y extensión con cotización.
- Suite de hardening remota H01..H12: **12/12 PASS**. Incluye estados financieros, bloqueo Mercado Pago, cotizaciones válidas/vencidas/cambiadas, idempotencia, no disponibilidad, trazabilidad de vencimiento, analítica y grants.
- Carrera de extensión remota: dos llamadas MCP independientes y simultáneas usaron la misma cotización. Ambas devolvieron éxito; una fue replay idempotente. Se verificó **1** extensión, **1** evento y **1** registro de auditoría.
- Los usuarios sintéticos de las suites se eliminaron o quedaron revertidos por transacción. La prueba paralela verificó residuo 0 para su usuario y reservas.
- Las migraciones aparecen registradas en Supabase con los nombres citados arriba.

## Hallazgos corregidos

1. La interfaz y el cliente aún enviaban la hora final directamente a `pf_extend_booking`, aunque la migración cambió el contrato a `p_quote_id`. Ahora la aplicación envía el `quoteId` del servidor y la suite DB-T11 sigue ese contrato.
2. La consulta mensual de `pf_get_my_analytics` agrupaba por posición 1, que PostgreSQL interpretaba como una expresión agregada JSON. La consulta se corrigió en la migración 06 y H11 pasó después.
3. La interfaz presentaba Mercado Pago como alternativa de demostración. Ahora los métodos son pago en el estacionamiento y pago simulado explícito; Mercado Pago Test queda pendiente de Sprint 2D.
4. Los indicadores ahora exponen importe pendiente, simulado, aprobado externamente y reembolsado. La duración efectiva aparece como no disponible hasta que Sprint 3 registre check-in/check-out.

## Alcance y límites de verificación

Validación de base de datos ejecutada contra Supabase remoto. La prueba paralela fue una comprobación remota con dos llamadas independientes; no se incorporó como ejecución automatizada de CI. No se probó la interfaz en navegador ni en la URL publicada. No se verificó el contrato vigente de Orders API con Mercado Pago ni se hizo llamada externa. No se ejecutaron pagos ni se habilitó el proveedor.

## Capacidad MCP

La conexión Supabase MCP permite escritura: se aplicaron las migraciones autorizadas. Durante la auditoría también se ejecutaron lecturas. Esta evidencia de escritura no implica que haya quedado activo un rol administrativo o una credencial en el repositorio.
