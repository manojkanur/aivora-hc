from __future__ import annotations

import secrets
from typing import Optional

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aivora_hc"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    JWT_SECRET_KEY: str = "change-me-to-a-real-secret-key-at-least-32-chars"
    FERNET_KEY: str = "change-me-fernet-key-must-be-32-bytes-base64-encoded"
    APP_SECRET_KEY: str = secrets.token_hex(32)

    # Google OAuth
    GOOGLE_CLIENT_ID: str = "change_me.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: str = "change_me"
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Stripe
    STRIPE_SECRET_KEY: str = "sk_test_change_me"
    STRIPE_WEBHOOK_SECRET: str = "whsec_change_me"

    # OpenAI
    OPENAI_API_KEY: str = "sk-change_me"
    AI_MODEL: str = "gpt-4o"

    # AWS / S3
    AWS_ACCESS_KEY_ID: str = "AKIAIOSFODNN7EXAMPLE"
    AWS_SECRET_ACCESS_KEY: str = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "aivora-hc-exports"

    # LinkedIn
    LINKEDIN_CLIENT_ID: str = "change_me"
    LINKEDIN_CLIENT_SECRET: str = "change_me"
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/v1/oauth/linkedin/callback"

    # Observability
    SENTRY_DSN: Optional[str] = None

    # App
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # Stripe Price IDs (populated in .env)
    STRIPE_PRICE_STARTER_MONTHLY: str = "price_starter_monthly"
    STRIPE_PRICE_STARTER_ANNUAL: str = "price_starter_annual"
    STRIPE_PRICE_PROFESSIONAL_MONTHLY: str = "price_professional_monthly"
    STRIPE_PRICE_PROFESSIONAL_ANNUAL: str = "price_professional_annual"
    STRIPE_PRICE_ENTERPRISE_MONTHLY: str = "price_enterprise_monthly"
    STRIPE_PRICE_ENTERPRISE_ANNUAL: str = "price_enterprise_annual"
    STRIPE_PRICE_ADVISORY_MONTHLY: str = "price_advisory_monthly"
    STRIPE_PRICE_ADVISORY_ANNUAL: str = "price_advisory_annual"

    # Credit topup price IDs
    STRIPE_PRICE_TOPUP_50: str = "price_topup_50"
    STRIPE_PRICE_TOPUP_200: str = "price_topup_200"
    STRIPE_PRICE_TOPUP_500: str = "price_topup_500"

    @field_validator("JWT_SECRET_KEY", "FERNET_KEY", mode="after")
    @classmethod
    def _validate_secrets(cls, v: str, info) -> str:
        return v

    @model_validator(mode="after")
    def _production_secret_check(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            for field_name in ("JWT_SECRET_KEY", "FERNET_KEY"):
                value = getattr(self, field_name)
                if "change-me" in value.lower() or len(value) < 32:
                    raise ValueError(
                        f"{field_name} is insecure for production environment. "
                        "Provide a strong value of at least 32 characters."
                    )
        return self

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
