# ParkFinder

Prototipo web interactivo (V1) para buscar, comparar y reservar estacionamientos privados en Buenos Aires, con confirmación inmediata, soporte bilingüe (ES/EN) y modo offline de respaldo.

## Estructura

- `index.html`: aplicación web estática autocontenida (HTML + CSS + JavaScript vanilla), sin dependencias locales ni paso de compilación.

## Funcionalidades incluidas

- Búsqueda por zona de CABA o dirección libre (geocodificación con OpenStreetMap / Nominatim y fallback local).
- Mapa interactivo con [Leaflet](https://leafletjs.com/) y marcadores de tarifas.
- Ordenamiento por cercanía o precio y filtro por disponibilidad.
- Simulación de reserva con validación de cupo, generación de Booking ID y código QR en SVG.
- Gestión de reservas (*Mis reservas*, cancelación con devolución de cupo) y persistencia en `localStorage`.
- Simulación de modo sin conexión (resiliencia ante caída de mapa/geocoding).

## Cómo editar y probar localmente

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/fedealmendra/parkfinder.git
   cd parkfinder
   ```
2. Abrir `index.html` directamente en el navegador, o iniciar un servidor local:
   ```bash
   python3 -m http.server 8080
   ```
3. Editar `index.html` y enviar los cambios mediante Pull Request (o push directo si tenés permisos de colaborador).

## Deploy en Netlify

Al ser un sitio estático autocontenido, puede publicarse conectando este repositorio en Netlify con:
- **Build command:** *(vacío)*
- **Publish directory:** `.`
