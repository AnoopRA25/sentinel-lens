"""Tests for image ingest and preparation (skills.md S-11)."""

import io
import pytest
from PIL import Image

from app.utils.image_ingest import (
    CorruptImageError,
    ImageDimensionError,
    ImageTooLargeError,
    InvalidImageFormatError,
    prepare_image,
)


def create_test_image(
    width: int = 400,
    height: int = 300,
    fmt: str = "JPEG",
    exif_orientation: int | None = None,
) -> bytes:
    """Generate in-memory test image with optional EXIF orientation."""
    img = Image.new("RGB", (width, height), color=(200, 100, 50))
    buf = io.BytesIO()

    exif = None
    if exif_orientation is not None:
        exif = img.getexif()
        # 0x0112 is EXIF Orientation tag
        exif[0x0112] = exif_orientation
        img.save(buf, format=fmt, exif=exif)
    else:
        img.save(buf, format=fmt)

    return buf.getvalue()


def test_prepare_image_valid():
    raw = create_test_image(800, 600)
    prep = prepare_image(raw, max_upload_mb=10, max_side=1600)

    assert prep.format == "JPEG"
    assert prep.width == 800
    assert prep.height == 600
    assert len(prep.data) > 0
    assert prep.original_size_bytes == len(raw)


def test_prepare_image_resizes_oversize_dimensions():
    # 2000 x 1000 with max_side 1000 should resize to 1000 x 500
    raw = create_test_image(2000, 1000)
    prep = prepare_image(raw, max_upload_mb=10, max_side=1000)

    assert prep.width == 1000
    assert prep.height == 500


def test_prepare_image_strips_exif():
    # Create image with EXIF orientation 6 (90 degrees CW)
    raw = create_test_image(400, 200, exif_orientation=6)
    prep = prepare_image(raw)

    # Orientation 6 should transpose 400x200 to 200x400
    assert prep.width == 200
    assert prep.height == 400

    # Output image must have no EXIF tags (Rule R12: privacy by default)
    with Image.open(io.BytesIO(prep.data)) as out_img:
        exif = out_img.getexif()
        assert len(exif) == 0


def test_prepare_image_rejects_oversized_payload():
    raw = create_test_image(100, 100)
    # limit 0.0001 MB (<100 bytes)
    with pytest.raises(ImageTooLargeError):
        prepare_image(raw, max_upload_mb=0)


def test_prepare_image_rejects_empty_and_corrupt_data():
    with pytest.raises(InvalidImageFormatError):
        prepare_image(b"")

    with pytest.raises(InvalidImageFormatError):
        prepare_image(b"not an image at all, just plain text")

    with pytest.raises(CorruptImageError):
        # Truncated valid JPEG file
        real_jpeg = create_test_image(100, 100)
        truncated = real_jpeg[: len(real_jpeg) // 2]
        prepare_image(truncated)


def test_prepare_image_handles_rgba():
    img = Image.new("RGBA", (200, 200), color=(100, 150, 200, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()

    prep = prepare_image(raw)
    assert prep.format == "JPEG"
    assert prep.width == 200
    assert prep.height == 200
