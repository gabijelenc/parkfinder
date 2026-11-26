# Preparación técnica para Sprint 2D

## Conclusión

La capa de base de datos de Sprint 2C.1 queda **técnicamente lista para revisión y para iniciar el diseño de Sprint 2D**, con el proveedor todavía deshabilitado. La extensión requiere cotización de servidor aceptada, pago demo/Mercado Pago están separados, el vencimiento conserva ledger consistente y las pruebas críticas remotas pasaron. Esto no equivale a tener una integración de pagos lista ni a aprobar la integración de producción.

## Criterios comprobados

- Cotización persistida y aceptada por UUID; importe recalculado server-side.
- Expiración/cambio de precio detectados; falta de disponibilidad conserva el final original.
- Extensión idempotente bajo llamadas concurrentes.
- RPC demo no confirma Mercado Pago; método no puede cambiar en la confirmación.
- Pago en estacionamiento sigue pendiente; simulación es `demo_simulated` y `is_test=true`.
- Permisos directos de payments y quotes limitados; RLS 24/24.
- Expiración de hold actualiza reserva, pago y eventos de auditoría.
- Analítica separa importes; horas efectivas no disponibles.

## Riesgos y pendientes antes de aceptar cambios

- La UI no recibió smoke test visual/funcional en navegador y todavía debe verificarse en móvil, escritorio, claro y oscuro.
- El contrato oficial de Orders API sigue pendiente de verificación.
- No se hizo despliegue ni smoke test en Cloudflare.
- El funcionamiento de webhook, reconciliación, pago tardío y reembolso pertenece a Sprint 2D y no está implementado.
- No fusionar este PR automáticamente.

## Próximo paso

Revisar el PR hacia `improvements`, correr CI y el smoke test de la interfaz. Luego puede iniciarse Sprint 2D como trabajo de arquitectura/contrato en entorno de pruebas, manteniendo Checkout Pro deshabilitado hasta implementar y validar Worker, autenticidad de webhook e idempotencia transaccional.
