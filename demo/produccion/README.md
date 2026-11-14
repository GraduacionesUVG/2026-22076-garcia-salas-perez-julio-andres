# Producción del video

Estas herramientas producen archivos de video e imágenes de evidencia de forma local; no ejecutan ni contienen una interfaz web del proyecto. Requieren Node.js, las dependencias de `src/` instaladas, FFmpeg y el historial de Git con el commit original de las capturas (`92bc271`).

1. Desde la raíz del repositorio, ejecutar `node demo/produccion/preparar.cjs`. El comando informa la carpeta temporal creada.
2. Ejecutar `node demo/produccion/renderizar.cjs RUTA_TEMPORAL`.
3. Revisar el MP4, las capturas, los subtítulos y `timeline.json` antes de sustituir los entregables.

`escenas.json` define títulos, endpoints, duración, subtítulos y encuadres. `preparar.cjs` recupera las capturas originales desde Git, conserva la URL y los paneles de API, comprueba igualdad de píxeles y crea las composiciones. Los cursores de las originales se encuentran fuera de las regiones retenidas.

`renderizar.cjs` codifica las escenas de forma secuencial con dos hilos de FFmpeg, espera a que cada proceso termine, agrega las transiciones y empaqueta el video con su pista de subtítulos. Todos los procesos de renderizado terminan al finalizar; ante SIGINT o SIGTERM se señala al proceso activo.

`verificacion.json` registra los encuadres utilizados y el resultado de la comparación contra los píxeles originales. La presentación añade títulos y subtítulos alrededor de la evidencia, sin alterar sus datos.
