"""
Code Extractor module - Extracts code blocks from LLM responses.
Provides a clean interface for code extraction.
"""
from typing import List, Dict, Any

from services.code_stripper import extract_code_blocks as _extract_code_blocks


class CodeExtractor:
    """
    Extracts code blocks from LLM responses.
    """
    
    @staticmethod
    def extract(text: str) -> List[Dict[str, Any]]:
        """
        Extract code blocks from LLM response.
        
        Args:
            text: The LLM response text
            
        Returns:
            List of code blocks with 'language', 'code', and 'type' keys
        """
        return _extract_code_blocks(text)
    
    @staticmethod
    def has_code(text: str) -> bool:
        """
        Check if text contains code blocks.
        
        Args:
            text: The text to check
            
        Returns:
            True if text contains code blocks
        """
        blocks = _extract_code_blocks(text)
        return len(blocks) > 0
    
    @staticmethod
    def get_first_code(text: str) -> str:
        """
        Get the first code block from text.
        
        Args:
            text: The LLM response text
            
        Returns:
            The first code block, or empty string if none
        """
        blocks = _extract_code_blocks(text)
        if blocks:
            return blocks[0].get('code', '')
        return ''
    
    @staticmethod
    def get_codes_only(text: str) -> str:
        """
        Get only the code content without explanations.
        
        Args:
            text: The LLM response text
            
        Returns:
            All code blocks joined together
        """
        blocks = _extract_code_blocks(text)
        if not blocks:
            return ''
        return '\n'.join([block['code'] for block in blocks])


# Standalone function for backward compatibility
extract_code_blocks = CodeExtractor.extract
