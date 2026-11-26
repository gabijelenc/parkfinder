# Sprint 2B — Identidad Visual Urban Tech & Experiencia Comercial de Conductor · Reporte de Implementación y Evidencia

- **Rama:** `feature/sprint-02-driver-experience`
- **Especificación oficial:** `02_trabajo/design_system/driver_ux_v01.md` (alcance exclusivo Sprint 2B; Sprint 2C no implementado)
- **Fecha:** 2026-11-25
- **Verificación automatizada total (56/56 PASS):**
  - Sprint 1 Core Domain Regression (`node tests/core_booking_tests.js`): **10/10 PASS**
  - Sprint 2A Core Domain Regression (`node tests/sprint02_domain_tests.js`): **9/9 PASS**
  - Sprint 2B Core Domain (`node tests/sprint02b_domain_tests.js`): **6/6 PASS**
  - Sprint 1 Browser E2E Regression (`python3 tests/e2e_browser_acceptance.py`): **11/11 PASS**
  - Sprint 2A Browser E2E Regression (`python3 tests/e2e_sprint02_acceptance.py`): **10/10 PASS**
  - Sprint 2B Browser E2E Acceptance (`python3 tests/e2e_sprint02b_acceptance.py`): **10/10 PASS**
- **Revisión humana / visual:** `PENDING_HUMAN_ACCEPTANCE` (subido solo a `feature/sprint-02-driver-experience`; sin merge a `improvements` ni `main`; sin APIs pagas ni facturación activada).

---

## 1. Transformación Visual y Funcional (Sprint 2B)

Se reemplazó por completo la estética de formulario administrativo previa por un producto comercial **Urban Tech** moderno, limpio y mobile-first:

1. **Identidad de marca `parkFinder`:**
   - Nombre sensible a mayúsculas/minúsculas **`parkFinder`** y eslogan oficial **«Tu lugar, antes de llegar.»** (EN: *Your spot, before you arrive.*).
   - **Isotipo SVG original** escalable y accesible (`#brandIsotype`): vehículo frontal dentro de una plaza de estacionamiento con contraste Navy/Mint.
   - **Paleta Urban Tech aprobada:** Navy `#0B1220`, Graphite `#334155`, Mint `#34D399` (acciones primarias con texto oscuro `#0B1220`, contraste medido **9.7:1** en ambos modos, muy por encima de WCAG AA 4.5:1), fondo claro `#F8FAFC`, blanco `#FFFFFF`.
   - **Tipografía:** `Inter` con fallback de sistema, grilla de espaciado de `8px`, íconos lineales SVG y áreas táctiles mínimas de `≥44px` en controles primarios.
   - **Modo claro y modo oscuro manuales** (`#themeToggleBtn`) con persistencia en `localStorage` (`parkfinder.v2.theme`) y contraste WCAG AA/AAA verificado automáticamente (Light cuerpo **18.7:1**, Dark cuerpo **16.6:1**, CTA Mint **9.7:1**).
   - Estados no disponibles siempre con texto + ícono explícito, nunca solo por color.
2. **Navegación comercial (Desktop & Mobile):**
   - Header desktop: `Explorar`, `Mis reservas (n)`, `Favoritos (n)`, `Mi perfil`, selector Claro/Oscuro, ES/EN y menú separado `Info · QA`.
   - Barra inferior móvil fija (`.mobile-bottom-nav`) con las 4 secciones principales (`Explorar`, `Reservas`, `Favoritos`, `Mi perfil`).
   - Sin pantalla de bienvenida ni barrera de registro para explorar.
3. **Nuevo buscador integrado y progresivo:**
   - Barra compacta horizontal en escritorio y píldora flotante superior **«¿A dónde vas?»** en móvil (`#mobileSearchToggle`).
   - Autocompletado progresivo (`#destDropdown`) con catálogo offline de barrios, puntos de interés (`Teatro Colón`, `Estadio Luna Park`, `CCK`, `Plaza Serrano`, `Museo MALBA`, `Facultad de Medicina UBA`) y comercios (`Galerías Pacífico`, `Abasto Shopping`, `Alto Palermo`, `Mercado de San Telmo`, `Catalinas`), sin geocodificación paga.
   - **Ubicación actual bajo permiso explícito** (`#geoLocationBtn`, nunca solicitada automáticamente al cargar; manejo claro ante permiso denegado o no disponible).
   - **Destinos recientes** (máx. 6) y **destinos favoritos** persistidos en `localStorage`.
