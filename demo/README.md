# Video demostrativo

`demo.mp4` es una **grabación real** de la colección de Bruno enviando las 16 peticiones al backend en ejecución local (`http://localhost:3317`), con una cuenta QA y datos sintéticos. Dura **4 minutos y 9 segundos**, a **1920 × 1080** y **30 fps** (H.264). Incluye **narración del autor**, música de fondo baja, una pista de subtítulos seleccionable en español y el archivo `subtitulos.srt`.

La duración la marca la narración. Cada explicación se muestra sobre el paso que describe. Los silencios se recortaron a pausas breves, y los tramos de la grabación sin voz se aceleran a 2× para no saltarse ningún paso.

Grabación del 19 de noviembre de 2026. Las 16 respuestas devolvieron el código esperado:

| # | Petición | Respuesta |
|---|---|---|
| 01 | `GET /api/health` | 200 |
| 02 | `POST /api/auth/login` | 200 |
| 03 | `POST /api/projects` | 201 |
| 04 | `POST /api/projects` con nombre vacío | 400 |
| 05 | `POST /api/projects/:id/participants` | 201 |
| 06 | `POST /api/projects/:id/documents` | 201 |
| 07 | `POST /api/projects/:id/analysis/codes` | 201 |
| 08 | `POST /api/projects/:id/analysis/memos` | 201 |
| 09 | `GET /api/projects/:id/delimitation` | 200 |
| 10 | `PATCH /api/projects/:id/delimitation` | 200 |
| 11 | `POST /api/projects/:id/delimitation/review` | 200 |
| 12 | `GET /api/projects/:id/analysis/overview` | 200 |
| 13 | `GET /api/projects/:id/exports/codebook?format=md` | 200 |
| 14 | `DELETE /api/projects/:id` | 200 |
| 15 | `GET /api/projects/:id` después de eliminar | 403 |
| 16 | `POST /api/auth/logout` | 200 |

La edición solo agrega encima de la grabación:
- un marco;
- una franja inferior con el número de paso, la ruta y el código recibido;
- una portada y un cierre.

En la respuesta del inicio de sesión se difumina el correo de la cuenta QA. Las contraseñas no aparecen: Bruno muestra `{{qaPassword}}`. El servidor se ejecutó sin claves de IA, así que la revisión metodológica usa reglas heurísticas.

`portada.png` y `vista-previa.png` son cuadros del video. Bruno es un cliente externo; su interfaz no forma parte del proyecto.

## Cómo se grabó

Las herramientas están en `grabacion/`:

1. Iniciar el backend (`npm run dev -- --port 3317` desde `src/`) y crear `src/tools/bruno/environments/Local.bru` con la cuenta QA. Ese archivo está excluido de Git.
2. Abrir Bruno con `--remote-debugging-port=9333`, abrir la colección `src/tools/bruno` y seleccionar el entorno `Local`.
3. `node demo/grabacion/grabar.mjs SALIDA` abre cada petición, muestra su cuerpo, pulsa **Send** y guarda los cuadros reales de la ventana de Bruno junto con `timeline.json`.
4. `node demo/grabacion/overlays.mjs SALIDA/timeline.json CAPAS` genera la portada, el cierre y las franjas.
5. `node demo/grabacion/editar.mjs SALIDA CAPAS demo.mp4 [musica.wav]` monta el video.
6. `node demo/grabacion/subtitulos.mjs demo.tiempos.json demo/subtitulos.srt` genera los subtítulos.

`timeline.json` y `tiempos.json` conservan los tiempos y los códigos de respuesta de la grabación base de 2:35; sus marcas de tiempo no corresponden al montaje narrado de 4:09. El plan de edición narrado se conserva en `grabacion/narracion/plan.json`. La carpeta `produccion/` contiene las herramientas de la versión anterior, un montaje de capturas, como referencia.

## Narración

La narración se grabó aparte, con el video original en pantalla. Los scripts de `grabacion/narracion/` hacen la edición:

1. Aislar la voz de la música con Demucs (`htdemucs`, dos pistas).
2. Detectar los tramos con voz (`vad.py`, Silero VAD) y transcribirlos con marcas de tiempo por palabra (`tr.py`, faster-whisper).
3. Alinear cada cuadro de la grabación narrada con la versión anterior de `demo.mp4`, sin narración y de 2:35, para saber qué paso se mostraba al hablar. Esa versión sigue en el historial de Git y es la fuente de los cuadros.
4. `plan.py` decide qué se conserva: la voz a velocidad real, los silencios recortados y los tramos sin voz acelerados. `plan.json` guarda el resultado.
5. `build.py` arma los cuadros y la pista de voz. Luego se limpian (filtro, reducción de ruido, compresión y `loudnorm` a -16 LUFS) y se mezclan con la música de `audio.mjs`, que baja automáticamente mientras se habla.

Los subtítulos salen de la transcripción del audio final, con correcciones de términos técnicos. Se omitió una frase ininteligible que se grabó encima de la música.
