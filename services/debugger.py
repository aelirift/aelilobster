"""
Debugger Service
Handles error analysis and debugging with debugger.md context.
"""
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from services.code_stripper import extract_code_blocks


def get_debugger_context() -> str:
    """Load the debugger.md context file if it exists."""
    context_files_dir = Path(__file__).parent.parent / "context_files"
    
    # Look for any debugger type file
    for md_file in context_files_dir.glob("*_debugger_*.md"):
        try:
            with open(md_file, 'r') as f:
                return f.read()
        except:
            pass
    
    # Also check for any file with type=debugger
    for md_file in context_files_dir.glob("*.md"):
        if "debugger" in md_file.name:
            try:
                with open(md_file, 'r') as f:
                    return f.read()
            except:
                pass
    
    return None


def analyze_error(error_output: str) -> Dict[str, Any]:
    """
    Analyze an error output to extract useful debugging information.
    
    Returns:
        Dict with error_type, error_message, line_number, and suggested_fixes
    """
    error_info = {
        "error_type": "unknown",
        "error_message": error_output,
        "line_number": None,
        "suggested_fixes": []
    }
    
    # Common Python error patterns
    error_patterns = {
        "ImportError": r"ImportError: (.+)",
        "ModuleNotFoundError": r"ModuleNotFoundError: No module named '(.+)'",
        "SyntaxError": r"SyntaxError: (.+)",
        "NameError": r"NameError: name '(.+)' is not defined",
        "TypeError": r"TypeError: (.+)",
        "ValueError": r"ValueError: (.+)",
        "FileNotFoundError": r"FileNotFoundError: (.+)",
        "PermissionError": r"PermissionError: (.+)",
        "TimeoutError": r"TimeoutError: (.+)",
        "ConnectionError": r"ConnectionError: (.+)",
    }
    
    for error_type, pattern in error_patterns.items():
        import re
        match = re.search(pattern, error_output)
        if match:
            error_info["error_type"] = error_type
            error_info["error_message"] = match.group(1)
            
            # Try to extract line number
            line_match = re.search(r"line (\d+)", error_output)
            if line_match:
                error_info["line_number"] = int(line_match.group(1))
            
            # Add suggested fixes based on error type
            if error_type == "ModuleNotFoundError":
                module_name = match.group(1)
                error_info["suggested_fixes"] = [
                    f"Install the module: pip install {module_name}",
                    f"Add {module_name} to requirements.txt",
                    f"Check if the module name is correct"
                ]
            elif error_type == "SyntaxError":
                error_info["suggested_fixes"] = [
                    "Check for missing parentheses, brackets, or quotes",
                    "Verify indentation is correct",
                    "Ensure all strings are properly closed"
                ]
            elif error_type == "NameError":
                error_info["suggested_fixes"] = [
                    "Check if the variable is defined before use",
                    "Verify there are no typos in variable names",
                    "Make sure imports are correct"
                ]
            elif error_type == "TypeError":
                error_info["suggested_fixes"] = [
                    "Check the types of variables being used",
                    "Verify function arguments are correct",
                    "Ensure you're not mixing incompatible types"
                ]
            
            break
    
    return error_info


def create_debug_prompt(error: str, debugger_context: Optional[str] = None) -> str:
    """
    Create a debugging prompt for the LLM.
    
    Args:
        error: The error message to debug
        debugger_context: Optional context from debugger.md file
    
    Returns:
        A prompt string to send to the LLM for debugging
    """
    error_info = analyze_error(error)
    
    prompt_parts = [
        "I'm encountering an error while running code. Please help me debug it.",
        "",
        f"Error Type: {error_info['error_type']}",
        f"Error Message: {error_info['error_message']}",
    ]
    
    if error_info['line_number']:
        prompt_parts.append(f"Error Line: {error_info['line_number']}")
    
    if error_info['suggested_fixes']:
        prompt_parts.append("")
        prompt_parts.append("Suggested fixes to try:")
        for fix in error_info['suggested_fixes']:
            prompt_parts.append(f"- {fix}")
    
    if debugger_context:
        prompt_parts.append("")
        prompt_parts.append("Debug Context:")
        prompt_parts.append(debugger_context)
    
    prompt_parts.append("")
    prompt_parts.append("Please analyze the error and provide corrected code that fixes the issue.")
    prompt_parts.append("Respond with only the corrected code in a code block. Do not include explanations unless the code cannot be fixed.")
    
    return "\n".join(prompt_parts)


def debug_error(
    error: str,
    code: str,
    model: str,
    api_key: str,
    call_llm_func
) -> Dict[str, Any]:
    """
    Debug an error by sending it to the LLM with debugger context.
    
    Args:
        error: The error message
        code: The original code that caused the error
        model: The LLM model to use
        api_key: The API key for the LLM
        call_llm_func: Function to call the LLM
    
    Returns:
        Dict with debug_result, fixed_code, and success
    """
    # Get debugger context
    debugger_context = get_debugger_context()
    
    # Analyze the error
    error_info = analyze_error(error)
    
    # Create debug prompt
    debug_prompt = create_debug_prompt(error, debugger_context)
    
    # Add the original code context
    full_prompt = f"""Original code that caused the error:
```
{code}
```

{debug_prompt}"""
    
    # Call the LLM
    messages = [{"role": "user", "content": full_prompt}]
    
    try:
        result = call_llm_func(model, messages, 0.7, 2048, api_key)
        llm_response = result["choices"][0]["message"]["content"]
        
        # Extract fixed code from the response
        code_blocks = extract_code_blocks(llm_response)
        
        if code_blocks:
            fixed_code = code_blocks[0]['code']
            return {
                "success": True,
                "fixed_code": fixed_code,
                "llm_response": llm_response,
                "error_info": error_info
            }
        else:
            return {
                "success": False,
                "fixed_code": None,
                "llm_response": llm_response,
                "error_info": error_info,
                "error": "Could not extract code from LLM response"
            }
    
    except Exception as e:
        return {
            "success": False,
            "fixed_code": None,
            "llm_response": None,
            "error_info": error_info,
            "error": str(e)
        }


if __name__ == "__main__":
    # Test
    test_error = "ModuleNotFoundError: No module named 'requests'"
    error_info = analyze_error(test_error)
    print(json.dumps(error_info, indent=2))
    
    prompt = create_debug_prompt(test_error)
    print("\n--- Debug Prompt ---")
    print(prompt)
