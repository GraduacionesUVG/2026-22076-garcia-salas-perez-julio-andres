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

La revisión final de la selección, los archivos, las credenciales y los enlaces se realizó en esta misma sesión, sin un revisor independiente. El informe final aprobado y el consentimiento firmado permanecen pendientes del estudiante.

## Revisión visual posterior

Se sustituyeron las 15 capturas y el montaje de video por versiones sin el cursor de Codex. Se compararon los píxeles de la URL y de cada fragmento de API retenido contra las capturas del commit `92bc271`: todos coinciden exactamente. Las únicas transformaciones de las capturas son recorte y encuadre; no se generaron respuestas nuevas.

El nuevo video es H.264, 2560 × 1440, 24 fps y 218 segundos, sin pista de audio. Contiene subtítulos visibles y una pista de subtítulos en español. El cambio se limita a medios, documentación y herramientas de producción del video; no modifica el backend.
