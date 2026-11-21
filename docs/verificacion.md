# Verificación de la entrega de backend

Fecha: 14 de noviembre de 2026. Entorno: macOS, Node.js 24.18.1, Next.js 16.2.6.

| Verificación | Resultado |
|---|---|
| Instalación mediante `npm ci` | Correcta; lockfile con versiones fijadas |
| `npm test` | 98 suites, 2,092 pruebas y 1 snapshot correctos |
| `npm run test:coverage` | Correcto; se cumplieron los umbrales configurados |
| Cobertura global | 85.85 % sentencias; 68.26 % ramas; 88.50 % funciones; 88.97 % líneas |
| `npm run typecheck` | Correcto |
| `npm run build` | Correcto; rutas de API compiladas |
| Código de presentación en la entrega | 0 archivos JSX, TSX, CSS, SCSS o HTML |
| Rutas y módulos originales | 85 rutas API y 95 archivos de módulos/utilidades conservados sin cambios |
| Recorrido HTTP automatizado | 16 operaciones con estados esperados; proyecto temporal eliminado |
| Exportación PDF | HTTP 200; tamaño, tipo, firma y SHA-256 registrados en `evidencia-api.json` |
| Capturas de Bruno | 15 capturas reencuadradas con peticiones y respuestas reales, sin el cursor de Codex |
| Limpieza de Bruno | Proyecto temporal eliminado y sesión QA cerrada |
| Restauración del esquema | 34 tablas y 103 políticas creadas en PostgreSQL local vacío |
| Trigger de Auth | Creó correctamente un perfil a partir de un usuario sintético local |
| Procesos temporales | Servidor de demo y bases PostgreSQL locales detenidos y verificados |

## Alcance y límites

La restauración se probó sobre PostgreSQL 18.6 local con roles y funciones mínimas que representan la infraestructura de Auth de Supabase. No constituye una prueba de despliegue completo en un proyecto Supabase nuevo. La base remota no recibió cambios de esquema.

Las pruebas unitarias utilizan dobles de dependencias donde corresponde. El recorrido HTTP sí utilizó el servidor extraído y la base configurada, con cuentas QA y datos sintéticos. Se verificaron proyectos, validación, participantes, documentos, códigos, memos, delimitación, respaldo heurístico, resúmenes, PDF, permisos y limpieza. No se ejecutó aquí toda la batería histórica de integración ni llamadas a proveedores externos de IA.

Dos suites de infraestructura del proyecto original no se trasladaron: la auditoría de llamadas desde archivos del cliente y el inventario mixto de pruebas, porque dependen del frontend excluido. Se adaptaron rutas de migraciones, el prefijo de la carpeta de entrega y la configuración de pruebas HTTP para esperar `/api/health` en lugar de una página raíz. La lógica de negocio y las rutas originales no se modificaron.

La revisión final de la selección, los archivos, las credenciales y los enlaces se realizó en esta misma sesión, sin un revisor independiente. A esa fecha, el informe final aprobado y el consentimiento firmado permanecían pendientes del estudiante. Las actualizaciones posteriores constan abajo.

## Revisión visual posterior

Se sustituyeron las 15 capturas y el montaje de video por versiones sin el cursor de Codex. Se compararon los píxeles de la URL y de cada fragmento de API retenido contra las capturas del commit `92bc271`: todos coinciden exactamente. Las únicas transformaciones de las capturas son recorte y encuadre; no se generaron respuestas nuevas.

El nuevo video es H.264, 2560 × 1440, 24 fps y 218 segundos, sin pista de audio. Contiene subtítulos visibles y una pista de subtítulos en español. El cambio se limita a medios, documentación y herramientas de producción del video; no modifica el backend.

## Primera actualización del 20 de noviembre de 2026

Se incorporó `docs/consentimiento_firmado.pdf` como copia exacta del PDF proporcionado por el estudiante. La revisión visual muestra los datos completados y una firma visible; el archivo tiene una página y no está cifrado. No se modificó, firmó ni aplanó el PDF.

La demo fue sustituida por la nueva grabación preparada por el estudiante: 155.434 segundos, H.264 a 1920 × 1080, 30 fps, 9,056,922 bytes, audio AAC y subtítulos seleccionables en español. La decodificación completa de video y audio terminó sin errores. Los archivos de `demo/grabacion/` contienen las herramientas y tiempos de esa grabación; las secciones anteriores describen versiones históricas.

En esa versión, el README de la grabación indicaba música de fondo sin narración. El manual oficial pide una duración de 3–5 minutos y narración explicativa: esos requisitos permanecieron pendientes hasta la revisión narrada descrita abajo. Tampoco se agregó un informe no aprobado ni se creó el PR de entrega final.

La revisión de esta actualización cubre los medios, la copia del consentimiento y el estado de entrega; no vuelve a ejecutar las pruebas del backend que constan arriba. No se modificó la lógica del servidor.

## Sustitución por la demo narrada del 20 de noviembre de 2026

Se revisó la nueva versión preparada por el estudiante y se conservó su contenido sin volver a editarla. `demo/demo.mp4` dura **249.433 segundos (4:09)**: H.264, 1920 × 1080, 30 fps, 13,922,595 bytes, audio AAC y pista de subtítulos en español. Cumple los requisitos técnicos de duración, resolución, formato y tamaño del manual. La decodificación completa de video y audio con FFmpeg terminó con código 0 y sin errores.

La revisión de audio con Earshot detectó narración en el recorrido: nivel integrado de -17.7 LUFS y pico verdadero de -3.1 dBTP. Se revisaron cuadros de la introducción y de las operaciones, junto con el texto de los subtítulos, que explica autenticación QA, proyectos, validaciones, análisis, exportación y cierre de sesión. Los 40 subtítulos SRT están ordenados y terminan a los 240.940 segundos, dentro de la duración del video. Esta revisión confirma la presencia de voz; no constituye una comprobación independiente palabra por palabra de la transcripción.

SHA-256 del video revisado: `182e26b5730d83db99ba7ac626cf7a419c274ae25dc26e13d92beef66aeb442f`.

Los scripts y el plan de edición en `demo/grabacion/narracion/` se incluyen como herramientas de producción; no agregan código de frontend a la aplicación. No se modificó `src/` ni se repitieron las pruebas del servidor por esta actualización de medios y documentación. Siguen pendientes el informe final aprobado, la confirmación de la fecha y hora límite y el proceso de Pull Request con su aprobación e integración.

## Incorporación del informe final del 20 de noviembre de 2026

El estudiante proporcionó su informe final y solicitó incorporarlo y crear el Pull Request. Se agregó `docs/informe_final.pdf` como copia binaria exacta: **92 páginas**, **1,566,969 bytes**, sin cifrado ni contraseña. Se comprobó la extracción de texto y la renderización de las 92 páginas; se revisó visualmente una selección de portada, aprobación, contenido y anexos. El índice y el texto incluyen resumen, introducción, objetivos, antecedentes, marco teórico, metodología, resultados, discusión, conclusiones y bibliografía. No se editaron el contenido, las firmas ni la presentación del PDF.

SHA-256 del informe: `1cb8f431980ba96fecaa182f8d4e2d895b649931904e88a29c8ae1009145e252`.

Se actualizó el enlace del README y se retiró el informe de los documentos pendientes. Esta revisión no revalida académicamente el trabajo ni vuelve a ejecutar las pruebas históricas del servidor: solo incorpora el documento final y prepara su entrega. La aprobación e integración del Pull Request corresponden a la universidad; la fecha límite debe confirmarse con su comunicación oficial.
