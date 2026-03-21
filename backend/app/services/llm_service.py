"""Multi-provider LLM service with logging and monitoring.

Supports: Ollama, OpenAI, Claude (Anthropic), Gemini (Google), DeepSeek.
"""

import json
import logging
import time
from pathlib import Path
from typing import AsyncGenerator

import httpx

from app.config import settings

logger = logging.getLogger("seekrefine.llm")

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    """Load a prompt template from the prompts directory."""
    path = PROMPTS_DIR / f"{name}.txt"
    return path.read_text(encoding="utf-8")


def get_active_provider() -> str:
    return settings.llm_provider


def get_active_model() -> str:
    provider = settings.llm_provider
    if provider == "ollama":
        return settings.ollama_model
    elif provider == "openai":
        return settings.openai_model
    elif provider == "claude":
        return settings.claude_model
    elif provider == "gemini":
        return settings.gemini_model
    elif provider == "deepseek":
        return settings.deepseek_model
    return settings.ollama_model


# ---------------------------------------------------------------------------
# Ollama backend
# ---------------------------------------------------------------------------

def _ollama_options(temperature: float = 0.7) -> dict:
    return {
        "temperature": temperature,
        "num_ctx": settings.ollama_num_ctx,
        "num_predict": settings.ollama_num_predict,
    }


async def _ollama_generate(prompt: str, system: str, temperature: float) -> str:
    full_response = ""
    token_count = 0
    done_reason = None
    final_stats = {}

    print("\n>>> LLM Output (Ollama): ", end="", flush=True)

    async with httpx.AsyncClient(timeout=httpx.Timeout(
        connect=10.0, read=settings.ollama_timeout, write=10.0, pool=10.0
    )) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "system": system,
                "stream": True,
                "options": _ollama_options(temperature),
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                if "response" in chunk:
                    token_text = chunk["response"]
                    full_response += token_text
                    token_count += 1
                    print(token_text, end="", flush=True)
                if chunk.get("done"):
                    done_reason = chunk.get("done_reason")
                    final_stats = chunk

    print(f"\n<<< Done ({token_count} tokens)\n")

    if done_reason == "length":
        logger.warning("!!! Response TRUNCATED (hit num_predict limit) !!!")

    return full_response


# ---------------------------------------------------------------------------
# OpenAI-compatible backend (also used for DeepSeek)
# ---------------------------------------------------------------------------

async def _openai_generate(
    prompt: str, system: str, temperature: float,
    api_key: str, base_url: str, model: str, max_tokens: int,
) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    full_response = ""
    label = "DeepSeek" if "deepseek" in base_url.lower() else "OpenAI"
    print(f"\n>>> LLM Output ({label}): ", end="", flush=True)

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=600.0, write=10.0, pool=10.0)) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        full_response += text
                        print(text, end="", flush=True)
                except json.JSONDecodeError:
                    continue

    print(f"\n<<< Done ({len(full_response)} chars)\n")
    return full_response


# ---------------------------------------------------------------------------
# Claude (Anthropic) backend
# ---------------------------------------------------------------------------

async def _claude_generate(prompt: str, system: str, temperature: float) -> str:
    messages = [{"role": "user", "content": prompt}]

    full_response = ""
    print("\n>>> LLM Output (Claude): ", end="", flush=True)

    body: dict = {
        "model": settings.claude_model,
        "messages": messages,
        "max_tokens": settings.claude_max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    if system:
        body["system"] = system

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=600.0, write=10.0, pool=10.0)) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.claude_api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                    if event.get("type") == "content_block_delta":
                        text = event.get("delta", {}).get("text", "")
                        if text:
                            full_response += text
                            print(text, end="", flush=True)
                except json.JSONDecodeError:
                    continue

    print(f"\n<<< Done ({len(full_response)} chars)\n")
    return full_response


# ---------------------------------------------------------------------------
# Gemini (Google) backend
# ---------------------------------------------------------------------------

async def _gemini_generate(prompt: str, system: str, temperature: float) -> str:
    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": f"[System Instructions]\n{system}\n\n{prompt}"}]})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})

    full_response = ""
    print("\n>>> LLM Output (Gemini): ", end="", flush=True)

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}"
        f":streamGenerateContent?alt=sse&key={settings.gemini_api_key}"
    )

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=600.0, write=10.0, pool=10.0)) as client:
        async with client.stream(
            "POST",
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": settings.gemini_max_tokens,
                },
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                try:
                    chunk = json.loads(line[6:])
                    parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            full_response += text
                            print(text, end="", flush=True)
                except json.JSONDecodeError:
                    continue

    print(f"\n<<< Done ({len(full_response)} chars)\n")
    return full_response


