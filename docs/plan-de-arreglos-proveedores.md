# Plan de arreglos y compatibilidad de proveedores

Base: auditoría del 11/11/2026, commit `181192e`. Estado: primera entrega implementada y validada; ver avance al final. La auditoría está terminada; cada arreglo se cierra con su evidencia.

Objetivo: que los proveedores configurados puedan consultarse y reproducirse de forma verificable desde Brave, con idioma, posición y subtítulos correctos. La equivalencia con la app nativa se certificará por proveedor y caso, no por cantidad de pruebas unitarias.

## Lista de trabajo

| ID | Tarea | Prioridad | Dependencias | Entrega verificable |
|---|---|---|---|---|
| T01 | Diagnóstico común por proveedor y reproducción | Alta | — | Error tipificado, etapa y tiempo; exportación redactada |
| T02 | Límites de tiempo y reintentos acotados | Alta | T01 | Solicitudes que siempre terminan o se cancelan |
| T03 | Cancelación y resultados parciales | Alta | T02 | Un proveedor lento no bloquea a los demás |
| T04 | Recuperación de caché y fallos transitorios | Alta | T01–T02 | Recuperación sin cerrar sesión ni borrar configuración |
| T05 | Cabeceras y acceso coherentes entre motores | Alta | T01–T02 | Inspección y reproducción usan una misma política |
| T06 | Pasarela de consultas para complementos con CORS | Alta | T01–T05 | Acceso directo o pasarela según el caso probado |
| T07 | Selección y recuperación del motor de reproducción | Alta | T01, T05 | Ruta explícita, sin ciclos de intentos ni carga indefinida |
| T08 | Estabilidad de audio, subtítulos y controles | Alta | T07 | Idioma y posición conservados, sincronización estable |
| T09 | Detección de descarga insuficiente y progreso de carga | Media | T01, T07 | Separar falta de ancho de banda de fallo del decodificador |
| T10 | Verificación de cuenta, perfil y proveedores sincronizados | Alta | T01 | Configuración correcta y aislada por cuenta/perfil |
| T11 | Matriz real de proveedores frente a la app nativa | Alta | T01, T10; cierre tras T06–T09 | Resultados documentados por fuente, cliente y red |
| T12 | Carga diferida y uso de recursos | Media | T07–T09 | Menos carga en login y sin motores abandonados consumiendo recursos |
| T13 | Lint, pruebas automáticas y controles de CI | Alta | —; E2E tras T07–T08 | Lint limpio, suite completa y E2E en GitHub |
| T14 | Publicación gradual y reversión | Alta | T01–T13 o excepción documentada | Versión identificable, verificación publicada y reversión probada |

Las tareas sin avance anotado al final siguen **pendientes**. T11 requiere una sesión/enlace real vigente cuando llegue la validación; hoy no hay resultados de reproducción real de esos proveedores en el entorno de pruebas. T06 requiere confirmar las rutas de proveedor que necesitan pasarela. Un relay de video o servidor persistente se evalúa por separado si la matriz demuestra su necesidad.

## Preparación técnica y aceptación

### T01 — Diagnóstico común

Revisar `js/core/network/httpClient.js`, `js/core/diagnostics/consoleDebugBuffer.js`, repositorios de addons/streams, `playerController.js` y estados de carga.

- Tipificar timeout, cancelación, HTTP/autenticación, respuesta inválida, red/CORS indeterminado, enlace caducado, Range y códec. No presentar un `TypeError: Failed to fetch` como prueba suficiente de CORS.
- Identificar proveedor, recurso, etapa, ruta y duración sin registrar URLs configuradas, tokens, cookies ni cabeceras sensibles.
- Mostrar último éxito, motivo del fallo y reintento individual. Reutilizar el diseño existente del panel de proveedores/errores.
- Aceptación: un fallo inducido en cada etapa produce un diagnóstico útil y exportable sin secretos. El error multimedia genérico 4 conserva la causa del worker.

