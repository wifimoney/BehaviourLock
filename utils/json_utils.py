import json
import re
import ast as py_ast

def parse_json_robust(text: str) -> dict:
    """Try to extract a JSON block from LLM output even if there's conversational fluff."""
    text = text.strip()
    
    # 1. Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # print(f"[json_utils] Raw text for parsing: {text[:500]}...")
        
    # 2. Try to find markdown JSON block
    match = re.search(r"```json\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
            
    # 3. Try to find first { and last } (Widest match)
    start_index = text.find('{')
    end_index = text.rfind('}')
    if start_index != -1 and end_index != -1 and end_index > start_index:
        cleaned = text[start_index : end_index + 1]
        try:
            # Clean up potential common issues like control characters
            cleaned = re.sub(r"[\x00-\x1F\x7F]", "", cleaned)
            
            # Remove trailing commas in objects/arrays (common LLM mistake)
            cleaned = re.sub(r",\s*([\]}])", r"\1", cleaned)
            
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"[json_utils] JSON Parse Error: {e}")
            print(f"[json_utils] Attempted to parse: {cleaned[:500]}...")
            
            # Last ditch effort: try cleaning up even more if it looks like markdown was escaped
            try:
                second_cleaned = cleaned.replace('\\"', '"').replace('\\n', '\n')
                return json.loads(second_cleaned)
            except:
                pass
            
            # Try 4. Python literal eval as extreme fallback
            try:
                # py_ast.literal_eval is safer than eval()
                return py_ast.literal_eval(cleaned)
            except:
                pass
            
            print(f"[json_utils] Final parse attempt failed: {e}")
            pass
            
    # Raise the original error or a generic one
    raise ValueError(f"Could not parse JSON from LLM response. Length: {len(text)}. Text started with: {text[:100]}...")
