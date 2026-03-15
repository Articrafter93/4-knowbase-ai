# 00-ARQUITECTURA-PROYECTO

## Stack decidido
- Frontend: Next.js + TypeScript + Tailwind.
- Backend: FastAPI.
- Orquestación: LangGraph para flujo RAG y memoria.
- DB canónica: PostgreSQL.
- Vector layer: pgvector como base y Qdrant para recuperación híbrida.
- Jobs: Celery + Redis.
- Infra: Docker Compose.

## Decisiones técnicas clave
- Recuperación híbrida expuesta desde `search` y `chat`.
- Security trimming aplicado en queries documentales y de recuperación.
- Persistencia de conversaciones y feedback para trazabilidad.
- Ingesta unificada con pipeline para URL, archivo, audio y nota.

## Riesgos abiertos
- Falta validar screenshots reales del producto corriendo.
- Falta verificar build frontend en este entorno con dependencias instaladas.