### T02 — Límites y reintentos

Modificar la política de solicitudes de addons, sin imponer el mismo timeout a video, sincronización y llamadas de autenticación.

- Propuesta inicial ajustable: manifest/meta 8 s, streams 15 s, resolución 15 s; medir antes de fijar valores finales.
- Presupuesto total incluye reintentos; máximo un reintento de GET idempotente ante fallos transitorios. Respetar `Retry-After` sin superar el presupuesto.
- No reintentar automáticamente cancelaciones, credenciales rechazadas, JSON inválido o fallos deterministas de acceso.
- Aceptación: proveedor que nunca responde termina dentro de su presupuesto; una cancelación externa se conserva y no dispara reintentos.

### T03 — Cancelación y carga parcial

Revisar `addonRepository.getInstalledAddons` y `streamRepository.getStreamsFromAllAddons`.

- Limitar concurrencia y mostrar configuración/manifests en caché mientras se actualizan. Evitar que la espera de todos los manifests retrase los primeros resultados útiles.
- Conservar y probar `onChunk`, que ya existe. Cancelar al cambiar contenido/perfil o salir de pantalla; una respuesta tardía no reemplaza el contenido nuevo.
- Aceptación: con proveedores rápido, lento y fallido se puede elegir el resultado rápido antes de que terminen los otros; no quedan trabajos de la pantalla abandonada.

### T04 — Caché recuperable

Añadir caducidad explícita para fallos de manifest, separación por perfil/configuración y fecha de último éxito.

- Un error transitorio no queda fijado hasta un refresco manual. Una credencial/configuración cambiada invalida el estado asociado.
- Distinguir un manifest antiguo disponible de una comprobación de red actual correcta.
- Aceptación: proveedor que falla y luego se recupera vuelve a funcionar sin reinstalarlo; cambiar de cuenta no muestra datos de la anterior. Mantener la prueba de la carrera de `Response.clone` ya corregida.

### T05 — Política única de acceso

Revisar `probeRangeReader.js`, `ffprobeClient.js`, `moviCapability.js`, `moviPlayerScreen.js`, workers de remux y la resolución de enlaces.

- Propagar las cabeceras permitidas requeridas por la fuente durante inspección, preflight, manifests/segmentos y reproducción. No prometer que JavaScript puede imponer cabeceras o cookies reservadas al navegador.
- Tratar redirecciones y exposición de `Content-Range`/`Content-Length`; no reenviar credenciales a otro origen indiscriminadamente.
- Aceptación: fuente de prueba que requiere autorización funciona en inspección y reproducción; enlace expirado, Range ignorado y cabecera no aplicable producen errores distintos y acotados.

### T06 — Pasarela de consultas de addons

Preparar adaptador en `netlify/lib/providers-handler.mjs` y capa de transporte en `addonApi.js`. Probar acceso directo antes de decidir qué proveedores requieren el respaldo.

- Delimitar solicitudes pequeñas: manifest, catálogo, meta, listado de streams y respuestas/archivos de subtítulos autorizados y acotados. No transportar películas por esta función.
- Validar destinos y cada redirección, bloquear redes privadas, limitar cuerpo, concurrencia y tiempo. Autenticar/autorizar su uso y evitar que se convierta en proxy abierto.
- No compartir cachés de respuestas privadas entre cuentas; no convertir URLs con tokens en claves públicas o logs.
- Aceptación: proveedor de prueba sin CORS se consulta por la pasarela; proveedor directo compatible conserva su ruta; destinos privados, redirecciones inválidas y respuestas demasiado grandes son rechazados.

### T07 — Selección del reproductor

Centralizar decisiones actualmente repartidas entre clasificación, reproducción no verificada, plan de remux y rutas de player/Movi.

