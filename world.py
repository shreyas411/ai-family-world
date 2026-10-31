"""AI Family World - simulation engine.

Deterministic core: clock, schedules, utility-based decisions, emotions, relationships,
tasks, memory, learning. The LLM (llm.py) is only used to voice conversations and parse
controller instructions; every state change is decided here, so the world runs without it.
"""
import csv
import io
import json
import random
import re
import sqlite3
import threading
from pathlib import Path

import llm

TICK = 10  # simulated minutes per tick
EMOTIONS = ["happiness", "sadness", "anger", "frustration", "excitement", "jealousy", "fear", "anxiety",
            "love", "affection", "pride", "guilt", "loneliness", "surprise", "curiosity", "disappointment",
            "gratitude"]
NEGATIVE = {"sadness", "anger", "frustration", "jealousy", "fear", "anxiety", "guilt", "loneliness",
            "disappointment"}
REL_KEYS = ["trust", "affection", "respect", "frustration", "understanding", "closeness"]
ROOMS = {"living_room": "Living room", "kitchen": "Kitchen", "parents_bedroom": "Parents' bedroom",
         "kids_bedroom": "Children's bedroom", "study": "Study room", "dining": "Dining area",
         "balcony": "Balcony", "entrance": "Home entrance", "outside": "Outside"}
TASK_ROOM = {"work": "study", "academic": "study", "finance": "study", "learning": "study",
             "household": "kitchen", "creative": "balcony", "care": "kids_bedroom", "help": "study",
             "general": "living_room"}
EMOJI = {"happiness": "😊", "sadness": "😢", "anger": "😠", "frustration": "😤", "excitement": "🤩",
         "jealousy": "😒", "fear": "😨", "anxiety": "😟", "love": "🥰", "affection": "🤗", "pride": "😌",
         "guilt": "😔", "loneliness": "🥺", "surprise": "😮", "curiosity": "🤔", "disappointment": "😞",
         "gratitude": "🙏", "calm": "🙂", "asleep": "😴"}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def hhmm(m):
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def S(*rows):
    return [dict(start=a, end=b, loc=l, act=t, kind=k) for a, b, l, t, k in rows]


# ---------------------------------------------------------------- default family

def _agent(id, name, age, role, avatar, color, traits, baseline, schedule, leisure, goals, memories, daily):
    emotions = {e: 0.05 for e in EMOTIONS}
    emotions.update(baseline)
    return dict(id=id, name=name, age=age, role=role, avatar=avatar, color=color, model=llm.DEFAULT_MODEL,
                traits=traits, baseline=dict(emotions), emotions=dict(emotions), schedule=schedule,
                leisure=leisure, goals=goals, daily=daily, location="parents_bedroom", place="",
                activity="Sleeping", thought="", energy=0.9, current_task=None,
                memory=dict(short=[], long=[], episodic=[dict(t=0, text=m, importance=0.7, kind="background",
                                                              who=[]) for m in memories]),
                lessons=[], modifiers=dict(discipline=0.0, patience=0.0, helpfulness=0.0, delegation=0.0, honesty=0.0),
                counters={}, recent=[], leisure_streak=0, last_talk=-999, wake_until=-1, shared=[])


def default_agents():
    weekday_father = S((0, 360, "parents_bedroom", "Sleeping", "sleep"),
                       (360, 420, "balcony", "Morning tea and newspaper", "free"),
                       (420, 470, "parents_bedroom", "Getting ready for work", "routine"),
                       (470, 520, "dining", "Breakfast", "meal"),
                       (520, 1080, "outside:Office", "Working at the office", "away"),
                       (1080, 1230, "living_room", "Relaxing after work", "free"),
                       (1230, 1290, "dining", "Family dinner", "meal"),
                       (1290, 1350, "living_room", "Family time", "free"),
                       (1350, 1400, "parents_bedroom", "Talking with spouse", "free"),
                       (1400, 1440, "parents_bedroom", "Sleeping", "sleep"))
    mother = S((0, 330, "parents_bedroom", "Sleeping", "sleep"),
               (330, 470, "kitchen", "Cooking breakfast and packing lunches", "chores"),
               (470, 520, "dining", "Breakfast", "meal"),
               (520, 720, "kitchen", "Household work", "chores"),
               (720, 840, "living_room", "Lunch and rest", "free"),
               (840, 1020, "balcony", "Personal time", "free"),
               (1020, 1230, "kitchen", "Cooking dinner", "chores"),
               (1230, 1290, "dining", "Family dinner", "meal"),
               (1290, 1350, "living_room", "Family time", "free"),
               (1350, 1400, "parents_bedroom", "Talking with spouse", "free"),
               (1400, 1440, "parents_bedroom", "Sleeping", "sleep"))
    son = S((0, 420, "kids_bedroom", "Sleeping", "sleep"),
            (420, 470, "kids_bedroom", "Getting ready for college", "routine"),
            (470, 520, "dining", "Breakfast", "meal"),
            (520, 960, "outside:College", "Attending college", "away"),
            (960, 1080, "living_room", "Free time", "free"),
            (1080, 1230, "study", "Study time", "study"),
            (1230, 1290, "dining", "Family dinner", "meal"),
            (1290, 1420, "living_room", "Free time", "free"),
            (1420, 1440, "kids_bedroom", "Sleeping", "sleep"))
    daughter = S((0, 390, "kids_bedroom", "Sleeping", "sleep"),
                 (390, 470, "kids_bedroom", "Getting ready for school", "routine"),
                 (470, 520, "dining", "Breakfast", "meal"),
                 (520, 930, "outside:School", "At school", "away"),
                 (930, 1020, "living_room", "Snack and rest", "free"),
                 (1020, 1200, "study", "Homework time", "study"),
                 (1200, 1230, "kitchen", "Helping in the kitchen", "chores"),
                 (1230, 1290, "dining", "Family dinner", "meal"),
                 (1290, 1380, "balcony", "Hobby time", "free"),
                 (1380, 1440, "kids_bedroom", "Sleeping", "sleep"))
    anu = S((0, 400, "kids_bedroom", "Sleeping", "sleep"),
            (400, 470, "kids_bedroom", "Getting ready for school", "routine"),
            (470, 520, "dining", "Breakfast", "meal"),
            (520, 870, "outside:School", "At school", "away"),
            (870, 960, "living_room", "Playing", "free"),
            (960, 1050, "study", "Homework time", "study"),
            (1050, 1230, "living_room", "Playing", "free"),
            (1230, 1290, "dining", "Family dinner", "meal"),
            (1290, 1320, "living_room", "Story time", "free"),
            (1320, 1440, "kids_bedroom", "Sleeping", "sleep"))
    g = lambda title, metric, target: dict(title=title, metric=metric, target=target)
    agents = [
        _agent("father", "Rajesh", 45, "Father", "👨", "#2a78d6",
               dict(conscientiousness=.85, agreeableness=.45, neuroticism=.45, extraversion=.35, openness=.4),
               dict(love=.45, affection=.3, anxiety=.2), weekday_father, "Watching the news",
               [g("Complete professional work", "work_done", 20), g("Improve financial planning", "finance_done", 6),
                g("Spend quality time with family", "family_minutes", 900),
                g("Communicate better with the children", "warm_child_talks", 15)],
               ["Arjun's college fees have made the household budget tight this year.",
                "Last month I argued with Arjun about whether he should study computer science or join a startup."],
               [("Finish office report", "work", 4, 1080, 14), ("Review the household budget", "finance", 3, 1390, 4)]),
        _agent("mother", "Lakshmi", 42, "Mother", "👩", "#eb6834",
               dict(conscientiousness=.8, agreeableness=.7, neuroticism=.55, extraversion=.6, openness=.6),
               dict(love=.55, affection=.5), mother, "Calling her sister",
               [g("Manage household responsibilities", "household_done", 25), g("Improve personal skills", "learning_done", 6),
                g("Maintain family coordination", "mediations", 8), g("Balance personal and family goals", "personal_minutes", 600)],
               ["I gave up my teaching job when Anu was born; I still miss it sometimes.",
                "I worry Rajesh is too hard on Arjun."],
               [("Do the laundry", "household", 3, 1020, 4), ("Clean the living room", "household", 2, 1230, 3),
                ("Plan groceries for the week", "household", 2, 1390, 2), ("Online cooking/teaching course", "learning", 2, 1390, 4)]),
        _agent("son", "Arjun", 19, "Son (college student)", "🧑", "#1baf7a",
               dict(conscientiousness=.4, agreeableness=.5, neuroticism=.5, extraversion=.55, openness=.85),
               dict(curiosity=.4, affection=.25, love=.3), son, "Gaming on his phone",
               [g("Complete academic assignments", "academic_done", 15), g("Learn programming", "learning_done", 10),
                g("Improve academic performance", "exam_avg", 80), g("Develop independence", "household_done", 6)],
               ["Dad wants me to join a stable job; I want to build my own app.",
                "I promised Priya I'd help her with Python and keep forgetting."],
               [("College assignment", "academic", 4, 1380, 7), ("Practice programming", "learning", 3, 1420, 6),
                ("Take out the trash", "household", 2, 1290, 1)]),
        _agent("daughter", "Priya", 16, "Daughter (school student)", "👧", "#eda100",
               dict(conscientiousness=.7, agreeableness=.55, neuroticism=.65, extraversion=.6, openness=.8),
               dict(curiosity=.35, affection=.4, love=.4, anxiety=.15), daughter, "Sketching in her notebook",
               [g("Complete schoolwork", "academic_done", 15), g("Develop creative abilities", "creative_done", 10),
                g("Improve communication skills", "conversations", 30), g("Build confidence", "exam_avg", 85)],
               ["Board exams are next year and everyone keeps reminding me.",
                "Arjun read my diary once; I haven't fully forgiven him."],
               [("Homework", "academic", 4, 1260, 6), ("Practice drawing", "creative", 2, 1380, 3),
                ("Help mother in the kitchen", "household", 2, 1230, 2)]),
        _agent("anu", "Anu", 8, "Younger daughter", "👶", "#e87ba4",
               dict(conscientiousness=.35, agreeableness=.8, neuroticism=.6, extraversion=.9, openness=.9),
               dict(curiosity=.65, affection=.6, love=.55, happiness=.45, excitement=.3), anu, "Playing with her toys",
               [g("Finish age-appropriate learning", "academic_done", 12), g("Develop reading skills", "learning_done", 10),
                g("Explore hobbies", "creative_done", 6), g("Learn good habits", "household_done", 5)],
               ["My teacher gave me a star sticker for drawing a peacock.",
                "Priya-chechi lets me sit with her when she draws."],
               [("Basic homework", "academic", 3, 1140, 3), ("Reading practice", "learning", 2, 1260, 2),
                ("Put toys away", "household", 1, 1290, 1)]),
    ]
    for a in agents:
        a["location"] = a["schedule"][0]["loc"]
    return agents


VARIANTS = {"College assignment": ["Data Structures assignment", "DBMS lab record", "Operating Systems assignment",
                                   "Maths problem set"],
            "Homework": ["Maths homework", "Physics worksheet", "Chemistry homework", "English essay"],
            "Basic homework": ["Spelling homework", "Addition worksheet", "Colouring homework", "EVS homework"]}


