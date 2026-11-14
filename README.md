# Backend para investigación antropológica cualitativa

**Proyecto de Graduación 2026 · Universidad del Valle de Guatemala**

**Julio Andrés García Salas Pérez · Carné 22076**

API para construir protocolos y organizar el análisis de datos de investigación antropológica cualitativa en la Ciudad de Guatemala. Incluye autenticación, proyectos y colaboración, delimitación, diseño de investigación, configuración de muestra, participantes, corpus documental, segmentos, códigos, memos, hallazgos y exportaciones.

Esta entrega contiene exclusivamente el backend. Next.js se utiliza como servidor de Route Handlers; no se incluyen páginas, layouts, componentes, estilos, recursos gráficos del cliente ni aplicaciones de interfaz. `react` y `react-dom` se conservan únicamente porque son dependencias de ejecución requeridas por Next.js. La ruta `/` no ofrece una interfaz; para comprobar el servidor se utiliza `/api/health`.

## Tecnologías utilizadas

- Node.js 22.13–24 y TypeScript.
- Next.js 16.2.6 para rutas HTTP y middleware de seguridad.
- Supabase Auth y PostgreSQL con políticas de acceso por fila (RLS).
- Zod para validación de entradas.
- AI SDK y Google AI como proveedores opcionales.
- `pdf-lib`, `docx` y `jszip` para exportación.
- Jest para pruebas unitarias y Playwright para pruebas HTTP.
- Bruno como cliente externo para demostrar la API; su interfaz no forma parte del proyecto.

## Estructura

```text
capturas/                 Evidencias reales de las peticiones en Bruno
demo/                     demo.mp4 y subtítulos en español
docs/                     Referencia de API, arquitectura y verificación
src/                      Raíz instalable del backend
  app/api/                85 archivos de rutas de API
  app/auth/callback/      Callback HTTP de autenticación
  src/lib/                Utilidades del servidor
  src/modules/            Servicios, repositorios, validaciones y seguridad
  supabase/               Esquema de instalación y migraciones históricas
  __tests__/              Pruebas y utilidades del backend
  scripts/                Herramientas HTTP de verificación y demo
  tools/bruno/            Colección reproducible de peticiones de API
  .env.example            Configuración sin credenciales
  package.json
  package-lock.json
README.md
```

La carpeta interna `src/src/` conserva la organización original y los alias de importación del backend; la carpeta externa `src/` corresponde al formato de entrega de la universidad.

## Requisitos previos

1. Node.js **22.13 o posterior de la rama 22**, o **Node.js 24**; npm.
2. Un proyecto Supabase con Auth y el esquema de la aplicación. Para una instalación nueva, consultar [base de datos](docs/base-de-datos.md).
3. Credenciales propias de Supabase: URL y clave `anon`. No se requiere una clave `service_role` para ejecutar la aplicación.
4. Opcional: un proveedor de IA para las funciones conversacionales.

## Instalación

```bash
git clone https://github.com/Hayser8/2026-22076-garcia-salas-perez-julio-andres.git
cd 2026-22076-garcia-salas-perez-julio-andres/src
npm ci
cp .env.example .env.local
```

Editar `src/.env.local` para configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto donde se instaló el esquema. Las claves reales y los archivos `.env.local` no se incluyen en Git.

## Ejecución

Desde la carpeta `src/`:

```bash
npm run dev -- --port 3317
```

Utilizar **`http://localhost:3317`** para las peticiones y su encabezado `Origin`. El servidor escucha solamente en la interfaz local. Para detenerlo, presionar `Ctrl+C`.

Comprobación pública:

```bash
curl http://localhost:3317/api/health
# {"ok":true}
```

El endpoint público confirma disponibilidad de la aplicación, no una comprobación exhaustiva de la base de datos. Los diagnósticos internos requieren su configuración restringida.

Para compilar y ejecutar en modo producción:

```bash
npm run build
npm start -- --port 3317
```

En producción, publicar detrás de HTTPS: las cookies de sesión se marcan como `Secure`. Para las pruebas HTTP locales y la colección Bruno se utiliza el modo de desarrollo.

## Uso de la API

Los endpoints y métodos están enumerados en [la referencia de API](docs/api.md). Las operaciones protegidas utilizan cookies de sesión. Las mutaciones con sesión requieren un encabezado `Origin` que coincida con el origen del servidor.

Ejemplo con una cuenta de pruebas propia:

```bash
curl -c cookies.txt -X POST http://localhost:3317/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3317' \
  --data '{"email":"qa_backend_owner@example.com","password":"TU_CLAVE_LOCAL"}'

curl -b cookies.txt -X POST http://localhost:3317/api/projects \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3317' \
  --data '{"name":"Mi investigación","description":"Proyecto de prueba"}'
```

`cookies.txt` contiene una sesión privada: mantenerlo fuera del repositorio y eliminarlo al terminar.

### Inteligencia artificial y respaldo local

`AI_GATEWAY_API_KEY` y `GEMINI_API_KEY` son opcionales. Sin proveedores configurados, las revisiones de delimitación, diseño y muestra utilizan reglas heurísticas y declaran el origen del resultado. Estas reglas no certifican coherencia semántica. Los chats requieren un proveedor configurado y no tienen una conversación local sustitutiva.

## Pruebas

Desde `src/`:

```bash
npm test
npm run typecheck
npm run build
```

Las pruebas unitarias no requieren credenciales reales. Para cobertura: `npm run test:coverage`.

Las pruebas HTTP necesitan una base de pruebas y cuentas QA separadas. Copiar `.env.backend-tests.example` a `.env.backend-tests.local`, completar valores propios y definir `TEST_ALLOWED_SUPABASE_HOST` con el host autorizado. Las variables de Supabase deben estar disponibles en el entorno del proceso de pruebas, además de estar configuradas para el servidor. El comando `npm run test:integration` utiliza el servidor protegido definido en `playwright.backend.config.ts`; no ejecuta las pruebas heredadas que crean usuarios aleatorios permanentes.

Los resultados de esta preparación y sus límites se registran en [verificación](docs/verificacion.md). No se presenta el recorrido de demo como ejecución de toda la batería de integración.

## Demo y capturas

- [Video demostrativo sin narración, con subtítulos en español](demo/demo.mp4).
- [Subtítulos SRT](demo/subtitulos.srt).
- [Capturas de las operaciones reales de API](capturas/).
- [Índice de capturas](docs/capturas.md).
- [Colección de Bruno](src/tools/bruno/) para repetir las operaciones con credenciales propias.
- `node scripts/demo-api.mjs`: recorrido HTTP automatizado con datos sintéticos, desde `src/`. Requiere el servidor local activo y las cuentas QA configuradas. Crea un proyecto temporal, verifica operaciones y elimina únicamente ese proyecto.

## Documentación y estado de entrega

- [Arquitectura del backend](docs/arquitectura.md).
- [Instalación de la base de datos](docs/base-de-datos.md).
- [Checklist de entrega](docs/checklist-entrega.md).
- [Procedencia y exclusiones de la extracción](docs/procedencia-backend.json).

**Pendientes a cargo del estudiante:** el informe final aprobado debe agregarse como `docs/informe_final.pdf` y el consentimiento firmado como `docs/consentimiento_firmado.pdf`. Esos documentos aún no forman parte de esta entrega. El checklist y el Pull Request de entrega final deben completarse después de incorporarlos.

## Autor y licencia

Julio Andrés García Salas Pérez · Carné 22076. No se asigna una licencia nueva al código en esta preparación. Las licencias de los recursos tipográficos incluidos se conservan junto a sus archivos.
