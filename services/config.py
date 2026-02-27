"""
Configuration Service
Handles loading/saving config and managing API keys.
"""
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from services.naming import parse_project_id as parse_project_id_normalized

# Configuration file path
CONFIG_FILE = Path(__file__).parent.parent / "config.json"

# Projects directory
PROJECTS_DIR = Path(__file__).parent.parent / "user_login"


def parse_project_id(project_id: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse project_id into (user_name, project_name).
    
    Uses centralized naming module for consistency.
    Supports formats:
    - user-project (hyphen): "test_user-myproject" -> ("test_user", "myproject")
    - user_project (underscore): "test_user_myproject" -> ("test_user", "myproject")
    
    Returns (None, None) if invalid format.
    """
    return parse_project_id_normalized(project_id)


def load_config() -> Dict[str, Any]:
    """Load config from file."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}


def save_config(config: Dict[str, Any]) -> None:
    """Save config to file."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def get_api_key(provider: str) -> str:
    """
    Get API key for a provider from config or environment.
    
    Args:
        provider: One of "minimax" or "openai"
    
    Returns:
        The API key string (empty if not configured)
    """
    config = load_config()
    if provider.lower() == "minimax":
        return config.get("minimax_api_key", os.getenv("MINIMAX_API_KEY", ""))
    elif provider.lower() == "openai":
        return config.get("openai_api_key", os.getenv("OPENAI_API_KEY", ""))
    return ""


def get_projects_dir() -> Path:
    """Get the projects directory path."""
    return PROJECTS_DIR


def get_config_path() -> Path:
    """Get the config file path."""
    return CONFIG_FILE


# =============================================================================
# Configuration Models (for Pydantic validation)
# =============================================================================

class ConfigRequest:
    """Request model for config updates."""
    def __init__(
        self,
        minimax_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        default_model: Optional[str] = None
    ):
        self.minimax_api_key = minimax_api_key
        self.openai_api_key = openai_api_key
        self.default_model = default_model


class ProjectRequest:
    """Request model for project operations."""
    def __init__(self, name: str, user: str):
        self.name = name
        self.user = user
