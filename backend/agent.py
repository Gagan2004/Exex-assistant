import os
import json
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

# Setup logging
logger = logging.getLogger("assistant_bot.agent")
logging.basicConfig(level=logging.INFO)

# Structured schema for AI responses
class ParsedActionCard(BaseModel):
    action_type: str = Field(description="Action category: 'calendar', 'email', or 'task'")
    title: str = Field(description="Short, action-oriented title")
    description: str = Field(description="Detailed explanation of the action to be performed")
    time_proposed: Optional[str] = Field(None, description="Proposed meeting time. MUST be formatted in 'YYYY-MM-DD HH:MM' format (e.g. '2026-06-23 14:00'). Resolve relative times like 'tomorrow', 'today', or 'Friday' using the current date and time context.")
    recipient: Optional[str] = Field(None, description="Email address or name of the target contact if applicable")

def get_all_gemini_keys() -> list:
    """
    Parses the .env file to extract all Gemini API keys (starting with AIzaSy)
    to establish a pool of keys for rotation.
    """
    keys = []
    possible_paths = [
        os.path.join(os.path.dirname(__file__), ".env"),
        ".env",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", ".env")
    ]
    env_content = ""
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    env_content = f.read()
                break
            except Exception as e:
                logger.error(f"Failed to read .env from {path}: {e}")
                
    if env_content:
        import re
        matches = re.findall(r"AIzaSy[A-Za-z0-9_\-]+", env_content)
        seen = set()
        for key in matches:
            if key not in seen:
                seen.add(key)
                keys.append(key)
                
    # If no keys were found via parsing, check the primary environment variable as a fallback
    primary_env_key = os.environ.get("GOOGLE_API_KEY")
    if primary_env_key and primary_env_key not in keys:
        keys.insert(0, primary_env_key)
        
    return keys

def parse_voice_transcription(text: str) -> Dict[str, Any]:
    """
    Parses a voice transcription string into a structured action item.
    Uses LangChain and Google Gemini (gemini-2.5-flash) with API Key rotation.
    If all API keys fail, falls back to local rule-based heuristic parsing.
    """
    from dotenv import load_dotenv
    load_dotenv()
    
    keys = get_all_gemini_keys()
    
    print("\n[Hermes Agent Workflow] Starting transcription parsing...")
    print(f"[Hermes Agent Workflow] Input text: '{text}'")
    
    if not keys:
        print("[Hermes Agent Workflow] No Gemini API keys found. Falling back to heuristics.")
        logger.warning("No Gemini API keys found in environment or .env. Falling back to local heuristic parsing.")
        return parse_heuristically(text)
        
    masked_keys = [f"{k[:6]}...{k[-4:]}" if len(k) > 10 else "Invalid" for k in keys]
    print(f"[Hermes Agent Workflow] Loaded key pool: {masked_keys}")
    
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import JsonOutputParser
    
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    
    for idx, api_key in enumerate(keys):
        masked_key = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "Invalid/Short Key"
        print(f"\n[Hermes Agent Workflow] [Attempt {idx + 1}/{len(keys)}] Using API key: {masked_key}")
        
        try:
            model_name = os.environ.get("GEMINI_MODEL_NAME", "gemini-2.5-flash")
            
            if openrouter_key:
                print("[Hermes Agent Workflow] OpenRouter API Key detected. Initializing OpenRouter wrapper...")
                from langchain_openai import ChatOpenAI
                llm = ChatOpenAI(
                    model=os.environ.get("OPENROUTER_MODEL", "nvidia/nemotron-4-340b-instruct"),
                    openai_api_key=openrouter_key,
                    openai_api_base="https://openrouter.ai/api/v1"
                )
            else:
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    google_api_key=api_key,
                    temperature=0.2
                )

            parser = JsonOutputParser(pydantic_object=ParsedActionCard)

            prompt = ChatPromptTemplate.from_template(
                "You are Hermes, a premium high-trust AI Executive Assistant.\n"
                "Current date and time context: {current_time}\n\n"
                "Analyze the executive's voice memo transcription below and extract the structured action request.\n"
                "Executive Memo: \"{memo_text}\"\n\n"
                "CRITICAL INTEGRITY INSTRUCTION:\n"
                "- If the action type is 'calendar' (scheduling a meeting), do NOT guess or hallucinate any meeting date/time or email/guest contact if they are not explicitly mentioned in the memo.\n"
                "- If you cannot find a date or time in the text, set 'time_proposed' to null/None. Do not put placeholders or guesses.\n"
                "- If you cannot find a guest's email address or contact info, set 'recipient' to null/None. Do NOT generate email addresses (like guest@company.com).\n\n"
                "{format_instructions}\n"
            )

            chain = prompt | llm | parser
            
            from datetime import datetime
            current_time_str = datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")
            
            print(f"[Hermes Agent Workflow] Invoking Gemini LLM chain with key {masked_key}...")
            result = chain.invoke({
                "memo_text": text,
                "current_time": current_time_str,
                "format_instructions": parser.get_format_instructions()
            })
            
            print(f"[Hermes Agent Workflow] Gemini raw parsed output: {result}")
            
            # Map fields to match database schema
            mapped_result = {
                "type": result.get("action_type", "task").lower(),
                "title": result.get("title", "Voice Memo Task"),
                "description": result.get("description", text),
                "time_proposed": result.get("time_proposed"),
                "recipient": result.get("recipient")
            }
            print(f"[Hermes Agent Workflow] Success! Mapped action item: {mapped_result}")
            return mapped_result

        except Exception as e:
            print(f"[Hermes Agent Workflow] ERROR: LLM execution failed for key {masked_key}: {e}")
            import traceback
            traceback.print_exc()
            logger.warning(f"Error calling LLM agent with key {masked_key}: {e}. Rotating to next key.")
            
    print("\n[Hermes Agent Workflow] All Gemini API keys failed. Falling back to heuristic parser.")
    logger.error("All Gemini API keys failed. Falling back to local heuristic parsing.")
    return parse_heuristically(text)

