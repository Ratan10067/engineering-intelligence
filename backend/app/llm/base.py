"""
Engineering Intelligence Platform — Abstract LLM Interface.

Defines a pluggable interface for LLM providers, allowing easy swapping
between Ollama, OpenAI, Anthropic, or any other provider.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMResponse:
    """Structured response from an LLM call."""

    content: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any] | None:
        """Attempt to parse the content as JSON with robust cleaning for local models."""
        if not self.content:
            return None

        # Clean sentencepiece/gemma space tokens and zero-width spaces
        cleaned = (
            self.content.replace("\u2581", " ")
            .replace("\u00a0", " ")
            .replace("\ufeff", "")
            .replace("\u200b", "")
            .strip()
        )

        # 1. Direct JSON parse
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass

        # 2. Extract from markdown code blocks ```json ... ```
        if "```" in cleaned:
            parts = cleaned.split("```")
            for part in parts:
                p = part.strip()
                if p.lower().startswith("json"):
                    p = p[4:].strip()
                if p.startswith("{") and p.endswith("}"):
                    try:
                        parsed = json.loads(p)
                        if isinstance(parsed, dict):
                            return parsed
                    except (json.JSONDecodeError, TypeError):
                        pass

        # 3. Find first '{' and last '}'
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            candidate = cleaned[first_brace : last_brace + 1].strip()
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass

        return None


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> LLMResponse:
        """
        Generate a text completion.

        Args:
            prompt: The user prompt
            system_prompt: Optional system instruction
            temperature: Sampling temperature (lower = more deterministic)
            max_tokens: Maximum response tokens
        """
        ...

    async def generate_structured(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> dict[str, Any] | None:
        """
        Generate a structured JSON response.

        Returns parsed JSON dict or None if parsing fails.
        """
        json_instruction = "You MUST respond with valid JSON only. Output a single JSON object matching the requested schema. No explanations, no markdown code blocks, just raw JSON."
        if system_prompt:
            system_prompt += f"\n\n{json_instruction}"
        else:
            system_prompt = json_instruction

        # Pass format="json" if not explicitly overridden
        if "format" not in kwargs:
            kwargs["format"] = "json"

        response = await self.generate(
            prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        return response.to_json()

    async def generate_stream(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ):
        """
        Stream text completion tokens.

        Yields string chunks as they are generated.
        """
        # Default non-streaming fallback if not overridden
        res = await self.generate(
            prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        yield res.content

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the LLM provider is available."""
        ...
