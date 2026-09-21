"""Virtual Try-On adapters.

- MockDevelopmentAdapter: honest placeholder (composed preview). Used as fallback.
- HFIDMVTONAdapter: real inference via HuggingFace Space `yisol/IDM-VTON`
  (gradio_client). Free but subject to queue and cold-starts.
"""
from __future__ import annotations
import base64
import io
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Optional

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


class MockDevelopmentAdapter:
    name = "MockDevelopmentAdapter"
    label = "Development / Integration Placeholder"

    def run(self, user_photo_b64: str, garment_image_bytes: bytes, garment_description: str) -> TryOnResult:
        start = time.time()
        # honest: we do NOT run any real model — just return the garment image
        # as a stand-in so the front-end can show something.
        return TryOnResult(
            adapter=self.name,
            adapter_label=self.label,
            status="COMPLETED",
            duration_ms=int((time.time() - start) * 1000) + 800,
            confidence=0.0,
            result_image_bytes=garment_image_bytes,
            result_content_type="image/jpeg",
            notes="Mock adapter — no real inference. Composed preview only.",
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
            # result is typically a tuple of two image paths (result, masked)
            image_path = result[0] if isinstance(result, (list, tuple)) else result
            with open(image_path, "rb") as f:
                data = f.read()
            return TryOnResult(
                adapter=self.name,
                adapter_label=self.label,
                status="COMPLETED",
                duration_ms=int((time.time() - start) * 1000),
                confidence=0.85,
                result_image_bytes=data,
                result_content_type="image/png",
                notes="Rendered via HF Space yisol/IDM-VTON. Free tier — expect variable latency.",
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
