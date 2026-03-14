"""
OpenTelemetry setup — traces for every FastAPI request and LangGraph span.
Supports OTLP exporter (Jaeger / Grafana Tempo) and stdout for dev.
"""
import os
from contextlib import contextmanager
from typing import Iterator

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

from app.core.config import settings

_tracer: trace.Tracer | None = None


def setup_tracing(app=None) -> None:
    """
    Initialize OpenTelemetry. Call once at app startup.
    Set OTEL_EXPORTER_OTLP_ENDPOINT in .env to point to Grafana Tempo / Jaeger.
    """
    global _tracer

    resource = Resource(attributes={SERVICE_NAME: settings.APP_NAME})
    provider = TracerProvider(resource=resource)

    otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
    elif settings.ENVIRONMENT == "development":
        # Dev: print traces to console
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer(settings.APP_NAME)

    # Auto-instrument FastAPI and SQLAlchemy
    if app:
        FastAPIInstrumentor.instrument_app(app)
    SQLAlchemyInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()


def get_tracer() -> trace.Tracer:
    global _tracer
    if _tracer is None:
        _tracer = trace.get_tracer(settings.APP_NAME)
    return _tracer


@contextmanager
def rag_span(name: str, **attributes) -> Iterator[trace.Span]:
    """
    Context manager for tracing individual RAG graph nodes.
    Usage: with rag_span("rerank", query=query, chunk_count=n): ...
    """
    tracer = get_tracer()
    with tracer.start_as_current_span(f"rag.{name}") as span:
        for k, v in attributes.items():
            span.set_attribute(k, str(v))
        try:
            yield span
        except Exception as exc:
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR, str(exc))
            raise
