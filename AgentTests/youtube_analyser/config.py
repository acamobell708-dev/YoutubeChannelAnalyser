"""Application configuration loaded from the local .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
import truststore


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLACEHOLDER_API_KEYS = {
    "",
    "replace_with_your_openai_api_key",
    "your_openai_api_key_here",
}


class ConfigurationError(ValueError):
    """Raised when required application configuration is missing."""


@dataclass(frozen=True)
class Settings:
    """Runtime settings for the analyser."""

    openai_api_key: str
    openai_model: str


def load_settings() -> Settings:
    """Load and validate settings from AgentTests/.env."""

    # Use the operating system's certificate store. This is particularly useful
    # on Windows machines behind a school, workplace, or antivirus HTTPS proxy.
    truststore.inject_into_ssl()
    load_dotenv(PROJECT_ROOT / ".env")

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip()

    if api_key.lower() in PLACEHOLDER_API_KEYS:
        raise ConfigurationError(
            "OPENAI_API_KEY is not configured. Open AgentTests/.env and replace "
            "'replace_with_your_openai_api_key' with your API key."
        )
    if not model:
        raise ConfigurationError("OPENAI_MODEL cannot be empty.")

    return Settings(openai_api_key=api_key, openai_model=model)