def parse_heuristically(text: str) -> Dict[str, Any]:
    """
    Fallback deterministic parser using regex and keywords.
    Strictly avoids hallucinating missing fields.
    """
    lower_text = text.lower()
    
    # Defaults
    action_type = "task"
    title = "Follow-up Action"
    description = text
    time_proposed = None
    recipient = None

    # Detect emails
    if "email" in lower_text or "draft" in lower_text or "reply to" in lower_text:
        action_type = "email"
        title = "Draft Email Reply"
        # Only parse recipient if it contains a real email structure
        if "@" in lower_text:
            words = lower_text.split()
            for w in words:
                if "@" in w:
                    recipient = w.strip(".,()<>")
                    break

    # Detect meetings
    elif any(kw in lower_text for kw in ["schedule", "calendar", "meet", "sync", "book", "hold"]):
        action_type = "calendar"
        title = "Schedule Meeting"
        
        # Try to find a date/time in the text using regex
        import re
        date_patterns = [
            r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:\s+\d{4})?",
            r"\d{1,2}/\d{1,2}(?:/\d{2,4})?",
            r"\btomorrow\b",
            r"next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"\btoday\b",
            r"this\s+(afternoon|morning|evening)"
        ]
        
        matched_time = None
        for pattern in date_patterns:
            match = re.search(pattern, lower_text)
            if match:
                matched_time = match.group(0).title()
                break
        
        if matched_time:
            time_proposed = f"Proposed: {matched_time}"
        else:
            time_proposed = None  # Do not guess!
            
        # Try to find recipient email (must contain '@')
        if "@" in lower_text:
            words = lower_text.split()
            for w in words:
                if "@" in w:
                    recipient = w.strip(".,()<>")
                    break
        
        if "with " in lower_text:
            parts = lower_text.split("with ")
            if len(parts) > 1:
                guest_name = parts[1].split()[0].replace(",", "").replace(".", "").title()
                title = f"Sync with {guest_name}"

    else:
        # Generic task
        title = "Executive Task"
        if len(text) > 40:
            title = text[:40] + "..."

    return {
        "type": action_type,
        "title": title,
        "description": description,
        "time_proposed": time_proposed,
        "recipient": recipient
    }