- Elegir nativo directo cuando baste; copia de contenedor si es necesario; conversión solo de audio cuando esté soportada; Movi u otra alternativa explícita cuando proceda.
- Recordar intentos y causas por fuente/sesión. Un error de acceso no dispara otra conversión sobre el mismo acceso fallido.
- Incluir arranque frío de WASM dentro de un presupuesto visible y cancelable. Tras agotar rutas, mostrar una acción de recuperación.
- Aceptación: acceso fallido, códec no compatible y fallo de inicialización terminan sin bucle; cada cambio conserva intención de pausa, posición e idioma cuando el destino lo admite.

### T08 — Audio, subtítulos y controles

Verificar E-AC3/AC3→Opus y fuentes AAC; probar que las marcas de tiempo siguen alineadas tras cambios de idioma y saltos.

- Mostrar solo pistas reales y posibilidades comprobadas; evitar presentar una preferencia de idioma como pista disponible.
- Validar SPA/ENG, subtítulos internos/externos, pausa, volumen y recuperación de AudioContext suspendido.
- Aceptación: diez minutos sin deriva A/V creciente, sin doble audio y sin pérdida de idioma/posición tras cambio de motor. Definir un umbral medible de desfase para la prueba y registrar sus límites de precisión.

### T09 — Búfer, descarga y espera

Medir FPS realmente presentados, salud del búfer, pausas por descarga y tiempo a primer cuadro con sonido. No confundir FPS nominales de la fuente con FPS conseguidos.

- Comparar bitrate estimado y descarga sostenida cuando haya datos suficientes; mostrar incertidumbre si faltan.
- Presentar carga/compilación de WASM y permitir cancelar. Un archivo grande no implica por sí solo un fallo de red.
- Aceptación: red limitada produce espera controlada o recomendación de otra fuente, sin audio avanzando indefinidamente sobre video detenido.

### T10 — Sincronización de proveedores

Revisar `providerCredentialSyncService.js`, configuración de addons y cambios de cuenta/perfil.

- Comparar inventario y configuración en ambas apps; comprobar renovación de sesión, cambio de perfil y cierre de sesión sin mezclar datos.
- Distinguir configuración sincronizada de proveedor accesible/verificado.
- Aceptación: una modificación aparece en el perfil correcto y las credenciales no se exportan en diagnósticos. Una cuenta nueva no hereda fuentes privadas de la anterior.

### T11 — Matriz real

Archivo inicial: `matriz-pruebas-proveedores.csv`. Proveedores iniciales: Nuve+, LAT-ADD y AddonLatam. Completar datos durante la ejecución, sin pegar enlaces privados en el CSV.

- Identificar versión de Brave, sistema operativo y versión/plataforma de la app nativa; comparar misma cuenta, perfil, título, fuente y momento cuando sea posible.
- Probar acceso completo, reproducción/idiomas/subtítulos y estabilidad en red doméstica y laboral. Registrar por separado cualquier restricción propia de la red.
- Aceptación: cada fila contiene resultado, etapa de fallo y evidencia redactada; las filas no ejecutables se marcan bloqueadas y explicadas, nunca aprobadas por inferencia.
- Ampliar fixtures automatizadas con CORS, autorización, Range, redirecciones, enlaces caducados y red lenta. Cubrir MP4/MKV/HLS y AAC/E-AC3; no usar películas descargadas como fixtures.

### T12 — Recursos y arranque

Revisar `app.js:331`, `loadStreamingLibs.js`, carga de Movi/FFmpeg, limpieza de motores y cachés.

- Evitar precarga HLS/DASH en login sin intención de reproducción. Mantener importación diferida de motores y aprovechar caché sin duplicar trabajos concurrentes.
- Aceptación: login frío no solicita HLS/DASH por temporizador; navegación y cambios de motor no dejan audio, workers ni descargas abandonadas. Comparar arranque frío/caliente y memoria con la misma metodología de medición.

### T13 — Calidad y CI

