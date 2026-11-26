# Backlog — transición 2C.1 → 2D

## Sprint 2C.1 completado para revisión

- [x] Cotización de extensión emitida y persistida por servidor.
- [x] Aceptación por quote UUID, revalidación y replay idempotente.
- [x] Separación de pago en estacionamiento y simulación.
- [x] Bloqueo de confirmación Mercado Pago en RPC demo.
- [x] Expiración coherente de hold, payment y auditoría.
- [x] Indicadores financieros con procedencia y tiempo efectivo no disponible.
- [x] Migraciones incrementales y pruebas SQL remotas.
- [x] Crear PR hacia `improvements` para revisión.

## Pendiente antes de integrar/aceptar

- [ ] Revisión humana del PR; no fusionado.
- [ ] Smoke test del cliente en móvil/escritorio y modos claro/oscuro.
- [ ] Confirmar comportamiento del selector de pago cuando ya existe un hold.
- [ ] Ejecutar pruebas de CI y pruebas del repositorio en checkout local.

## Sprint 2D — aún no iniciado

- [ ] Verificar contrato oficial vigente de Checkout Pro + Orders API para Argentina y cuenta de test.
- [ ] Diseñar Worker endpoint, validación de sesión y secreto de test.
- [ ] Crear orden server-side con importe de Supabase e idempotency key.
- [ ] Diseñar autenticación de webhook, verificación server-to-server y deduplicación.
- [ ] Crear RPC transaccional para aplicar eventos de proveedor y soportar estados tardíos/reembolsos.
- [ ] Pruebas de integración exclusivamente con cuenta de test; nunca credenciales/pagos reales.
- [ ] Reconciliación de órdenes pendientes y monitoreo sin exponer datos sensibles.