def initial_relationships(agents):
    rel = {}
    special = {("father", "son"): dict(respect=.55, frustration=.3, understanding=.4),
               ("son", "father"): dict(respect=.6, frustration=.35, understanding=.4, closeness=.4),
               ("son", "daughter"): dict(frustration=.25), ("daughter", "son"): dict(frustration=.35, trust=.45),
               ("father", "mother"): dict(affection=.7, trust=.75), ("mother", "father"): dict(affection=.7, trust=.75, frustration=.2)}
    for a in agents:
        for b in agents:
            if a["id"] == b["id"]:
                continue
            r = dict(trust=.65, affection=.65, respect=.6, frustration=.1, understanding=.55, closeness=.55)
            if a["age"] < 12 or b["age"] < 12 or a["id"] == "mother":
                r.update(affection=.8, closeness=.7)
            r.update(special.get((a["id"], b["id"]), {}))
            rel[f"{a['id']}|{b['id']}"] = r
    return rel


# ---------------------------------------------------------------- the world

class World:
    def __init__(self, path="world.db"):
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, json TEXT);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, t INTEGER, type TEXT, actors TEXT, text TEXT, data TEXT);
            CREATE TABLE IF NOT EXISTS convs(id INTEGER PRIMARY KEY, t INTEGER, room TEXT, topic TEXT, initiator TEXT,
                participants TEXT, private INTEGER, lines TEXT, context TEXT, summary TEXT, voiced_by TEXT);
            CREATE TABLE IF NOT EXISTS history(t INTEGER, kind TEXT, data TEXT);
            CREATE TABLE IF NOT EXISTS reports(day INTEGER PRIMARY KEY, json TEXT, md TEXT);
            CREATE INDEX IF NOT EXISTS hist_idx ON history(kind, t);
        """)
        row = self.db.execute("SELECT json FROM state WHERE id=1").fetchone()
        self.s = json.loads(row[0]) if row else self.fresh()
        self.s.setdefault("claims", [])
        self.s["running"] = False  # never auto-run after restart; controller presses start
        self.outbox = []  # events/convs since last drain, pushed to websocket clients
        if not row:
            self.save()

    # ---------- persistence
    def fresh(self, seed=42):
        agents = default_agents()
        s = dict(t=330, seed=seed, running=False, speed=1.0, agents={a["id"]: a for a in agents},
                 rel=initial_relationships(agents), tasks=[], next_id=1, conflicts=[], stats={},
                 cooldowns={}, settings=dict(llm_enabled=llm.available(), budget_usd=2.0),
                 cost=dict(calls=0, input_tokens=0, output_tokens=0, usd=0.0), day_start={}, pending_share={}, claims=[])
        self.s = s
        self.start_day(0)
        return s

    def reset(self, seed=None):
        with self.lock:
            self.db.executescript("DELETE FROM events; DELETE FROM convs; DELETE FROM history; DELETE FROM reports;")
            self.fresh(seed if seed is not None else random.randrange(10 ** 6))
            self.log("system", "The world was reset. A new family story begins.")
            self.save()

    def save(self):
        self.db.execute("INSERT OR REPLACE INTO state(id, json) VALUES(1, ?)", (json.dumps(self.s),))
        self.db.commit()

    def log(self, type, text, actors=(), data=None):
        t = self.s["t"]
        cur = self.db.execute("INSERT INTO events(t, type, actors, text, data) VALUES(?,?,?,?,?)",
                              (t, type, json.dumps(list(actors)), text, json.dumps(data or {})))
        self.outbox.append(dict(kind="event", id=cur.lastrowid, t=t, type=type, actors=list(actors), text=text))

    # ---------- small helpers
    @property
    def agents(self):
        return self.s["agents"]

    def A(self, aid):
        return self.agents[aid]

    def rel(self, a, b):
        return self.s["rel"][f"{a}|{b}"]

    def bump_rel(self, a, b, **d):
        r = self.rel(a, b)
        for k, v in d.items():
            r[k] = round(clamp(r[k] + v), 3)

    def feel(self, a, **d):
        """Apply emotion deltas, scaled by personality: neurotic agents react harder to negative events."""
        t = a["traits"]
        for e, v in d.items():
            scale = (0.6 + 0.8 * t["neuroticism"]) if (e in NEGATIVE and v > 0) else (0.6 + 0.6 * t["extraversion"]) if v > 0 else 1
            a["emotions"][e] = round(clamp(a["emotions"][e] + v * scale), 3)

    def mood(self, a):
        if self.asleep(a):
            return "asleep", 0
        diff = {e: a["emotions"][e] - 0.6 * a["baseline"][e] for e in EMOTIONS}
        e = max(diff, key=diff.get)
        return (e, round(a["emotions"][e], 2)) if a["emotions"][e] > 0.35 else ("calm", 0)

    def negativity(self, a):
        em = a["emotions"]
        return (em["anger"] + em["sadness"] + em["anxiety"] + em["frustration"]) / 4

    def asleep(self, a):
        return a["activity"] == "Sleeping"

    def stat(self, a, key, inc=1):
        st = self.s["stats"].setdefault(a["id"], {})
        st[key] = st.get(key, 0) + inc

    def note(self, a, key, text):
        st = self.s["stats"].setdefault(a["id"], {})
        st.setdefault(key, []).append(f"{hhmm(self.s['t'])} {text}")

    def count(self, a, key, inc=1):
        a["counters"][key] = a["counters"].get(key, 0) + inc

    def remember(self, a, text, importance=0.3, who=(), kind="observation"):
        m = dict(t=self.s["t"], text=text, importance=round(importance, 2), kind=kind, who=list(who))
        a["memory"]["short"] = (a["memory"]["short"] + [m])[-25:]
        if importance >= 0.6:
            a["memory"]["episodic"].append(m)

    def recall(self, a, who=(), k=4):
        """Top memories by importance, recency and relevance to the people involved. Only this agent's own memories."""
        now = self.s["t"]
        mem = a["memory"]["episodic"] + a["memory"]["long"] + a["memory"]["short"]
        score = lambda m: m["importance"] + 0.4 * bool(set(m["who"]) & set(who)) - (now - m["t"]) / (1440 * 6)
        return [m["text"] for m in sorted(mem, key=score, reverse=True)[:k]]

    def claim(self, a, to, t, kind, said):
        """Record what an agent *said* about a task. Truth is decided later by the task's real state, not by the words.
        kind: done (says it's finished) | on_track (says it's nearly done) | promise (says they'll do it)."""
        c = dict(id=self.s["next_id"], t=self.s["t"], agent=a["id"], to=to["id"] if to else None, task=t["id"],
                 title=t["title"], kind=kind, said=said, progress=t["progress"], status="pending", discovered=False)
        self.s["next_id"] += 1
        if kind == "done":
            c["status"] = "true" if t["status"] == "done" else "false"
        self.s["claims"] = self.s["claims"][-300:] + [c]
        return c

    def settle_claims(self, t):
        """A task just finished or failed: check every claim made about it."""
        for c in self.s["claims"]:
            if c["task"] != t["id"] or c["discovered"]:
                continue
            if c["status"] == "pending":
                c["status"] = "true" if t["status"] == "done" else "false"
            c.update(verified_t=self.s["t"], actual=t["status"], discovered=True)
            if c["status"] == "false" and t["status"] == "failed":
                a, to, lie = self.A(c["agent"]), self.agents.get(c["to"]), c["kind"] != "promise"
                self.stat(a, "caught_lying" if lie else "broken_promises")
                self.feel(a, guilt=0.15)
                if to:
                    self.bump_rel(to["id"], a["id"], trust=-0.12 if lie else -0.05, respect=-0.04 if lie else -0.02,
                                  frustration=0.1 if lie else 0.04)
                    self.feel(to, disappointment=0.2 if lie else 0.1, anger=0.1 if lie else 0)
                    self.remember(to, f"{a['name']} told me \"{c['said']}\" about '{t['title']}', but it was never finished.",
                                  0.7 if lie else 0.5, [a["id"]], "claim")
                self.log("claim", f"Claim check: {a['name']} said \"{c['said']}\" about '{t['title']}' "
                                  f"({int(c['progress'] * 100)}% done at the time), but it was never finished.",
                         [a["id"]] + ([to["id"]] if to else []), dict(claim=c["id"]))

    def tasks_of(self, aid, status=("pending",)):
        return [t for t in self.s["tasks"] if t["owner"] == aid and t["status"] in status]

    def add_task(self, owner, title, kind="general", priority=3, due=None, effort=4, source="routine"):
        t = dict(id=self.s["next_id"], owner=owner, title=title, kind=kind, priority=priority, effort=effort,
                 progress=0.0, due=due if due is not None else self.s["t"] + 720, status="pending",
                 created=self.s["t"], source=source, procrastinated=0)
        self.s["next_id"] += 1
        self.s["tasks"].append(t)
        self.stat(self.A(owner), "assigned")
        return t

    def block(self, a, minute, day):
        for b in a["schedule"]:
            if b["start"] <= minute < b["end"]:
                b = dict(b)
                break
        else:
            b = dict(start=0, end=1440, loc="living_room", act="Free time", kind="free")
        if b["kind"] == "away" and day % 7 in (5, 6):  # weekend: everyone home
            b.update(loc="living_room", act="Weekend at home", kind="free")
        if b["kind"] == "sleep" and self.s["t"] < a.get("wake_until", -1):
            b.update(loc=a["schedule"][0]["loc"], act="Up early", kind="free")
        return b

    def co_located(self, a):
        return [o for o in self.agents.values()
                if o["id"] != a["id"] and o["location"] == a["location"] and o["location"] != "outside"
                and not self.asleep(o)]

    # ---------- day lifecycle
    def start_day(self, day):
        rng = random.Random(self.s["seed"] + day)
        for a in self.agents.values():
            for title, kind, prio, due, effort in a.get("daily", []):
                title = rng.choice(VARIANTS[title]) if title in VARIANTS else title
                if kind == "academic" and day % 7 in (5, 6):
                    continue
                self.add_task(a["id"], title, kind, prio, day * 1440 + due, max(1, round(effort * rng.uniform(0.7, 1.7))))
            for c in self.s["conflicts"]:  # unresolved arguments follow you into the next morning
                if c["resolved"] or a["id"] not in (c["a"], c["b"]):
                    continue
                other = self.A(c["b"] if a["id"] == c["a"] else c["a"])
                if day * 1440 - c["t"] > 3 * 1440:  # old grudges fade on their own
                    c.update(resolved=True, resolved_t=day * 1440, resolved_how="faded with time, never talked through")
                    continue
                self.feel(a, anger=0.2 * c["severity"], sadness=0.1, anxiety=0.05)
                self.remember(a, f"Woke up still upset with {other['name']} about {c['topic']}.", 0.6, [other["id"]], "carryover")
                self.log("carryover", f"{a['name']} woke up still upset with {other['name']} about {c['topic']}.",
                         [a["id"], other["id"]], dict(conflict=c["id"]))
            for k in a["modifiers"]:  # habits slip unless reinforced
                a["modifiers"][k] = round(a["modifiers"][k] * 0.97, 3)
            self.s["stats"][a["id"]] = dict(assigned=len(self.tasks_of(a["id"])), emotions_start=dict(a["emotions"]))
        self.s["day_start"] = dict(rel=json.loads(json.dumps(self.s["rel"])), conflicts=len(self.s["conflicts"]))

    def end_of_day(self, day):
        """Reflection: evaluate results, learn lessons with evidence, consolidate memory, write the report."""
        for a in self.agents.values():
            self.reflect(a, day)
        report = self.build_report(day)
        self.db.execute("INSERT OR REPLACE INTO reports(day, json, md) VALUES(?,?,?)",
                        (day, json.dumps(report), report_markdown(report)))
        self.log("report", f"Daily report for Day {day + 1} is ready.", data=dict(day=day))
        # keep state small: drop finished tasks older than 3 days
        self.s["tasks"] = [t for t in self.s["tasks"] if t["status"] == "pending" or t["created"] > (day - 2) * 1440]
        self.start_day(day + 1)

    def reflect(self, a, day):
        st = self.s["stats"].get(a["id"], {})
        a["modifiers"].setdefault("honesty", 0.0)
        today = [t for t in self.s["tasks"] if t["owner"] == a["id"] and day * 1440 <= t["due"] < (day + 1) * 1440]
        done = sum(t["status"] == "done" for t in today)
        rate = round(done / len(today), 2) if today else 1.0
        hist = a["counters"].setdefault("completion_history", [])
        hist.append(rate)
        failed = [t for t in today if t["status"] == "failed"]
        procrast = sum(t["procrastinated"] for t in failed)

        others = [k for k in self.agents if k != a["id"]]
        metrics = dict(discipline=rate, patience=-st.get("arguments", 0), delegation=round(a["energy"], 2),
                       helpfulness=round(sum(self.rel(o, a["id"])["affection"] for o in others) / max(1, len(others)), 3),
                       honesty=-st.get("caught_lying", 0))
        daily = a["counters"].setdefault("daily_metrics", {})
        for k, v in metrics.items():
            daily.setdefault(k, []).append(v)

        def learn(text, mod, delta, evidence):
            if any(l["text"] == text and l["status"] != "not effective" for l in a["lessons"]):
                for l in a["lessons"]:  # repeated mistake: reinforce, keep the evidence trail
                    if l["text"] == text:
                        l["evidence"].append(f"Day {day + 1}: {evidence}")
                a["modifiers"][mod] = round(min(0.4, a["modifiers"][mod] + delta / 2), 3)
                return
            a["lessons"].append(dict(text=text, day=day, modifier=mod, delta=delta, baseline_rate=metrics[mod],
                                     evidence=[f"Day {day + 1}: {evidence}"], status="testing"))
            a["modifiers"][mod] = round(min(0.4, a["modifiers"][mod] + delta), 3)
            self.remember(a, f"Lesson learned: {text}", 0.8, kind="lesson")
            self.log("learning", f"{a['name']} reflected: \"{text}\"", [a["id"]], dict(evidence=evidence))

        if failed and procrast >= 2:
            learn("Start important tasks earlier instead of postponing them.", "discipline", 0.08,
                  f"failed {len(failed)} task(s) after postponing {procrast} times")
        args = st.get("arguments", 0)
        if args:
            learn("Stay calm and listen before reacting in disagreements.", "patience", 0.06, f"{args} argument(s) today")
        if a["energy"] < 0.3 or st.get("overloaded", 0):
            learn("Ask the family for help before getting exhausted.", "delegation", 0.1,
                  f"ended the day with energy {a['energy']:.2f}")
        if st.get("caught_lying", 0):
            learn("Tell the truth about my progress, even when it's bad.", "honesty", 0.15,
                  f"said work was nearly done, then missed {st['caught_lying']} deadline(s) and lost trust")
        if st.get("helped", 0) >= 2:
            learn("Helping others brings the family closer.", "helpfulness", 0.04, f"helped {st['helped']} times")
        # Evaluate older lessons on the metric they target: improvement must show in the numbers.
        # (discipline: completion rate, patience: -arguments, delegation: end-of-day energy, helpfulness: affection received)
        for l in a["lessons"]:
            if l["status"] == "testing" and day - l["day"] >= 2:
                after = daily[l["modifier"]][-2:]
                avg = sum(after) / len(after)
                l["measured_rate"] = round(avg, 2)
                l["status"] = "effective" if avg > l["baseline_rate"] + 0.02 else "not effective"
        # Memory consolidation: important short-term memories become long-term, plus a day summary.
        mood, _ = self.mood(a)
        a["memory"]["long"].append(dict(t=self.s["t"], kind="day_summary", who=[], importance=0.5,
                                        text=f"Day {day + 1}: completed {done}/{len(today)} tasks, mostly felt {mood}, "
                                             f"{args} argument(s), helped {st.get('helped', 0)} time(s)."))
        a["memory"]["long"] = a["memory"]["long"][-60:]
        a["memory"]["episodic"] = a["memory"]["episodic"][-80:]

    # ---------- main loop
    def tick(self):
        with self.lock:
            s = self.s
            day, minute = divmod(s["t"], 1440)
            rng = random.Random(s["seed"] * 100003 + s["t"])
            if minute % 60 == 0:
                self.maybe_world_event(rng, day, minute)
            plans = []
            for a in self.agents.values():
                plans.append(self.step_agent(a, day, minute, rng))
            self.run_conversations([p for p in plans if p], rng)
            self.check_deadlines()
            self.decay()
            self.record(minute)
            s["t"] += TICK
            if s["t"] // 1440 > day:
                self.end_of_day(day)
            self.save()

    def step_agent(self, a, day, minute, rng):
        b = self.block(a, minute, day)
        prev_loc, prev_act = a["location"], a["activity"]
        if b["kind"] == "sleep":
            a.update(location=b["loc"], place="", activity="Sleeping", current_task=None, thought="")
            a["energy"] = clamp(a["energy"] + 0.035)
            return None
        if prev_act == "Sleeping":
            a["energy"] = max(a["energy"], 0.7)
        if b["kind"] == "away":
            place = b["loc"].split(":")[1]
            a.update(location="outside", place=place, activity=b["act"], current_task=None)
            self.away_work(a, rng)
            if prev_loc != "outside":
                self.log("move", f"{a['name']} left for {place.lower()}.", [a["id"]])
            return None
        a["place"] = ""
        if prev_loc == "outside":
            self.log("move", f"{a['name']} came back home.", [a["id"]])
            a["location"] = "entrance"
        plan = self.decide(a, b, minute, rng)
        plan["initiator"] = a["id"]
        self.apply_choice(a, b, plan, prev_loc)
        return plan if plan["kind"] == "talk" else None

    def away_work(self, a, rng):
        a["energy"] = clamp(a["energy"] - 0.008)
        for t in self.tasks_of(a["id"]):
            if t["kind"] == "work":
                self.progress(a, t, 0.8)
                break
        if a["id"] == "father":
            self.count(a, "work_minutes", TICK)

    def decide(self, a, b, minute, rng):
        """Score every option and pick the best. Each option carries the reason that produced it."""
        tr, em, md = a["traits"], a["emotions"], a["modifiers"]
        opts = [dict(u=0.5 if b["kind"] in ("routine", "meal") else 0.42, kind="schedule", why=f"routine: {b['act']}")]
        if b["kind"] in ("free", "study", "chores"):
            for t in self.tasks_of(a["id"]):
                if t["kind"] == "work" and minute < 1080 and a["id"] == "father":
                    continue
                left = t["due"] - self.s["t"]
                urgency = clamp(1 - left / 600) if left > 0 else 1
                bonus = 0.15 if (b["kind"] == "study" and t["kind"] in ("academic", "learning")) or \
                                (b["kind"] == "chores" and t["kind"] == "household") else 0
                u = (0.15 + t["priority"] * 0.07 + urgency * 0.35 + tr["conscientiousness"] * 0.25 + md["discipline"]
                     + bonus - (1 - a["energy"]) * 0.25 - self.negativity(a) * 0.2)
                opts.append(dict(u=u, kind="task", task=t, why=f"'{t['title']}' is {int(t['progress'] * 100)}% done, "
                                                                 f"due {hhmm(t['due'])} (priority {t['priority']})"))
            temptation = (1 - tr["conscientiousness"] - md["discipline"]) * 0.55 + em["excitement"] * 0.15
            u = 0.3 + temptation + (1 - a["energy"]) * 0.3 - a["leisure_streak"] * 0.03
            opts.append(dict(u=u, kind="leisure", why=f"wants a break (energy {a['energy']:.2f})"))
        if a["energy"] < 0.2:
            opts.append(dict(u=0.9, kind="rest", why="exhausted"))
        if self.s["t"] - a["last_talk"] >= 30:
            for o in self.topics(a, b, minute):
                opts.append(o)
        for o in opts:
            o["u"] = round(o["u"] + rng.uniform(0, 0.08), 3)
        choice = max(opts, key=lambda o: o["u"])
        pending = [o for o in opts if o["kind"] == "task"]
        if choice["kind"] == "leisure" and pending:
            urgent = max(pending, key=lambda o: o["u"])
            if urgent["task"]["due"] - self.s["t"] < 360:
                urgent["task"]["procrastinated"] += 1
                self.stat(a, "procrastinations")
                choice["why"] += f"; postponing '{urgent['task']['title']}'"
        top = sorted(opts, key=lambda o: -o["u"])[:3]
        a["thought"] = f"{choice['why']}  [considered: " + ", ".join(
            f"{o['kind']}{'(' + o.get('topic', '') + ')' if o['kind'] == 'talk' else ''} {o['u']:.2f}" for o in top) + "]"
        return choice

    def apply_choice(self, a, b, c, prev_loc):
        kind = c["kind"]
        if kind == "task":
            t = c["task"]
            loc = TASK_ROOM.get(t["kind"], b["loc"])
            if t["kind"] == "household" and b["kind"] == "chores":
                loc = b["loc"]
            a.update(location=loc, activity=f"Working on: {t['title']}", current_task=t["id"])
            a["leisure_streak"] = 0
            self.progress(a, t, 1.0)
            a["energy"] = clamp(a["energy"] - 0.012)
        elif kind == "leisure":
            a.update(location=b["loc"], activity=a["leisure"], current_task=None)
            a["leisure_streak"] += 1
            a["energy"] = clamp(a["energy"] + 0.01)
            self.feel(a, happiness=0.02)
        elif kind == "rest":
            a.update(location=a["schedule"][0]["loc"], activity="Resting", current_task=None)
            a["energy"] = clamp(a["energy"] + 0.04)
        elif kind == "schedule":
            a.update(location=b["loc"], activity=b["act"], current_task=None)
            a["energy"] = clamp(a["energy"] - (0.012 if b["kind"] == "chores" else 0.006))
            if b["kind"] == "chores":  # chores block also advances household tasks a little
                h = next(iter(t for t in self.tasks_of(a["id"]) if t["kind"] == "household"), None)
                if h:
                    self.progress(a, h, 0.5)
        elif kind == "talk":
            a["activity"] = f"Talking with {self.A(c['target'])['name']}"
        if a["location"] != prev_loc and a["location"] not in ("outside",):
            self.log("move", f"{a['name']} went to the {ROOMS[a['location']].lower()}.", [a["id"]])
        if a["id"] == "father" and kind in ("schedule", "leisure") and len(self.co_located(a)) >= 2:
            self.count(a, "family_minutes", TICK)
        if a["id"] == "mother" and b["act"] == "Personal time" and kind in ("schedule", "leisure", "task"):
            self.count(a, "personal_minutes", TICK)

    def progress(self, a, t, factor):
        eff = (0.55 + 0.45 * a["energy"] - 0.35 * self.negativity(a) + 0.15 * a["traits"]["conscientiousness"]) * factor
        t["progress"] = round(min(1.0, t["progress"] + eff / max(1, t["effort"])), 3)
        if t["progress"] >= 1.0 and t["status"] == "pending":
            t["status"] = "done"
            t["finished"] = self.s["t"]
            self.stat(a, "completed")
            self.count(a, f"{t['kind']}_done")
            self.feel(a, pride=0.12 + 0.04 * t["priority"], happiness=0.08, guilt=-0.15, anxiety=-0.08)
            self.remember(a, f"I finished '{t['title']}'.", 0.3 + 0.08 * t["priority"], kind="achievement")
            self.log("task", f"{a['name']} completed '{t['title']}'.", [a["id"]], dict(task=t["id"]))
            if t["priority"] >= 4 or t["source"] != "routine":
                self.s["pending_share"].setdefault(a["id"], []).append(t["title"])
            if a["current_task"] == t["id"]:
                a["current_task"] = None
            self.settle_claims(t)

    def check_deadlines(self):
        for t in self.s["tasks"]:
            if t["status"] == "pending" and self.s["t"] >= t["due"]:
                t["status"] = "failed"
                a = self.A(t["owner"])
                self.stat(a, "failed")
                self.note(a, "problems", f"missed deadline for '{t['title']}' ({int(t['progress'] * 100)}% done)")
                self.feel(a, guilt=0.1 + 0.05 * t["priority"], anxiety=0.08, disappointment=0.1)
                self.remember(a, f"I missed the deadline for '{t['title']}'.", 0.3 + 0.1 * t["priority"], kind="failure")
                self.log("task", f"{a['name']} missed the deadline for '{t['title']}' ({int(t['progress'] * 100)}% done).",
                         [a["id"]], dict(task=t["id"]))
                self.settle_claims(t)

    def decay(self):
        for a in self.agents.values():
            rate = 0.07 * (1 - 0.5 * a["traits"]["neuroticism"])
            for e in EMOTIONS:
                a["emotions"][e] = round(a["emotions"][e] + (a["baseline"][e] - a["emotions"][e]) * rate, 3)
            if a["energy"] < 0.35 and not self.asleep(a):
                self.feel(a, frustration=0.01)
            if not self.asleep(a) and not self.co_located(a) and a["location"] != "outside":
                a["emotions"]["loneliness"] = round(clamp(a["emotions"]["loneliness"] + 0.004), 3)
        study = [a for a in self.agents.values() if a["location"] == "study" and a["current_task"] and a["age"] < 25]
        for a in study:  # sharing the study room: small friction for the less patient
            for o in study:
                if o is not a:
                    self.bump_rel(a["id"], o["id"], frustration=0.008 * (1.2 - a["traits"]["agreeableness"]))
        grudges = {k for c in self.s["conflicts"] if not c["resolved"] for k in (f"{c['a']}|{c['b']}", f"{c['b']}|{c['a']}")}
        for k, r in self.s["rel"].items():  # frustration fades slowly when nothing feeds it - but not while a fight is unresolved
            if k not in grudges:
                r["frustration"] = round(r["frustration"] - (r["frustration"] - 0.1) * 0.01, 3)

    def record(self, minute):
        frame = {aid: dict(loc=a["location"], place=a["place"], act=a["activity"], mood=self.mood(a)[0])
                 for aid, a in self.agents.items()}
        self.db.execute("INSERT INTO history VALUES(?,?,?)", (self.s["t"], "frame", json.dumps(frame)))
        if minute % 30 == 0:
            emo = {aid: a["emotions"] for aid, a in self.agents.items()}
            self.db.execute("INSERT INTO history VALUES(?,?,?)", (self.s["t"], "emotion", json.dumps(emo)))
        if minute % 60 == 0:
            self.db.execute("INSERT INTO history VALUES(?,?,?)", (self.s["t"], "rel", json.dumps(self.s["rel"])))

    # ---------- autonomous conversation topics
    def cooldown_ok(self, key, minutes):
        return self.s["t"] - self.s["cooldowns"].get(key, -10 ** 9) >= minutes

    def topics(self, a, b, minute):
        """Conversations this agent would like to start, given only what it knows and can observe."""
        tr, em, aid = a["traits"], a["emotions"], a["id"]
        out = []

        def add(u, target, topic, why, **data):
            if self.cooldown_ok(f"{aid}|{target}|{topic}", 240):
                out.append(dict(u=u * (0.7 + 0.5 * tr["extraversion"]), kind="talk", target=target, topic=topic,
                                why=why, data=data))

        here = self.co_located(a)
        for o in here:
            r, oid = self.rel(aid, o["id"]), o["id"]
            parent, child = a["age"] >= 30, o["age"] < 25
            if parent and child and o["age"] >= 6 and (minute >= 960 or b["kind"] == "meal") and \
                    self.cooldown_ok(f"{aid}|{oid}|ask_studies", 600):
                slacking = o["activity"] == o["leisure"] and any(t["kind"] in ("academic", "learning")
                                                                   for t in self.tasks_of(oid))
                add(0.25 + em["anxiety"] * 0.4 + (1 - tr["agreeableness"]) * 0.25 + tr["conscientiousness"] * 0.1
                    + slacking * 0.35 * tr["conscientiousness"], oid, "ask_studies",
                    f"sees {o['name']} {o['activity'].lower()} with schoolwork pending" if slacking else
                    f"wants to know how {o['name']}'s studies are going")
            distress = max(o["emotions"]["frustration"], o["emotions"]["sadness"], o["emotions"]["anxiety"])
            if distress > 0.45 and a["energy"] > 0.35:
                add(0.2 + tr["agreeableness"] * 0.3 + a["modifiers"]["helpfulness"] + r["affection"] * 0.25 + distress * 0.3,
                    oid, "offer_help", f"noticed {o['name']} looks {self.mood(o)[0]}")
            jealous = em["jealousy"] > 0.4 and self.s["t"] - o["counters"].get("praised_at", -999) < 240
            if r["frustration"] > 0.55 or jealous:
                add(0.15 + r["frustration"] * 0.6 + em["anger"] * 0.3 - a["modifiers"]["patience"] - tr["agreeableness"] * 0.15,
                    oid, "conflict", f"frustrated with {o['name']}" + (" and a bit jealous" if jealous else ""))
            if a["age"] < 12 and b["kind"] == "free" and o["age"] < 25:
                add(0.45 + em["excitement"] * 0.4 + em["loneliness"] * 0.5 + r["affection"] * 0.2, oid, "play", f"wants to play with {o['name']}")
            if a["age"] < 12 and em["curiosity"] > 0.5 and o["age"] > a["age"]:
                add(0.3 + em["curiosity"] * 0.4, oid, "question", "is curious about something")
            if {aid, oid} == {"father", "mother"} and minute >= 1290:
                add(0.3 + em["love"] * 0.2 + em["anxiety"] * 0.3, oid, "spouse_talk", "end-of-day talk with spouse")
            if a["age"] >= 13 and o["age"] >= 13 and child and o["age"] < 25 and b["kind"] == "free":
                add(0.3 + r["closeness"] * 0.25 + em["loneliness"] * 0.4, oid, "sibling_chat", f"wants to hang out with {o['name']}")
        for c in self.s["conflicts"]:
            if not c["resolved"] and aid in (c["a"], c["b"]):
                other = c["b"] if aid == c["a"] else c["a"]
                if any(o["id"] == other for o in here) and self.s["t"] - c["t"] > 90:
                    add(0.25 + em["guilt"] * 0.6 + tr["agreeableness"] * 0.2 + self.rel(aid, other)["affection"] * 0.2
                        + a["modifiers"]["patience"], other, "apologize", f"wants to make up after the argument about {c['topic']}",
                        conflict=c["id"])
        if self.s["pending_share"].get(aid) and here:
            best = max(here, key=lambda o: self.rel(aid, o["id"])["closeness"])
            add(0.45 + em["pride"] * 0.4, best["id"], "share_achievement", "wants to share good news",
                item=self.s["pending_share"][aid][0])
        risky = [t for t in self.tasks_of(aid) if t["due"] - self.s["t"] < 300 and t["progress"] < 0.5]
        if risky and here and (em["anxiety"] > 0.3 or a["age"] < 12 or tr["agreeableness"] > 0.6):
            helper = max(here, key=lambda o: o["age"] if o["age"] > a["age"] else -1)
            if helper["age"] > a["age"]:
                add(0.25 + em["anxiety"] * 0.5 + (a["age"] < 12) * 0.2 + a["modifiers"]["delegation"], helper["id"],
                    "seek_help", f"'{risky[0]['title']}' is at risk", task=risky[0]["id"])
        overloaded = len([t for t in self.tasks_of(aid) if t["kind"] == "household"]) >= 3 or a["energy"] < 0.35
        if (em["frustration"] > 0.45 or overloaded) and a["age"] >= 13:
            phone = [o for o in self.agents.values() if o["id"] == "father" and o["location"] == "outside"] \
                if aid == "mother" and 720 <= minute < 780 else []
            for o in (here or phone)[:1]:
                add(0.2 + em["frustration"] * 0.6 + (1 - a["energy"]) * 0.3 + a["modifiers"]["delegation"], o["id"],
                    "vent", "feeling overloaded" if overloaded else "frustrated", phone=bool(phone))
        return out

    def run_conversations(self, plans, rng):
        busy = set()
        for p in sorted(plans, key=lambda p: -p["u"])[:2]:  # at most two conversations per tick
            a, b = self.A(p["initiator"]), self.A(p["target"])
            if a["id"] in busy or b["id"] in busy or self.asleep(b) or \
                    (b["location"] != a["location"] and not p["data"].get("phone")):
                continue
            busy |= {a["id"], p["target"]}
            self.converse(a, b, p["topic"], p["data"], rng, p["why"])

    # ---------- conversations
    def converse(self, a, b, topic, data, rng, why, observers=None):
        aid, bid = a["id"], b["id"]
        self.s["cooldowns"][f"{aid}|{bid}|{topic}"] = self.s["t"]
        a["last_talk"] = self.s["t"]
        room = a["location"] if not data.get("phone") else "phone"
        observers = observers if observers is not None else [o for o in self.co_located(a) if o["id"] != bid] \
            if room != "phone" else []
        before = dict(emotions={x["id"]: self.mood(x) for x in (a, b)}, rel_ab=dict(self.rel(aid, bid)),
                      rel_ba=dict(self.rel(bid, aid)))
        handler = getattr(self, "talk_" + topic)
        res = handler(a, b, data, rng)  # dict(lines, summary, tension, importance)
        lines, tension = res["lines"], res.get("tension", 0)
        participants = [aid, bid]
        for o in observers:  # bystanders may react; at most one line each, so no endless chains
            line = self.bystander(o, a, b, topic, tension, rng)
            if line:
                lines.append(line)
                participants.append(o["id"])
                tension = clamp(tension + line.pop("dt", 0))
        conflict = None
        if tension > 0.55 and res.get("can_argue"):
            conflict = dict(id=self.s["next_id"], a=aid, b=bid, topic=res.get("about", topic), t=self.s["t"],
                            severity=round(tension, 2), resolved=False, cause=f"{a['name']} {why}")
            self.s["conflicts"].append(conflict)
            self.s["next_id"] += 1
            for x, y in ((a, b), (b, a)):
                self.feel(x, anger=0.25 * tension, frustration=0.2, happiness=-0.1)
                self.bump_rel(x["id"], y["id"], frustration=0.15 * tension, trust=-0.05, closeness=-0.05)
                self.stat(x, "arguments")
            res["summary"] += " It turned into an argument."
        if res.get("praised"):  # siblings who witness praise may feel jealous, depending on temperament
            for o in observers:
                if o["age"] < 25 and o["id"] != res["praised"]:
                    self.feel(o, jealousy=0.25 * (1.2 - o["traits"]["agreeableness"]))
        imp = max(res.get("importance", 0.3), 0.75 if tension > 0.55 else 0)
        names = ", ".join(self.A(p)["name"] for p in participants)
        where = ROOMS.get(room, room).lower()
        memories = {}
        for pid in participants:  # people who took part remember it in full
            self.remember(self.A(pid), res["summary"], imp, participants, "conversation")
            memories[pid] = ["took part", res["summary"]]
        for o in observers:  # silent witnesses only know what they saw and heard
            if o["id"] in participants:
                continue
            if conflict and o["age"] < 12:
                text = f"{a['name']} and {b['name']} were shouting at each other in the {where}. It scared me."
                self.feel(o, fear=0.15, anxiety=0.1)
            elif conflict:
                text = f"I saw {a['name']} and {b['name']} argue in the {where} about {conflict['topic']}."
            else:
                text = f"In the {where} I saw: {res['summary']}"
            self.remember(o, text, imp * 0.8, [aid, bid], "witnessed")
            memories[o["id"]] = ["witnessed", text]
        if conflict:  # raised voices carry through the house, but not the details
            for o in self.agents.values():
                if o["id"] not in memories and o["location"] not in ("outside", a["location"]) and not self.asleep(o):
                    text = f"I heard {a['name']} and {b['name']} arguing from the {ROOMS[o['location']].lower()}."
                    self.remember(o, text, 0.5, [aid, bid], "witnessed")
                    memories[o["id"]] = ["overheard", text]
        self.stat(a, "conversations_initiated")
        self.count(a, "conversations")
        self.note(a, "decisions", f"talked to {b['name']} ({topic}) because {why}")
        ctx = dict(reason=why, before=before, knowledge={aid: self.recall(a, [bid]), bid: self.recall(b, [aid])},
                   tension=round(tension, 2), observers=[o["id"] for o in observers], memories=memories)
        voiced = "template"
        if self.llm_ok():
            out = llm.voice(self, a, b, participants, topic, res["summary"], lines, ctx)
            if out:
                lines, voiced = out, a["model"]
        cur = self.db.execute(
            "INSERT INTO convs(t, room, topic, initiator, participants, private, lines, context, summary, voiced_by) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)", (self.s["t"], room, topic, aid, json.dumps(participants), 0,
                                             json.dumps(lines), json.dumps(ctx), res["summary"], voiced))
        self.outbox.append(dict(kind="conv", id=cur.lastrowid, t=self.s["t"], participants=participants, lines=lines,
                                topic=topic, room=room, tension=ctx.get("tension", 0)))
        if conflict:
            conflict["conv"] = cur.lastrowid
        self.log("talk", f"{a['name']} → {b['name']}: {res['summary']}", participants, dict(conv=cur.lastrowid))

    def say(self, who, text):
        return dict(speaker=who["id"], name=who["name"], text=text)

    def talk_ask_studies(self, p, c, data, rng):
        today = [t for t in self.s["tasks"] if t["owner"] == c["id"] and t["kind"] in ("academic", "learning")
                 and t["created"] >= (self.s["t"] // 1440) * 1440]
        slacking = c["activity"] == c["leisure"]  # the parent can see what the child is doing right now
        bad = [t for t in today if t["status"] == "failed" or (t["status"] == "pending" and t["due"] - self.s["t"] < 480
                                                                 and t["progress"] < (0.5 if slacking else 0.3))]
        good = [t for t in today if t["status"] == "done"]
        L = [self.say(p, rng.choice([f"{c['name']}, how are your studies going today?",
                                     f"{c['name']}, what about your {today[0]['title'] if today else 'homework'}?"]))]
        if c["age"] < 12:
            if bad and rng.random() < 0.35 * (1 - c["traits"]["conscientiousness"]) - c["modifiers"].get("honesty", 0):
                L.append(self.say(c, "I did it all!"))  # a small fib; the task state will tell the truth later
                L.append(self.say(p, "Okay, I'll check your notebook later."))
                self.claim(c, p, bad[0], "done", "I did it all!")
                return dict(lines=L, summary=f"{p['name']} checked {c['name']}'s homework.", importance=0.3)
            if bad:
                L.append(self.say(c, f"Umm... I didn't finish {bad[0]['title'].lower()} yet. It's sooo boring!"))
                L.append(self.say(p, "Finish it first, then you can play. I'll check after."))
                self.feel(c, guilt=0.1)
            else:
                L.append(self.say(c, "I did it all! Can I show you my notebook?"))
                self.feel(p, pride=0.1, affection=0.08)
                self.feel(c, happiness=0.12)
                self.count(p, "warm_child_talks")
            self.bump_rel(p["id"], c["id"], closeness=0.02)
            return dict(lines=L, summary=f"{p['name']} checked {c['name']}'s homework.", importance=0.3)
        if bad:
            t = bad[0]
            self.feel(p, disappointment=0.25, frustration=0.15 * (1 - p["traits"]["agreeableness"]), anxiety=0.05)
            defense = clamp(c["traits"]["neuroticism"] * 0.4 + (1 - c["traits"]["agreeableness"]) * 0.35
                            + (13 <= c["age"] <= 21) * 0.15 + c["emotions"]["frustration"] * 0.3
                            + self.rel(c["id"], p["id"])["frustration"] * 0.4 - self.rel(c["id"], p["id"])["respect"] * 0.2
                            - c["modifiers"]["patience"] + rng.uniform(-0.1, 0.1))
            tension = clamp(defense + (1 - p["traits"]["agreeableness"]) * 0.35 - p["modifiers"]["patience"] * 0.6
                            + p["emotions"]["anger"] * 0.2)
            honest = (c["traits"]["conscientiousness"] * 0.45 + c["traits"]["agreeableness"] * 0.3
                      + self.rel(c["id"], p["id"])["trust"] * 0.3 + c["modifiers"].get("honesty", 0)
                      - p["emotions"]["anger"] * 0.3 - c["emotions"]["anxiety"] * 0.2 + rng.uniform(-0.15, 0.15))
            if honest < 0.45:  # dodges the confrontation with a claim the task state will later confirm or expose
                said = "It's almost done, just the last part left." if t["progress"] > 0.1 else "I already finished most of it."
                L.append(self.say(c, said))
                self.claim(c, p, t, "on_track", said)
                caught = any(x["agent"] == c["id"] and x["to"] == p["id"] and x["status"] == "false" and x["discovered"]
                             and self.s["t"] - x["t"] < 3 * 1440 for x in self.s["claims"])
                if self.rel(p["id"], c["id"])["trust"] > 0.55 and not caught:
                    L.append(self.say(p, "Good. I'll take your word for it."))
                    return dict(lines=L, summary=f"{p['name']} asked {c['name']} about '{t['title']}'; {c['name']} said it was "
                                                 f"almost done ({int(t['progress'] * 100)}% in reality).", importance=0.4)
                L.append(self.say(p, "That's what you said last time, and it wasn't done. Show me." if caught else "Show me, then."))
                tension = clamp(tension + 0.25)  # a parent who was lied to before doesn't take it calmly
            else:
                excuse = "I'll finish it later, I just needed a break." if c["traits"]["conscientiousness"] < 0.5 else \
                    "It's harder than I expected, I'm working on it."
                L.append(self.say(c, excuse))
                self.claim(c, p, t, "promise", excuse)
            if tension > 0.55:
                L.append(self.say(p, f"Later, later, always later! '{t['title']}' should have been your first priority."))
                L.append(self.say(c, rng.choice(["Why do you always assume the worst about me?",
                                                 "You don't even ask what I'm actually working on!"])))
                self.feel(c, anger=0.15, frustration=0.15)
            else:
                L.append(self.say(p, f"Alright. Finish '{t['title']}' before you do anything else. I'm trusting you."))
                L.append(self.say(c, "Okay, okay. I'll do it now."))
                self.feel(c, guilt=0.15)
                t["priority"] = min(5, t["priority"] + 1)
                self.bump_rel(p["id"], c["id"], understanding=0.02)
            self.bump_rel(p["id"], c["id"], trust=-0.04)
            return dict(lines=L, summary=f"{p['name']} questioned {c['name']} about the unfinished '{t['title']}'.",
                        tension=tension, can_argue=True, about=t["title"], importance=0.55)
        if good:
            L.append(self.say(c, f"Finished '{good[0]['title']}' already."))
            self.claim(c, p, good[0], "done", L[-1]["text"])
            L.append(self.say(p, rng.choice(["Good. That's how it should be.", "Very good! I'm proud of you."])))
            self.feel(p, pride=0.15)
            self.feel(c, happiness=0.1, pride=0.08)
            self.bump_rel(p["id"], c["id"], respect=0.03, trust=0.03)
            self.bump_rel(c["id"], p["id"], closeness=0.03)
            self.count(p, "warm_child_talks")
            c["counters"]["praised_at"] = self.s["t"]
            return dict(lines=L, summary=f"{p['name']} was pleased that {c['name']} finished their work.", importance=0.4,
                        praised=c["id"])
        L.append(self.say(c, "It's going fine, still working on it."))
        L.append(self.say(p, "Okay. Don't leave it for the last minute."))
        return dict(lines=L, summary=f"{p['name']} asked {c['name']} about studies.", importance=0.2)

    def talk_share_achievement(self, a, b, data, rng):
        item = data["item"]
        self.s["pending_share"][a["id"]].remove(item)
        warmth = self.rel(b["id"], a["id"])["affection"] + b["traits"]["agreeableness"] - b["emotions"]["jealousy"]
        L = [self.say(a, f"Guess what? I finished '{item}'!" if a["age"] >= 12 else f"Look look! I finished {item.lower()}!")]
        if warmth > 0.9:
            L.append(self.say(b, rng.choice(["That's wonderful! Well done.", "See? I knew you could do it!"])))
            self.feel(a, happiness=0.12, gratitude=0.08)
            self.feel(b, happiness=0.05, pride=0.05 if b["age"] > a["age"] else 0)
            self.bump_rel(a["id"], b["id"], closeness=0.03)
            self.bump_rel(b["id"], a["id"], respect=0.02)
            a["counters"]["praised_at"] = self.s["t"]
            if b["age"] >= 30 and a["age"] < 25:
                self.count(b, "warm_child_talks")
        else:
            L.append(self.say(b, "Hmm, nice."))
            self.feel(a, disappointment=0.08)
        return dict(lines=L, summary=f"{a['name']} shared with {b['name']} that they finished '{item}'.", importance=0.4,
                    praised=a["id"] if warmth > 0.9 else None)

    def talk_offer_help(self, a, b, data, rng):
        accept = b["traits"]["agreeableness"] * 0.5 + self.rel(b["id"], a["id"])["trust"] * 0.5 - b["emotions"]["anger"] * 0.4
        L = [self.say(a, rng.choice([f"{b['name']}, you look upset. What happened?", f"Everything okay, {b['name']}? Need a hand?"]))]
        pending = self.tasks_of(b["id"])
        if accept > 0.45:
            if pending:
                t = min(pending, key=lambda t: t["due"])
                t["progress"] = round(min(1.0, t["progress"] + 0.25), 3)
                L.append(self.say(b, f"Actually yes... '{t['title']}' is too much right now."))
                L.append(self.say(a, "Let's do it together then."))
                summary = f"{a['name']} helped {b['name']} with '{t['title']}'."
            else:
                L.append(self.say(b, "Just a long day. Thanks for asking."))
                summary = f"{a['name']} comforted {b['name']}."
            self.feel(b, gratitude=0.2, frustration=-0.15, sadness=-0.12, anxiety=-0.1, loneliness=-0.1)
            self.feel(a, happiness=0.06)
            self.bump_rel(b["id"], a["id"], trust=0.04, affection=0.04, closeness=0.04, understanding=0.03)
            self.bump_rel(a["id"], b["id"], understanding=0.04)
            self.stat(a, "helped")
            a["energy"] = clamp(a["energy"] - 0.03)
            return dict(lines=L, summary=summary, importance=0.5)
        L.append(self.say(b, "I'm fine. Please just leave me alone for now."))
        self.feel(a, sadness=0.05)
        self.bump_rel(a["id"], b["id"], understanding=0.01)
        return dict(lines=L, summary=f"{a['name']} offered help but {b['name']} wanted space.", importance=0.3)

    def talk_seek_help(self, a, b, data, rng):
        t = next((t for t in self.s["tasks"] if t["id"] == data["task"]), None)
        willing = b["traits"]["agreeableness"] * 0.5 + self.rel(b["id"], a["id"])["affection"] * 0.4 + b["energy"] * 0.3 \
            - b["emotions"]["frustration"] * 0.4 + b["modifiers"]["helpfulness"]
        L = [self.say(a, f"Can you help me with {t['title'].lower()}? I'm stuck." if a["age"] >= 12 else
                      f"{b['name']}, can you help me? My {t['title'].lower()} is too hard!")]
        if willing > 0.6 and t:
            t["progress"] = round(min(1.0, t["progress"] + 0.3), 3)
            L.append(self.say(b, rng.choice(["Sure, show me.", "Okay, come sit here. Let's see."])))
            self.feel(a, gratitude=0.15, anxiety=-0.12)
            self.bump_rel(a["id"], b["id"], trust=0.03, closeness=0.03)
            self.stat(b, "helped")
            b["energy"] = clamp(b["energy"] - 0.03)
            return dict(lines=L, summary=f"{b['name']} helped {a['name']} with '{t['title']}'.", importance=0.45)
        L.append(self.say(b, rng.choice(["Not now, I'm busy with my own work.", "Try it yourself first, then ask."])))
        self.feel(a, frustration=0.1, disappointment=0.08)
        self.bump_rel(a["id"], b["id"], frustration=0.04)
        return dict(lines=L, summary=f"{a['name']} asked {b['name']} for help but {b['name']} was busy.", importance=0.35)

    def talk_vent(self, a, b, data, rng):
        pending = len(self.tasks_of(a["id"]))
        L = [self.say(a, rng.choice([f"I can't do everything alone. {pending} things still pending and nobody helps!",
                                     "I'm exhausted. Everyone just expects things to get done."]))]
        self.stat(a, "overloaded")
        empathy = b["traits"]["agreeableness"] + self.rel(b["id"], a["id"])["understanding"] + b["modifiers"]["helpfulness"]
        if empathy > 1.0:
            mine = [t for t in self.tasks_of(a["id"]) if t["kind"] in ("household", "general")]
            if mine and not data.get("phone"):
                t = mine[0]
                t["owner"] = b["id"]  # the listener takes over a task
                L.append(self.say(b, f"You're right. I'll take care of '{t['title']}'. Sit for a while."))
                self.stat(b, "helped")
            else:
                L.append(self.say(b, "I'm sorry. Let's sort it out together this evening."))
            self.feel(a, frustration=-0.2, gratitude=0.15, love=0.05)
            self.bump_rel(a["id"], b["id"], affection=0.04, understanding=0.04)
            tension = 0.1
        else:
            L.append(self.say(b, "Everyone is tired. Don't make it a big issue."))
            self.feel(a, frustration=0.15, sadness=0.08)
            self.bump_rel(a["id"], b["id"], frustration=0.08, understanding=-0.03)
            tension = 0.45 + a["emotions"]["anger"] * 0.3
        return dict(lines=L, summary=f"{a['name']} told {b['name']} {'over the phone ' if data.get('phone') else ''}"
                                     f"that they feel overloaded.", tension=tension, can_argue=True,
                    about="household workload", importance=0.55)

    def talk_conflict(self, a, b, data, rng):
        r = self.rel(a["id"], b["id"])
        L = [self.say(a, rng.choice([f"{b['name']}, why do you always do this?", "You never think about anyone else!",
                                     "Stop acting like you're the favourite!"] if a["emotions"]["jealousy"] > 0.4 else
                                    [f"{b['name']}, you really annoyed me today.", "Can you stop bothering me?"]))]
        tension = clamp(r["frustration"] + a["emotions"]["anger"] * 0.4 + (1 - b["traits"]["agreeableness"]) * 0.3
                        - b["modifiers"]["patience"])
        if tension > 0.55:
            L.append(self.say(b, rng.choice(["Me? Look at yourself first!", "Whatever. You're overreacting."])))
        else:
            L.append(self.say(b, "Okay, okay... I didn't mean to upset you."))
            self.bump_rel(a["id"], b["id"], frustration=-0.1)
        a["emotions"]["jealousy"] = round(a["emotions"]["jealousy"] * 0.6, 3)
        return dict(lines=L, summary=f"{a['name']} confronted {b['name']}.", tension=tension, can_argue=True,
                    about="a sibling disagreement" if a["age"] < 25 else "family matters", importance=0.5)

    def talk_apologize(self, a, b, data, rng):
        c = next(c for c in self.s["conflicts"] if c["id"] == data["conflict"])
        L = [self.say(a, rng.choice([f"{b['name']}, I'm sorry about earlier. I shouldn't have said that.",
                                     f"About {c['topic']}... I was wrong to shout."]))]
        forgive = b["traits"]["agreeableness"] * 0.5 + self.rel(b["id"], a["id"])["affection"] * 0.5 \
            - b["emotions"]["anger"] * 0.5 - c["severity"] * 0.2 + rng.uniform(-0.05, 0.1)
        if forgive > 0.35:
            c["resolved"] = True
            c["resolved_t"] = self.s["t"]
            tries = len(c.get("attempts", []))
            c["resolved_how"] = f"{a['name']} apologized{f' after {tries} failed attempt(s)' if tries else ''}; {b['name']} forgave"
            L.append(self.say(b, rng.choice(["It's okay. I also overreacted.", "Fine. Let's not fight again."])))
            for x, y in ((a, b), (b, a)):
                self.feel(x, guilt=-0.25, anger=-0.2, happiness=0.08, love=0.05)
                self.bump_rel(x["id"], y["id"], frustration=-0.15, trust=0.05, understanding=0.05, closeness=0.04)
            self.log("relationship", f"{a['name']} and {b['name']} reconciled.", [a["id"], b["id"]])
            return dict(lines=L, summary=f"{a['name']} apologized to {b['name']} and they made up.", importance=0.7)
        c.setdefault("attempts", []).append(self.s["t"])
        L.append(self.say(b, "Saying sorry doesn't fix everything."))
        self.feel(a, sadness=0.08)
        return dict(lines=L, summary=f"{a['name']} apologized to {b['name']}, who is still upset.", importance=0.55)

    def talk_play(self, a, b, data, rng):
        game = rng.choice(["hide and seek", "a drawing game", "carrom", "a story about a talking elephant"])
        yes = b["energy"] > 0.35 and b["emotions"]["frustration"] < 0.5 and not self.tasks_of(b["id"]) or rng.random() < 0.35
        L = [self.say(a, f"{b['name']}! Play {game} with me? Pleeease?")]
        if yes:
            L.append(self.say(b, "Okay, just for a little while!"))
            for x in (a, b):
                self.feel(x, happiness=0.12, loneliness=-0.15)
            self.feel(a, excitement=0.1)
            self.bump_rel(a["id"], b["id"], closeness=0.03, affection=0.02)
            self.bump_rel(b["id"], a["id"], closeness=0.03, affection=0.02)
            return dict(lines=L, summary=f"{a['name']} and {b['name']} played {game}.", importance=0.35)
        L.append(self.say(b, "Not now, Anu. Maybe later." if a["age"] < 12 else "Not now."))
        self.feel(a, sadness=0.1, loneliness=0.05)
        return dict(lines=L, summary=f"{a['name']} wanted to play {game} but {b['name']} was busy.", importance=0.2)

    def talk_question(self, a, b, data, rng):
        q = rng.choice(["Why is the sky blue?", "Where do stars go in the morning?", "Why does Appa drink so much coffee?",
                        "How do aeroplanes stay up?", "Can I have a puppy?", "Why do we have to sleep?"])
        L = [self.say(a, q)]
        patient = b["traits"]["agreeableness"] + b["energy"] * 0.5 - b["emotions"]["frustration"]
        L.append(self.say(b, "Good question! Let me explain..." if patient > 0.7 else "Not now, I'm tired."))
        self.feel(a, curiosity=-0.15, happiness=0.06 if patient > 0.7 else -0.05)
        if patient > 0.7:
            self.count(a, "learning_done", 0)  # curiosity satisfied; no task credit
            self.bump_rel(a["id"], b["id"], closeness=0.02)
        return dict(lines=L, summary=f"{a['name']} asked {b['name']}: \"{q}\"", importance=0.15)

    def talk_spouse_talk(self, a, b, data, rng):
        kids = [k for k in self.agents.values() if k["age"] < 25]
        worry = max(kids, key=lambda k: self.rel(a["id"], k["id"])["frustration"] - self.rel(a["id"], k["id"])["trust"])
        topic = rng.choice(["finances", "kids"])
        if topic == "finances":
            L = [self.say(a, "The expenses this month are higher than I planned. We need to be careful."),
                 self.say(b, "I know. I'll adjust the grocery list. But let's not cut the children's classes.")]
        else:
            L = [self.say(a, f"I'm worried about {worry['name']}."),
                 self.say(b, f"Be gentle with {worry['name']}. Shouting won't help." if b["traits"]["agreeableness"] > 0.6
                          else f"Yes, {worry['name']} needs to be more responsible.")]
            # Spouse's view of the child shifts slightly toward the speaker's concern (shared knowledge only via talk)
            self.bump_rel(b["id"], worry["id"], understanding=0.01)
        for x, y in ((a, b), (b, a)):
            self.feel(x, love=0.04, anxiety=-0.03)
            self.bump_rel(x["id"], y["id"], closeness=0.02, understanding=0.02)
        return dict(lines=L, summary=f"{a['name']} and {b['name']} discussed {topic if topic == 'finances' else worry['name']}.",
                    importance=0.4)

    def talk_sibling_chat(self, a, b, data, rng):
        friendly = self.rel(b["id"], a["id"])["affection"] - self.rel(b["id"], a["id"])["frustration"]
        L = [self.say(a, rng.choice(["Want to watch something?", "What happened at school today?", "Check out this meme."]))]
        if friendly > 0.35:
            L.append(self.say(b, rng.choice(["Haha, okay!", "Ugh, a lot. Let me tell you..."])))
            for x, y in ((a, b), (b, a)):
                self.feel(x, happiness=0.06, loneliness=-0.1)
                self.bump_rel(x["id"], y["id"], closeness=0.03, frustration=-0.03)
        else:
            L.append(self.say(b, "Leave me alone."))
            self.bump_rel(a["id"], b["id"], frustration=0.04)
        return dict(lines=L, summary=f"{a['name']} and {b['name']} chatted.", importance=0.2)

    def bystander(self, o, a, b, topic, tension, rng):
        """A family member who overhears may react - mediate, interrupt innocently, or take sides."""
        if tension < 0.45:
            return None
        if o["age"] >= 30 and o["traits"]["agreeableness"] >= 0.6:
            self.count(o, "mediations")
            self.stat(o, "helped")
            for x in (a, b):
                self.feel(x, anger=-0.1)
            return dict(self.say(o, rng.choice(["Enough, both of you. Let's talk calmly after dinner.",
                                                "Stop shouting. Sit down and listen to each other."])), dt=-0.2)
        if o["age"] < 12 and rng.random() < 0.6:
            for x in (a, b):
                self.feel(x, anger=-0.06, happiness=0.03)
            return dict(self.say(o, rng.choice(["Why is everyone angry? I drew a cat, look!", "Can we have ice cream?"])),
                        dt=-0.12)
        if 12 <= o["age"] < 25 and rng.random() < 0.5:
            target = b if a["age"] >= 30 else a
            if self.rel(o["id"], target["id"])["frustration"] > self.rel(o["id"], target["id"])["affection"] - 0.3:
                self.bump_rel(target["id"], o["id"], frustration=0.08)
                return dict(self.say(o, f"Typical {target['name']}."), dt=0.1)
            self.bump_rel(target["id"], o["id"], affection=0.04)
            return dict(self.say(o, f"Leave it, {target['name']} is trying."), dt=-0.1)
        return None

    # ---------- world events
    def maybe_world_event(self, rng, day, minute):
        if rng.random() > 0.12:
            return
        options = []
        if 960 <= minute <= 1200:
            options += ["exam_results", "power_cut", "guest_visit"]
        if 600 <= minute <= 1000:
            options += ["work_pressure", "bonus"]
        if 900 <= minute <= 1260:
            options += ["broken_vase", "anu_fever"]
        if options:
            self.trigger_event(rng.choice(options), rng)

    def trigger_event(self, kind, rng=None, text=None):
        rng = rng or random.Random()
        A = self.agents
        if kind == "exam_results":
            s = rng.choice([x for x in A.values() if 12 <= x["age"] < 25] or list(A.values()))
            rate = s["counters"].get("completion_history", [0.7])[-3:]
            score = int(clamp(0.45 + 0.45 * sum(rate) / len(rate) + rng.uniform(-0.12, 0.12)) * 100)
            ex = s["counters"].setdefault("exams", [])
            ex.append(score)
            s["counters"]["exam_avg"] = round(sum(ex) / len(ex))
            if score >= 80:
                self.feel(s, pride=0.3, happiness=0.25, excitement=0.2)
                self.s["pending_share"].setdefault(s["id"], []).append(f"exam with {score}%")
            else:
                self.feel(s, disappointment=0.3, anxiety=0.2, sadness=0.15)
            self.remember(s, f"I got {score}% in my exam.", 0.75, kind="event")
            self.log("event", f"{s['name']} got exam results: {score}%.", [s["id"]], dict(score=score))
        elif kind == "power_cut":
            for a in A.values():
                if a["location"] != "outside" and not self.asleep(a):
                    a["location"] = "living_room"
                    self.feel(a, surprise=0.2, affection=0.05)
                    self.remember(a, "The power went out and we all sat together with candles.", 0.5, list(A), "event")
            self.log("event", "Power cut! Everyone at home gathered in the living room with candles.", list(A))
        elif kind == "guest_visit":
            m = A.get("mother")
            if m:
                self.add_task(m["id"], "Prepare snacks for visiting relatives", "household", 5, self.s["t"] + 90, 3, "event")
                self.feel(m, anxiety=0.15, excitement=0.1)
            self.log("event", "Relatives called - they're visiting in an hour and a half.", list(A))
        elif kind == "work_pressure":
            f = A.get("father")
            if f:
                self.add_task(f["id"], "Urgent client report (overtime)", "work", 5, self.s["t"] + 600, 8, "event")
                self.feel(f, anxiety=0.25, frustration=0.1)
                self.remember(f, "My manager dumped an urgent report on me.", 0.6, kind="event")
                self.log("event", f"{f['name']}'s manager assigned an urgent report.", [f["id"]])
        elif kind == "bonus":
            f = A.get("father")
            if f:
                self.feel(f, happiness=0.25, pride=0.15, anxiety=-0.15)
                self.s["pending_share"].setdefault(f["id"], []).append("my performance bonus")
                self.remember(f, "I received a performance bonus at work.", 0.75, kind="event")
                self.log("event", f"{f['name']} received a performance bonus.", [f["id"]])
        elif kind == "broken_vase":
            c = A.get("anu") or rng.choice(list(A.values()))
            self.feel(c, guilt=0.35, fear=0.3)
            self.remember(c, "I broke Amma's favourite vase while playing. I hid the pieces.", 0.8, kind="secret")
            self.log("event", f"{c['name']} accidentally broke a vase and hid the pieces (only {c['name']} knows).", [c["id"]])
        elif kind == "anu_fever":
            c, m = A.get("anu"), A.get("mother")
            if c and m:
                self.feel(c, sadness=0.25, happiness=-0.2)
                self.feel(m, anxiety=0.3)
                self.add_task(m["id"], "Take care of Anu's fever", "care", 5, self.s["t"] + 240, 3, "event")
                self.log("event", f"{c['name']} has a mild fever.", [c["id"], m["id"]])
        else:  # free-form controller event
            for a in A.values():
                self.feel(a, surprise=0.2)
                self.remember(a, f"Something happened: {text}", 0.65, kind="event")
            self.log("event", text or kind, list(A))

    # ---------- controller
    def llm_ok(self):
        st = self.s["settings"]
        return st["llm_enabled"] and llm.available() and self.s["cost"]["usd"] < st["budget_usd"]

    def instruct(self, text, target=None):
        """Natural-language instruction from the World Controller. Agents turn it into goals - or push back."""
        with self.lock:
            targets = [self.A(target)] if target else list(self.agents.values())
            plan = llm.parse_instruction(self, text, targets) if self.llm_ok() else None
            plan = plan or parse_instruction(text, targets, self.agents)
            lines = [dict(speaker="controller", name="World Controller", text=text)]
            minute = self.s["t"] % 1440
            for a in targets:
                self.remember(a, f"The World Controller told me{' privately' if target else ''}: \"{text}\"", 0.7,
                              kind="instruction")
            if plan.get("wake") and 240 <= minute < 600:
                for a in targets:
                    if self.asleep(a):
                        a["wake_until"] = (self.s["t"] // 1440) * 1440 + a["schedule"][0]["end"]
                        a["activity"] = "Waking up"
            if plan.get("mood"):
                for a in targets:
                    self.feel(a, happiness=0.08, excitement=0.08)
            for item in plan.get("tasks", []):
                a = self.agents.get(item["owner"])
                if not a:
                    continue
                accept = 0.4 + a["traits"]["agreeableness"] * 0.3 + a["traits"]["conscientiousness"] * 0.2 \
                    - a["emotions"]["anger"] * 0.4 - len(self.tasks_of(a["id"])) * 0.04 + random.uniform(-0.1, 0.1)
                prio = item.get("priority", 3)
                if accept > 0.6:
                    reply = "Okay, I'll do it." if a["age"] >= 12 else "Okaaay! I'll do it!"
                elif accept > 0.4:
                    prio = max(1, prio - 1)
                    pending = self.tasks_of(a["id"])
                    reply = f"Fine, but after I finish '{pending[0]['title']}'." if pending else "Hmm, okay, later."
                else:
                    prio = max(1, prio - 2)
                    reply = "Why me? I already have enough to do." if a["age"] >= 12 else "But I want to play!"
                t = self.add_task(a["id"], item["title"], item.get("kind", "general"), prio,
                              self.s["t"] + int(item.get("due_hours", 8) * 60), item.get("effort", 4), "controller")
                lines.append(self.say(a, reply))
                self.claim(a, None, t, "promise", reply)
                self.note(a, "decisions", f"responded to instruction: {reply}")
            if len(lines) == 1:
                for a in targets[:3]:
                    if not self.asleep(a):
                        lines.append(self.say(a, "Good morning!" if minute < 720 else "Okay!"))
            cur = self.db.execute(
                "INSERT INTO convs(t, room, topic, initiator, participants, private, lines, context, summary, voiced_by) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)", (self.s["t"], "controller", "instruction", "controller",
                                                 json.dumps(["controller"] + [a["id"] for a in targets]), int(bool(target)),
                                                 json.dumps(lines), json.dumps(dict(plan=plan)), text,
                                                 "llm" if plan.get("_llm") else "rules"))
            self.outbox.append(dict(kind="conv", id=cur.lastrowid, t=self.s["t"], participants=["controller"],
                                    lines=lines, topic="instruction", room="controller"))
            who = self.A(target)["name"] if target else "everyone"
            self.log("controller", f"Controller → {who}: {text}", [a["id"] for a in targets], dict(plan=plan))
            self.save()
            return dict(plan=plan, lines=lines)

    def update_agent(self, aid, patch):
        with self.lock:
            a = self.A(aid)
            for k in ("name", "age", "role", "avatar", "model", "leisure"):
                if k in patch:
                    a[k] = patch[k]
            for k, v in patch.get("traits", {}).items():
                if k in a["traits"]:
                    a["traits"][k] = clamp(float(v))
            self.log("controller", f"Controller updated {a['name']}'s profile.", [aid], dict(patch=patch))
            self.save()

    def add_member(self, name, age, role):
        """Modularity: any number of members can be added; they get a generic schedule and default relationships."""
        with self.lock:
            aid = re.sub(r"\W+", "_", name.lower())
            src = self.A("daughter" if age < 25 else "mother")
            a = _agent(aid, name, age, role, "🧓" if age >= 60 else "🙂", ["#008300", "#6250d6", "#e34948"][len(self.agents) % 3],
                       dict(conscientiousness=.6, agreeableness=.65, neuroticism=.4, extraversion=.5, openness=.5),
                       dict(love=.4, affection=.4), json.loads(json.dumps(src["schedule"])), "Relaxing", [], [], [])
            a["location"] = "living_room"
            for o in self.agents.values():
                for x, y in ((aid, o["id"]), (o["id"], aid)):
                    self.s["rel"][f"{x}|{y}"] = dict(trust=.55, affection=.6, respect=.6, frustration=.1,
                                                     understanding=.5, closeness=.45)
            self.agents[aid] = a
            self.log("controller", f"{name} ({age}) joined the household.", [aid])
            self.save()
            return a

    # ---------- reports
    def build_report(self, day):
        A = self.agents
        evs = self.db.execute("SELECT t, type, text FROM events WHERE t>=? AND t<? ORDER BY id",
                              (day * 1440, (day + 1) * 1440)).fetchall()
        start_rel = self.s["day_start"].get("rel", self.s["rel"])
        changes = []
        for k, r in self.s["rel"].items():
            r0 = start_rel.get(k, r)
            score = lambda x: x["trust"] + x["affection"] + x["closeness"] + x["understanding"] - x["frustration"]
            a, b = k.split("|")
            changes.append((round(score(r) - score(r0), 3), A[a]["name"], A[b]["name"]))
        changes.sort()
        conflicts = [c for c in self.s["conflicts"] if day * 1440 <= c["t"] < (day + 1) * 1440]
        members = []
        for a in A.values():
            st = self.s["stats"].get(a["id"], {})
            today = [t for t in self.s["tasks"] if t["owner"] == a["id"] and day * 1440 <= t["due"] < (day + 1) * 1440]
            em0 = st.get("emotions_start", a["emotions"])
            shift = sorted(((round(a["emotions"][e] - em0.get(e, 0), 2), e) for e in EMOTIONS), key=lambda x: -abs(x[0]))[:3]
            members.append(dict(
                id=a["id"], name=a["name"], tasks_assigned=[t["title"] for t in today],
                tasks_completed=[t["title"] for t in today if t["status"] == "done"],
                tasks_failed=[t["title"] for t in today if t["status"] == "failed"],
                tasks_pending=[t["title"] for t in self.tasks_of(a["id"])],
                completion_rate=a["counters"].get("completion_history", [None])[-1],
                decisions=st.get("decisions", [])[-8:], conversations_initiated=st.get("conversations_initiated", 0),
                problems=st.get("problems", []), procrastinations=st.get("procrastinations", 0),
                emotional_changes=[f"{e} {'+' if d >= 0 else ''}{d}" for d, e in shift],
                lessons=[l["text"] for l in a["lessons"] if l["day"] == day],
                lesson_evaluations=[f"{l['text']} → {l['status']} (baseline {l['baseline_rate']}, measured "
                                    f"{l.get('measured_rate', '-')})" for l in a["lessons"] if l["status"] != "testing"],
                goal_progress=[f"{g['title']}: {a['counters'].get(g['metric'], 0)}/{g['target']}" for g in a["goals"]],
                plans_tomorrow=[f"{t[0]}" for t in a.get("daily", [])][:3] + [t["title"] for t in self.tasks_of(a["id"])][:2],
                mood=self.mood(a)[0], claims=self.claim_stats(a["id"], day)))
        neg = sum(self.negativity(a) for a in A.values()) / len(A)
        overall = "conflicted" if len(conflicts) >= 2 else "stressed" if neg > 0.3 else "happy" if neg < 0.15 else "mixed"
        return dict(day=day, family=dict(
            overall=overall, important=[e[2] for e in evs if e[1] in ("event", "relationship", "learning")][:15],
            conversations=sum(1 for e in evs if e[1] == "talk"), arguments=len(conflicts),
            resolved=sum(c["resolved"] for c in conflicts)),
            members=members,
            relationships=dict(improved=[f"{a} → {b} (+{d})" for d, a, b in changes[::-1][:4] if d > 0],
                               tension=[f"{a} → {b} ({d})" for d, a, b in changes[:4] if d < 0],
                               arguments=[f"{A[c['a']]['name']} vs {A[c['b']]['name']} about {c['topic']}"
                                          f"{' (resolved)' if c['resolved'] else ''}" for c in conflicts]),
            events=[e[2] for e in evs if e[1] in ("event", "controller")])

    def claim_stats(self, aid, day=None):
        cs = [c for c in self.s["claims"] if c["agent"] == aid and (day is None or day * 1440 <= c["t"] < (day + 1) * 1440)]
        n = lambda s: sum(c["status"] == s for c in cs)
        return dict(made=len(cs), kept=n("true"), broken=n("false"), open=n("pending"))

    def report_csv(self, day):
        row = self.db.execute("SELECT json FROM reports WHERE day=?", (day,)).fetchone()
        rep = json.loads(row[0])
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["day", "member", "assigned", "completed", "failed", "pending", "completion_rate",
                    "conversations_initiated", "procrastinations", "mood", "lessons", "claims_kept", "claims_broken"])
        for m in rep["members"]:
            w.writerow([day + 1, m["name"], len(m["tasks_assigned"]), len(m["tasks_completed"]), len(m["tasks_failed"]),
                        len(m["tasks_pending"]), m["completion_rate"], m["conversations_initiated"], m["procrastinations"],
                        m["mood"], " | ".join(m["lessons"]), m["claims"]["kept"], m["claims"]["broken"]])
        return buf.getvalue()


def report_markdown(r):
    f = r["family"]
    out = [f"# Daily Family Report – Day {r['day'] + 1:02d}", "",
           "_All entries are recorded simulation state, not generated prose._", "",
           "## Family Summary", f"- Overall mood: **{f['overall']}**",
           f"- Conversations: {f['conversations']} · Arguments: {f['arguments']} (resolved: {f['resolved']})", "",
           "### Important events"] + [f"- {e}" for e in f["important"] or ["Nothing unusual."]]
    for m in r["members"]:
        out += ["", f"## {m['name']}", f"- Completion rate: {m['completion_rate']} · Mood at day end: {m['mood']}",
                f"- Completed: {', '.join(m['tasks_completed']) or '—'}",
                f"- Failed: {', '.join(m['tasks_failed']) or '—'}",
                f"- Still pending: {', '.join(m['tasks_pending']) or '—'}",
                f"- Conversations initiated: {m['conversations_initiated']} · Times postponed work: {m['procrastinations']}",
                "- Said vs did: {made} claims about tasks: {kept} true, {broken} false, {open} still open".format(**m["claims"]),
                f"- Emotional changes: {', '.join(m['emotional_changes'])}",
                f"- Problems: {'; '.join(m['problems']) or '—'}",
                f"- Lessons learned: {'; '.join(m['lessons']) or '—'}",
                f"- Lesson evaluations: {'; '.join(m['lesson_evaluations']) or '—'}",
                f"- Goal progress: {'; '.join(m['goal_progress'])}",
                f"- Plans for tomorrow: {', '.join(m['plans_tomorrow'])}",
                "- Key decisions:"] + [f"  - {d}" for d in m["decisions"]]
    rel = r["relationships"]
    out += ["", "## Relationships", f"- Improved: {', '.join(rel['improved']) or '—'}",
            f"- Tension: {', '.join(rel['tension']) or '—'}",
            f"- Arguments: {'; '.join(rel['arguments']) or 'none'}", "",
            "## Unexpected Events"] + [f"- {e}" for e in r["events"] or ["None."]]
    return "\n".join(out)


# ---------------------------------------------------------------- rule-based instruction parser (no LLM)

KIND_WORDS = [("academic", r"assignment|homework|study|studies|exam|lesson"), ("finance", r"financ|budget|money|saving"),
              ("household", r"organi[sz]e|clean|cook|household|tidy|laundry|prepare"),
              ("creative", r"creative|draw|paint|surprise|music|craft"), ("learning", r"learn|practice|read|course|skill"),
              ("help", r"\bhelp\b"), ("work", r"work|office|report")]


def parse_instruction(text, targets, agents):
    low = text.lower()
    named = [a for a in agents.values() if re.search(rf"\b{re.escape(a['name'].lower())}\b", low)]
    addressed = [a for a in named if low.startswith(a["name"].lower())]  # "Arjun, ..." is addressed to Arjun
    everyone = re.search(r"^\W*(everyone|everybody|all of you|family)\b", low)
    owners = targets if len(targets) == 1 else addressed[:1] or (named[:1] if named and not everyone else targets)
    greeting = re.search(r"good morning|wake up|new day|let'?s get started|rise and shine", low)
    kind = next((k for k, p in KIND_WORDS if re.search(p, low)), None)
    prio = 5 if re.search(r"important|urgent|must|before|immediately", low) else 3
    plan = dict(wake=bool(greeting), mood=bool(greeting or "special" in low), tasks=[])
    actionable = re.search(r"\b(complete|finish|focus|organi[sz]e|help|prepare|make sure|do|clean|study|surprise|"
                           r"practice|plan|review|cook|read|learn)\b", low)
    if actionable:
        parts = [c.strip() for c in re.split(r"[.!]\s*", text) if c.strip()]
        kind_re = dict(KIND_WORDS).get(kind, "$^")
        clauses = [c for c in parts if re.search(kind_re, c.lower())] or \
                  [c for c in parts if re.search(actionable.re, c.lower())]
        title = re.sub(r"^(\w+,\s*)?(you have|there is|you've got)\s+(an?\s+)?", r"\1", clauses[0] if clauses else text, flags=re.I)

        for a in owners:
            t = re.sub(rf"^{re.escape(a['name'])},?\s*", "", title, flags=re.I)
            t = t[:1].upper() + t[1:]
            plan["tasks"].append(dict(owner=a["id"], title=t[:80], kind=kind or "general", priority=prio, due_hours=8,
                                      effort=5 if prio == 5 else 4))
    return plan
