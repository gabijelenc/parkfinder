# Registro de decisiones — Sprint 2C.1

| Decisión | Resolución | Motivo / evidencia |
|---|---|---|
| Aceptación de extensión | La previsualización crea cotización persistida con UUID, usuario, reserva, rango, moneda, importes y expiración de cinco minutos. La confirmación acepta únicamente `quote_id`. | Evitar confiar en importes del navegador; H05–H09 y H13. |
| Revalidación | Bajo bloqueo transaccional se verifican estado, propiedad, expiración, rango, total, disponibilidad, moneda y precio. | Precio/disponibilidad pueden cambiar entre preview y aceptación. |
| Idempotencia | Cotización aplicada devuelve el resultado ya registrado sin repetir extensión, evento ni auditoría. | H06 y prueba paralela remota posterior a la migración 08. |
| Saldo pendiente | Al extender una reserva pay-at-garage, el payment pendiente se incrementa en la misma transacción; pagos ya aprobados bloquean la extensión hasta que exista pago incremental verificado. | H06 y prueba paralela. |
| Pago en estacionamiento | Confirma la reserva; payment queda `pending`, `provider=pay_at_garage`, `is_test=true`. | No es un cobro procesado. |
| Pago simulado | Modalidad explícita `demo_simulated`; el registro aprobado lleva `is_test=true`, metadatos de simulación y evento propio. | No confundir una simulación con aprobación de proveedor. |
| Mercado Pago | No se puede crear hold ni confirmar por RPC demo. Sin integración activa. | Se reserva para Sprint 2D; H04. |
| Extensión de reservas prepagas | Bloqueada hasta resolver el pago incremental por un flujo verificado. | Evita ampliar una reserva sin cubrir el importe adicional. |
| Expiración | El helper común marca reserva vencida, cancela payment pendiente y agrega eventos/auditoría. La aceptación de una extensión ejecuta limpieza bajo lock antes de asignar plaza. | H10 y H13. |
| Duración efectiva | API devuelve null y disponibilidad false hasta contar con eventos operativos. | No inferir ingreso/salida desde el horario reservado. |
| Revalidación | La aceptación vuelve a comprobar horarios operativos y disponibilidad bajo el bloqueo de instalación. | H13–H14. |
| Arquitectura futura | Workers para backend de MP; Supabase conserva la fuente de datos. Checkout Pro en test; Orders API seleccionada por el equipo y contrato oficial específico pendiente. | Ninguna credencial ni llamada externa en este sprint. |
