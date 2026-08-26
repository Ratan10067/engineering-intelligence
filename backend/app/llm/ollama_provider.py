"""
Engineering Intelligence Platform — Ollama LLM Provider.

Implements the LLM provider interface for Ollama, communicating with
the local Ollama server via its REST API.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.llm.base import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)

settings = get_settings()


class OllamaProvider(LLMProvider):
    """
    Ollama LLM provider using the local REST API.

    Connects to the Ollama server (default: http://localhost:11434)
    and uses the configured model for text generation.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(120.0, connect=10.0),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        reraise=True,
    )
    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> LLMResponse:
        """Generate a completion using Ollama's /api/generate endpoint."""
        client = await self._get_client()

        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        if "format" in kwargs:
            payload["format"] = kwargs["format"]

        if system_prompt:
            payload["system"] = system_prompt

        start_time = time.monotonic()

        try:
            response = await client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()

            elapsed_ms = int((time.monotonic() - start_time) * 1000)

            return LLMResponse(
                content=data.get("response", ""),
                model=data.get("model", self.model),
                prompt_tokens=data.get("prompt_eval_count", 0),
                completion_tokens=data.get("eval_count", 0),
                total_tokens=(
                    data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
                ),
                latency_ms=elapsed_ms,
                metadata={
                    "total_duration": data.get("total_duration"),
                    "load_duration": data.get("load_duration"),
                    "eval_duration": data.get("eval_duration"),
                },
            )
        except httpx.HTTPStatusError as e:
            logger.error("Ollama API error: %s — %s", e.response.status_code, e.response.text)
            raise
        except httpx.ConnectError:
            logger.error(
                "Cannot connect to Ollama at %s. Is Ollama running?", self.base_url
            )
            raise

    async def generate_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> LLMResponse:
        """Generate using Ollama's /api/chat endpoint with message history."""
        client = await self._get_client()

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        start_time = time.monotonic()

        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        return LLMResponse(
            content=data.get("message", {}).get("content", ""),
            model=data.get("model", self.model),
            prompt_tokens=data.get("prompt_eval_count", 0),
            completion_tokens=data.get("eval_count", 0),
            total_tokens=(
                data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
            ),
            latency_ms=elapsed_ms,
        )

    async def generate_stream(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ):
        """Stream completion tokens directly from Ollama."""
        client = await self._get_client()

        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        if system_prompt:
            payload["system"] = system_prompt

        import json

        try:
            async with client.stream("POST", "/api/generate", json=payload, timeout=120.0) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            chunk = data.get("response", "")
                            if chunk:
                                yield chunk
                            if data.get("done", False):
                                break
                        except Exception:
                            continue
        except Exception as e:
            logger.error("Ollama streaming error: %s", e)
            yield f"\n[Streaming error: {str(e)}]"

    async def health_check(self) -> bool:
        """Check if Ollama is running and the model is available."""
        try:
            client = await self._get_client()
            response = await client.get("/api/tags")
            if response.status_code != 200:
                return False

            models = response.json().get("models", [])
            model_names = [m.get("name", "") for m in models]

            # Check if our configured model is available
            return any(self.model in name for name in model_names)
        except Exception as e:
            logger.error("Ollama health check failed: %s", e)
            return False
