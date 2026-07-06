#!/usr/bin/env python3
"""本地 RAG 混合检索测试（调用 Node retrieveKnowledge）。"""

from __future__ import annotations

import json
import subprocess
import sys


def main() -> int:
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "海底捞补贴率和核销预警线"
    script = """
const { retrieveKnowledge } = require('./api/_lib/rag');
retrieveKnowledge({ query: process.argv[1], brandId: 'haidilao', topK: 4 })
  .then((text) => { console.log(text); })
  .catch((err) => { console.error(err); process.exit(1); });
"""
    result = subprocess.run(
        ["node", "-e", script, query],
        capture_output=True,
        text=True,
        cwd=str(__import__("pathlib").Path(__file__).resolve().parents[1]),
    )
    if result.returncode != 0:
        print(result.stderr or result.stdout, file=sys.stderr)
        return result.returncode
    payload = json.loads(result.stdout)
    print("retrievalMode:", payload.get("retrievalMode"))
    print("embedding:", payload.get("embeddingModel"))
    print("rerank:", payload.get("rerankModel"))
    if payload.get("warning"):
        print("warning:", payload.get("warning"))
    for p in payload.get("passages", []):
        print(f"- [{p.get('score')}] {p.get('title')} | sources={p.get('recallSources')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
