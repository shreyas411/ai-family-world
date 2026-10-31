"""Optional Claude layer. Only voices conversations and parses instructions; never decides state.

Enabled when ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is set. Every call is metered into world cost
and stops when the configured budget is reached; failures silently fall back to the rule-based path.
"""
import json
import os

try:
    import anthropic
except ImportError:  # the simulation runs fine without it
    anthropic = None

DEFAULT_MODEL = "claude-haiku-5-5"  # cheapest current model; change per agent in the control panel
MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0)}  # $/MTok
SAFETY = ("This is a fictional, wholesome simulation of an Indian family. Keep everything age-appropriate: realistic "
          "disagreements and discipline are fine, but never abuse, humiliation, violence, or any sexual content.")
_client = None


def available():
    return anthropic is not None and bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _call(world, model, system, prompt, schema):
    global _client
    _client = _client or anthropic.Anthropic(max_retries=1, timeout=30)
    extra = {}
    if model != "claude-haiku-5-5":  # server-side refusal fallback for Sonnet/Opus
        extra = dict(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    try:
        r = _client.beta.messages.create(
            model=model, max_tokens=1500, system=f"{SAFETY}\n\n{system}",
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}}, **extra)
    except anthropic.APIConnectionError:
        return None
    except anthropic.APIStatusError as e:
        world.log("system", f"LLM call failed ({e.status_code}); using rule-based fallback.")
        return None
    c = world.s["cost"]
    pin, pout = PRICES.get(model, PRICES[DEFAULT_MODEL])
    c["calls"] += 1
    c["input_tokens"] += r.usage.input_tokens
    c["output_tokens"] += r.usage.output_tokens
    c["usd"] = round(c["usd"] + (r.usage.input_tokens * pin + r.usage.output_tokens * pout) / 1e6, 5)
    if c["usd"] >= world.s["settings"]["budget_usd"]:
        world.log("system", f"LLM budget of ${world.s['settings']['budget_usd']} reached; switching to rule-based voices.")
    if r.stop_reason == "refusal":
        return None
    text = next((b.text for b in r.content if b.type == "text"), None)
    return json.loads(text) if text else None


LINES_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["lines"],
                "properties": {"lines": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["speaker", "text"],
                    "properties": {"speaker": {"type": "string"}, "text": {"type": "string"}}}}}}


def voice(world, a, b, participants, topic, summary, draft, ctx):
    """Rewrite the rule-generated draft into natural dialogue. Outcome and speakers are fixed by the engine."""
    people = []
    for pid in participants:
        p = world.A(pid)
        people.append(f"- {pid}: {p['name']}, {p['age']}, {p['role']}. Traits {p['traits']}. "
                      f"Mood: {world.mood(p)[0]}. Remembers: {ctx['knowledge'].get(pid) or world.recall(p, participants)}")
    prompt = (f"Situation ({topic}) in the {ctx.get('reason', '')} context. What happens (fixed): {summary}\n"
              f"Participants:\n" + "\n".join(people) +
              f"\n\nDraft lines (keep the same speakers, order and outcome; make them sound like real family members, "
              f"Indian English with occasional Hindi/Malayalam words is fine, each line under 25 words; each character "
              f"may only reference what they themselves remember):\n{json.dumps(draft)}\n"
              f"Return the lines; speaker must be the participant id.")
    out = _call(world, a.get("model", DEFAULT_MODEL), "You write short, natural dialogue for a family simulation.",
                prompt, LINES_SCHEMA)
    if not out or len(out["lines"]) != len(draft):
        return None
    return [dict(speaker=d["speaker"], name=d["name"], text=l["text"]) for d, l in zip(draft, out["lines"])]


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
    out = _call(world, DEFAULT_MODEL, "You convert instructions into structured goals.", prompt, PLAN_SCHEMA)
    if out:
        out["_llm"] = True
    return out
