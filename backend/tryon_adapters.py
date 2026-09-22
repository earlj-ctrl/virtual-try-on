"""Virtual Try-On adapters.

- MockDevelopmentAdapter: composites the garment onto the user's silhouette
  using Pillow (edge feathering + blend). More realistic than a raw garment
  image, still clearly labelled as a placeholder.
- HFIDMVTONAdapter: real inference via HuggingFace Space `yisol/IDM-VTON`
  (gradio_client). Free, subject to queue.
- All results include additional "views" (mirrored) to approximate multi-view.
"""
from __future__ import annotations
import base64
import io
import logging
import os
import tempfile
import time
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image, ImageChops, ImageFilter, ImageOps

logger = logging.getLogger("atelier-ai.tryon")

HF_TOKEN = os.environ.get("HUGGINGFACE_TOKEN")
HF_SPACE = "yisol/IDM-VTON"


@dataclass
class TryOnResult:
    adapter: str
    adapter_label: str
    status: str  # COMPLETED | FAILED
    duration_ms: int
    confidence: float
    result_image_bytes: Optional[bytes] = None
    result_content_type: str = "image/png"
    # Multi-view approximations
    side_image_bytes: Optional[bytes] = None
    rear_image_bytes: Optional[bytes] = None
    error: Optional[str] = None
    notes: str = ""


def _decode_data_url(data_url: str) -> tuple[bytes, str]:
    if "," in data_url and data_url.startswith("data:"):
        header, b64 = data_url.split(",", 1)
        ct = header.split(";")[0].removeprefix("data:") or "image/jpeg"
        return base64.b64decode(b64), ct
    return base64.b64decode(data_url), "image/jpeg"


def _write_temp(data: bytes, suffix: str) -> str:
    tf = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tf.write(data)
    tf.close()
    return tf.name


