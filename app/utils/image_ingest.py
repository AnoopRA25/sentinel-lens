"""Image ingest and preprocessing pipeline (skills.md S-11).

Validates image content using Pillow verify(), strips EXIF/GPS metadata (Rule R12),
handles orientation via exif_transpose, enforces size/dimension caps,
and re-encodes clean JPEG in memory without touching disk.
"""

import io
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings
from app.schemas.image import PreparedImage

# Maximum sanity dimension cap to prevent decompression bomb DOS attacks
MAX_RAW_DIMENSION = 10000


class ImageIngestError(Exception):
    """Base exception for image ingest failures."""
    pass


class ImageTooLargeError(ImageIngestError):
    """Uploaded image byte size exceeds MAX_UPLOAD_MB."""
    pass


class InvalidImageFormatError(ImageIngestError):
    """Payload is not a recognized image or empty."""
    pass


class CorruptImageError(ImageIngestError):
    """Image data is malformed or corrupted."""
    pass


class ImageDimensionError(ImageIngestError):
    """Image pixel dimensions exceed maximum sanity boundaries."""
    pass


def prepare_image(
    raw_bytes: bytes,
    max_upload_mb: int | None = None,
    max_side: int | None = None,
) -> PreparedImage:
    """Validate, orient, resize, and strip EXIF from raw image bytes.

    Args:
        raw_bytes: Raw binary image payload.
        max_upload_mb: Max allowed file size in MB (defaults to setting).
        max_side: Max pixel dimension for width or height (defaults to setting).

    Returns:
        PreparedImage containing cleaned JPEG bytes and final dimensions.

    Raises:
        InvalidImageFormatError: If raw_bytes is empty or unrecognizable.
        ImageTooLargeError: If payload exceeds max_upload_mb.
        CorruptImageError: If Pillow verify or decode fails.
        ImageDimensionError: If image dimensions exceed MAX_RAW_DIMENSION.
    """
    settings = get_settings()
    upload_limit_mb = max_upload_mb if max_upload_mb is not None else settings.MAX_UPLOAD_MB
    dimension_limit = max_side if max_side is not None else settings.MAX_IMAGE_SIDE

    # 1. Byte size validation
    if not raw_bytes:
        raise InvalidImageFormatError("Empty image payload provided.")

    byte_limit = upload_limit_mb * 1024 * 1024
    if len(raw_bytes) > byte_limit:
        raise ImageTooLargeError(
            f"Image payload size ({len(raw_bytes)} bytes) exceeds the allowed limit of {upload_limit_mb} MB."
        )

    # 2. Content-based verification (Pillow verify)
    try:
        with Image.open(io.BytesIO(raw_bytes)) as verify_img:
            verify_img.verify()
    except UnidentifiedImageError as e:
        raise InvalidImageFormatError("Unrecognized image format. Only valid images are supported.") from e
    except (SyntaxError, ValueError, OSError) as e:
        raise CorruptImageError(f"Corrupt or invalid image content: {e}") from e

    # 3. Fresh decode for transformation (verify() invalidates image handle)
    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            raw_w, raw_h = img.size
            if raw_w <= 0 or raw_h <= 0:
                raise CorruptImageError(f"Invalid image dimensions: {raw_w}x{raw_h}")

            if raw_w > MAX_RAW_DIMENSION or raw_h > MAX_RAW_DIMENSION:
                raise ImageDimensionError(
                    f"Image dimension ({raw_w}x{raw_h}) exceeds sanity limit of {MAX_RAW_DIMENSION}px."
                )

            # 4. Handle EXIF orientation tag before stripping metadata
            try:
                oriented_img = ImageOps.exif_transpose(img)
                if oriented_img is not None:
                    img = oriented_img
            except Exception:
                # If exif transpose fails, continue with original orientation
                pass

            # 5. Normalize color mode to RGB (flatten transparency if RGBA/P)
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                rgba_img = img.convert("RGBA")
                bg.paste(rgba_img, mask=rgba_img.split()[3])
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # 6. Resize if longest side exceeds dimension_limit
            w, h = img.size
            longest_side = max(w, h)
            if longest_side > dimension_limit:
                scale = dimension_limit / float(longest_side)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # 7. Re-encode as JPEG in memory, stripping EXIF and all metadata
            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=85, optimize=True)
            jpeg_bytes = out_buf.getvalue()

            return PreparedImage(
                data=jpeg_bytes,
                format="JPEG",
                width=img.width,
                height=img.height,
                original_size_bytes=len(raw_bytes),
            )

    except ImageIngestError:
        raise
    except Exception as e:
        raise CorruptImageError(f"Failed to process image: {e}") from e
