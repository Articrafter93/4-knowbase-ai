"""
Audio parser — transcribes audio files using OpenAI Whisper API (Phase 3).
Supports: mp3, mp4, m4a, wav, webm, ogg.
"""
import io
from pathlib import Path

import structlog

from app.core.config import settings

log = structlog.get_logger()

SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".mp4", ".m4a", ".wav", ".webm", ".ogg", ".flac"}
MAX_AUDIO_SIZE_MB = 25  # Whisper API limit


async def transcribe_audio(file_path: Path | str, language: str | None = None) -> dict:
    """
    Transcribe an audio file using OpenAI Whisper API.
    Returns: {"text": str, "language": str, "duration_seconds": float}
    """
    import openai

    path = Path(file_path)
    if path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported audio format: {path.suffix}")

    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_AUDIO_SIZE_MB:
        raise ValueError(f"Audio file too large ({size_mb:.1f}MB). Max is {MAX_AUDIO_SIZE_MB}MB.")

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    log.info("Transcribing audio", file=str(path), size_mb=round(size_mb, 2))

    with open(path, "rb") as f:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(path.name, f, f"audio/{path.suffix.lstrip('.')}"),
            language=language,
            response_format="verbose_json",
        )

    text = response.text.strip()
    log.info("Transcription complete", chars=len(text))

    return {
        "text": text,
        "language": getattr(response, "language", None) or language or "unknown",
        "duration_seconds": getattr(response, "duration", None),
        "source_type": "audio",
        "title": path.stem,
    }


async def transcribe_audio_bytes(content: bytes, filename: str, language: str | None = None) -> dict:
    """Transcribe audio from bytes (for API uploads)."""
    import openai

    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_AUDIO_EXTENSIONS:
        raise ValueError(f"Unsupported audio format: {suffix}")

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    log.info("Transcribing audio from bytes", filename=filename, size_kb=round(len(content) / 1024, 1))

    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, io.BytesIO(content), f"audio/{suffix.lstrip('.')}"),
        language=language,
        response_format="verbose_json",
    )

    return {
        "text": response.text.strip(),
        "language": getattr(response, "language", None) or language or "unknown",
        "duration_seconds": getattr(response, "duration", None),
        "source_type": "audio",
        "title": Path(filename).stem,
    }
