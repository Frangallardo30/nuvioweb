# Auditoría de compatibilidad de proveedores — 11/11/2026

Revisión del commit `181192e`, despliegue público `nuviofranga.netlify.app` y registros entregados por el usuario. No se modificó ni desplegó código de la aplicación durante esta auditoría. No se utilizaron credenciales ni enlaces privados de los registros para hacer solicitudes externas.

## Conclusión

La base de la aplicación funciona y el reproductor puede manejar H.264 con audio Dolby mediante conversión local. La equivalencia con la aplicación nativa no está demostrada: falta una capa de compatibilidad de acceso a proveedores y pruebas reales por proveedor. Sincronizar una cuenta recupera configuración y credenciales; no modifica las restricciones de red, cookies, cabeceras y códecs del navegador.

## Pruebas ejecutadas

| Prueba | Resultado | Alcance |
|---|---|---|
| `npm test` | 1.836 aprobadas; 0 fallidas; 57 s | Pruebas del repositorio; muchas usan respuestas simuladas |
| `npm run build:netlify` | Correcto | Compilación local del despliegue |
| `npm run lint` | 7 errores | Detalle abajo; no equivalen a siete fallos de reproducción |
| Chromium 156, web pública, sesión nueva | Login visible; sin errores JS no capturados | Sin autenticación personal; carga observada ~2,84 s en una única medición |
| Cinemeta: manifest público desde la web | HTTP 200, JSON con `id`, 539 ms | No prueba catálogos completos ni reproducción |
| OpenSubtitles: manifest público desde la web | HTTP 200, JSON con `id`, 512 ms | No prueba búsqueda/descarga de subtítulos particulares |
| Torrentio: manifest público desde la web | HTTP 200, JSON con `id`, 421 ms | Sin configuración personal, debrid ni reproducción torrent |
| MKV sintético 1920×800, H.264, 23,976 FPS, dos pistas E-AC3 5.1 | 23,89 FPS; sonido confirmado en ambas pistas; cambio de idioma y salto a 5 s correctos | Chromium/Linux; no es una prueba de Brave/Windows ni de una película remota de 10 GB |

El sonido se verificó sobre audio capturado del video nativo: tonos distintos de aproximadamente 441 y 883 Hz. La prueba incluyó el intento de remux con conversión automática, no solamente el modo solicitado explícitamente.

Los tres manifests públicos funcionan desde este entorno, mientras que los registros del usuario muestran errores CORS para ellos. Esto exige comparar red, momento y URL exacta/configuración; no demuestra que todos los proveedores carezcan permanentemente de CORS. Tampoco permite atribuir los errores a Brave, al trabajo o a Netlify sin otra comprobación.

## Hallazgos priorizados

### P1 — Acceso directo a complementos; no hay pasarela general de compatibilidad

`js/data/remote/api/addonApi.js:4` llama a `httpRequest` sobre la URL externa. `netlify/lib/providers-handler.mjs:8` solo enruta debrid, Trakt, MDBList e IntroDB. No existe aquí una pasarela para manifests, catálogos, metadatos, streams y subtítulos de cualquier complemento instalado.

Consecuencia: un proveedor puede funcionar en la app nativa y fallar en la web antes de obtener siquiera sus enlaces. CORS debe permitir tanto la respuesta como las cabeceras requeridas; los errores de red/bloqueos también pueden presentarse al usuario como fallos de fetch.

Mejora: mantener acceso directo para servicios compatibles y ofrecer una pasarela JSON de respaldo para proveedores que la necesiten. Debe validar destino y redirecciones, impedir acceso a redes privadas, limitar tamaño/tiempo y proteger URLs configuradas que contienen tokens. Separar esta pasarela de un relay de video. Netlify Functions puede cubrir solicitudes pequeñas; esto no convierte Netlify en un servidor de streaming o FFmpeg persistente.

Aceptación: manifest, catálogo, meta, stream y subtítulos correctos por proveedor; un error en uno no bloquea los demás; ningún token llega a logs o claves públicas de caché.

### P1 — Solicitudes de complementos sin presupuesto de tiempo propio

`httpClient.js:18` admite opciones de fetch y señales aportadas por el llamador, pero no añade tiempo límite por defecto. `addonApi.js` no añade señales ni timeout. `addonRepository.js:427` espera todos los manifests con `Promise.all`. Un manifest lento puede retener la carga inicial del conjunto; capturar errores no resuelve una solicitud que nunca termina.

La lista de streams ya tiene publicación parcial con `onChunk` (`streamRepository.js:30`), por lo que no hace falta rehacerla. Su consulta comienza después de `getInstalledAddons`, y su resultado final también espera a todos los trabajos.

Mejora: presupuestos distintos para manifest/meta/stream, cancelación al abandonar pantalla, concurrencia limitada y presentación inmediata de configuración/manifests en caché. Separar «agotó el tiempo», «sin resultados», «autenticación», «red/CORS» y «respuesta inválida». Reintentar solo fallos transitorios e idempotentes, con límites.

Aceptación: un proveedor sin respuesta no impide ver y elegir resultados de otro; al salir de la pantalla se cancelan los trabajos pendientes.

### P1 — Cabeceras de reproducción y de inspección no usan la misma política

`playerScreen.js:3919` extrae `behaviorHints.proxyHeaders.request` y los workers de reproducción reciben cabeceras. Sin embargo, `probeRangeReader.js:96` genera solicitudes Range sin esas cabeceras; el preflight de Movi (`moviCapability.js:99`) también solo envía Range. `moviPlayerScreen.js` hace este preflight antes de montar el motor con las cabeceras.

