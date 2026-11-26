# Estado — 2026-11-25
V1: aplicación estática heredada; reservas locales y mapa Leaflet/OSM. V2 y V3 pendientes de revisión y pruebas. Ningún artifact nuevo aceptado. Próximo paso: validar requisitos y motor de disponibilidad. Las fuentes docentes originales permanecen en el proyecto ChatGPT; verificar permisos antes de publicarlas en GitHub público.

V0 update: Google Maps target architecture endorsed by user; team review pending. A06 and PF-14 specifications drafted. No API credentials or billing activated; index.html unchanged; browser tests pending.

Sprint 01 update (`feature/sprint-01-core-booking`): PF-01, PF-02, PF-03 y PF-04 implementados en `core-booking.js` e `index.html` (disponibilidad por intervalo semiabierto en hora BA, pico de ocupación concurrente derivado del ledger, validación vehicular/altura/horario, precios dinámicos por tramo con cotización congelada, manejo explícito de fallas de `localStorage`, prevención local de doble envío y sandbox QA aislado). Pruebas automatizadas Node (10/10) y Playwright Chromium (11/11) ejecutadas con resultado PASS (evidencia en `02_trabajo/sprint_01/sprint_01_test_report.md` y `04_revision/pruebas_funcionales.csv`). Pendiente revisión humana del equipo; sin merge a `main` ni despliegue.

Cloudflare Workers: production branch configured to feature/sprint-01-core-booking by user. This documentation-only commit is a deployment trigger test; automatic build and public version verification remain pending.
