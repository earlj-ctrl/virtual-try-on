"""Email service. Uses Emergent's managed Resend proxy.

Falls back to console log if the platform key is not provisioned so the
password-reset feature still works in development.
"""
from __future__ import annotations
import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("atelier-ai.email")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "AtelierAI")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host); return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> dict:
    """Returns {'status': 'sent'|'logged'|'failed', 'id': str|None, 'reason': ...}"""
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logger.warning(f"EMERGENT_EMAIL_KEY not set. Would send to {to}: {subject}")
        return {"status": "logged", "id": None, "reason": "no_email_key"}
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        if resp.status_code >= 400:
            logger.error(f"Email send failed: {resp.status_code} {resp.text[:200]}")
            return {"status": "failed", "id": None, "reason": f"{resp.status_code}"}
        return {"status": "sent", "id": resp.json().get("id"), "reason": None}
    except Exception as e:
        logger.error(f"Email exception: {e}")
        return {"status": "failed", "id": None, "reason": str(e)[:120]}


def password_reset_html(name: str, reset_url: str) -> str:
    safe_name = escape(name or "there")
    safe_url = escape(reset_url, quote=True)
    return (
        '<table role="presentation" width="100%" style="background:#fbfbf9;padding:24px;">'
        '<tr><td align="center">'
        '<table role="presentation" width="560" style="background:#ffffff;border:1px solid #e4e0d7;border-radius:14px;padding:32px;font-family:Arial,sans-serif;color:#121212;">'
        f'<tr><td><h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 8px;">{escape(EMAIL_FROM_NAME)}</h1>'
        f'<p style="color:#6e6b64;margin:0 0 24px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;">Password reset request</p>'
        f'<p>Hi {safe_name},</p>'
        f'<p>We received a request to reset the password for your {escape(EMAIL_FROM_NAME)} account. '
        'Use the button below within 60 minutes to set a new password.</p>'
        f'<p style="text-align:center;margin:32px 0;"><a href="{safe_url}" '
        'style="background:#121212;color:#fbfbf9;text-decoration:none;padding:14px 28px;'
        'border-radius:999px;display:inline-block;font-weight:600;">Reset password</a></p>'
        '<p style="font-size:13px;color:#6e6b64;">If you did not request this, you can safely ignore this email — '
        'your password remains unchanged.</p>'
        f'<p style="font-size:12px;color:#9c9a92;margin-top:24px;border-top:1px solid #e4e0d7;padding-top:16px;">'
        f'Sent by {escape(EMAIL_FROM_NAME)}. We will never ask for your password or one-time code by email.</p>'
        '</td></tr></table></td></tr></table>'
    )
