# 01-BRIEFING

## Objetivo
Convertir KnowBase en una base de conocimiento personal con IA orientada a trabajo serio: almacenar documentos, enlaces, notas, imágenes y audio; conversar sobre ese corpus con citas trazables; y mantener memoria persistente editable.

## Audiencia
- Profesionales y founders que necesitan un "second brain" privado.
- Equipos pequeños que requieren búsqueda, chat contextual y trazabilidad por fuente.

## Alcance funcional confirmado
- Biblioteca documental con colecciones, favoritos y estados.
- Ingesta de PDF, DOCX, TXT, Markdown, imágenes, audio, URLs y notas.
- Chat contextual con citas por chunk y salto directo a fuente.
- Memoria persistente editable.
- Panel admin con estado de ingesta y parámetros de recuperación.

## Sensibilidad de datos
- Clasificación: registrado.
- Riesgos: documentos privados, conversaciones, posibles notas sensibles.

## API y backend
- API requerida: sí.
- Alcance API: BFF/API privada para frontend web y jobs de ingesta.
- Modo de datos inicial: real para Postgres/Qdrant; mock-first tolerable donde falten servicios externos.

## Integraciones backend requeridas
- Auth: JWT propio.
- DB: PostgreSQL.
- Vector: pgvector + Qdrant.
- Storage: filesystem local hoy; S3-compatible previsto.
- Analítica/observabilidad: logs estructurados y métricas admin.

## Dinamismo
- Intensidad: medium.
- Justificación: producto B2B serio con necesidad de percepción premium, sin artificio excesivo.
