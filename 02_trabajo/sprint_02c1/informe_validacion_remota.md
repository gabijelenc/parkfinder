# Informe de validación remota — Sprint 2C.1

Fecha: 2026-11-26. Proyecto autorizado: `parkfinder-dev` (`qerrmfdpxbjwmeprwrbc`). Repositorio de revisión: `gabijelenc/parkfinder`. Rama: `fix/sprint-02c-database-validation`. Base del PR: `improvements`.

## Resumen

Se aplicaron dos migraciones incrementales: `sprint_02c1_payment_extension_hardening` y `sprint_02c1_analytics_grouping_fix`. No se eliminaron tablas ni se relajaron políticas. La segunda migración corrige un error de ejecución que apareció al probar la nueva consulta de analítica mensual.

La auditoría remota final observó PostgreSQL 17.12, 24 tablas en `public`, RLS habilitado en 24/24 (0 sin RLS), 11 estacionamientos activos (8 comerciales y 3 QA), capacidad agregada de 729 y 729 plazas físicas activas. La tabla `booking_extension_quotes` está protegida por RLS y no concede acceso directo a `authenticated`.

## Evidencia

- Suite de regresión remota DB-T01..DB-T12: **12/12 PASS**. Incluye RLS/permisos, seed, creación Auth, disponibilidad, límites, pricing, expiración, aislamiento y extensión con cotización.
- Suite de hardening remota H01..H14: **14/14 PASS**. Incluye estados financieros, bloqueo Mercado Pago, cotizaciones válidas/vencidas/cambiadas, idempotencia, no disponibilidad, trazabilidad de vencimiento, analítica y grants.
- Carrera de extensión remota tras la última migración: dos llamadas MCP independientes y simultáneas usaron la misma cotización. Ambas devolvieron éxito; una fue replay idempotente. Se verificó **1** extensión, **1** evento de reserva, **1** evento de pago, **1** auditoría y monto pendiente igual al nuevo total.
- Los usuarios sintéticos de las suites se eliminaron o quedaron revertidos por transacción. La prueba paralela verificó residuo 0 para su usuario y reservas.
- También se aplicó `sprint_02c1_extension_revalidation`, que incorpora limpieza de holds vencidos, verificación final de horarios y actualización transaccional del payment pendiente. Las tres migraciones están registradas en Supabase.

## Hallazgos corregidos

1. La interfaz y el cliente aún enviaban la hora final directamente a `pf_extend_booking`, aunque la migración cambió el contrato a `p_quote_id`. Ahora la aplicación envía el `quoteId` del servidor y la suite DB-T11 sigue ese contrato.
2. La consulta mensual de `pf_get_my_analytics` agrupaba por posición 1, que PostgreSQL interpretaba como una expresión agregada JSON. La consulta se corrigió en la migración 06 y H11 pasó después.
3. La interfaz presentaba Mercado Pago como alternativa de demostración. Ahora los métodos son pago en el estacionamiento y pago simulado explícito; Mercado Pago Test queda pendiente de Sprint 2D.
5. El selector ahora deshabilita cambios durante la creación del hold y reconcilia la selección con el método persistido devuelto por el servidor.
4. La aceptación de extensión limpia holds vencidos bajo el bloqueo de instalación y vuelve a validar horarios. La actualización de reserva, payment pendiente, eventos de pago y total estimado queda en una transacción.
6. Los indicadores ahora exponen importe pendiente, simulado, aprobado externamente y reembolsado. La duración efectiva aparece como no disponible hasta que Sprint 3 registre check-in/check-out.

## Alcance y límites de verificación

Validación de base de datos ejecutada contra Supabase remoto. La prueba paralela fue una comprobación remota con dos llamadas independientes; no se incorporó como ejecución automatizada de CI. Cloudflare Preview: check del commit e6078f2 exitoso y deployment exitoso. URL: https://fix-sprint-02c-database-validation-parkfinder.gjelenc.workers.dev/. Se ejecutó validación funcional/visual parcial en navegador; los flujos autenticados quedaron bloqueados por límites de Supabase Auth. Ver 02_trabajo/sprint_02c1/qa_final/resultados.md. No se verificó el contrato vigente de Orders API ni se hizo llamada externa. No se ejecutaron pagos ni se habilitó el proveedor.

## Capacidad MCP

La conexión Supabase MCP permite escritura: se aplicaron las migraciones autorizadas. Durante la auditoría también se ejecutaron lecturas. Esta evidencia de escritura no implica que haya quedado activo un rol administrativo o una credencial en el repositorio.

## QA final del Preview — 2026-11-26

El Preview funcional se probó en navegador en escritorio (1440 × 900) y móvil (390 × 844). Búsqueda, filtros, ocho opciones comerciales, idioma español/inglés, temas claro/oscuro y rutas protegidas públicas se probaron. Se corrigió el solapamiento móvil del control de mapa. Cloudflare Workers Builds pasó para el commit `4aaab0a4de034df9b2597f56794ffdf9d9d51fc7`; URL: https://fix-sprint-02c-database-validation-parkfinder.gjelenc.workers.dev/.

Los dos usuarios sintéticos `qa.driver` y `qa.driver2` tienen perfil y rol `driver` en Supabase; las acciones autenticadas se hicieron con `qa.driver`. Se probaron login y logout, CRUD de vehículo (creación y edición), reserva con pago en cochera, pago simulado, extensión y aceptación de cotización, cancelación, historial e indicadores financieros. La UI confirmó la reserva de pago en cochera y se corrigió el recibo que antes mostraba «Simulado (demo)» para ese método; en el Preview actualizado mostró «Pagar en cochera». Se crearon cuatro reservas sintéticas en total y todas terminaron canceladas con liberación de cupo. El vehículo sintético `QAPF2611` permanece asociado al usuario QA. El registro de pago `demo_simulated` fue de prueba (`is_test=true`), sin proveedor externo ni dinero real; la reserva correspondiente se canceló. No se inició un flujo real de Mercado Pago y ese proveedor sigue deshabilitado.

La comunicación con Supabase se confirmó por login, perfil, vehículos, reservas, historial y métricas respaldados por el backend. El recorrido previo había observado cero errores de consola, pero no se capturaron logs durante la sesión autenticada. No se guardaron PNG en el repositorio; las capturas se inspeccionaron en el navegador. Las mediciones previas registraron cero overflow horizontal, controles observados con nombre accesible e imágenes con `alt`; no se completó auditoría integral de contraste/teclado.

**Conclusión:** los flujos autenticados del alcance Sprint 2C.1 se completaron con usuarios y datos sintéticos, y el check de Preview está en éxito. Antes de autorizar publicación definitiva o merge conviene que una persona revise los registros de prueba que permanecen (vehículo y pagos/booking históricos) y que se persista evidencia visual conforme al procedimiento del equipo. El PR #2 permanece abierto y sin merge; Mercado Pago sigue deshabilitado.
