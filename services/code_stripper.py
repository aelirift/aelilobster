"""
Code stripper service.
Extracts code blocks from LLM responses and returns them for execution.
"""
import re
from typing import List, Dict, Any, Optional


def extract_code_blocks(text: str) -> List[Dict[str, Any]]:
    """
    Extract code blocks from LLM response.
    
    Returns list of code blocks with their language and content.
    Filters out duplicates where inline commands are already in fenced blocks.
    Also filters out conversational/non-code text.
    """
    code_blocks = []
    
    # Pattern for fenced code blocks (```language ... ```)
    # This is the standard way LLMs return code
    fenced_pattern = r'```(\w*)\n?(.*?)```'
    matches = re.findall(fenced_pattern, text, re.DOTALL)
    
    fenced_codes = []  # Store fenced codes for duplicate detection
    
    # Patterns that indicate conversational/non-code text
    conversational_patterns = [
        r'^Let me',
        r'^I will',
        r'^I can',
        r'^Sure,',
        r'^Here',
        r'^Okay,',
        r'^Yes,',
        r'^No,',
        r'^I\'ll',
        r'^I would',
        r'^First,',
        r'^Then,',
        r'^Finally,',
        r'^To do this,',
        r'^You can',
        r'^You need',
        r'^This will',
        r'^Let\'s',
    ]
    
    def is_conversational(code: str) -> bool:
        """Check if code looks like conversational text, not actual code."""
        code_stripped = code.strip()
        # Check for conversational patterns at the start
        for pattern in conversational_patterns:
            if re.match(pattern, code_stripped, re.IGNORECASE):
                return True
        # Check if it's too short to be real code (less than 20 chars)
        if len(code_stripped) < 20:
            return True
        # Check if it's mostly sentence-like text
        if code_stripped.startswith('The ') or code_stripped.startswith('This '):
            return True
        return False
    
    for lang, code in matches:
        if code.strip():
            # Skip conversational text that got wrapped in code blocks
            if is_conversational(code):
                print(f"[DEBUG extract_code_blocks] Skipping conversational text: {code[:50]}...")
                continue
            code_blocks.append({
                'language': lang if lang else 'text',
                'code': code.strip(),
                'type': 'fenced'
            })
            fenced_codes.append(code.strip())
    
    # Pattern for single backtick commands like `ls` or `ls -la`
    # These often appear in LLM explanations like: use `ls` to list files
    single_backtick_pattern = r'`([^`]+)`'
    single_matches = re.findall(single_backtick_pattern, text)
    for cmd in single_matches:
        cmd = cmd.strip()
        # Skip conversational text in backticks
        if is_conversational(cmd):
            print(f"[DEBUG extract_code_blocks] Skipping conversational backtick: {cmd[:50]}...")
            continue
        # Only add if it looks like a command (has spaces, or is short)
        if cmd and not cmd.startswith('#') and len(cmd) < 100:
            # Check if already in fenced or duplicate
            is_duplicate = any(cmd in fc or fc in cmd for fc in fenced_codes)
            if not is_duplicate:
                code_blocks.append({
                    'language': 'shell',
                    'code': cmd,
                    'type': 'single-backtick'
                })
                fenced_codes.append(cmd)
    
    # Pattern for inline code that looks like shell commands
    # Lines starting with $ or > at the start
    inline_pattern = r'^(?:\$\s*|>\s*)(.+)$'
    lines = text.split('\n')
    for line in lines:
        match = re.match(inline_pattern, line.strip())
        if match:
            cmd = match.group(1).strip()
            # Skip conversational text
            if is_conversational(cmd):
                print(f"[DEBUG extract_code_blocks] Skipping conversational inline: {cmd[:50]}...")
                continue
            # Only add if it looks like a command and is not already in a fenced block
            if cmd and not cmd.startswith('#'):
                # Check if this inline command is already contained in any fenced block
                is_duplicate = any(cmd in fenced_code for fenced_code in fenced_codes)
                if not is_duplicate:
                    code_blocks.append({
                        'language': 'shell',
                        'code': cmd,
                        'type': 'inline'
                    })
    
    return code_blocks


def extract_and_execute(text: str, executor_func=None) -> Dict[str, Any]:
    """
    Extract code blocks from text and optionally execute them.
    
    Args:
        text: The LLM response text
        executor_func: Optional function to execute extracted code
    
    Returns:
        Dict with original_text, code_blocks, and execution_results
    """
    code_blocks = extract_code_blocks(text)
    
    result = {
        'original_text': text,
        'code_blocks': code_blocks,
        'has_code': len(code_blocks) > 0,
        'execution_results': []
    }
    
    # Execute code if executor function provided
    if executor_func and code_blocks:
        for block in code_blocks:
            exec_result = executor_func(block['code'])
            result['execution_results'].append({
                'code': block['code'],
                'language': block['language'],
                'type': block['type'],
                'output': exec_result['output'],
                'exit_code': exec_result['exit_code'],
                'is_error': exec_result['is_error']
            })
    
    return result


def strip_codes(text: str) -> str:
    """
    Return only the codes from the LLM responsewithout explanations ().
    """
    code_blocks = extract_code_blocks(text)
    
    if not code_blocks:
        return ""
    
    codes = [block['code'] for block in code_blocks]
    return '\n'.join(codes)
