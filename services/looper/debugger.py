"""
Debugger module - Handles errors and suggests fixes.
Wraps the existing debugger service and provides error analysis.
"""
from typing import Dict, Any, Optional, List

# Import from existing debugger service
from services.debugger import debug_error, analyze_error, get_debugger_context


class DebuggerWrapper:
    """
    Wrapper for error handling and debugging functionality.
    Provides error analysis and fix suggestions.
    """
    
    @staticmethod
    def analyze(error_message: str) -> Dict[str, Any]:
        """
        Analyze an error message.
        
        Args:
            error_message: The error message to analyze
            
        Returns:
            Dict with 'error_type' and 'error_message' keys
        """
        return analyze_error(error_message)
    
    @staticmethod
    def get_context() -> Optional[str]:
        """
        Get the current debugger context.
        
        Returns:
            Debugger context string or None
        """
        return get_debugger_context()
    
    @staticmethod
    def add_to_context(info: str) -> None:
        """
        Add information to the debugger context.
        
        Args:
            info: Information to add
        """
        # The existing debugger service handles this internally
        pass
    
    @staticmethod
    def create_fix_prompt(
        error: str,
        error_type: str,
        original_code: str
    ) -> str:
        """
        Create a prompt for fixing an error.
        
        Args:
            error: The error message
            error_type: Type of error
            original_code: The original code
            
        Returns:
            Prompt string for LLM
        """
        return f"""The previous code had an error:

Error: {error}
Error Type: {error_type}

Original Code:
```
{original_code}
```

Please provide corrected code that fixes this error. Respond with only the corrected code in a code block.
Do not include explanations - just the fixed code."""
    
    @staticmethod
    def is_terminal_error(error: str) -> bool:
        """
        Check if an error is a terminal error that shouldn't be retried.
        
        Args:
            error: The error message
            
        Returns:
            True if error is terminal
        """
        # Podman not installed is a terminal error
        if "PODMAN_NOT_INSTALLED" in error or "podman" in error.lower() and "not installed" in error.lower():
            return True
        return False


# Standalone functions for backward compatibility
debug_error_fn = debug_error
analyze_error_fn = analyze_error
get_debugger_context_fn = get_debugger_context
