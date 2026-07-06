#!/usr/bin/env python3
"""口播文本规范化与分段（百炼 wan2.2-s2v 单段 <20s）。"""

from __future__ import annotations

import json
import re
import sys

DEFAULT_MAX_CHARS = 58
STOP_CHARS = "。！？；，、 "


def normalize_text(text: str) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    value = re.sub(r"[#*`>|]+", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def split_narration(text: str, max_chars: int = DEFAULT_MAX_CHARS) -> list[str]:
    value = normalize_text(text)
    if not value:
        return []
    if len(value) <= max_chars:
        return [value]

    segments: list[str] = []
    rest = value
    while rest:
        if len(rest) <= max_chars:
            segments.append(rest)
            break
        chunk = rest[:max_chars]
        last_stop = max(chunk.rfind(c) for c in STOP_CHARS)
        if last_stop >= 18:
            chunk = rest[: last_stop + 1]
        segments.append(chunk.strip())
        rest = rest[len(chunk) :].strip()
    return [s for s in segments if s]


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"segments": []}), end="")
        return 0

    mode = sys.argv[1]
    if mode == "split":
        raw = sys.stdin.read()
        max_chars = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_MAX_CHARS
        print(json.dumps({"segments": split_narration(raw, max_chars)}, ensure_ascii=False), end="")
        return 0

    if mode == "normalize":
        raw = sys.stdin.read()
        print(json.dumps({"text": normalize_text(raw)}, ensure_ascii=False), end="")
        return 0

    print(json.dumps({"error": "unknown mode"}), end="")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