- Resolver los siete errores de lint enumerados en la auditoría sin cambios funcionales innecesarios.
- Ejecutar lint, suite completa, adaptadores y build en CI. Añadir E2E con fixture controlada para sonido, idioma y saltos.
- Separar las pruebas autenticadas reales de los checks públicos: requieren una sesión autorizada vigente, secretos protegidos y límites de consumo.
- Aceptación: lint sin errores, checks reproducibles y E2E que falla si desaparece el sonido o se pierde la posición. Tener muchos tests no reemplaza T11.

### T14 — Entrega y reversión

- Agrupar cambios en versiones pequeñas y verificables. Documentar commit, capacidades nuevas, pruebas realizadas y límites pendientes.
- Publicar primero una vista previa para pruebas controladas. Verificar rutas de API, contenido realmente servido, actualización del service worker y sesión ya abierta; después integrar la versión de producción.
- Conservar referencia a la versión anterior y ensayar la reversión de código/configuración sin borrar datos del usuario.
- Aceptación: despliegue correcto y comprobado públicamente; actualización desde versión anterior funciona; si una fuente sigue fallando, hay diagnóstico y salida recuperable.

## Secuencia de ejecución

1. **Bloque A — Base comprobable:** T13 (lint y checks básicos), T01, T02, T03 y T04.
2. **Bloque B — Compatibilidad:** T05, T10 y T06 según la evidencia de acceso. T11 empieza a registrar casos desde este bloque.
3. **Bloque C — Reproducción estable:** T07, T08 y T09; ejecutar E2E de T13 con cada cambio.
4. **Bloque D — Rendimiento y cierre:** T12, cierre de T11 y T14. Aplicar verificación/reversión de T14 a cada entrega intermedia también.

No contratar infraestructura ni migrar alojamiento por anticipado. Si un proveedor requiere relay de medios o conversión persistente, preparar antes una propuesta concreta con casos afectados, alternativa, coste y límites. La pasarela JSON y un relay de medios son entregas distintas.

## Regla para cerrar tareas

Marcar una tarea terminada únicamente con archivos/commit, pruebas ejecutadas, resultado y limitaciones. Estado permitido: pendiente, en curso, bloqueada o terminada. Mantener pruebas y resultados reales separados de objetivos propuestos.

## Avance — primera entrega

- **T13, en curso:** siete errores de lint corregidos; CI ejecuta lint, suite completa (incluye adaptadores) y build. Pendiente el E2E persistente de reproducción previsto después de T07–T08.
- **T01, en curso:** transporte de addons emite categorías de error, recurso y estado HTTP, sin copiar URL, respuesta privada o excepción original. `safeApiCall` conserva el diagnóstico. Pendiente el panel por proveedor y su exportación.
- **T02, en curso:** manifest, meta y subtítulos tienen 8 s; streams, 15 s. El presupuesto cubre lectura y JSON, y un llamador puede cancelarlo. Incluso un transporte que ignore AbortSignal termina para el llamador. Las sesiones de autenticación y las descargas de video no reciben estos límites. Pendientes los reintentos selectivos con presupuesto total.
- **Validación:** `npm run lint` sin errores; `npm test` con 1.840 pruebas aprobadas; `npm run build:netlify` correcto. Pruebas nuevas: transporte que nunca responde, aborto previo y durante la solicitud, clasificación de HTTP/JSON/red, ausencia de secretos y resultados vacíos válidos.
- **Siguiente entrega:** conectar cancelación con navegación y resultados parciales (T03), recuperación de caché (T04) y política de cabeceras (T05). Las pruebas reales T11 siguen pendientes; esta entrega no demuestra equivalencia con Nuve+, LAT-ADD o AddonLatam.
- **Preparación de CI:** las pruebas de artefactos se ejecutan después de compilar; el runner instala FFmpeg para comprobar el servidor local. Esta dependencia de pruebas no habilita un servidor de conversión en Netlify.
