"""Headless check: run 4 simulated days and assert the core loops actually happen. `python test_sim.py`"""
import json
import os
import tempfile

os.environ.pop("ANTHROPIC_API_KEY", None)  # deterministic, free
import world as W

path = os.path.join(tempfile.mkdtemp(), "t.db")
w = W.World(path)
w.instruct("Good morning, everyone. It's a new day. Let's get started.")
w.instruct("Arjun, you have an important assignment. Complete it before playing games.")
w.instruct("Priya, help your younger sister with her homework.", target="daughter")
for _ in range(int(os.environ.get("DAYS", 4)) * 144):
    w.tick()

db = w.db
q = lambda sql, *a: db.execute(sql, a).fetchall()
topics = dict(q("SELECT topic, COUNT(*) FROM convs GROUP BY topic"))
print("conversations by topic:", topics)
print("events by type:", dict(q("SELECT type, COUNT(*) FROM events GROUP BY type")))
print("conflicts:", len(w.s["conflicts"]), "resolved:", sum(c["resolved"] for c in w.s["conflicts"]))
for a in w.agents.values():
    print(f"{a['name']:8} rates={a['counters'].get('completion_history')} lessons={[(l['text'][:30], l['status']) for l in a['lessons']]}"
          f" mods={a['modifiers']} mem={len(a['memory']['episodic'])}")

assert len(q("SELECT day FROM reports")) == int(os.environ.get("DAYS", 4)), "a report per day"
assert sum(topics.values()) > 40, "agents talk on their own"
assert len(topics) >= 6, "conversations are varied"
assert q("SELECT COUNT(*) FROM events WHERE type='task' AND text LIKE '%completed%'")[0][0] > 20, "tasks get done"
assert any(a["lessons"] for a in w.agents.values()), "someone learned something"
# knowledge isolation: Anu's secret stays with Anu unless she says it
secret = [aid for aid, a in w.agents.items() for m in a["memory"]["episodic"] if m["kind"] == "secret"]
assert set(secret) <= {"anu"}, secret
# private instruction only reached Priya
priv = [aid for aid, a in w.agents.items()
        for m in a["memory"]["episodic"] + a["memory"]["short"] if "World Controller told me privately" in m["text"]]
assert set(priv) == {"daughter"}, priv
# persistence: reload from disk gives the same clock
t = w.s["t"]
assert W.World(path).s["t"] == t
# witnesses keep their own (partial) version of what they saw
kinds = {m["kind"] for a in w.agents.values() for m in a["memory"]["short"] + a["memory"]["episodic"]}
assert "witnessed" in kinds, kinds
# claims are checked against real task state, not taken at face value
cl = w.s["claims"]
print("claims:", {s: sum(c["status"] == s for c in cl) for s in ("true", "false", "pending")},
      "caught:", [e[0] for e in q("SELECT text FROM events WHERE type='claim'")][:3])
assert cl and any(c["status"] in ("true", "false") for c in cl)
for c in cl:
    t = next((t for t in w.s["tasks"] if t["id"] == c["task"]), None)
    if t and c["kind"] != "done" and c["status"] != "pending":
        assert (c["status"] == "true") == (t["status"] == "done"), (c, t["status"])
# an unresolved argument carries into the next morning, and the grudge doesn't fade overnight
w2 = W.World(os.path.join(tempfile.mkdtemp(), "c.db"))
w2.s["conflicts"].append(dict(id=999, a="father", b="son", topic="the assignment", t=w2.s["t"], severity=0.8, resolved=False))
r0, anger0 = w2.rel("son", "father")["frustration"] + 0.3, w2.A("son")["emotions"]["anger"]
w2.rel("son", "father")["frustration"] = r0
w2.decay(); w2.start_day(1)
assert w2.rel("son", "father")["frustration"] == r0 and w2.A("son")["emotions"]["anger"] > anger0
assert any("still upset with Rajesh" in m["text"] for m in w2.A("son")["memory"]["short"])
md = q("SELECT md FROM reports WHERE day=1")[0][0]
assert "## Arjun" in md and "Said vs did" in md and w.report_csv(1).count("\n") == 6
print("\n".join(md.splitlines()[:14]))
print("OK")
