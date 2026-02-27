"""
Trace Log Service
Provides file-based trace logging for persistent storage.
This ensures trace logs survive restarts and can be read by the frontend.
"""
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from threading import Lock

# Trace log directory
TRACE_LOG_DIR = Path(__file__).parent.parent / "logs"
TRACE_LOG_FILE = TRACE_LOG_DIR / "trace.json"

# Thread lock for file operations
_lock = Lock()

# Ensure trace log directory exists
TRACE_LOG_DIR.mkdir(exist_ok=True)


def _load_trace_log() -> List[Dict[str, Any]]:
    """Load trace log from file."""
    if not TRACE_LOG_FILE.exists():
        return []
    try:
        with open(TRACE_LOG_FILE, "r") as f:
            return json.load(f)
    except:
        return []


def _save_trace_log(entries: List[Dict[str, Any]]) -> None:
    """Save trace log to file."""
    with open(TRACE_LOG_FILE, "w") as f:
        json.dump(entries, f, indent=2)


def add_trace_entry(
    trace_id: str,
    entry_type: str,
    label: str,
    data: Any
) -> None:
    """
    Add a trace entry to the persistent log file.
    
    Args:
        trace_id: Unique identifier for this trace session
        entry_type: Type of entry (input, output, process, error)
        label: Human-readable label
        data: Data to log
    """
    with _lock:
        entries = _load_trace_log()
        
        entry = {
            "trace_id": trace_id,
            "type": entry_type,
            "label": label,
            "data": _serialize_data(data),
            "time": datetime.now().strftime("%H:%M:%S"),
            "timestamp": datetime.now().isoformat()
        }
        
        entries.append(entry)
        
        # Keep only last 1000 entries to prevent file from growing too large
        if len(entries) > 1000:
            entries = entries[-1000:]
        
        _save_trace_log(entries)


def get_trace_entries(
    trace_id: Optional[str] = None,
    since_index: int = 0
) -> List[Dict[str, Any]]:
    """
    Get trace entries from the log file.
    
    Args:
        trace_id: Optional trace ID to filter by
        since_index: Return entries from this index onwards
    
    Returns:
        List of trace entries
    """
    with _lock:
        entries = _load_trace_log()
        
        # Filter by trace_id if provided
        if trace_id:
            entries = [e for e in entries if e.get("trace_id") == trace_id]
        
        # Return from since_index
        return entries[since_index:]


def clear_trace_log(trace_id: Optional[str] = None) -> None:
    """
    Clear trace log, optionally for a specific trace_id.
    
    Args:
        trace_id: Optional trace ID to clear (clears all if not provided)
    """
    with _lock:
        if trace_id:
            entries = _load_trace_log()
            entries = [e for e in entries if e.get("trace_id") != trace_id]
            _save_trace_log(entries)
        else:
            _save_trace_log([])


def create_trace_id() -> str:
    """
    Create a new trace ID.
    
    Returns:
        A unique trace ID based on timestamp
    """
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")


def _serialize_data(data: Any) -> Any:
    """Serialize data for JSON storage."""
    if data is None:
        return None
    if isinstance(data, (str, int, float, bool)):
        return data
    if isinstance(data, list):
        return [_serialize_data(item) for item in data]
    if isinstance(data, dict):
        return {str(k): _serialize_data(v) for k, v in data.items()}
    if hasattr(data, 'to_dict'):
        return data.to_dict()
    return str(data)


# =============================================================================
# In-memory trace with file persistence
# =============================================================================

class PersistentTraceLogger:
    """
    Trace logger that persists to file.
    Combines in-memory storage for SSE with file persistence.
    """
    
    def __init__(self):
        self._entries: List[Dict[str, Any]] = []
        self._trace_id: Optional[str] = None
        self._lock = Lock()
    
    def start_trace(self, trace_id: str) -> None:
        """Start a new trace session."""
        with self._lock:
            self._entries = []
            self._trace_id = trace_id
    
    def add(self, entry_type: str, label: str, data: Any) -> None:
        """Add a trace entry."""
        with self._lock:
            entry = {
                "trace_id": self._trace_id,
                "type": entry_type,
                "label": label,
                "data": _serialize_data(data),
                "time": datetime.now().strftime("%H:%M:%S"),
                "timestamp": datetime.now().isoformat()
            }
            self._entries.append(entry)
            
            # Also persist to file
            if self._trace_id:
                add_trace_entry(self._trace_id, entry_type, label, data)
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all entries."""
        with self._lock:
            return list(self._entries)
    
    def get_since(self, index: int) -> List[Dict[str, Any]]:
        """Get entries from index onwards."""
        with self._lock:
            return list(self._entries[index:])
    
    def clear(self) -> None:
        """Clear in-memory entries."""
        with self._lock:
            self._entries = []
    
    def __len__(self) -> int:
        return len(self._entries)


# Global persistent trace logger
_persistent_trace_logger = PersistentTraceLogger()


def get_persistent_trace_logger() -> PersistentTraceLogger:
    """Get the global persistent trace logger."""
    return _persistent_trace_logger