def _to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _make_side_view(front: Image.Image) -> bytes:
    """Approximated side view — horizontal mirror + small horizontal squeeze
    so the silhouette reads as a profile approximation. Not a real 3D rotation."""
    w, h = front.size
    mirrored = ImageOps.mirror(front)
    squeezed = mirrored.resize((int(w * 0.86), h), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (0, 0, 0))
    canvas.paste(squeezed, ((w - squeezed.width) // 2, 0))
    return _to_png_bytes(canvas)


def _make_rear_view(front: Image.Image) -> bytes:
    """Approximated rear view — desaturate + darken silhouette so garment
    palette shows without face features (still not a real rear render)."""
    faded = ImageOps.autocontrast(front.convert("RGB"))
    grey = ImageOps.grayscale(faded).convert("RGB")
    blended = Image.blend(faded, grey, 0.7)
    blurred = blended.filter(ImageFilter.GaussianBlur(radius=1.2))
    darker = ImageChops.multiply(blurred, Image.new("RGB", blurred.size, (200, 200, 210)))
    return _to_png_bytes(darker)


def _compose_mock(person_bytes: bytes, garment_bytes: bytes) -> Image.Image:
    """Layer the garment image on the person image with feathered edges.
    Purely deterministic — clearly not a real inference."""
    try:
        person = Image.open(io.BytesIO(person_bytes)).convert("RGB")
    except Exception:
        person = Image.new("RGB", (512, 640), (240, 235, 225))
    try:
        garment = Image.open(io.BytesIO(garment_bytes)).convert("RGBA")
    except Exception:
        garment = Image.new("RGBA", (256, 256), (240, 230, 200, 255))

    # Fit person to 512x640
    person = ImageOps.fit(person, (512, 640), Image.LANCZOS)
    canvas = person.copy()

    # Scale garment to ~60% of canvas width, place around the torso
    gw = int(canvas.width * 0.62)
    ratio = gw / garment.width
    gh = int(garment.height * ratio)
    garment_scaled = garment.resize((gw, gh), Image.LANCZOS)

    # Feathered mask
    mask = garment_scaled.split()[-1] if garment_scaled.mode == "RGBA" else Image.new("L", garment_scaled.size, 255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=8))
    # Reduce opacity so this is clearly a composite, not a claim of real inference
    mask = mask.point(lambda v: int(v * 0.78))

    x = (canvas.width - gw) // 2
    y = int(canvas.height * 0.24)
    canvas.paste(garment_scaled.convert("RGB"), (x, y), mask=mask)
    return canvas


class MockDevelopmentAdapter:
    name = "MockDevelopmentAdapter"
    label = "Development / Integration Placeholder"

    def run(self, user_photo_b64: str, garment_image_bytes: bytes, garment_description: str) -> TryOnResult:
        start = time.time()
        person_bytes, _ = _decode_data_url(user_photo_b64)
        composed = _compose_mock(person_bytes, garment_image_bytes)
        front = _to_png_bytes(composed)
        side = _make_side_view(composed)
        rear = _make_rear_view(composed)
        return TryOnResult(
            adapter=self.name,
            adapter_label=self.label,
            status="COMPLETED",
            duration_ms=int((time.time() - start) * 1000) + 400,
            confidence=0.0,
            result_image_bytes=front,
            result_content_type="image/png",
            side_image_bytes=side,
            rear_image_bytes=rear,
            notes="Mock adapter — deterministic Pillow composite. Side and rear views are approximations, NOT a real 3D rotation.",
        )


class HFIDMVTONAdapter:
    name = "HFIDMVTONAdapter"
    label = "HuggingFace yisol/IDM-VTON (Free Space)"

    def run(self, user_photo_b64: str, garment_image_bytes: bytes, garment_description: str) -> TryOnResult:
        from gradio_client import Client, handle_file

        start = time.time()
        person_bytes, _ = _decode_data_url(user_photo_b64)
        person_path = _write_temp(person_bytes, ".png")
        garment_path = _write_temp(garment_image_bytes, ".png")

        try:
            client = Client(HF_SPACE, hf_token=HF_TOKEN) if HF_TOKEN else Client(HF_SPACE)
            result = client.predict(
                dict={"background": handle_file(person_path), "layers": [], "composite": None},
                garm_img=handle_file(garment_path),
                garment_des=garment_description or "garment",
                is_checked=True,
                is_checked_crop=False,
                denoise_steps=30,
                seed=42,
                api_name="/tryon",
            )
            image_path = result[0] if isinstance(result, (list, tuple)) else result
            with open(image_path, "rb") as f:
                data = f.read()
            front_img = Image.open(io.BytesIO(data)).convert("RGB")
            side = _make_side_view(front_img)
            rear = _make_rear_view(front_img)
            return TryOnResult(
                adapter=self.name,
                adapter_label=self.label,
                status="COMPLETED",
                duration_ms=int((time.time() - start) * 1000),
                confidence=0.85,
                result_image_bytes=_to_png_bytes(front_img),
                result_content_type="image/png",
                side_image_bytes=side,
                rear_image_bytes=rear,
                notes="Front rendered via HF yisol/IDM-VTON (real inference). Side and rear views are approximations from the front render, NOT independent 3D rotations.",
            )
        except Exception as e:
            logger.warning(f"HF IDM-VTON failed: {e}")
            return TryOnResult(
                adapter=self.name,
                adapter_label=self.label,
                status="FAILED",
                duration_ms=int((time.time() - start) * 1000),
                confidence=0.0,
                error=str(e)[:400],
                notes="HF Space failed (queued/asleep/rate-limit). Fallback to mock adapter.",
            )
        finally:
            for p in (person_path, garment_path):
                try:
                    os.unlink(p)
                except OSError:
                    pass


def get_adapter(name: str):
    name = (name or "").lower()
    if name in ("hf", "hfidmvton", "hf-idm-vton", "idm-vton", "real"):
        return HFIDMVTONAdapter()
    return MockDevelopmentAdapter()
