"""
Tracer module - Trace/logging functionality for the looper.
Provides structured logging for the frontend and trace callbacks.
"""
from typing import Any, Callable, Optional, List, Dict
from datetime import datetime
from dataclasses import dataclass, field


# Callback type for trace logging
TraceCallback = Optional[Callable[[str, str, Any], None]]


@dataclass
class TraceEntry:
    """Single trace entry."""
    type: str
    label: str
    data: Any
    time: str = field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))


class TraceLogger:
    """Stores trace entries for sending to frontend."""
    
    def __init__(self):
        self.entries: List[TraceEntry] = []
    
    def add(self, type: str, label: str, data: Any) -> None:
        """Add a trace entry."""
        entry = TraceEntry(type=type, label=label, data=data)
        self.entries.append(entry)
    
    def clear(self) -> None:
        """Clear all entries."""
        self.entries = []
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all entries as dicts."""
        return [entry.__dict__ for entry in self.entries]
    
    def __len__(self) -> int:
        return len(self.entries)
    
    def __getitem__(self, index: int) -> TraceEntry:
        return self.entries[index]


# Global trace logger instance
_trace_logger = TraceLogger()


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
    # Add to logger for frontend
    _trace_logger.add(type, label, data)
    
    # Also call callback if set
    if callback:
        callback(type, label, data)


def clear_trace() -> None:
    """Clear the trace logger."""
    _trace_logger.clear()
