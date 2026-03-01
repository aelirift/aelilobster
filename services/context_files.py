"""
Context Files Service
Handles CRUD operations for context files stored as markdown files.
"""
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

# Context files directory
CONTEXT_FILES_DIR = Path(__file__).parent.parent / "context_files"
FILE_TYPES_FILE = CONTEXT_FILES_DIR / "file_types.json"

# Default file types (permanent list)
DEFAULT_FILE_TYPES = [
    "pre-llm",
    "post-llm",
    "pre-code",
    "post-code",
    "pre-pod",
    "post-pod",
    "pre-execute",
    "post-execute",
    "pre-display"
]

# Create the context_files directory if it doesn't exist
CONTEXT_FILES_DIR.mkdir(exist_ok=True)


# =============================================================================
# File Types Management
# =============================================================================

def get_file_types() -> List[str]:
    """Get the list of file types (creates file if not exists)."""
    if FILE_TYPES_FILE.exists():
        try:
            with open(FILE_TYPES_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    # Create the file with default types
    with open(FILE_TYPES_FILE, "w") as f:
        json.dump(DEFAULT_FILE_TYPES, f, indent=2)
    return DEFAULT_FILE_TYPES


# =============================================================================
# Context Files CRUD
# =============================================================================

def load_context_files() -> List[Dict[str, Any]]:
    """Load context files metadata from folder."""
    # Load defaults
    defaults = load_context_defaults()
    
    files = []
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.name in ("file_types.json", "defaults.json"):
            continue
        try:
            with open(md_file, "r") as f:
                content = f.read()
            # Parse metadata from filename: {name}_{type}.md
            stem = md_file.stem
            parts = stem.rsplit("_", 1)  # Split from right to get type
            if len(parts) == 2:
                name = parts[0]
                file_type = parts[1]
            else:
                # Single word filename - default to pre-llm type
                name = stem
                file_type = "pre-llm"
            
            # Check if this file is the default for its type
            is_default = defaults.get(file_type) == name
            
            files.append({
                "id": f"{name}_{file_type}",
                "name": name,
                "type": file_type,
                "content": content,
                "is_default": is_default
            })
        except:
            pass
    return files


def save_context_file(file_id: str, file_type: str, name: str, content: str) -> None:
    """
    Save a context file to disk as .md file.
    
    Args:
        file_id: The file identifier (used to lookup existing file)
        file_type: The type of context file
        name: The name of the file
        content: The content to save
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # First, check if there's an existing file with this file_id
    # If found, use its existing filename to preserve it (update mode)
    existing_filepath = None
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.stem == file_id:
            existing_filepath = md_file
            break
    
    if existing_filepath:
        # Update existing file - use its current filename
        logger.info(f"[CONTEXT FILES SERVICE] Updating existing file: file_id={file_id}, filepath={existing_filepath}")
        with open(existing_filepath, "w") as f:
            f.write(content)
        return
    
    # No existing file found - create new file
    # Sanitize name for filename - REMOVE any type suffix if present
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_").strip()
    if not safe_name:
        safe_name = "untitled"
    
    # Remove type suffix from name if it already contains it
    # e.g., "default_pre-llm" with type "pre-llm" -> "default"
    if safe_name.endswith(f"_{file_type}"):
        safe_name = safe_name[:-len(f"_{file_type}")]
    
    # New format: {name}_{type}.md
    filename = f"{safe_name}_{file_type}.md"
    filepath = CONTEXT_FILES_DIR / filename
    
    logger.info(f"[CONTEXT FILES SERVICE] Creating new file: file_id={file_id}, name={name}, type={file_type}, safe_name={safe_name}, filename={filename}")
    
    with open(filepath, "w") as f:
        f.write(content)


def delete_context_file(file_id: str) -> bool:
    """
    Delete a context file from disk.
    
    Args:
        file_id: The file identifier in format {name}_{type}
    
    Returns:
        True if deleted, False if not found
    """
    for md_file in CONTEXT_FILES_DIR.glob("*.md"):
        if md_file.stem == file_id:
            md_file.unlink()
            return True
    return False


# =============================================================================
# Defaults Management
# =============================================================================

def load_context_defaults() -> Dict[str, str]:
    """Load default context file mappings from defaults.json."""
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    if defaults_file.exists():
        try:
            with open(defaults_file, "r") as f:
                return json.load(f)
        except:
            pass
    return {}


def save_context_defaults(defaults: Dict[str, str]) -> None:
    """
    Save default context file mappings to defaults.json.
    
    Args:
        defaults: Dict mapping file types to default file names
    """
    defaults_file = CONTEXT_FILES_DIR / "defaults.json"
    with open(defaults_file, "w") as f:
        json.dump(defaults, f, indent=2)


def set_context_file_default(file_id: str) -> Dict[str, str]:
    """
    Set a context file as the default for its type.
    
    Args:
        file_id: The file identifier
    
    Returns:
        Dict with status, type, and name
    """
    files = load_context_files()
    # Find the file
    target_file = None
    for f in files:
        if f["id"] == file_id:
            target_file = f
            break
    
    if not target_file:
        raise FileNotFoundError(f"File not found: {file_id}")
    
    # Load current defaults
    defaults = load_context_defaults()
    # Set this file as default for its type
    defaults[target_file["type"]] = target_file["name"]
    save_context_defaults(defaults)
    
    return {"status": "success", "type": target_file["type"], "name": target_file["name"]}


# =============================================================================
# Project Context Settings
# =============================================================================

def get_pre_llm_context() -> Optional[Dict[str, Any]]:
    """
    Get the default pre-llm context file content.
    This ensures the pre-llm instructions are always included in LLM calls.
    
    Returns:
        Dict with pre-llm context file data, or None if not found
    """
    files = load_context_files()
    defaults = load_context_defaults()
    
    # Get the default pre-llm file name from defaults
    default_pre_llm_name = defaults.get("pre-llm")
    
    # First try to find the default pre-llm file by name from defaults
    if default_pre_llm_name:
        for f in files:
            if f.get("name") == default_pre_llm_name and f.get("type") == "pre-llm":
                return f
    
    # Fallback: look for any file with type "pre-llm" or filename containing "pre-llm"
    for f in files:
        if f.get("type") == "pre-llm":
            return f
        # Also check if filename contains "pre-llm"
        file_id = f.get("id", "")
        if "pre-llm" in file_id.lower():
            return f
    
    return None


def load_project_context_settings(project_id: str) -> Dict[str, str]:
    """
    Load context file settings for a specific project.
    
    Args:
        project_id: The project identifier
    
    Returns:
        Dict of context settings for the project
    """
    from services.config import load_config, save_config
    config = load_config()
    return config.get("project_context_settings", {}).get(project_id, {})


def save_project_context_settings(project_id: str, settings: Dict[str, str]) -> None:
    """
    Save context file settings for a specific project.
    
    Args:
        project_id: The project identifier
        settings: Dict of context settings
    """
    from services.config import load_config, save_config
    config = load_config()
    if "project_context_settings" not in config:
        config["project_context_settings"] = {}
    config["project_context_settings"][project_id] = settings
    save_config(config)


# =============================================================================
# ContextFile Model (for API requests)
# =============================================================================

class ContextFile:
    """Model for context file API requests."""
    def __init__(self, name: str, type: str, content: str):
        self.name = name
        self.type = type
        self.content = content
