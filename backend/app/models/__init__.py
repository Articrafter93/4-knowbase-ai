"""
Load every ORM model module so SQLAlchemy can resolve cross-model relationships
consistently in API and worker processes.
"""

from app.models import conversation, document, memory, permission, smart_folder, user  # noqa: F401
