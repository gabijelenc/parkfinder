# Arquitectura objetivo para Sprint 2D

## Componentes acordados

- **Aplicación:** cliente parkFinder; no calcula el importe final ni aprueba pagos.
- **Backend previsto:** Cloudflare Workers como único componente autorizado a comunicarse con Mercado Pago.
- **Datos y estado central:** Supabase/PostgreSQL. La reserva, el importe, el estado financiero y el ledger permanecen centralizados.
- **Checkout:** Mercado Pago Checkout Pro en entorno de pruebas. La opción seleccionada en la aplicación de Mercado Pago es la API de Orders; el contrato oficial específico de Orders aún debe verificarse antes de implementar.
- **Credenciales:** secretos del backend (Workers Secrets), nunca en HTML, bundle, base de datos accesible al cliente, historial Git o logs.
- **Confirmación:** comunicación servidor a servidor. Un redirect del navegador no es evidencia de pago.
- **Webhooks:** autenticar y validar la firma/autenticidad; validar merchant/order/importe/moneda/estado y relacionar la notificación con la orden esperada.
- **Idempotencia:** clave estable de creación de orden y deduplicación durable de eventos/notificaciones. La transición de pago y reserva debe ser transaccional en Supabase.
- **Conciliación:** conservar estados pendientes, tardíos, rechazados y reembolsados; no convertir reservas confirmadas en pagos aprobados.

## Secuencia futura propuesta

1. Cloudflare Worker valida sesión y reserva pendiente en Supabase.
2. Worker crea orden de Checkout Pro en test con importe leído del servidor e idempotency key.
3. El cliente recibe solo la URL/identificador necesario para continuar el checkout.
4. Webhook autenticado llega al Worker; el Worker consulta/verifica la orden con Mercado Pago.
5. Worker ejecuta RPC transaccional de Supabase para guardar evento idempotente y actualizar payment/booking según el estado verificado.
6. Un proceso de conciliación vuelve a consultar órdenes pendientes/tardías.

## Límites de Sprint 2C.1

No se implementa integración, secretos, Orders API, webhook, checkout externo ni pagos. Antes de Sprint 2D, verificar contra la documentación oficial vigente los campos, firma, idempotency contract, eventos de Orders API y Checkout Pro para la cuenta/país de prueba. No agregar credenciales de producción.
