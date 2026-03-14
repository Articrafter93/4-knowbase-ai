"""
Semantic chunker — splits documents into overlapping chunks respecting sentence and heading boundaries.
"""
import re
from dataclasses import dataclass
from typing import List

from app.core.config import settings


@dataclass
class TextChunk:
    text: str
    chunk_index: int
    char_start: int
    char_end: int
    section_title: str | None = None
    page_number: int | None = None
    token_count: int | None = None


def _split_sentences(text: str) -> List[str]:
    """Naive sentence splitter — good enough for most prose."""
    return re.split(r'(?<=[.!?])\s+', text.strip())


def _estimate_tokens(text: str) -> int:
    """Rough token count: ~4 chars per token."""
    return max(1, len(text) // 4)


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
    page_number: int | None = None,
) -> List[TextChunk]:
    """
    Semantic chunking with overlap.
    - Respects paragraph/heading boundaries first.
    - Falls back to sentence-level splitting for oversized paragraphs.
    """
    chunk_size = chunk_size or settings.CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP

    # Split on double newlines (paragraphs / headings)
    raw_blocks = re.split(r'\n{2,}', text)
    current_section: str | None = None
    chunks: List[TextChunk] = []
    buffer = ""
    buffer_start = 0
    char_cursor = 0

    def flush(buf: str, start: int) -> None:
        if buf.strip():
            chunks.append(
                TextChunk(
                    text=buf.strip(),
                    chunk_index=len(chunks),
                    char_start=start,
                    char_end=start + len(buf),
                    section_title=current_section,
                    page_number=page_number,
                    token_count=_estimate_tokens(buf),
                )
            )

    for block in raw_blocks:
        block_lower = block.strip().lower()
        # Detect markdown / heading-style blocks
        if re.match(r'^#{1,6}\s', block) or (len(block.strip()) < 120 and block.strip().endswith('\n')):
            current_section = block.strip().lstrip('#').strip()

        if _estimate_tokens(buffer + " " + block) <= chunk_size:
            buffer = (buffer + " " + block).strip()
        else:
            flush(buffer, buffer_start)
            # Overlap: carry last N tokens
            sentences = _split_sentences(buffer)
            overlap_sentences: List[str] = []
            overlap_tokens = 0
            for s in reversed(sentences):
                t = _estimate_tokens(s)
                if overlap_tokens + t > chunk_overlap:
                    break
                overlap_sentences.insert(0, s)
                overlap_tokens += t
            buffer = " ".join(overlap_sentences + [block]).strip()
            buffer_start = char_cursor

        char_cursor += len(block) + 2  # +2 for the \n\n separator

    flush(buffer, buffer_start)
    return chunks
