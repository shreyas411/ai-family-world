"""Optional LLM gateway. Only voices conversations and parses instructions; never decides state.

One entry point (_call) for every model on Anthropic, OpenAI or Google, chosen by model-name prefix. Enabled when
any provider key is set. Every call is metered per agent and per model into world cost and stops once the monthly
budget is reached. If a provider fails, the call is retried once on settings.fallback_model; if that fails too,
the rule-based path is used.
"""
import json
import os
import time
import urllib.request

try:
    import anthropic
except ImportError:  # the simulation runs fine without it
    anthropic = None

DEFAULT_MODEL = "claude-haiku-5-5"  # routine talk, planning, instructions
COMPLEX_MODEL = "claude-sonnet-5-5"  # arguments, apologies, emotionally heavy moments
FALLBACK_MODEL = "gemini-2.5-flash"  # used when the chosen model's provider is down
# $/MTok (input, output). Add a model here to make it selectable.
# ponytail: non-Claude prices are list-price estimates; update them to your contract.
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0),
          "gpt-5-mini": (0.25, 2.0), "gemini-2.5-flash": (0.30, 2.50)}
MODELS = list(PRICES)
CACHED_RATE = 0.1  # cached input tokens cost ~10% of normal input (ponytail: Google bills 25%, close enough here)
KEYS = {"anthropic": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"), "openai": ("OPENAI_API_KEY",),
        "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
LANGUAGES = {  # dialogue language for voiced lines; templates (no LLM) stay in English
    "English": "Indian English with occasional Hindi/Malayalam words is fine",
    "Tamil": "write every line in natural spoken Tamil, in Tamil script, as a Tamil family talks at home",
    "Tanglish": "write in Tanglish: spoken Tamil mixed with English, in Latin script, as urban Tamil families talk"}
SAFETY = ("This is a fictional, wholesome simulation of an Indian family. Keep everything age-appropriate: realistic "
          "disagreements and discipline are fine, but never abuse, humiliation, violence, or any sexual content.")
_client = None


def provider(model):
    return "anthropic" if model.startswith("claude") else "google" if model.startswith("gemini") else "openai"


def _key(p):
    return next((os.environ[k] for k in KEYS[p] if os.environ.get(k)), None)


def ready(model):
    p = provider(model)
    return bool(_key(p)) and (p != "anthropic" or anthropic is not None)


def available():
    return any(ready(m) for m in MODELS)


def month_usd(world):
    c = world.s["cost"]
    return c.get("month_usd", 0.0) if c.get("month") == time.strftime("%Y-%m") else 0.0


class Refused(Exception):
    pass


def _anthropic(model, system, prompt, schema):
    global _client
    _client = _client or anthropic.Anthropic(max_retries=1, timeout=30)
    extra = {}
    if model != "claude-haiku-5-5":  # server-side refusal fallback for Sonnet/Opus
        extra = dict(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    r = _client.beta.messages.create(
        model=model, max_tokens=1500, system=system, cache_control={"type": "ephemeral"},
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}}, **extra)
    if r.stop_reason == "refusal":
        raise Refused
    text = next((b.text for b in r.content if b.type == "text"), None)
    return text, r.usage.input_tokens, r.usage.output_tokens, r.usage.cache_read_input_tokens or 0


def _post(url, body, headers):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _openai(model, system, prompt, schema):
    r = _post("https://api.openai.com/v1/chat/completions",
              dict(model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                   response_format={"type": "json_schema", "json_schema": {"name": "out", "strict": True, "schema": schema}}),
              {"Authorization": f"Bearer {_key('openai')}"})
    msg, u = r["choices"][0]["message"], r["usage"]
    if msg.get("refusal"):
        raise Refused
    cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)  # OpenAI caches long prefixes automatically
    return msg["content"], u["prompt_tokens"] - cached, u["completion_tokens"], cached


def _google(model, system, prompt, schema):
    r = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
              dict(systemInstruction={"parts": [{"text": system}]}, contents=[{"role": "user", "parts": [{"text": prompt}]}],
                   generationConfig={"responseMimeType": "application/json", "responseJsonSchema": schema}),
              {"x-goog-api-key": _key("google")})
    cand, u = r["candidates"][0], r.get("usageMetadata", {})
    if cand.get("finishReason") == "SAFETY":
        raise Refused
    cached = u.get("cachedContentTokenCount", 0)
    return (cand["content"]["parts"][0]["text"], u.get("promptTokenCount", 0) - cached,
            u.get("candidatesTokenCount", 0), cached)


CALLERS = {"anthropic": _anthropic, "openai": _openai, "google": _google}


def _meter(world, who, model, tin, tout, cached, ms):
    c = world.s["cost"]
    month = time.strftime("%Y-%m")
    if c.get("month") != month:
        c.update(month=month, month_usd=0.0)
    pin, pout = PRICES.get(model, PRICES[DEFAULT_MODEL])
    usd = (tin * pin + cached * pin * CACHED_RATE + tout * pout) / 1e6
    c["month_usd"] = round(c["month_usd"] + usd, 6)
    for b in (c, c.setdefault("by_agent", {}).setdefault(who, {}), c.setdefault("by_model", {}).setdefault(model, {})):
        for k, v in (("calls", 1), ("input_tokens", tin), ("output_tokens", tout), ("cached_tokens", cached),
                     ("usd", usd), ("ms", ms)):
            b[k] = round(b.get(k, 0) + v, 6)
    return usd


