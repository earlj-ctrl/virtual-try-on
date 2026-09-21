"""Pixel-art avatar generator.

Downscales the source image with nearest-neighbor to a pixel grid, then
upscales back to a larger canvas keeping the crunchy blocky look. Optionally
posterises colours for a stronger pixel-art aesthetic.
"""
from __future__ import annotations
import io
from PIL import Image, ImageOps


def make_pixel_avatar(
    source_bytes: bytes,
    pixel_size: int = 48,
    output_size: int = 384,
    posterize_bits: int = 3,
) -> bytes:
    """Return PNG bytes of a pixelated version of the source image.

    pixel_size: number of pixels along the shortest edge in the "down" pass
    output_size: final image size in real pixels
    posterize_bits: 1-8; lower = more crunched palette
    """
    img = Image.open(io.BytesIO(source_bytes)).convert("RGB")
    img = ImageOps.fit(img, (output_size, output_size), method=Image.LANCZOS)
    # Pixelate: downscale then upscale with NEAREST
    small = img.resize((pixel_size, pixel_size), resample=Image.LANCZOS)
    if posterize_bits and 1 <= posterize_bits <= 8:
        small = ImageOps.posterize(small, posterize_bits)
    out = small.resize((output_size, output_size), resample=Image.NEAREST)
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
