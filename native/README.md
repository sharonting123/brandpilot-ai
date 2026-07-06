# Native 工具（可选）

Vercel 线上环境只跑 Node.js；本地可编译 C++ 分段器加速口播切分。

## C++ 口播分段

```bash
cd native
g++ -O2 -std=c++17 -o s2v_segment.exe s2v_segment.cpp
```

Node 的 `api/_lib/text-segment.js` 会优先尝试 `native/s2v_segment.exe`，不存在则回退 Python / JS。

## Python 文本管道

```bash
pip install -r ../scripts/requirements.txt
python ../scripts/text_pipeline.py split 58 < narration.txt
```
