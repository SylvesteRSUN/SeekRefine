"""Application configuration."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "SeekRefine"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./seekrefine.db"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:9b"
    ollama_timeout: int = 600  # 10 minutes - large resumes need time
    ollama_num_ctx: int = 32768  # Context window size (input + output)
    ollama_num_predict: int = 16384  # Max output tokens

    # Scraper
    scraper_delay_min: float = 3.0
    scraper_delay_max: float = 8.0
    scraper_max_per_minute: int = 10
    scraper_cookie_path: str = "./playwright_cookies"

    class Config:
        env_file = ".env"
        env_prefix = "SEEKREFINE_"


settings = Settings()
