"""Gateway check without network: routing, provider fallback, per-agent metering, monthly budget.
Run: .venv/bin/python test_llm.py"""
import os
import tempfile

os.environ.update(ANTHROPIC_API_KEY="x", GEMINI_API_KEY="x")
os.environ.pop("OPENAI_API_KEY", None)
import llm
import world as W

calls = []


def fake(model, system, prompt, schema):
    calls.append(model)
    if model.startswith("claude-sonnet"):
        raise ConnectionError("anthropic down")
    n = prompt.count('"speaker"')
    lines = [{"speaker": "x", "text": "hi"}] * n
    return __import__("json").dumps({"lines": lines}), 1000, 100, 0


llm.anthropic = llm.anthropic or object()  # SDK may be absent in CI; CALLERS is faked anyway
llm.CALLERS = {"anthropic": fake, "google": fake, "openai": fake}
w = W.World(os.path.join(tempfile.mkdtemp(), "t.db"))
w.reset(seed=1)
a, b = w.A("father"), w.A("son")
draft = [w.say(a, "Study."), w.say(b, "Okay.")]
ctx = dict(knowledge={})

lines, used = llm.voice(w, a, b, ["father", "son"], "ask_studies", "s", draft, ctx)
assert used == "claude-haiku-5-5" and calls == ["claude-haiku-5-5"], calls  # routine -> Haiku

calls.clear()
lines, used = llm.voice(w, a, b, ["father", "son"], "conflict", "s", draft, ctx, complex=True)
assert calls == ["claude-sonnet-5-5", "gemini-2.5-flash"] and used == "gemini-2.5-flash", calls  # Sonnet down -> fallback

c = w.s["cost"]
assert c["by_agent"]["father"]["calls"] == 2 and c["by_model"]["gemini-2.5-flash"]["calls"] == 1
assert "claude-sonnet-5-5" not in c["by_model"]  # failed calls cost nothing

w.s["settings"]["budget_usd"] = llm.month_usd(w)  # budget exhausted -> no call
calls.clear()
assert llm.voice(w, a, b, ["father", "son"], "ask_studies", "s", draft, ctx) is None and not calls
assert not w.llm_ok()
c["month"] = "1999-01"  # new month resets the monthly spend
assert llm.month_usd(w) == 0 and w.llm_ok()
print("ok")
