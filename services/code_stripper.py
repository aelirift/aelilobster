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
    """
    code_blocks = []
    
    # Pattern for fenced code blocks (```language ... ```)
    fenced_pattern = r'```(\w*)\n?(.*?)```'
    matches = re.findall(fenced_pattern, text, re.DOTALL)
    
    for lang, code in matches:
        if code.strip():
            code_blocks.append({
                'language': lang if lang else 'text',
                'code': code.strip(),
                'type': 'fenced'
            })
    
    # Pattern for inline code that looks like shell commands
    # Lines starting with $ or > at the start
    inline_pattern = r'^(?:\$\s*|>\s*)(.+)$'
    lines = text.split('\n')
    for line in lines:
        match = re.match(inline_pattern, line.strip())
        if match:
            cmd = match.group(1).strip()
            # Only add if it looks like a command
            if cmd and not cmd.startswith('#'):
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
