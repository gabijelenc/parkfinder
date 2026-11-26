# Configuración de Cloudflare Preview

## Cambio
- Se agrega `wrangler.jsonc` con el Worker `parkfinder`, los recursos estáticos servidos desde la raíz y el bloque requerido `previews: {}`.
- Se agrega `.assetsignore` con una lista permitida: los cinco archivos del cliente web y `assets/**`. La documentación, pruebas, directorios internos, archivos SQL, configuraciones y otros archivos del repositorio no se cargan como recursos públicos.
- No se agregan bindings, variables, credenciales ni secretos.

## Resolución de configuración
Antes de este cambio no había un archivo de Wrangler rastreado. Con la configuración nueva, Wrangler 4.168.0 toma el archivo de la rama actual tanto con `npx wrangler deploy` como con `npx wrangler preview`. La configuración deja `previews` vacío porque el Worker estático no declara recursos de runtime distintos para Preview.

## Compatibilidad esperada
- Producción: el comando configurado sigue siendo `npx wrangler deploy`; nombre `parkfinder` y directorio estático `./`.
- Preview: `npx wrangler preview` ahora encuentra el bloque obligatorio y sube assets de la rama.
- El comando de deploy no se ejecutó manualmente; el check de Cloudflare asociado al PR es la validación de Preview.

## Límites
Cloudflare puede mostrar avisos sobre bindings base definidos por separado en el Dashboard. Este repositorio no define bindings y no puede confirmar valores de configuración externos al repo. El bloque vacío cubre el error reportado de falta de `previews`.

## Referencias
- [Cloudflare Workers Previews: Wrangler configuration file](https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file)
- [Cloudflare Workers Static Assets: ignoring assets](https://developers.cloudflare.com/workers/static-assets/binding/#ignoring-assets)
