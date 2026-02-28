"""
Secrets Service
Manages project secrets (API keys, passwords, tokens, etc.)
Secrets are encrypted at rest and never logged or displayed in plaintext.
"""
import os
import json
import uuid
import base64
from typing import Dict, Any, List, Optional
from cryptography.fernet import Fernet
from pathlib import Path

# Secrets storage directory
SECRETS_DIR = Path("user_login")
SECRETS_FILE = "secrets.enc"

# Generate or load encryption key
def _get_encryption_key() -> bytes:
    """Get or generate encryption key for secrets."""
    key_file = SECRETS_DIR / ".secrets_key"
    if key_file.exists():
        return key_file.read_bytes()
    else:
        key = Fernet.generate_key()
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key_file.write_bytes(key)
        os.chmod(key_file, 0o600)
        return key

_cipher = None

def _get_cipher() -> Fernet:
    """Get Fernet cipher instance."""
    global _cipher
    if _cipher is None:
        _cipher = Fernet(_get_encryption_key())
    return _cipher

def _get_secrets_file(project_id: str) -> Path:
    """Get secrets file path for a project."""
    # Parse project_id to get user and project name
    parts = project_id.split('_')
    if len(parts) >= 2:
        user = parts[0]
        project = '_'.join(parts[1:])
    else:
        user = "default"
        project = project_id
    
    project_dir = SECRETS_DIR / user / project
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir / SECRETS_FILE

def _load_secrets(project_id: str) -> List[Dict[str, Any]]:
    """Load secrets for a project."""
    secrets_file = _get_secrets_file(project_id)
    if not secrets_file.exists():
        return []
    
    try:
        with open(secrets_file, 'rb') as f:
            encrypted_data = f.read()
        if not encrypted_data:
            return []
        
        decrypted = _get_cipher().decrypt(encrypted_data)
        return json.loads(decrypted)
    except Exception:
        return []

def _save_secrets(project_id: str, secrets: List[Dict[str, Any]]) -> None:
    """Save secrets for a project."""
    secrets_file = _get_secrets_file(project_id)
    data = json.dumps(secrets).encode()
    encrypted = _get_cipher().encrypt(data)
    
    with open(secrets_file, 'wb') as f:
        f.write(encrypted)
    
    os.chmod(secrets_file, 0o600)

def create_secret(project_id: str, name: str, value: str, tags: List[str] = None) -> Dict[str, Any]:
    """
    Create a new secret for a project.
    
    Args:
        project_id: Project identifier
        name: Secret name
        value: Secret value (will be encrypted)
        tags: Optional list of tags
    
    Returns:
        Secret object (without the actual value)
    """
    secrets = _load_secrets(project_id)
    
    # Check if secret with same name exists
    for secret in secrets:
        if secret['name'] == name:
            return {
                "success": False,
                "error": f"Secret with name '{name}' already exists"
            }
    
    secret_id = str(uuid.uuid4())
    secret = {
        "id": secret_id,
        "name": name,
        "value": value,  # Will be encrypted when saved
        "tags": tags or [],
        "created_at": "",
        "updated_at": ""
    }
    
    secrets.append(secret)
    _save_secrets(project_id, secrets)
    
    # Return secret without value
    return {
        "success": True,
        "secret": {
            "id": secret_id,
            "name": name,
            "tags": tags or [],
            "created_at": secret.get("created_at", ""),
            "updated_at": secret.get("updated_at", "")
        }
    }

def get_secrets(project_id: str) -> List[Dict[str, Any]]:
    """
    Get all secrets for a project.
    Returns secrets WITHOUT values (for security).
    """
    secrets = _load_secrets(project_id)
    
    # Return secrets without values
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "tags": s.get("tags", []),
            "created_at": s.get("created_at", ""),
            "updated_at": s.get("updated_at", "")
        }
        for s in secrets
    ]

def get_secret(project_id: str, secret_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific secret (with value)."""
    secrets = _load_secrets(project_id)
    
    for secret in secrets:
        if secret["id"] == secret_id:
            return secret
    
    return None

def update_secret(project_id: str, secret_id: str, name: str = None, value: str = None, tags: List[str] = None) -> Dict[str, Any]:
    """Update a secret."""
    secrets = _load_secrets(project_id)
    
    for i, secret in enumerate(secrets):
        if secret["id"] == secret_id:
            if name is not None:
                # Check for duplicate name
                for other in secrets:
                    if other["id"] != secret_id and other["name"] == name:
                        return {"success": False, "error": f"Secret with name '{name}' already exists"}
                secret["name"] = name
            
            if value is not None:
                secret["value"] = value
            
            if tags is not None:
                secret["tags"] = tags
            
            _save_secrets(project_id, secrets)
            
            return {
                "success": True,
                "secret": {
                    "id": secret["id"],
                    "name": secret["name"],
                    "tags": secret.get("tags", []),
                    "created_at": secret.get("created_at", ""),
                    "updated_at": secret.get("updated_at", "")
                }
            }
    
    return {"success": False, "error": "Secret not found"}

def delete_secret(project_id: str, secret_id: str) -> Dict[str, Any]:
    """Delete a secret."""
    secrets = _load_secrets(project_id)
    
    for i, secret in enumerate(secrets):
        if secret["id"] == secret_id:
            secrets.pop(i)
            _save_secrets(project_id, secrets)
            return {"success": True}
    
    return {"success": False, "error": "Secret not found"}

def get_secret_value(project_id: str, secret_name: str) -> Optional[str]:
    """Get secret value by name (for use in commands)."""
    secrets = _load_secrets(project_id)
    
    for secret in secrets:
        if secret["name"] == secret_name:
            return secret["value"]
    
    return None

def list_secret_names(project_id: str) -> List[str]:
    """List all secret names for a project (for autocomplete)."""
    secrets = _load_secrets(project_id)
    return [s["name"] for s in secrets]
