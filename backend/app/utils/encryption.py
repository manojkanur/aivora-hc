from __future__ import annotations

import base64

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _get_fernet() -> Fernet:
    key = settings.FERNET_KEY
    # Fernet requires a URL-safe base64-encoded 32-byte key.
    # If the stored key is already valid base64 of the correct length, use it;
    # otherwise derive a padded version to be forgiving of minor mismatches
    # in development environments.
    try:
        raw = base64.urlsafe_b64decode(key + "==")
        if len(raw) == 32:
            return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        pass

    # Derive a proper 32-byte key from whatever string was provided
    padded = key.ljust(32)[:32].encode()
    derived_key = base64.urlsafe_b64encode(padded)
    return Fernet(derived_key)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string and return a URL-safe base64 ciphertext string."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string produced by encrypt_value."""
    f = _get_fernet()
    try:
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Decryption failed: invalid token or wrong key.") from exc
