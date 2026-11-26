# Registro de decisiones — Sprint 2C.1

| Decisión | Resolución | Motivo / evidencia |
|---|---|---|
| Aceptación de extensión | La previsualización crea cotización persistida con UUID, usuario, reserva, rango, moneda, importes y expiración de cinco minutos. La confirmación acepta únicamente `quote_id`. | Evitar confiar en importes del navegador; H05–H09 y H13. |
| Revalidación | Bajo bloqueo transaccional se verifican estado, propiedad, expiración, rango, total, disponibilidad, moneda y precio. | Precio/disponibilidad pueden cambiar entre preview y aceptación. |
| Idempotencia | Cotización aplicada devuelve el resultado ya registrado sin repetir extensión, evento ni auditoría. | H06 y carrera H13. |
| Pago en estacionamiento | Confirma la reserva; payment queda `pending`, `provider=pay_at_garage`, `is_test=true`. | No es un cobro procesado. |
| Pago simulado | Modalidad explícita `demo_simulated`; el registro aprobado lleva `is_test=true`, metadatos de simulación y evento propio. | No confundir una simulación con aprobación de proveedor. |
| Mercado Pago | No se puede crear hold ni confirmar por RPC demo. Sin integración activa. | Se reserva para Sprint 2D; H04. |
| Extensión de reservas prepagas | Bloqueada hasta resolver el pago incremental por un flujo verificado. | Evita ampliar una reserva sin cubrir el importe adicional. |
| Expiración | Un único helper marca la reserva vencida, cancela el pago pendiente y agrega eventos/auditoría. | H10 valida consistencia y liberación de capacidad. |
| Duración efectiva | API devuelve null y disponibilidad false hasta contar con eventos operativos. | No inferir ingreso/salida desde el horario reservado. |
| Arquitectura futura | Workers para backend de MP; Supabase conserva la fuente de datos. Checkout Pro en test; Orders API seleccionada por el equipo y contrato oficial específico pendiente. | Ninguna credencial ni llamada externa en este sprint. |