def _call(world, who, model, system, prompt, schema):
    """Returns (parsed_json, model_used) or None. `who` is the agent id the spend is billed to."""
    budget = world.s["settings"]["budget_usd"]
    fallback = world.s["settings"].get("fallback_model")
    for m in dict.fromkeys([model, fallback]):  # chosen model, then the fallback once
        if not m or not ready(m):
            continue
        if month_usd(world) >= budget:
            world.log("system", f"Monthly LLM budget of ${budget} reached; using rule-based voices.")
            return None
        t0 = time.monotonic()
        try:
            text, tin, tout, cached = CALLERS[provider(m)](m, f"{SAFETY}\n\n{system}", prompt, schema)
        except Refused:
            return None  # a refusal is a content decision; another provider shouldn't second-guess it
        except Exception as e:  # provider down, rate limited, bad key: try the fallback
            world.log("system", f"LLM {m} failed ({type(e).__name__}: {str(e)[:80]}); "
                                f"{'trying ' + fallback if m != fallback and fallback else 'using rule-based fallback'}.")
            continue
        _meter(world, who, m, tin, tout, cached, round((time.monotonic() - t0) * 1000))
        return (json.loads(text), m) if text else None
    return None


LINES_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["lines"],
                "properties": {"lines": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["speaker", "text"],
                    "properties": {"speaker": {"type": "string"}, "text": {"type": "string"}}}}}}


def voice(world, a, b, participants, topic, summary, draft, ctx, complex=False, model=None):
    """Rewrite the rule-generated draft into natural dialogue. Outcome and speakers are fixed by the engine.
    Routine talk uses the initiator's model, emotionally complex moments their model_complex."""
    people = []
    for pid in participants:
        p = world.A(pid)
        people.append(f"- {pid}: {p['name']}, {p['age']}, {p['role']}. Traits {p['traits']}. "
                      f"Mood: {world.mood(p)[0]}. Remembers: {ctx['knowledge'].get(pid) or world.recall(p, participants)}")
    prompt = (f"Situation ({topic}) in the {ctx.get('reason', '')} context. What happens (fixed): {summary}\n"
              f"Participants:\n" + "\n".join(people) +
              f"\n\nDraft lines (keep the same speakers, order and outcome; make them sound like real family members, "
              f"{LANGUAGES.get(world.s['settings'].get('language'), LANGUAGES['English'])}; each line under 25 words; each character "
              f"may only reference what they themselves remember):\n{json.dumps(draft)}\n"
              f"Return the lines; speaker must be the participant id.")
    model = model or (a.get("model_complex", COMPLEX_MODEL) if complex else a.get("model", DEFAULT_MODEL))
    res = _call(world, a["id"], model, "You write short, natural dialogue for a family simulation.", prompt, LINES_SCHEMA)
    if not res or len(res[0]["lines"]) != len(draft):
        return None
    return [dict(speaker=d["speaker"], name=d["name"], text=l["text"]) for d, l in zip(draft, res[0]["lines"])], res[1]


PLAN_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["wake", "mood", "tasks"],
               "properties": {"wake": {"type": "boolean"}, "mood": {"type": "boolean"}, "tasks": {"type": "array", "items": {
                   "type": "object", "additionalProperties": False,
                   "required": ["owner", "title", "kind", "priority", "due_hours", "effort"],
                   "properties": {"owner": {"type": "string"}, "title": {"type": "string"},
                                  "kind": {"type": "string", "enum": ["academic", "finance", "household", "creative",
                                                                     "learning", "help", "work", "care", "general"]},
                                  "priority": {"type": "integer"}, "due_hours": {"type": "number"},
                                  "effort": {"type": "integer"}}}}}}


def parse_instruction(world, text, targets):
    roster = "\n".join(f"- id={a['id']}: {a['name']} ({a['age']}, {a['role']})" for a in targets)
    prompt = (f"The world controller said: \"{text}\"\nAddressed family members:\n{roster}\n"
              "Translate it into goals. wake=true if it's a wake-up/new-day greeting; mood=true if it's encouraging. "
              "tasks: one per member who is asked to do something concrete (owner = id, short title, priority 1-5, "
              "due_hours from now, effort in 10-minute units 1-12). A greeting alone has no tasks.")
    who = targets[0] if len(targets) == 1 else None  # a private instruction is billed to (and uses the model of) its target
    res = _call(world, who["id"] if who else "controller", who.get("model", DEFAULT_MODEL) if who else DEFAULT_MODEL,
                "You convert instructions into structured goals.", prompt, PLAN_SCHEMA)
    if not res:
        return None
    res[0]["_llm"] = True
    return res[0]