# ---------------------------------------------------------------------------
# Unified interface
# ---------------------------------------------------------------------------

async def generate(prompt: str, system: str = "", temperature: float = 0.7) -> str:
    """Call configured LLM provider and return full response."""
    provider = settings.llm_provider

    logger.info("=" * 60)
    logger.info(f"LLM GENERATE - Provider: {provider}, Model: {get_active_model()}")
    logger.info(f"  Prompt: {len(prompt)} chars | System: {len(system)} chars | Temp: {temperature}")
    logger.info("-" * 60)

    start_time = time.time()

    try:
        if provider == "ollama":
            result = await _ollama_generate(prompt, system, temperature)
        elif provider == "openai":
            result = await _openai_generate(
                prompt, system, temperature,
                settings.openai_api_key, settings.openai_base_url,
                settings.openai_model, settings.openai_max_tokens,
            )
        elif provider == "claude":
            result = await _claude_generate(prompt, system, temperature)
        elif provider == "gemini":
            result = await _gemini_generate(prompt, system, temperature)
        elif provider == "deepseek":
            result = await _openai_generate(
                prompt, system, temperature,
                settings.deepseek_api_key, settings.deepseek_base_url,
                settings.deepseek_model, settings.deepseek_max_tokens,
            )
        else:
            raise ValueError(f"Unknown LLM provider: {provider}")
    except httpx.TimeoutException:
        elapsed = time.time() - start_time
        logger.error(f"LLM TIMEOUT after {elapsed:.1f}s")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"LLM HTTP Error: {e.response.status_code} - {e.response.text[:500]}")
        raise

    elapsed = time.time() - start_time
    logger.info(f"LLM GENERATE - Completed in {elapsed:.1f}s ({len(result)} chars)")
    logger.info("=" * 60)

    return result


async def generate_json(prompt: str, system: str = "", temperature: float = 0.3) -> dict | list:
    """Call LLM and parse JSON from response."""
    full_response = await generate(prompt, system, temperature)

    # Try to extract JSON from the response
    json_match = None
    if "```json" in full_response:
        start = full_response.index("```json") + 7
        end = full_response.index("```", start)
        json_match = full_response[start:end].strip()
    elif "```" in full_response:
        start = full_response.index("```") + 3
        end = full_response.index("```", start)
        json_match = full_response[start:end].strip()
    else:
        json_match = full_response.strip()

    try:
        return json.loads(json_match)
    except json.JSONDecodeError as e:
        logger.error(f"JSON PARSE ERROR: {e}")
        logger.error(f"Attempted to parse ({len(json_match)} chars):")
        logger.error(json_match[:1000] if json_match else "(empty)")
        raise ValueError(
            f"LLM returned invalid JSON. Parse error: {e}. "
            f"Response length: {len(full_response)} chars."
        ) from e


# ---------------------------------------------------------------------------
# Task-specific helpers (unchanged interface)
# ---------------------------------------------------------------------------

async def match_analysis(resume_json: str, job_description: str) -> dict:
    system = _load_prompt("match_analysis")
    prompt = f"## Resume\n{resume_json}\n\n## Job Description\n{job_description}"
    return await generate_json(prompt, system)


async def tailor_resume(resume_json: str, job_description: str, analysis: str) -> dict:
    system = _load_prompt("tailor_resume")
    prompt = (
        f"## Original Resume\n{resume_json}\n\n"
        f"## Job Description\n{job_description}\n\n"
        f"## Match Analysis\n{analysis}"
    )
    return await generate_json(prompt, system, temperature=0.4)


async def suggest_searches(resume_json: str) -> list[dict]:
    system = _load_prompt("suggest_searches")
    prompt = f"## Candidate Resume\n{resume_json}"
    return await generate_json(prompt, system, temperature=0.5)


async def generate_cover_letter(
    resume_json: str, job_description: str, style: str = "professional"
) -> str:
    system = _load_prompt("cover_letter")
    prompt = (
        f"## Resume\n{resume_json}\n\n"
        f"## Job Description\n{job_description}\n\n"
        f"## Style: {style}"
    )
    return await generate(prompt, system, temperature=0.7)
