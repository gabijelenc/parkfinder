# Preparación técnica para Sprint 2D

## Conclusión

La capa de base de datos de Sprint 2C.1 queda **técnicamente lista para revisión y para iniciar el diseño de Sprint 2D**, con el proveedor todavía deshabilitado. La extensión requiere cotización de servidor aceptada, limpia holds vencidos y revalida horarios al aceptar; el ledger pendiente se ajusta en transacción. Pago demo/Mercado Pago están separados y las pruebas críticas remotas pasaron. Esto no equivale a tener una integración de pagos lista ni a aprobar la integración de producción.

## Criterios comprobados

- Cotización persistida y aceptada por UUID; importe recalculado server-side.
- Expiración/cambio de precio detectados; falta de disponibilidad conserva el final original.
- Extensión idempotente bajo llamadas concurrentes.
- RPC demo no confirma Mercado Pago; método no puede cambiar en la confirmación.
- Pago en estacionamiento sigue pendiente; simulación es `demo_simulated` y `is_test=true`.
- Permisos directos de payments y quotes limitados; RLS 24/24.
- Expiración de hold actualiza reserva, pago y eventos de auditoría.
- Al aceptar una extensión se limpia un hold solapado vencido, se valida horario, y el pago pendiente refleja el nuevo total.
- Analítica separa importes; horas efectivas no disponibles.

## Riesgos y pendientes antes de aceptar cambios

- La UI no recibió smoke test visual/funcional en navegador y todavía debe verificarse en móvil, escritorio, claro y oscuro.
- El check de vista previa de Cloudflare falló para commits previos del PR; no hay URL de preview ni evidencia de despliegue exitoso. El log no es accesible mediante MCP. No aceptar merge hasta diagnosticar el check del último commit.
- El contrato oficial de Orders API sigue pendiente de verificación.
- No se publicó el Worker ni se hizo smoke test; solo se disparó la verificación automática de preview del PR, que falló en ejecuciones previas.
- El funcionamiento de webhook, reconciliación, pago tardío y reembolso pertenece a Sprint 2D y no está implementado.
- No fusionar este PR automáticamente.

## Próximo paso

Revisar el PR hacia `improvements`, correr CI y el smoke test de la interfaz. Sprint 2D no se inicia como parte de esta entrega; si se autoriza por separado, el primer trabajo será verificar el contrato vigente y diseñar Worker/webhook en entorno de pruebas, manteniendo Checkout Pro deshabilitado hasta implementar y validar la autenticidad, verificación server-to-server e idempotencia transaccional.
