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
        # Add context about the environment and common fixes
        environment_context = """
Environment: The code runs in an Ubuntu container.
- Use 'apt-get install' to install system packages (e.g., 'apt-get install -y python3 python3-pip')
- Use 'pip3' for Python packages
- For Python web servers, install flask with 'pip3 install flask'
- ALWAYS add required packages to requirements.md in the project for persistence!
"""
        
        # Check if this is a "not found" error that might need package installation
        needs_install = False
        if "python" in error.lower() and "not found" in error.lower():
            needs_install = True
            environment_context += """
IMPORTANT: Python is not installed in the container. Your fix MUST first install Python before running Python code.
For Ubuntu, use: ```shell\napt-get update && apt-get install -y python3 python3-pip\n```
Then run your Python code in a SEPARATE code block.

ALWAYS add the packages to requirements.md so they persist across restarts!
"""
        
        return f"""You are a debugging assistant. Fix the error in the previous code.

{environment_context}

Error:
{error}

Error Type: {error_type}

Original Code:
```
{original_code}
```

IMPORTANT INSTRUCTIONS:
1. If the error is "python not found" or similar, you MUST first install Python/dependencies in a shell code block BEFORE running Python code
2. If installing packages, do it in a SEPARATE shell code block from your main code
3. Install all required dependencies first, then run the actual code
4. ALWAYS add required packages to requirements.md in the project directory for persistence!

When you need to install packages, create/update requirements.md with the needed packages, for example:
```markdown
# Project Requirements
flask
requests
```

Provide the fix as code blocks. If you need to install something first, include a shell code block for installation:
```shell
# Install commands here
apt-get update && apt-get install -y python3 python3-pip
pip3 install flask
# Add to requirements.md
echo -e "flask\\nrequests" > requirements.md
```

Then your main code:
```python
# Main code here
```"""
    
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
