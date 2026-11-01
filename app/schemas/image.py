"""Image schemas for ingested and preprocessed images.

Defines PreparedImage per agent.md §4.3 and skills.md S-11.
"""

from pydantic import BaseModel, ConfigDict, Field, computed_field


class PreparedImage(BaseModel):
    """Cleaned, EXIF-stripped, size-capped in-memory image representation.
    Produced by image_ingest (S-11) and consumed by perception (S-12).
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    data: bytes = Field(..., description="JPEG-encoded image bytes (EXIF metadata stripped)")
    format: str = Field(default="JPEG", description="Encoding format, always JPEG")
    width: int = Field(..., ge=1, description="Image width in pixels")
    height: int = Field(..., ge=1, description="Image height in pixels")
    original_size_bytes: int | None = Field(default=None, description="Raw input upload size before processing")

    @computed_field
    @property
    def aspect_ratio(self) -> float:
        """Width divided by height."""
        return self.width / self.height if self.height else 1.0

    def as_bytes(self) -> bytes:
        """Return raw data bytes."""
        return self.data
