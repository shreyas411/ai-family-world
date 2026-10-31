"""Benchmark models on identical family scenarios: behaviour quality, speed and cost.

    .venv/bin/python bench.py claude-haiku-5-5 claude-sonnet-5-5 gemini-2.5-flash [--judge claude-sonnet-5-5]

Scenarios are the first conversation of each topic from a seeded, rule-based day, so every model voices the
same drafts with the same memories. Quality = format checks (line count, <25 words) plus an optional
1-5 judge score. Full lines go to bench_results.json for reading side by side.
"""
import json
import os
import sys
import tempfile

import llm
import world as W

JUDGE_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["score", "reason"],
                "properties": {"score": {"type": "integer"}, "reason": {"type": "string"}}}


def scenarios(n=8):
    w = W.World(os.path.join(tempfile.mkdtemp(), "bench.db"))
    w.reset(seed=42)
    w.s["settings"]["llm_enabled"] = False
    for _ in range(144):  # one simulated day
        w.tick()
    rows = w.db.execute("SELECT topic, initiator, participants, lines, context, summary FROM convs ORDER BY id").fetchall()
    seen, out = set(), []
    for topic, init, parts, lines, ctx, summary in rows:
        if topic not in seen and len(out) < n:
            seen.add(topic)
            out.append(dict(topic=topic, a=init, participants=json.loads(parts), draft=json.loads(lines),
                            ctx=json.loads(ctx), summary=summary))
    w.s["settings"].update(llm_enabled=True, budget_usd=float(os.environ.get("BENCH_BUDGET", 1.0)), fallback_model="")
    return w, out


def checks(draft, lines):
    return dict(count=len(lines) == len(draft), short=all(len(l["text"].split()) < 25 for l in lines))


def main(models, judge=None):
    w, cases = scenarios()
    w.s["settings"]["language"] = os.environ.get("LANGUAGE", "English")  # LANGUAGE=Tamil to benchmark Tamil dialogue
    results, table = [], []
    for m in models:
        if not llm.ready(m):
            print(f"skip {m}: no API key for {llm.provider(m)}")
            continue
        b0 = dict(w.s["cost"].get("by_model", {}).get(m, {}))
        ok = scores = 0
        for c in cases:
            out = llm.voice(w, w.A(c["a"]), None, c["participants"], c["topic"], c["summary"], c["draft"], c["ctx"],
                            model=m)
            lines = out[0] if out else []
            chk = checks(c["draft"], lines) if out else dict(count=False, short=False)
            score = None
            if judge and out:
                j = llm._call(w, "bench-judge", judge, "You rate dialogue for a family simulation.",
                              f"Situation: {c['summary']}\nLines: {json.dumps(lines)}\nRate 1-5 how believable, in "
                              f"character and emotionally fitting this is for an Indian family, and whether it is natural "
                              f"{w.s['settings']['language']}.", JUDGE_SCHEMA)
                score = j[0]["score"] if j else None
                scores += score or 0
            ok += all(chk.values())
            results.append(dict(model=m, topic=c["topic"], draft=c["draft"], lines=lines, checks=chk, judge=score))
        b = w.s["cost"]["by_model"].get(m, {})
        calls = b.get("calls", 0) - b0.get("calls", 0)
        table.append((m, f"{ok}/{len(cases)}", f"{scores / len(cases):.1f}" if judge else "—",
                      round((b.get("ms", 0) - b0.get("ms", 0)) / max(calls, 1)),
                      f"${b.get('usd', 0) - b0.get('usd', 0):.4f}"))
    json.dump(results, open("bench_results.json", "w"), indent=1, ensure_ascii=False)
    print(f"{len(cases)} scenarios; judge calls bill to the judge's row; total incl. judge ${w.s['cost'].get('usd', 0):.4f}")
    print(f"{'model':22} {'format ok':>9} {'judge':>6} {'avg ms':>7} {'cost':>9}")
    for r in table:
        print(f"{r[0]:22} {r[1]:>9} {r[2]:>6} {r[3]:>7} {r[4]:>9}")
    return results


if __name__ == "__main__":
    args = sys.argv[1:]
    judge = args[args.index("--judge") + 1] if "--judge" in args else None
    models = [a for a in args if a not in ("--judge", judge)] or [llm.DEFAULT_MODEL, llm.COMPLEX_MODEL]
    main(models, judge)
