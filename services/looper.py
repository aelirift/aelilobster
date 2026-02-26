"""
Looper Service - Tree-based Command Execution
Handles the tree: prompt -> commands -> error fixes -> results

DEPRECATED: This module is kept for backward compatibility.
Please use services.looper instead (import from services.looper package).
"""
# Re-export everything from the new modular package for backward compatibility
from services.looper import (
    # Main function
    run_looper,
    # State management
    get_looper_state,
    set_trace_callback,
    stop_looper,
    # Trace logger
    trace_logger,
    log_trace,
    # Classes
    CommandNode,
    LooperState,
    # Utilities
    extract_code_blocks,
    execute_code_with_podman_check,
    ensure_project_requirements,
    list_project_files,
    # Debugger
    analyze_error,
    get_debugger_context,
    # Types
    TraceCallback,
)

# Keep backward compatibility aliases
LLMClient = None  # Now in services.looper.llm_client
CodeExtractor = None  # Now in services.looper.code_extractor
Executor = None  # Now in services.looper.executor

__all__ = [
    'run_looper',
    'get_looper_state',
    'set_trace_callback',
    'stop_looper',
    'trace_logger',
    'log_trace',
    'CommandNode',
    'LooperState',
    'extract_code_blocks',
    'execute_code_with_podman_check',
    'ensure_project_requirements',
    'list_project_files',
    'analyze_error',
    'get_debugger_context',
    'TraceCallback',
]
