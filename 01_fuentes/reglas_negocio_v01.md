# Reglas de negocio — propuesta inicial

- Intervalos [inicio, fin): salida de una reserva puede coincidir con llegada de otra. Rechazar duración no positiva y fechas inválidas.
- Disponibilidad: capacidad compatible menos máximo de ocupación simultánea durante el intervalo; validar nuevamente al confirmar.
- Vehículos: Motorcycle, Car, SUV, Van. Compatibilidad según restricciones de cada estacionamiento; no duplicar capacidad compartida por categoría.
- Precio: cotización determinística en ARS y congelada al confirmar. Cambios futuros no alteran reservas confirmadas.
- Cancelación libera capacidad; check-in/out, no-show y penalidades requieren política explícita antes de aplicación real.
- Operador: no reducir capacidad por debajo de compromisos vigentes; registrar cambios y validar tarifas.
- localStorage solo simula persistencia en un navegador. Prevención multiusuario requiere transacciones/validación en servidor.
- Pagos, credenciales y webhooks se implementarán en infraestructura segura, no en HTML estático.
