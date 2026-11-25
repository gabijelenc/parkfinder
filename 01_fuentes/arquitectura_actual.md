# Arquitectura actual — revisión estática

`index.html` reúne HTML, CSS y JavaScript vanilla. Leaflet externo muestra mapa; Nominatim geocodifica; fallback local ofrece resiliencia. Datos de cocheras en GARAGES; getInventory/setInventory y getBookings/saveBookings usan localStorage. readForm recoge criterios, costOf calcula precio, renderResults/renderMap muestran resultados, doReserve confirma cupo y cancelBooking libera inventario. qrSvg produce representación demo.

La disponibilidad V1 es inventario global, no un calendario por intervalos. No se identificó backend, autenticación real ni integración de pagos en la estructura inspeccionada. Netlify sirve la raíz sin build. La evolución propuesta conserva el shell estático inicialmente y separa lógica de negocio verificable; luego incorpora backend compartido.
