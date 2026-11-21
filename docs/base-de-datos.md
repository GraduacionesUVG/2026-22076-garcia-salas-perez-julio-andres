# Base de datos

El backend utiliza Supabase Auth y PostgreSQL. El servidor necesita una URL de Supabase y una clave `anon`; aplica las sesiones y las políticas RLS de la base.

## Instalación en un proyecto Supabase nuevo

1. Crear un proyecto Supabase propio. Su infraestructura proporciona los esquemas de Auth, los roles `anon`, `authenticated`, `service_role` y las funciones `auth.uid()` y `auth.jwt()`.
2. Revisar y ejecutar `src/supabase/schema.sql` en el editor SQL **de ese proyecto nuevo**. Es una instantánea del esquema actual del backend, con tablas, restricciones, funciones, índices, RLS, triggers, privilegios y catálogos metodológicos.
3. Habilitar autenticación por correo y configurar las URLs de callback que utilizará el consumidor de la API. Para una demostración por contraseña no se necesita una interfaz web.
4. Crear cuentas de prueba propias mediante Supabase Auth y comprobar que se generen sus perfiles.
5. Completar `src/.env.local` y probar la autenticación y la creación de un proyecto.

La instantánea no contiene usuarios, sesiones, contraseñas ni datos de investigación. Los únicos registros de configuración incluidos corresponden a las opciones metodológicas de muestra.

## Migraciones históricas

Se conservaron las ubicaciones de las migraciones del proyecto original:

- `src/supabase/migrations/`.
- `src/supabase/supabase/migrations/`.

Esas migraciones documentan cambios históricos sobre una base ya existente; por sí solas no crean todas las tablas iniciales. **No deben aplicarse después de restaurar la instantánea actual.** Para una instalación nueva se utiliza `schema.sql`; para mantener una instalación existente se sigue su historial real de migraciones.

La preparación de esta entrega no aplicó DDL ni cambió el esquema del proyecto remoto existente. Las operaciones de demo utilizan cuentas QA y proyectos temporales independientes de las investigaciones reales.
