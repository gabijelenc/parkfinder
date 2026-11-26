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
| H06 | Cotización válida; replay idempotente; un solo evento/auditoría y saldo pendiente actualizado | SQL remoto Supabase | PASS |
| H07 | Cotización vencida | SQL remoto Supabase | PASS |
| H08 | Cambio del precio invalida la cotización anterior | SQL remoto Supabase | PASS |
| H09 | Sin disponibilidad, se preserva la reserva original | SQL remoto Supabase | PASS |
| H10 | Expiración sincroniza booking/payment/events/audit | SQL remoto Supabase | PASS |
| H11 | Analítica financiera separada y duración efectiva no disponible | SQL remoto Supabase | PASS |
| H12 | Sin grants directos a la tabla de cotizaciones; RLS activo | SQL remoto Supabase | PASS |
| H13 | Dos extensiones concurrentes con la misma cotización | Dos sesiones MCP simultáneas remotas | PASS: replay idempotente; 1 extensión, evento reserva, evento pago, auditoría; saldo = total |
| H14 | Horarios cambiados entre cotización y aceptación | SQL remoto Supabase | PASS: rechaza y mantiene la reserva original |

## Casos críticos y cobertura explícita

La manipulación de importe se bloquea en el contrato porque `pf_extend_booking(uuid, uuid)` no recibe importes; el importe se vuelve a calcular en PostgreSQL. La prueba H05 inspecciona la firma y comprueba que el usuario autenticado no puede modificar directamente `payments`. La actualización de precio se comprueba en H08. Las extensiones pagas/simuladas requieren pago incremental y no se habilitan desde la interfaz. H06 confirma que el importe pendiente se incrementa con el nuevo total.

Pruebas ejecutadas: remotas SQL en Supabase y prueba remota paralela MCP. Pruebas locales de navegador y flujos visuales: **no ejecutadas**. Los checks de preview de Cloudflare en GitHub fallaron en commits del PR y no hay URL de preview ni evidencia de despliegue exitoso. El detalle de logs no es accesible mediante MCP; inspeccionarlo antes de aceptar el merge. El build log no pudo inspeccionarse vía MCP. Pruebas de MP reales o sandbox externo: **no ejecutadas y fuera de alcance**. No se usaron datos personales.
