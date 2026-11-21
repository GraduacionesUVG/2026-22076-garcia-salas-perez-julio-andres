# Arquitectura del backend

La extracción conserva las rutas y los módulos de servidor del repositorio original sin modificar su lógica de negocio. El inventario y el commit de procedencia están en `procedencia-backend.json`.

```text
Cliente HTTP externo (curl, Bruno u otro consumidor)
        ↓
Proxy: validación del origen y encabezados de seguridad
        ↓
Route Handler: sesión, rol por proyecto y validación Zod
        ↓
Servicio de dominio
        ↓
Repositorio → Supabase Auth / PostgreSQL con RLS
        ↓
Respuesta JSON, flujo de IA o archivo exportado
```

## Módulos

| Módulo | Responsabilidad |
|---|---|
| Auth, usuarios y perfiles | Sesiones, credenciales y datos del usuario |
| Proyectos y colaboración | Membresías, roles, invitaciones y presencia |
| Delimitación | Tema, contexto, población, alcance y versiones |
| Diseño de investigación | Pregunta, objetivos, evaluación y versiones |
| Configuración de muestra | Enfoque, alcance, técnicas y revisión |
| Participantes y documentos | Corpus, fuentes, versiones, papelera y segmentos |
| Análisis | Códigos, codificación de segmentos, memos, hallazgos y resúmenes |
| Exportaciones | Documentos Markdown, DOCX, PDF y paquetes ZIP |
| Seguridad | Sesión, permisos, CSRF, límites de uso, errores y registro seguro |

Las revisiones metodológicas pueden recurrir a reglas locales cuando no hay proveedor de IA. Los chats requieren un proveedor real. La persistencia, autorización y validación siguen ejecutándose en el servidor.

Las rutas de callback conservan sus contratos de redirección para consumidores externos. Las páginas `/login` y `/auth/reset` no se incluyen: pertenecen a la aplicación cliente del proyecto original.

## Archivos excluidos

Se excluyeron `features/`, `components/`, `public/`, `styles/`, páginas, layouts, hojas de estilo, configuración de Tailwind, dependencias de presentación y pruebas de interfaz. Las referencias textuales a consumidores históricos en los inventarios de pruebas no incorporan su código.
