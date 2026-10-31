# Contributing

Thanks for helping out. Issues and pull requests are welcome.

## Setup

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python server.py          # → http://localhost:8000
cd web3d && npm install && npm run dev   # 3D view on http://localhost:5173/3d/
```

No API key is needed. Without `ANTHROPIC_API_KEY` the simulation runs fully on the rule-based engine.

## Before opening a PR

```bash
.venv/bin/python test_sim.py        # headless multi-day run with assertions
cd web3d && node nav.test.mjs && npm run build
```

- Keep the core rule: **the engine decides, the LLM only voices.** State changes belong in `world.py`, never in `llm.py`.
- If you change `web3d/`, commit the rebuilt `static/3d/` so the app runs without Node.
- Keep PRs focused and match the style of the surrounding code.
- Content stays wholesome and age-appropriate (see `SAFETY` in `llm.py`).
- Never commit API keys, `.env` files, or `world.db`.

Good first areas are listed under **Roadmap** in the README.
