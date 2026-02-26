"""
LLM Client module - Handles LLM API interactions.
Provides a clean interface for calling the LLM with context.
"""
from typing import List, Dict, Any, Callable, Optional


class LLMClient:
    """
    Client for interacting with LLM APIs.
    Handles message construction and API calls.
    """
    
    def __init__(
        self,
        model: str,
        api_key: str,
        call_llm_func: Callable,
        temperature: float = 0.7,
        max_tokens: int = 4096
    ):
        """
        Initialize the LLM client.
        
        Args:
            model: Model name to use
            api_key: API key for authentication
            call_llm_func: Function to call the LLM API
            temperature: Sampling temperature (default: 0.7)
            max_tokens: Maximum tokens in response (default: 4096)
        """
        self.model = model
        self.api_key = api_key
        self.call_llm_func = call_llm_func
        self.temperature = temperature
        self.max_tokens = max_tokens
    
    def _build_messages(
        self,
        user_prompt: str,
        context_files: Optional[List[Dict]] = None,
        debug_context: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """
        Build messages list for LLM API call.
        
        Args:
            user_prompt: The user's prompt
            context_files: Optional list of context files with 'type' and 'content'
            debug_context: Optional debug context from previous errors
            
        Returns:
            List of message dictionaries
        """
        messages = []
        
        # Add pre-llm context files (these contain the prompt engineering)
        if context_files:
            for ctx in context_files:
                if ctx.get('type') == 'pre-llm':
                    messages.append({
                        "role": "system",
                        "content": ctx.get('content', '')
                    })
        
        # Add debug context if available (from previous error fixes)
        if debug_context:
            messages.append({
                "role": "system",
                "content": f"Previous debugging context:\n{debug_context}"
            })
        
        # Add user prompt
        messages.append({
            "role": "user",
            "content": user_prompt
        })
        
        return messages
    
    async def call(
        self,
        user_prompt: str,
        context_files: Optional[List[Dict]] = None,
        debug_context: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Call the LLM with the given prompt and context.
        
        Args:
            user_prompt: The user's prompt
            context_files: Optional list of context files
            debug_context: Optional debug context
            temperature: Override default temperature
            max_tokens: Override default max_tokens
            
        Returns:
            The LLM response text
        """
        messages = self._build_messages(user_prompt, context_files, debug_context)
        
        temp = temperature if temperature is not None else self.temperature
        tokens = max_tokens if max_tokens is not None else self.max_tokens
        
        result = await self.call_llm_func(
            self.model,
            messages,
            temp,
            tokens,
            self.api_key
        )
        
        return result["choices"][0]["message"]["content"]
    
    async def call_for_fix(
        self,
        error: str,
        error_type: str,
        original_code: str,
        context_files: Optional[List[Dict]] = None,
        debugger_context: Optional[str] = None
    ) -> str:
        """
        Call the LLM to get a fix for an error.
        
        Args:
            error: The error message
            error_type: Type of error
            original_code: The original code that caused the error
            context_files: Optional context files
            debugger_context: Optional debugger context
            
        Returns:
            The LLM response with fixed code
        """
        fix_prompt = f"""The previous code had an error:

Error: {error}
Error Type: {error_type}

Original Code:
```
{original_code}
```

Please provide corrected code that fixes this error. Respond with only the corrected code in a code block.
Do not include explanations - just the fixed code."""
        
        return await self.call(
            fix_prompt,
            context_files=context_files,
            debug_context=debugger_context
        )


# Standalone function for backward compatibility
async def run_llm_with_context(
    prompt: str,
    model: str,
    api_key: str,
    call_llm_func: Callable,
    context_files: List[Dict] = None,
    debug_context: str = None
) -> str:
    """
    Call LLM with optional context and debug context.
    Standalone function for backward compatibility.
    
    Args:
        prompt: User prompt
        model: Model name
        api_key: API key
        call_llm_func: Function to call the LLM
        context_files: Optional context files
        debug_context: Optional debug context
        
    Returns:
        The LLM response text
    """
    client = LLMClient(model, api_key, call_llm_func)
    return await client.call(prompt, context_files, debug_context)
