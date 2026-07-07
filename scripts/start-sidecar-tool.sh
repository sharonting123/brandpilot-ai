#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="${AGENT_DIR:-/home/ubuntu/agent}"
TOOL_DIR="${SIDECAR_TOOL_DIR:-$AGENT_DIR/genie-tool}"

echo "==> 侧车工具服务启动脚本"
echo "    目录: $TOOL_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "错误: 未找到 python3"
  exit 1
fi

cd "$TOOL_DIR"

if [ ! -f .env ] && [ -f .env_template ]; then
  cp .env_template .env
  echo "已创建 .env（请配置 OPENAI_API_KEY / OPENAI_BASE_URL）"
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "==> 安装 uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# 国内镜像加速（PyPI + Python 解释器）
export UV_INDEX_URL="${UV_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
export UV_PYTHON_INSTALL_MIRROR="${UV_PYTHON_INSTALL_MIRROR:-https://registry.npmmirror.com/-/binary/python-build-standalone/}"
export PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"

echo "==> 同步 Python 依赖（镜像: $UV_INDEX_URL）..."
uv sync --index-url "$UV_INDEX_URL"

if [ ! -d .venv ]; then
  echo "错误: .venv 未创建"
  exit 1
fi

echo "==> 初始化数据库（首次运行）..."
uv run python -m genie_tool.db.db_engine || true

echo "==> 启动工具服务 (http://127.0.0.1:1601)..."
echo "    报告 API: POST /v1/tool/report"
exec uv run python server.py