4. **Navegación híbrida mapa + resultados:**
   - **Escritorio (`≥960px`):** vista híbrida por defecto **60% mapa / 40% lista** con divisor vertical ajustable (`#splitDivider`, arrastre de puntero y teclado `ArrowLeft`/`ArrowRight`/`Home`).
   - **Móvil (`<960px`):** mapa interactivo a pantalla completa detrás de un **panel inferior desplegable** (`#resultsSheet` / `#sheetHandle`) con 3 estados (`peek` / `half` / `full`), arrastre táctil, teclado (`ArrowUp`/`ArrowDown`) y sincronización con `#mobileViewToggle`.
   - **Pines de mapa y sincronización bidireccional:** precio total en el pin, verde menta `#34D399` disponible, grafito con `✕` no disponible, borde destacado al seleccionar; hover/click sincronizados entre tarjeta y pin.
5. **Tarjetas comerciales con imágenes ilustrativas identificadas:**
   - 12 ilustraciones arquitectónicas SVG locales originales (`assets/garages/*.svg`), sin fotografías reales de supuestos socios ni dependencias externas pagas.
   - Etiqueta explícita **`Imagen ilustrativa`** (EN: *Illustrative image*) en cada tarjeta, ficha, galería y comparador.
   - Muestran nombre, dirección, puntuación y reseñas etiquetadas `demo`, caminata y distancia estimada en línea recta, capacidad libre compatible para todo el intervalo, servicios confirmados, precio total y **precio promedio por hora**, favorito (`♥`), comparador (`⇄`) y CTA `Reservar`.
6. **Ficha detallada y galería ampliable:**
   - Panel lateral deslizable en escritorio y pantalla completa en móvil (`#detailPanel`).
   - Foto principal, miniaturas clicables y **galería Lightbox ampliable** (`#galleryModal`, navegación con flechas y `Escape`).
   - **5 pestañas ARIA accesibles** (`Info`, `Servicios`, `Fotos`, `Reseñas`, `Ubicación`) con navegación por teclado (`ArrowLeft`/`ArrowRight`), horarios, altura máxima, vehículos admitidos, matriz tri-estado (`Sí`/`No`/`Sin informar`), reseñas sintéticas etiquetadas demo, desglose tarifario expandible y enlace de ruta demo a Google Maps.
7. **Comparador de hasta 3 estacionamientos (`#compareBar` + `#compareModal`):**
   - Evalúa exactamente el mismo intervalo y vehículo activos; bloquea el 4.º con mensaje claro (`COMPARE_LIMIT_EXCEEDED`).
   - Compara precio total, promedio/h, distancia estimada, puntuación demo, cupo compatible, horarios, altura, vehículos y los 6 servicios tri-estado con resaltado de mejores valores y botón directo `Reservar`.
8. **Filtros rápidos y avanzados + Recomendaciones inteligentes:**
   - Controles rápidos (`Más barato`, `Más cercano`, `Mejor puntuado`, `Solo disponibles`, `Techado`, `24 hs`) + chips y selectores combinados + modal sincronizado de **Filtros avanzados** (`#advancedFiltersModal`).
   - **Recomendaciones inteligentes determinísticas (`Core.computeRecommendations`):**
     - `lowestTotal`: menor total en ARS entre opciones elegibles.
     - `closest`: menor distancia Haversine entre opciones elegibles.
     - `highestRating`: mayor puntuación demo entre opciones elegibles.
     - `bestValue` (**propuesta para revisión del equipo**): normalización min-max `[0, 1]` de precio total y distancia entre resultados elegibles con pesos iguales (`0.5 * normPrecio + 0.5 * normDistancia`, menor es mejor).
     - `lowAvailability` (**propuesta para revisión del equipo**): umbral estricto `≤ 2` plazas sintéticas libres reales (`eligible && 1 <= availableSpaces <= 2`), garantizando **cero falsa urgencia** en cocheras con ≥3 lugares libres.
9. **Favoritos y destinos recientes (`#favoritesModal`):**
   - Persistencia local en `localStorage` para cocheras favoritas (`parkfinder.v2.favoriteGarages`), destinos favoritos (`parkfinder.v2.favoriteDestinations`) y destinos recientes (`parkfinder.v2.recentDestinations`).

