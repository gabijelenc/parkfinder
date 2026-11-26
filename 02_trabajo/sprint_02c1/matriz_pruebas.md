# Matriz de pruebas — Sprint 2C.1

| ID | Caso | Tipo/entorno | Resultado |
|---|---|---|---|
| DB-T01–T03 | RLS, permisos mínimos, integridad del seed | SQL remoto Supabase | 3 PASS |
| DB-T04–T08 | Auth, disponibilidad, límites, concurrencia secuencial y paridad de precios | SQL remoto Supabase | 5 PASS |
| DB-T09–T10 | Vencimiento, aislamiento de usuario y RLS | SQL remoto Supabase | 2 PASS |
| DB-T11–T12 | Extensión con quoteId y contrato stub de MP | SQL remoto Supabase | 2 PASS |
| H01 | Confirmación pago en estacionamiento conserva payment pending | SQL remoto Supabase | PASS |
| H02 | Reintento no cambia método ni estado financiero | SQL remoto Supabase | PASS |
| H03 | Demo aprobado solo como `demo_simulated`, `is_test=true` | SQL remoto Supabase | PASS |
| H04 | Hold MP y confirmación MP por RPC demo bloqueados | SQL remoto Supabase | PASS |
| H05 | Firma de extensión solo acepta UUID de cotización; UPDATE directo a payments denegado | SQL remoto Supabase | PASS |
| H06 | Cotización válida; replay idempotente; un solo evento/auditoría | SQL remoto Supabase | PASS |
| H07 | Cotización vencida | SQL remoto Supabase | PASS |
| H08 | Cambio del precio invalida la cotización anterior | SQL remoto Supabase | PASS |
| H09 | Sin disponibilidad, se preserva la reserva original | SQL remoto Supabase | PASS |
| H10 | Expiración sincroniza booking/payment/events/audit | SQL remoto Supabase | PASS |
| H11 | Analítica financiera separada y duración efectiva no disponible | SQL remoto Supabase | PASS |
| H12 | Sin grants directos a la tabla de cotizaciones; RLS activo | SQL remoto Supabase | PASS |
| H13 | Dos extensiones concurrentes con la misma cotización | Dos sesiones MCP simultáneas remotas | PASS: dos respuestas exitosas, replay idempotente, 1 extensión/evento/auditoría |

## Casos críticos y cobertura explícita

La manipulación de importe se bloquea en el contrato porque `pf_extend_booking(uuid, uuid)` no recibe importes; el importe se vuelve a calcular en PostgreSQL. La prueba H05 inspecciona la firma y comprueba que el usuario autenticado no puede modificar directamente `payments`. La actualización de precio se comprueba en H08. Las extensiones pagas/simuladas requieren pago incremental y no se habilitan desde la interfaz.

Pruebas ejecutadas: remotas SQL en Supabase y prueba remota paralela MCP. Pruebas locales de navegador, flujos visuales, despliegue Cloudflare y CI: **no ejecutadas**. Pruebas de MP reales o sandbox externo: **no ejecutadas y fuera de alcance**. No se usaron datos personales.
