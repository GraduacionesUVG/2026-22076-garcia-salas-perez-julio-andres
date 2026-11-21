# Capturas del backend

Capturas de operaciones reales de Bruno, reencuadradas para excluir el cursor de Codex y los controles ajenos a la evidencia. La URL y los píxeles de los fragmentos de petición y respuesta retenidos se conservan sin retoques. Se utilizaron cuentas QA y datos sintéticos. Los encuadres muestran fragmentos visibles de la respuesta; no son pantallas del frontend del proyecto. El HTTP 400 de validación y el HTTP 403 posterior a la eliminación son resultados esperados.

| Captura | Operación | HTTP |
|---|---|---|
| [01. Disponibilidad](../capturas/captura-01.png) | `GET /api/health` | 200 |
| [02. Autenticación](../capturas/captura-02.png) | `POST /api/auth/login` | 200 |
| [03. Creación de proyecto](../capturas/captura-03.png) | `POST /api/projects` | 201 |
| [04. Validación de entrada](../capturas/captura-04.png) | `POST /api/projects` | 400 |
| [05. Participantes](../capturas/captura-05.png) | `POST /api/projects/:id/participants` | 201 |
| [06. Corpus documental](../capturas/captura-06.png) | `POST /api/projects/:id/documents` | 201 |
| [07. Libro de códigos](../capturas/captura-07.png) | `POST /api/projects/:id/analysis/codes` | 201 |
| [08. Memo analítico](../capturas/captura-08.png) | `POST /api/projects/:id/analysis/memos` | 201 |
| [09. Lectura de delimitación](../capturas/captura-09.png) | `GET /api/projects/:id/delimitation` | 200 |
| [10. Guardado del protocolo](../capturas/captura-10.png) | `PATCH /api/projects/:id/delimitation` | 200 |
| [11. Revisión metodológica local](../capturas/captura-11.png) | `POST /api/projects/:id/delimitation/review` | 200 |
| [12. Resumen de análisis](../capturas/captura-12.png) | `GET /api/projects/:id/analysis/overview` | 200 |
| [13. Exportación Markdown](../capturas/captura-13.png) | `GET /api/projects/:id/exports/codebook?format=md` | 200 |
| [14. Eliminación del proyecto temporal](../capturas/captura-14.png) | `DELETE /api/projects/:id` | 200 |
| [15. Verificación de limpieza](../capturas/captura-15.png) | `GET /api/projects/:id` | 403 |

El proyecto temporal `30c57b37-e550-4e52-a329-6f546d5f7241` fue creado para este recorrido y eliminado al terminar. La sesión QA se cerró posteriormente mediante `/api/auth/logout` con HTTP 200. La colección temporal se retiró del cliente Bruno.

La evidencia JSON del recorrido automatizado independiente está en [evidencia-api.json](evidencia-api.json); comprende 16 operaciones y añade la comprobación de PDF y de acceso desde una cuenta ajena al proyecto.

La revisión visual está documentada en [el informe de encuadres](../demo/produccion/verificacion.json). El JSON completo del recorrido automatizado se conserva en `evidencia-api.json`.
