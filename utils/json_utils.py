import json
import re

def parse_json_robust(text: str) -> dict:
    """Try to extract a JSON block from LLM output even if there's conversational fluff."""
    text = text.strip()
    
    # 1. Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
        
    # 2. Try to find markdown JSON block
    match = re.search(r"```json\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
            
    # 3. Try to find first { and last }
    match = re.search(r"({.*})", text, re.DOTALL)
    if match:
        try:
            # Clean up potential common issues like control characters
            cleaned = re.sub(r"[\x00-\x1F\x7F]", "", match.group(1))
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
            
    # Raise the original error or a generic one
    raise ValueError("Could not parse JSON from LLM response")
