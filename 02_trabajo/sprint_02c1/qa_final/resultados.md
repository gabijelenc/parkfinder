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
| Conexión con Supabase | Parcial, conexión alcanzada | La UI indica “Backend Supabase · Centralizado”; Auth respondió con límite de email. La lista comercial de la portada se identifica en la propia UI como sintética/local. |
| Ocho estacionamientos comerciales | PASS visual | Se mostraron ocho opciones y ocho disponibles. |
| Registro | BLOCKED | El intento con correo sintético de formato válido devolvió “email rate limit exceeded”; dos formatos anteriores fueron rechazados como correo inválido. No se confirmó si Auth persistió un usuario no verificado y no se repitió el registro tras el rate limit. |
| Inicio de sesión | FAIL | El intento con la misma identidad sintética devolvió “Invalid login credentials”; no se estableció sesión. |
| Vehículos | BLOCKED | La pestaña exige iniciar sesión. |
| Búsqueda | PASS | Palermo Soho reordenó los ocho resultados. |
| Filtros | PASS | Precio máximo ARS 10.000 produjo 4 resultados; “Solo disponibles” + “Carga EV” produjo 2. |
| Crear reserva | BLOCKED | “Reservar” abrió el requisito de inicio de sesión; no se creó hold ni reserva. |
| Pago en estacionamiento / pago simulado | BLOCKED | Checkout no accesible sin sesión. |
| Mercado Pago deshabilitado | NO VERIFICADO en UI | No hubo controles de pago accesibles sin autenticación. |
| Extensión y aceptación de cotización | BLOCKED | No fue posible llegar al flujo autenticado. |
| Cancelación e historial | BLOCKED | No hubo sesión ni reservas; el contador de reservas se mantuvo en cero. |
| Indicadores financieros | PARCIAL | La pestaña Métricas mostró valores de visitante en cero y duración real como no disponible; no se probaron cifras asociadas a usuario. |
| Cierre de sesión | NO APLICA | No se estableció una sesión. |
| Español / inglés | PASS | El contenido y la navegación cambiaron a inglés y regresaron a español. |
| Tema claro / oscuro | PASS | El atributo de tema cambió y el fondo calculado pasó a oscuro. |
| Escritorio 1440 × 900 | PASS parcial | Captura visual revisada; ancho del documento no excedió el área. |
| Móvil 390 × 844 | PASS tras corrección | Sin overflow horizontal. El botón “Ver mapa” se movió a la parte inferior del mapa; se midió cero intersecciones con tarjetas. |
| Errores de consola | PASS | Cero errores/advertencias registrados en la sesión del navegador. |
| Comunicación Supabase | Parcial | Auth respondió con error de rate limit en registro y credenciales inválidas en login; no se observaron otros fallos. |
| Rutas privadas públicas | PASS | Solicitudes a migración SQL, documentación interna, wrangler.jsonc y .assetsignore no devolvieron el contenido del archivo. |
| Accesibilidad básica | PASS parcial | Cero imágenes sin alt y cero controles observados sin nombre accesible por la inspección DOM básica. Contraste y navegación completa por teclado no se auditaron. |

## Cambio aplicado durante QA

Se corrigió el posicionamiento del control móvil “Ver mapa” en styles.css. Antes se superponía geométricamente con la tarjeta de resultados; después de la corrección, quedó dentro de la zona del mapa y no se intersectó con tarjetas en 390 × 844. Cloudflare desplegó correctamente el commit e6078f2.

## Datos compartidos y posible identidad de prueba

Se enviaron datos sintéticos a Supabase Auth con dominio reservado de ejemplo. El registro fue rechazado por límite de correo. No se repitió la operación y no se crearon vehículos, reservas, pagos ni otros datos de negocio. Esta prueba no pudo confirmar si el servicio creó una identidad no verificada antes de devolver el error; una persona con acceso autorizado debe revisar Auth antes de cualquier cleanup.

## Capturas

Se inspeccionaron visualmente capturas de escritorio, móvil claro y móvil oscuro en el navegador. El exportador local no generó archivos de imagen, por lo que no se guardan PNG en esta carpeta ni se simula evidencia persistida. El resultado textual sí queda documentado aquí.

## Conclusión y siguiente paso

El despliegue de Preview está técnicamente sano y el defecto visual móvil detectado fue corregido. **Sprint 2C.1 no está listo para publicación definitiva ni para autorizar el merge del PR #2**: hace falta que una persona prepare o aporte una identidad sintética verificada y repita registro/login, vehículos, reservas, pagos de demo, extensión, cancelación, historial e indicadores. Mercado Pago debe continuar deshabilitado.
