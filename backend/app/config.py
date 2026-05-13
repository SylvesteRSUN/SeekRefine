"""Application configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "SeekRefine"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./seekrefine.db"

    # LLM Provider: "ollama" | "openai" | "claude" | "gemini" | "deepseek"
    llm_provider: str = "ollama"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:9b"
    ollama_timeout: int = 600  # 10 minutes - large resumes need time
    ollama_num_ctx: int = 65536  # Context window size (input + output)
    ollama_num_predict: int = 32768  # Max output tokens
    # How long Ollama keeps the model in VRAM after a request.
    # "5m" (default) caches the model; "0" releases VRAM immediately after each call;
    # "-1" keeps it loaded forever. Use "0" while developing if you want clean shutdown.
    ollama_keep_alive: str = "5m"

    # OpenAI-compatible (also used for DeepSeek)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o"
    openai_max_tokens: int = 16384

    # Claude (Anthropic)
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    claude_max_tokens: int = 16384

    # Gemini (Google)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_max_tokens: int = 16384

    # DeepSeek (OpenAI-compatible)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    deepseek_max_tokens: int = 16384

    # Scraper
    scraper_delay_min: float = 3.0
    scraper_delay_max: float = 8.0
    scraper_max_per_minute: int = 10
    scraper_cookie_path: str = "./playwright_cookies"

    class Config:
        env_file = ".env"
        env_prefix = "SEEKREFINE_"


settings = Settings()
