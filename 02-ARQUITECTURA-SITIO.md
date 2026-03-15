# 02-ARQUITECTURA-SITIO

## Mapa de pantallas
- `/library`: biblioteca con búsqueda, filtros y navegación a documento.
- `/library/[documentId]`: vista de documento con chunks y fragmento resaltado.
- `/chat`: chat con citas y panel de trazabilidad.
- `/upload`: ingesta de archivos, URLs y notas.
- `/memory`: memoria persistente editable.
- `/analytics`: observabilidad de uso e indexación.
- `/admin`: jobs, prompt RAG y reglas de memoria.
- `/settings`: preferencias operativas.

## Componentes obligatorios
- Sidebar con colecciones y acceso a módulos.
- Panel principal de trabajo.
- Panel derecho de trazabilidad.
- Vista de documento con fragmentos navegables.

## SEO y arquitectura
- App privada, por lo que el foco es claridad de información y UX, no indexación pública.
- Metadata básica presente en layout global.
