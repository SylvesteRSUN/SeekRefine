"""Ollama LLM service wrapper with logging and monitoring."""

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


def _build_options(temperature: float = 0.7) -> dict:
    """Build Ollama options with proper context/token limits."""
    return {
        "temperature": temperature,
        "num_ctx": settings.ollama_num_ctx,
        "num_predict": settings.ollama_num_predict,
    }


async def generate(prompt: str, system: str = "", temperature: float = 0.7) -> str:
    """Call Ollama generate API and return full response."""
    logger.info("=" * 60)
    logger.info("LLM GENERATE - Starting request")
    logger.info(f"  Model: {settings.ollama_model}")
    logger.info(f"  Prompt length: {len(prompt)} chars")
    logger.info(f"  System length: {len(system)} chars")
    logger.info(f"  Temperature: {temperature}")
    logger.info(f"  num_ctx: {settings.ollama_num_ctx}, num_predict: {settings.ollama_num_predict}")
    logger.info("-" * 60)

    start_time = time.time()

    # Use streaming so we can print tokens in real-time to console
    full_response = ""
    token_count = 0
    done_reason = None
    final_stats = {}

    print("\n>>> LLM Output: ", end="", flush=True)

    async with httpx.AsyncClient(timeout=httpx.Timeout(
        connect=10.0, read=settings.ollama_timeout, write=10.0, pool=10.0
    )) as client:
        try:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "system": system,
                    "stream": True,
                    "options": _build_options(temperature),
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
                        # Print every token to console in real-time
                        print(token_text, end="", flush=True)
                    if chunk.get("done"):
                        done_reason = chunk.get("done_reason")
                        final_stats = chunk
        except httpx.TimeoutException:
            elapsed = time.time() - start_time
            print(f"\n<<< TIMEOUT after {elapsed:.1f}s")
            logger.error(f"LLM TIMEOUT after {elapsed:.1f}s (generated {token_count} tokens so far)")
            raise
        except httpx.HTTPStatusError as e:
            logger.error(f"LLM HTTP Error: {e.response.status_code}")
            raise

    elapsed = time.time() - start_time
    print(f"\n<<< Done ({token_count} tokens, {elapsed:.1f}s)\n")

    # Log stats
    logger.info(f"LLM GENERATE - Completed in {elapsed:.1f}s")
    logger.info(f"  Response length: {len(full_response)} chars, ~{token_count} tokens")
    if final_stats.get("eval_count"):
        logger.info(f"  Tokens generated: {final_stats['eval_count']}")
    if final_stats.get("prompt_eval_count"):
        logger.info(f"  Prompt tokens: {final_stats['prompt_eval_count']}")
    if done_reason:
        logger.info(f"  Done reason: {done_reason}")
    logger.info("=" * 60)

    # Warn if response was truncated
    if done_reason == "length":
        logger.warning("!!! Response was TRUNCATED (hit num_predict limit) !!!")
        logger.warning(f"  Current num_predict: {settings.ollama_num_predict}")
        logger.warning("  Increase SEEKREFINE_OLLAMA_NUM_PREDICT in .env")

    return full_response


async def generate_stream(
    prompt: str, system: str = "", temperature: float = 0.7
) -> AsyncGenerator[str, None]:
    """Call Ollama generate API with streaming - logs each chunk to console."""
    logger.info("LLM STREAM - Starting")
    token_count = 0

    async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "system": system,
                "stream": True,
                "options": _build_options(temperature),
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    data = json.loads(line)
                    if "response" in data:
                        token_count += 1
                        # Print to console in real-time
                        print(data["response"], end="", flush=True)
                        yield data["response"]
                    if data.get("done"):
                        print()  # newline after stream ends
                        logger.info(f"LLM STREAM - Done, ~{token_count} chunks")
                        if data.get("done_reason") == "length":
                            logger.warning("STREAM TRUNCATED (hit token limit)")


async def generate_json(prompt: str, system: str = "", temperature: float = 0.3) -> dict | list:
    """Call Ollama and parse JSON from response."""
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
        # Try parsing the whole response
        json_match = full_response.strip()

    try:
        return json.loads(json_match)
    except json.JSONDecodeError as e:
        logger.error(f"JSON PARSE ERROR: {e}")
        logger.error(f"Attempted to parse ({len(json_match)} chars):")
        logger.error(json_match[:1000] if json_match else "(empty)")
        logger.error(f"Full response was ({len(full_response)} chars):")
        logger.error(full_response[:1000])
        raise ValueError(
            f"LLM returned invalid JSON. Parse error: {e}. "
            f"Response length: {len(full_response)} chars. "
            f"This may indicate the response was truncated."
        ) from e


async def match_analysis(resume_json: str, job_description: str) -> dict:
    """Analyze resume-job match using LLM."""
    system = _load_prompt("match_analysis")
    prompt = f"## Resume\n{resume_json}\n\n## Job Description\n{job_description}"
    return await generate_json(prompt, system)


async def tailor_resume(resume_json: str, job_description: str, analysis: str) -> dict:
    """Tailor resume for a specific job using LLM."""
    system = _load_prompt("tailor_resume")
    prompt = (
        f"## Original Resume\n{resume_json}\n\n"
        f"## Job Description\n{job_description}\n\n"
        f"## Match Analysis\n{analysis}"
    )
    return await generate_json(prompt, system, temperature=0.4)


async def suggest_searches(resume_json: str) -> list[dict]:
    """Suggest job search profiles based on resume content."""
    system = _load_prompt("suggest_searches")
    prompt = f"## Candidate Resume\n{resume_json}"
    return await generate_json(prompt, system, temperature=0.5)


async def generate_cover_letter(
    resume_json: str, job_description: str, style: str = "professional"
) -> str:
    """Generate a cover letter using LLM."""
    system = _load_prompt("cover_letter")
    prompt = (
        f"## Resume\n{resume_json}\n\n"
        f"## Job Description\n{job_description}\n\n"
        f"## Style: {style}"
    )
    return await generate(prompt, system, temperature=0.7)
