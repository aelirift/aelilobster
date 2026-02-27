"""
Tracer module - Trace/logging functionality for the looper.
Provides structured logging for the frontend and trace callbacks.
Now with file persistence for reliability.
"""
from typing import Any, Callable, Optional, List, Dict
from datetime import datetime
from dataclasses import dataclass, field
import threading


# Callback type for trace logging
TraceCallback = Optional[Callable[[str, str, Any], None]]


@dataclass
class TraceEntry:
    """Single trace entry."""
    type: str
    label: str
    data: Any
    time: str = field(default_factory=lambda: datetime.now().strftime("%H:%M:%S.%f")[:-3])  # Include milliseconds
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "label": self.label,
            "data": self._serialize_data(self.data),
            "time": self.time
        }
    
    @staticmethod
    def _serialize_data(data: Any) -> Any:
        """Recursively serialize data for JSON."""
        if data is None:
            return None
        if isinstance(data, (str, int, float, bool)):
            return data
        if isinstance(data, list):
            return [TraceEntry._serialize_data(item) for item in data]
        if isinstance(data, dict):
            return {str(k): TraceEntry._serialize_data(v) for k, v in data.items()}
        if hasattr(data, 'to_dict'):
            return data.to_dict()
        # For objects without to_dict, convert to string
        return str(data)


class TraceLogger:
    """
    Stores trace entries for sending to frontend.
    Thread-safe implementation with optional file persistence.
    """
    
    def __init__(self, persist_to_file: bool = True):
        self.entries: List[TraceEntry] = []
        self._lock = threading.Lock()
        self._persist_to_file = persist_to_file
        self._trace_id: Optional[str] = None
    
    def set_trace_id(self, trace_id: str) -> None:
        """Set the trace ID for this session."""
        with self._lock:
            self._trace_id = trace_id
    
    def add(self, type: str, label: str, data: Any) -> None:
        """Add a trace entry (thread-safe)."""
        entry = TraceEntry(type=type, label=label, data=data)
        with self._lock:
            self.entries.append(entry)
            
            # Also write to file for persistence
            if self._persist_to_file:
                try:
                    from services.trace_log import add_trace_entry
                    if self._trace_id:
                        add_trace_entry(self._trace_id, type, label, data)
                except ImportError:
                    pass  # trace_log module not available
    
    def clear(self) -> None:
        """Clear all entries (thread-safe)."""
        with self._lock:
            self.entries = []
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all entries as dicts (thread-safe)."""
        with self._lock:
            return [entry.to_dict() for entry in self.entries]
    
    def get_since(self, index: int) -> List[Dict[str, Any]]:
        """Get entries from index onwards (thread-safe)."""
        with self._lock:
            return [entry.to_dict() for entry in self.entries[index:]]
    
    def __len__(self) -> int:
        with self._lock:
            return len(self.entries)
    
    def __getitem__(self, index: int) -> TraceEntry:
        with self._lock:
            return self.entries[index]


# Global trace logger instance - persist to file by default
_trace_logger = TraceLogger(persist_to_file=True)


def get_trace_logger() -> TraceLogger:
    """Get the global trace logger instance."""
    return _trace_logger


def log_trace(
    type: str,
    label: str,
    data: Any,
    callback: TraceCallback = None
) -> None:
    """
    Log to trace - both to logger for frontend and optionally to callback.
    
    Args:
        type: Type of trace entry (e.g., 'input', 'output', 'process', 'error')
        label: Human-readable label
        data: Data to log
        callback: Optional callback function for real-time updates
    """
    # Add to logger for frontend (thread-safe)
    _trace_logger.add(type, label, data)
    
    # Also call callback if set
    if callback:
        callback(type, label, data)


def clear_trace() -> None:
    """Clear the trace logger."""
    _trace_logger.clear()