Consecuencia: una fuente protegida puede ser reproducible por una ruta pero rechazada por su inspector/preflight. Además, enviar un objeto de cabeceras desde JS no garantiza poder reproducir lo que hace una app nativa: ciertas cabeceras y cookies están controladas por el navegador, y otras provocan preflight CORS.

Mejora: una política común para resolver URL, inspeccionar, obtener manifests/segmentos y reproducir, conservando autenticación cuando corresponda. Detectar cuándo hace falta un relay o reproductor externo en vez de insistir con fetch. Verificar también `Content-Range`, `Content-Length` y su exposición por CORS.

Aceptación: fuente con cabecera obligatoria, URL firmada, redirección y Range pasa inspección y reproducción; fuente bloqueada falla con explicación específica y acotada en tiempo.

### P1 — Falta una matriz real de equivalencia con la app nativa

Las pruebas pasadas validan lógica y archivos sintéticos. No prueban la cuenta y enlaces reales de Nuve+, LAT-ADD y AddonLatam. Las pruebas públicas de esta auditoría solo verifican manifests sin credenciales.

Matriz propuesta por proveedor, usando la misma cuenta/perfil y la misma red: configuración sincronizada → manifest → catálogo → meta → streams → resolución del enlace → lectura Range → primer cuadro y sonido → cambio SPA/ENG → subtítulos → pausa/reanudación → salto → diez minutos de reproducción. Repetir con red doméstica y laboral, y con la aplicación nativa como referencia. Registrar estado HTTP/categoría y tiempos sin guardar la URL privada.

Incluir archivos pequeños/grandes, MP4/MKV/HLS, AAC/E-AC3, enlaces caducados, cabecera obligatoria, CORS ausente y red lenta. La equivalencia se afirma por caso aprobado, no por cantidad total de tests.

### P2 — Estado y errores de proveedor poco accionables

`addonRepository.js:325` conserva fallos de manifest en memoria sin un TTL visible; `refresh` explícito sí los limpia. Si el primer intento falla transitoriamente, las consultas que prefieren caché pueden seguir devolviendo ese fallo hasta un refresco. Un manifest antiguo puede seguir mostrándose como disponible aunque la red actual no funcione.

Mejora: TTL corto para fallos, backoff y fecha del último éxito. Panel por proveedor con recurso fallido, vía directa/pasarela, tiempo transcurrido y botón de reintento. Conservar el motivo del worker y la ruta escogida cuando el error multimedia genérico es 4. Los registros existentes ya redactan URLs: aprovechar esa base.

### P2 — Optimización del arranque

En la sesión pública se transfirieron aproximadamente 717 KB para `app.bundle.js`, 121 KB para HLS y 212 KB para DASH. `app.js:331` precalienta bibliotecas a los 1.400 ms incluso en login. Moverlo a intención de reproducción o a sesión autenticada evita esa carga adelantada donde no aporta.

Tamaños locales sin compresión: aplicación 2,83 MiB; Movi 11,63 MiB; núcleo FFmpeg 30,74 MiB. No son bytes transferidos en cada visita: caché, compresión y carga diferida cambian el coste real. Mantener los decodificadores diferidos, compartir descargas/cache y mostrar progreso/cancelación al cargar WASM. Medir con caché fría, caliente y red limitada. Evitar cargar dos motores mientras se abandona uno.

### P2 — Calidad y automatización

Lint falla en siete puntos: global redeclarada en `ffprobeClient.js:1`; escapes innecesarios en `playbackMethod.js:77–78`; import sin uso en su test; argumento sin uso en `startupLoadingOverlay.js:247`; variable sin uso en `homeScreen.js:9313`; función sin uso en `services/remux-bridge/bridge.mjs:73`.

`.github/workflows/netlify-check.yml` comprueba adaptadores y compilación; no ejecuta la suite completa ni lint. Añadirlos y sumar un pequeño E2E de reproducción con fixture controlada. Ejecutar pruebas autenticadas de proveedores en un trabajo separado, con secretos protegidos y sin descargar películas como fixture.

## Orden de implementación recomendado

1. Diagnóstico por proveedor y prueba comparativa con la app nativa; límites de tiempo y cancelación. Esto identifica si falla acceso, resolución o reproducción antes de cambiar otro motor.
2. Corregir la política de cabeceras y añadir pasarela JSON solo donde sea necesaria. Dar caducidad a fallos de caché y conservar presentación parcial.
3. Centralizar la selección de reproducción: nativo directo cuando sea compatible, copia de contenedor cuando baste, conversión solo del audio si es necesario y alternativa explícita si el navegador no puede acceder/decodificar. Evitar ciclos de fallback sobre el mismo fallo.
4. Carga diferida y CI completa. Medir primer resultado útil y primer cuadro con sonido, además del tiempo de carga general.

Objetivos propuestos, no resultados medidos: proveedor lento aislado por su presupuesto; primer resultado útil sin esperar al peor proveedor; ningún spinner indefinido; conservación de posición e idioma en cada cambio de ruta; diez minutos de reproducción sin deriva A/V creciente en cada caso de la matriz.

## Qué puede igualarse y qué requiere otra arquitectura

La web puede acercarse a la app nativa en sincronización, navegación, consultas de complementos y reproducción de fuentes accesibles con formatos compatibles. CORS, cabeceras/cookies controladas por el navegador, protocolos no admitidos, DRM y capacidad de decodificación impiden prometer equivalencia universal desde un sitio estático. Para los casos restantes puede hacer falta una pasarela/relay autorizado, conversión en un backend persistente o un reproductor externo. Ninguno debe activarse ni contratarse sin medir primero qué proveedores lo necesitan.
