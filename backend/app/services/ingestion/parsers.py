"""
Document parsers — PDF, DOCX, TXT, Markdown, URL, Image (OCR).
Returns plain text for chunking.
"""
import io
import os
from pathlib import Path
from typing import Tuple

import httpx
import pytesseract
from PIL import Image
from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from pypdf import PdfReader


class ParseError(Exception):
    pass


async def parse_url(url: str) -> Tuple[str, dict]:
    """Fetch a URL and extract clean text."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "KnowBase/0.1"})
        resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    # Remove scripts and styles
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    title = soup.find("title")
    metadata = {
        "title": title.text.strip() if title else url,
        "source_url": url,
        "content_type": resp.headers.get("content-type", ""),
    }
    return text, metadata


def parse_pdf(file_path: str) -> Tuple[str, dict]:
    """Extract text from PDF preserving page structure."""
    reader = PdfReader(file_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append(f"[Page {i + 1}]\n{text}")
    full_text = "\n\n".join(pages)
    info = reader.metadata or {}
    metadata = {
        "title": info.get("/Title", Path(file_path).stem),
        "author": info.get("/Author", None),
        "page_count": len(reader.pages),
    }
    return full_text, metadata


def parse_docx(file_path: str) -> Tuple[str, dict]:
    """Extract text from DOCX preserving headings."""
    doc = DocxDocument(file_path)
    sections = []
    for para in doc.paragraphs:
        if para.style.name.startswith("Heading"):
            sections.append(f"\n## {para.text}\n")
        elif para.text.strip():
            sections.append(para.text)
    text = "\n".join(sections)
    props = doc.core_properties
    metadata = {
        "title": props.title or Path(file_path).stem,
        "author": props.author or None,
    }
    return text, metadata


def parse_text(file_path: str) -> Tuple[str, dict]:
    """Read plain text or Markdown files."""
    content = Path(file_path).read_text(encoding="utf-8", errors="replace")
    return content, {"title": Path(file_path).stem}


def parse_image(file_path: str) -> Tuple[str, dict]:
    """OCR an image file using Tesseract."""
    image = Image.open(file_path)
    text = pytesseract.image_to_string(image)
    return text, {"title": Path(file_path).stem, "source_type": "image"}


def parse_file(file_path: str, mime_type: str | None = None) -> Tuple[str, dict]:
    """Dispatch to the correct parser based on extension / mime type."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf" or (mime_type and "pdf" in mime_type):
        return parse_pdf(file_path)
    elif ext in (".docx",) or (mime_type and "wordprocessingml" in mime_type):
        return parse_docx(file_path)
    elif ext in (".txt", ".md", ".markdown"):
        return parse_text(file_path)
    elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"):
        return parse_image(file_path)
    else:
        # Try plain text as fallback
        return parse_text(file_path)
