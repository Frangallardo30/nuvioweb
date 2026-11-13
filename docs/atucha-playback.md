# Rama experimental de reproducción en Atucha

Rama: `experimental/atucha-playback`.

## Base y alcance

Parte del commit `e05d63d`, cuya aplicación coincide con la primera publicación `5b5aac7`. `main` conserva esa versión restaurada. Esta entrega prepara la rama y sus comprobaciones; todavía no incorpora una corrección nueva de audio ni certifica reproducción real en la red de Atucha.

Objetivo: conservar la reproducción de video que ya funcionaba y resolver el audio y la selección de idioma con cambios pequeños y medibles. El reporte actual indica que desde el celular se accede a los proveedores pero falta sonido; aún se debe registrar navegador y sistema del dispositivo.

La configuración de Netlify permanece a cargo del usuario. Crear o subir esta rama no cambia su rama de producción.

## Cambiar la rama en Netlify

En el proyecto `nuviofranga`, buscar la configuración de despliegue continuo y de ramas, seleccionar `experimental/atucha-playback` como rama de producción y ejecutar un nuevo despliegue. Los nombres exactos de los apartados pueden variar en el panel de Netlify.

Configuración existente que debe conservarse:

- Comando de compilación: `npm run build:netlify`.
- Directorio publicado: `dist`.
- Variables de entorno actuales; no pegar credenciales personales en archivos del repositorio.

Verificar en el despliegue el nombre de la rama y su commit. Cerrar las pestañas anteriores y volver a cargar la web para evitar comparar con una copia antigua del service worker. Para volver a la versión restaurada, seleccionar `main` y desplegar nuevamente.

## Comprobaciones antes de cada entrega

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:atucha
npm run build:netlify
```

`test:atucha` agrupa pruebas existentes de capacidades, pistas de audio, remux, bloqueo inicial de audio y adaptadores de Netlify. No se conecta a Nuve+ ni a Addon Latam y no demuestra por sí solo reproducción real. Para ejecutar la suite completa primero se necesita el build, porque algunas pruebas inspeccionan `dist`.

## Secuencia de experimentos

1. **Confirmar la base:** misma película, proveedor y fuente en el PC de Atucha y en el celular. Registrar navegador, sistema, red, duración, códecs y mensaje visible. No deducir compatibilidad por el nombre de la fuente.
2. **Distinguir acceso y contenido:** confirmar que se entrega la película anunciada, en lugar de un clip de aviso, y separar fallos de manifiesto, resolución, Range y decodificación.
3. **Medir el audio:** comprobar silencio/volumen, pista realmente seleccionada, códec y estado de decodificación. Una lista vacía de pistas no prueba que el archivo carezca de sonido.
4. **Probar una solución de audio aislada:** mantener el video nativo cuando sea posible. Cada alternativa necesita evidencia de sonido real, selección ES/EN, conservación de posición y ausencia de desfase creciente antes de activarse automáticamente.
5. **Validar controles y estabilidad:** pausa, salto, cambio de idioma, subtítulos, salida del reproductor y al menos diez minutos de reproducción. Separar baja descarga de baja tasa real de cuadros.

No reutilizar automáticamente los cambios experimentales anteriores. No cambiar la ruta de todos los proveedores para resolver una sola fuente. No intentar eludir bloqueos de red o límites del proveedor. Si Nuve+ devuelve un aviso de límite, detener las pruebas de medios y registrar el caso como bloqueado.

## Registro de entregas

| Entrega | Cambio | Estado |
|---|---|---|
| Preparación | Rama desde la versión restaurada, guía y comando `test:atucha` | Preparada; ver resultados de ejecución en el mensaje de entrega |
| Base real en Atucha | Comparación del PC y celular con una misma fuente | Pendiente del despliegue de esta rama y prueba en esos dispositivos |
| Audio | Alternativa aislada y verificada | Pendiente |

Los enlaces de instalación, tokens y URLs firmadas de las pruebas reales no se guardan en esta guía ni en el historial Git.
