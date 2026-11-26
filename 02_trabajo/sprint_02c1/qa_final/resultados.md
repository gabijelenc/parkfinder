# Resultados de QA final — Sprint 2C.1

- Fecha: 2026-11-26
- Repositorio: gabijelenc/parkfinder
- Rama: fix/sprint-02c-database-validation
- Commit visual final: e6078f2989732cd9dd9c1ffe70795b1d266f22e3
- Preview: https://fix-sprint-02c-database-validation-parkfinder.gjelenc.workers.dev/
- Cloudflare Workers Builds: **success** (build y deployment).
- Uso de datos: solo datos sintéticos; se tuvo en cuenta que Preview y Producción comparten la base.

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia/observación |
|---|---|---|
| Conexión con Supabase | PASS | UI muestra backend centralizado; login, perfil, vehículos, reservas, historial y métricas respondieron a través de Supabase. |
| Ocho estacionamientos comerciales | PASS visual | Se mostraron las ocho opciones comerciales sintéticas. |
| Perfiles/roles de ambos usuarios | PASS (lectura previa) | `qa.driver@parkfinder.example` y `qa.driver2@parkfinder.example` tienen perfil y rol `driver`. |
| Registro | NO EJECUTADO en esta pasada | Los usuarios ya habían sido creados y auto-confirmados por el usuario. |
| Inicio de sesión | PASS | Se inició sesión con `qa.driver@parkfinder.example`; perfil autenticado visible. |
| Gestión de vehículos | PASS parcial | Se creó y editó vehículo sintético `QAPF2611`; queda persistido en la cuenta QA. No se borró. |
| Búsqueda y filtros | PASS | Palermo Soho reordenó resultados; precio máximo ARS 10.000 dio 4 resultados; disponibilidad + carga EV dio 2. |
| Crear reserva | PASS | Se crearon reservas sintéticas en el backend y se verificaron códigos en historial. |
| Pago en estacionamiento | PASS | Reserva persistida con método `pay_at_garage`; tras el fix el recibo mostró «Pagar en cochera». |
| Pago simulado | PASS | Se creó con `demo_simulated`, `is_test=true`; sin cobro externo. Su reserva luego fue cancelada. |
| Mercado Pago deshabilitado | PASS / sin transacción | No se activó ni se llamó el proveedor. La preferencia se presenta como preparada para Sprint 2D. |
| Extensión y aceptación de cotización | PASS | Reserva extendida; se aceptó cotización del servidor. El total actualizado fue ARS 18.000. |
| Cancelación de reserva | PASS | Cuatro reservas sintéticas quedaron canceladas; UI confirmó «Cupo liberado». |
| Historial | PASS | Se vieron cuatro reservas y estados cancelados en backend. |
| Indicadores financieros | PASS funcional | Métricas autenticadas visibles tras cancelación; montos activos volvieron a cero y duración efectiva continúa no disponible hasta Sprint 3. |
| Cierre de sesión | PASS | UI confirmó «Sesión cerrada correctamente» y volvió a visitante. |
| Español / inglés | PASS | Idioma alternado y retornado a español. |
| Modo claro / oscuro | PASS | Ambos temas revisados. |
| Desktop 1440 × 900 | PASS parcial | Revisado visualmente; ver inspección previa descrita abajo. |
| Móvil 390 × 844 | PASS tras fix | Sin overflow horizontal; botón de mapa reubicado para evitar superposición con tarjetas. |
| Errores de consola | PASS previo / no revalidado autenticado | En recorrido anterior se registraron cero; no se capturaron logs de consola durante la sesión autenticada. |
| Errores de comunicación con Supabase | PASS en flujos probados | Las operaciones autenticadas completaron correctamente. |
| Rutas de archivos internos | PASS previo | Solicitudes a SQL, documentación interna, configuración Wrangler y `.assetsignore` no expusieron contenidos. |
| Accesibilidad básica | PASS parcial previo | Inspección básica detectó nombres accesibles y alt; contraste integral y navegación completa por teclado no fueron auditados. |

## Cambios aplicados durante QA

1. Se corrigió el posicionamiento del control móvil «Ver mapa» en `styles.css`; comprobado en Preview.
2. En `index.html`, el recibo ahora distingue `pay_at_garage` del pago simulado. El Preview confirmó «Pagar en cochera» tras el commit `4aaab0a4de034df9b2597f56794ffdf9d9d51fc7`. Cloudflare Workers Builds: **success**.

## Datos de prueba compartidos

Los dos usuarios sintéticos fueron preparados por el usuario y tienen rol `driver`. La sesión autenticada creó/actualizó el vehículo de prueba `QAPF2611` y cuatro reservas. Las cuatro reservas quedaron canceladas y la UI confirmó liberación de cupo. La prueba de pago simulado figura como `demo_simulated` y de prueba (`is_test=true`); no fue una transacción real. El vehículo permanece en la cuenta QA; las reservas y eventos se conservan como historial auditable. No se modificaron políticas ni configuración Supabase.

## Capturas

Se inspeccionaron visualmente capturas de escritorio, móvil claro y móvil oscuro en el navegador. El exportador local no generó archivos de imagen, por lo que no se guardan PNG en esta carpeta ni se simula evidencia persistida. El resultado textual sí queda documentado aquí.

## Conclusión y siguiente paso

El Preview está desplegado y el check de Cloudflare pasó para el commit `4aaab0a4de034df9b2597f56794ffdf9d9d51fc7`. Se completaron los flujos autenticados principales con datos sintéticos, incluidos pagos demo, extensión, aceptación y cancelación. Mercado Pago continúa deshabilitado. **El Sprint 2C.1 está funcionalmente validado para revisión humana, pero no declaro lista la publicación definitiva ni autorizo el merge** hasta que una persona revise el vehículo y los registros de prueba que permanecen en la base compartida, y el equipo decida si necesita capturas persistidas como requisito de aceptación. No se guardaron PNG y no se registraron logs de consola autenticados en esta pasada. El PR #2 queda abierto y sin fusionar.