---

## 2. Capturas de Alta Resolución (2× DPR · Antes / Después · Claro y Oscuro)

| Escenario | Archivo |
|---|---|
| **Antes de Sprint 2B · Escritorio (1440×900)** | `02_trabajo/sprint_02b/screenshots/before_2b_desktop_1440x900.png` |
| **Después · Escritorio Modo Claro (2880×1800 · 2× DPR)** | `02_trabajo/sprint_02b/screenshots/after_2b_desktop_light_1440x900.png` |
| **Después · Escritorio Modo Oscuro (2880×1800 · 2× DPR)** | `02_trabajo/sprint_02b/screenshots/after_2b_desktop_dark_1440x900.png` |
| **Después · Escritorio Ficha Detallada + Pestañas + Galería** | `02_trabajo/sprint_02b/screenshots/after_2b_desktop_detail_light.png` |
| **Después · Escritorio Comparador (3 cocheras · Modo Oscuro)** | `02_trabajo/sprint_02b/screenshots/after_2b_desktop_compare_dark.png` |
| **Antes de Sprint 2B · Celular (390×844)** | `02_trabajo/sprint_02b/screenshots/before_2b_mobile_390x844.png` |
| **Después · Celular Modo Claro (780×1688 · 2× DPR · Mapa + Panel)** | `02_trabajo/sprint_02b/screenshots/after_2b_mobile_light_390x844.png` |
| **Después · Celular Modo Oscuro (780×1688 · 2× DPR · Mapa + Panel)** | `02_trabajo/sprint_02b/screenshots/after_2b_mobile_dark_390x844.png` |
| **Después · Celular Modo Oscuro Mapa Pantalla Completa (`peek`)** | `02_trabajo/sprint_02b/screenshots/after_2b_mobile_map_peek_dark.png` |

---

## 3. Evidencia de Pruebas Automatizadas (56/56 PASS)

Comandos reproducibles:
```bash
node tests/core_booking_tests.js
node tests/sprint02_domain_tests.js
node tests/sprint02b_domain_tests.js
python3 tests/e2e_browser_acceptance.py
python3 tests/e2e_sprint02_acceptance.py
python3 tests/e2e_sprint02b_acceptance.py
```

### Matriz de Pruebas Nuevas de Sprint 2B (`S2B-D01..D06` y `S2B-E01..E10`)

