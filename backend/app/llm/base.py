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
        """Attempt to parse the content as JSON."""
        try:
            return json.loads(self.content)
        except (json.JSONDecodeError, TypeError):
            # Try to extract JSON from markdown code blocks
            content = self.content.strip()
            if "```json" in content:
                start = content.index("```json") + 7
                end = content.index("```", start)
                return json.loads(content[start:end].strip())
            elif "```" in content:
                start = content.index("```") + 3
                end = content.index("```", start)
                return json.loads(content[start:end].strip())
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
        if system_prompt:
            system_prompt += "\n\nYou MUST respond with valid JSON only. No explanations, no markdown, just JSON."
        else:
            system_prompt = "You MUST respond with valid JSON only. No explanations, no markdown, just JSON."

        response = await self.generate(
            prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        return response.to_json()

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the LLM provider is available."""
        ...