| Test ID | Cobertura | Resultado Observado | Estado |
|---|---|---|---|
| `S2B-D01` | Recomendaciones determinísticas + score valor 50/50 + exclusión de no elegibles | `eligible=4`, `bestValue=garage-obelisco(0.4167)`, `lowest=garage-chacarita`, `closest=garage-obelisco`, determinismo 100% | PASS (Automatizado) |
| `S2B-D02` | Umbral baja disponibilidad `≤2` plazas libres (sin falsa urgencia) | `lowAvail=[g-1,g-2]`, excluye `g-0` (lleno), `g-3` y `g-50` | PASS (Automatizado) |
| `S2B-D03` | Comparador hasta 3 cocheras mismo intervalo/vehículo (rechaza 4.ª) | `ok3=OK`, `four=COMPARE_LIMIT_EXCEEDED`, tri-estado preservado | PASS (Automatizado) |
| `S2B-D04` | Precio promedio por hora con prorrateo nocturno/fin de semana | `total=25200`, `hours=4`, `avgHourly=6300` | PASS (Automatizado) |
| `S2B-D05` | Búsqueda offline de destinos (POIs, comercios, favoritos, recientes) | Coincidencia sin tildes (`Teatro Colón`, `Galerías Pacífico`, `Oficina Microcentro`) y deduplicación | PASS (Automatizado) |
| `S2B-D06` | Procedencia de galerías SVG locales y reseñas demo en 8 cocheras | `8/8` con `assets/garages/*.svg`, `illustrative_svg_demo`, `>=3` reseñas `synthetic_demo`, 0 atribución Google | PASS (Automatizado) |
| `S2B-E01` | Identidad Urban Tech (`parkFinder`, eslogan, isotipo SVG, `Inter`, nav 4 tabs) | `brand=parkFinder`, tagline OK, `#brandIsotype` SVG visible, fuente `Inter`, 4 ítems de nav | PASS (Automatizado) |
| `S2B-E02` | Modo Claro/Oscuro manual + persistencia + contraste WCAG AA real | `lightCR(body=18.7,cta=9.7)`, `darkCR(body=16.6,cta=9.7)`, persistido tras reload | PASS (Automatizado) |
| `S2B-E03` | Híbrido escritorio 60% mapa / 40% lista + divisor ajustable por teclado | Split inicial `40.0% / 59.3%`, teclado `ArrowRight`/`Home` `40→48→40` | PASS (Automatizado) |
| `S2B-E04` | Buscador progresivo (POI offline, geolocalización permiso denegado/concedido, recientes/favoritos) | `Teatro Colón` aplicado, permiso denegado/concedido manejados, persistencia tras reload | PASS (Automatizado) |
| `S2B-E05` | Tarjetas comerciales con SVG ilustrativo (ES/EN), prom/h y favoritos persistidos | `Imagen ilustrativa` / `Illustrative image`, `favGaragePersisted=garage-puerto-madero` | PASS (Automatizado) |
| `S2B-E06` | Ficha detallada (5 pestañas + teclado `ArrowRight`), reseñas demo y galería Lightbox (`Escape`) | `tabs=5`, `reviewsDemo=True`, Lightbox navegación + cierre `Escape` | PASS (Automatizado) |
| `S2B-E07` | Comparador UI (hasta 3, 4.ª bloqueada, reserva directa desde tabla) | `selected=3`, `4thBlocked=COMPARE_LIMIT_EXCEEDED`, `directReserveFromCompare=OK` | PASS (Automatizado) |
| `S2B-E08` | Franja de recomendaciones + baja disponibilidad `≤2` verificada en Sandbox QA | `recPills=4`, `normalLowAvail=0` (sin falsa urgencia), `sandboxCap1_2LowAvail>=1` | PASS (Automatizado) |
| `S2B-E09` | Controles rápidos (`Más barato`/`Más cercano`/`Mejor puntuado`) y modal Filtros avanzados | Sincronización bidireccional verificada | PASS (Automatizado) |
| `S2B-E10` | Móvil `390×844`: mapa pantalla completa, buscador superior, panel desplegable, nav inferior, `≥44px`, 0 overflow | `overflow(1440=False,390=False)`, estados `half/full/peek`, `touchPx>=44`, `jsErrors=0` | PASS (Automatizado) |

---

## 4. Limitaciones Documentadas y Alcance Fuera de Sprint 2B

1. **Sprint 2C deliberadamente NO implementado:** cuenta demo local con login al reservar, gestión CRUD de múltiples vehículos, flujo de checkout en pasos con elección de medio de pago, extensión de reserva, exportación `.ics`/compartir, pestañas de estado en Mis reservas, configuración de notificaciones in-app y métricas personales/exportación CSV quedan reservados para el Sprint 2C. La pestaña `Mi perfil` ofrece en Sprint 2B preferencias reales de tema Claro/Oscuro e idioma ES/EN junto con un aviso transparente del alcance Sprint 2C.
2. **Datos sintéticos e imágenes ilustrativas:** todos los estacionamientos, capacidades, servicios tri-estado, puntuaciones, reseñas e ilustraciones arquitectónicas SVG son sintéticos de demostración; no representan comercios socios reales ni fuentes de Google Places.
3. **Persistencia local (`localStorage`):** reservas, favoritos, destinos recientes, tema e idioma residen localmente en el navegador; la atomicidad multiusuario/multidispositivo requiere backend transaccional futuro (PF-12).
4. **Distancias y navegación sin APIs pagas:** las distancias y tiempos a pie (~5 km/h) son estimaciones en línea recta (Haversine); los enlaces «Cómo llegar (ubicación demo)» abren Google Maps sin clave ni facturación; la búsqueda de direcciones usa el catálogo demo offline y Nominatim OSM gratuito con fallback local.
5. **Políticas propuestas pendientes de aprobación del equipo:** fórmula 50/50 de score valor precio-distancia, umbral `≤2` de baja disponibilidad, ventanas pico `08:00–10:00` y `17:00–20:00` (`×1.15`) y tope de estadía de `72 h`.
6. **Revisión humana pendiente:** todas las pruebas automatizadas y capturas de alta resolución están completas; se requiere revisión visual y funcional humana antes de cualquier merge a `improvements`.
