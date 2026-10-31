"""FastAPI server: runs the simulation loop and serves the dashboard. `python server.py` → http://localhost:8000"""
import asyncio
import json
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import llm
import world as W

BASE = Path(__file__).parent
world = W.World(str(BASE / "world.db"))
app = FastAPI(title="AI Family World")
clients: set[WebSocket] = set()


def snapshot():
    s = world.s
    day, minute = divmod(s["t"], 1440)
    agents = []
    for a in world.agents.values():
        mood, level = world.mood(a)
        tasks = [t for t in s["tasks"] if t["owner"] == a["id"] and t["created"] >= day * 1440 or
                 (t["owner"] == a["id"] and t["status"] == "pending")]
        done = sum(t["status"] == "done" for t in tasks)
        cur = next((t for t in s["tasks"] if t["id"] == a["current_task"]), None)
        top = max((t for t in tasks if t["status"] == "pending"), key=lambda t: (t["priority"], -t["due"]), default=None)
        agents.append(dict(
            id=a["id"], name=a["name"], age=a["age"], role=a["role"], avatar=a["avatar"], color=a["color"],
            model=a["model"], traits=a["traits"], location=a["location"], place=a["place"], activity=a["activity"],
            mood=mood, mood_level=level, emoji=W.EMOJI[mood], emotions=a["emotions"], energy=round(a["energy"], 2),
            goal=(cur or top or {}).get("title", "—"), thought=a["thought"],
            completion=round(100 * done / len(tasks)) if tasks else 100, modifiers=a["modifiers"],
            goals=[dict(g, value=a["counters"].get(g["metric"], 0)) for g in a["goals"]],
            lessons=a["lessons"], completion_history=a["counters"].get("completion_history", []),
            claims=world.claim_stats(a["id"])))
    return dict(t=s["t"], day=day, minute=minute, clock=W.hhmm(minute), weekday=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
                                                                              "Sun"][day % 7],
                running=s["running"], speed=s["speed"], agents=agents, rel=s["rel"], cost=s["cost"],
                settings=dict(s["settings"], llm_available=llm.available(), models=llm.MODELS),
                tasks=[t for t in s["tasks"]], conflicts=s["conflicts"][-30:], claims=s["claims"][-60:], rooms=W.ROOMS)


async def broadcast():
    items, world.outbox = world.outbox, []
    msg = json.dumps(dict(type="tick", state=snapshot(), items=items))
    for ws in list(clients):
        try:
            await ws.send_text(msg)
        except Exception:
            clients.discard(ws)


async def loop():
    while True:
        if world.s["running"]:
            await asyncio.to_thread(world.tick)  # LLM calls inside a tick must not block the API
            await broadcast()
            await asyncio.sleep(world.s["speed"])
        else:
            await asyncio.sleep(0.2)


@app.on_event("startup")
async def start():
    asyncio.create_task(loop())


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/3d")
def house3d_redirect():
    return RedirectResponse("/3d/")


if (BASE / "static" / "3d").is_dir():  # built 3D house (web3d/ → npm run build)
    app.mount("/3d", StaticFiles(directory=BASE / "static" / "3d", html=True), name="3d")


@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    await ws.send_text(json.dumps(dict(type="tick", state=snapshot(), items=[])))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)


@app.get("/api/state")
def state():
    return snapshot()


@app.post("/api/control/{action}")
async def control(action: str):
    if action in ("start", "resume"):
        world.s["running"] = True
    elif action in ("pause", "stop"):
        world.s["running"] = False
    elif action == "reset":
        world.s["running"] = False
        await asyncio.to_thread(world.reset)
    elif action == "step":
        await asyncio.to_thread(world.tick)
    else:
        raise HTTPException(400, "unknown action")
    done = dict(start="started", resume="resumed", pause="paused", stop="stopped")
    if action in done:
        world.log("system", f"Simulation {done[action]}.")
    world.save()
    await broadcast()
    return dict(ok=True)


@app.post("/api/settings")
async def settings(body: dict = Body(...)):
    s = world.s
    if "speed" in body:
        s["speed"] = max(0.05, float(body["speed"]))
    if "day" in body or "minute" in body:  # jump the virtual clock (rounded to a tick)
        day = int(body.get("day", s["t"] // 1440))
        minute = int(body.get("minute", s["t"] % 1440)) // W.TICK * W.TICK
        with world.lock:
            if day != s["t"] // 1440:
                world.start_day(day)
            s["t"] = day * 1440 + minute
            world.log("controller", f"Clock set to Day {day + 1}, {W.hhmm(minute)}.")
    for k in ("llm_enabled", "budget_usd"):
        if k in body:
            s["settings"][k] = body[k]
    world.save()
    await broadcast()
    return dict(ok=True)


@app.post("/api/instruct")
async def instruct(body: dict = Body(...)):
    if not body.get("text", "").strip():
        raise HTTPException(400, "empty instruction")
    out = await asyncio.to_thread(world.instruct, body["text"].strip(), body.get("target") or None)
    await broadcast()
    return out


@app.post("/api/event")
async def event(body: dict = Body(...)):
    kind = body.get("kind", "custom")
    with world.lock:
        world.trigger_event(kind, text=body.get("text"))
        world.save()
    await broadcast()
    return dict(ok=True)


SCENARIOS = {
    "exam_pressure": ("Board exams are announced for next week.", [("son", "Prepare for semester exam", "academic", 5, 30, 10),
                                                                    ("daughter", "Revise for board exam", "academic", 5, 30, 10)]),
    "mother_overload": ("Lakshmi has guests coming, laundry piling up and a parent-teacher meeting.",
                        [("mother", "Prepare for guests", "household", 5, 5, 6), ("mother", "Parent-teacher meeting", "care", 4, 6, 4),
                         ("mother", "Finish piled-up laundry", "household", 4, 8, 6)]),
    "son_excels": ("Arjun's project won first prize at the college hackathon!", []),
    "festival": ("Onam is in two days - the family must prepare the house and the sadya.",
                 [("mother", "Plan the Onam sadya", "household", 4, 24, 6), ("son", "Clean and decorate the house", "household", 3, 24, 5),
                  ("daughter", "Draw the pookalam design", "creative", 3, 24, 4), ("anu", "Collect flowers for the pookalam", "creative", 2, 24, 2)]),
}


@app.post("/api/scenario")
async def scenario(body: dict = Body(...)):
    name = body.get("name")
    with world.lock:
        if name == "custom":
            world.trigger_event("custom", text=body.get("text", "Something unexpected happened."))
        else:
            text, tasks = SCENARIOS[name]
            world.trigger_event("custom", text=text)
            for owner, title, kind, prio, hours, effort in tasks:
                if owner in world.agents:
                    world.add_task(owner, title, kind, prio, world.s["t"] + hours * 60, effort, "scenario")
            if name == "son_excels" and "son" in world.agents:
                s = world.A("son")
                world.feel(s, pride=0.4, happiness=0.3, excitement=0.3)
                world.s["pending_share"].setdefault("son", []).append("first prize at the hackathon")
                world.remember(s, "My team won first prize at the hackathon!", 0.9, kind="achievement")
        world.save()
    await broadcast()
    return dict(ok=True)


@app.post("/api/task")
async def task(body: dict = Body(...)):
    with world.lock:
        t = world.add_task(body["owner"], body["title"], body.get("kind", "general"), int(body.get("priority", 3)),
                           world.s["t"] + int(float(body.get("due_hours", 8)) * 60), int(body.get("effort", 4)), "controller")
        world.remember(world.A(body["owner"]), f"I was given a new responsibility: {body['title']}", 0.6, kind="instruction")
        world.log("controller", f"Controller assigned '{t['title']}' to {world.A(t['owner'])['name']}.", [t["owner"]])
        world.save()
    await broadcast()
    return t


@app.patch("/api/agent/{aid}")
async def patch_agent(aid: str, body: dict = Body(...)):
    if aid not in world.agents:
        raise HTTPException(404)
    world.update_agent(aid, body)
    await broadcast()
    return dict(ok=True)


@app.post("/api/agent")
async def add_agent(body: dict = Body(...)):
    a = world.add_member(body["name"], int(body["age"]), body.get("role", "Relative"))
    await broadcast()
    return dict(id=a["id"])


@app.get("/api/memory/{aid}")
def memory(aid: str):
    a = world.A(aid)
    return dict(memory=a["memory"], lessons=a["lessons"], counters=a["counters"], modifiers=a["modifiers"])


@app.get("/api/events")
def events(limit: int = 300, before: int | None = None):
    rows = world.db.execute("SELECT id, t, type, actors, text FROM events WHERE id < ? ORDER BY id DESC LIMIT ?",
                            (before or 10 ** 12, limit)).fetchall()
    return [dict(id=i, t=t, type=ty, actors=json.loads(a), text=x) for i, t, ty, a, x in rows][::-1]


@app.get("/api/conversations")
def conversations(agent: str = "", q: str = "", limit: int = 200):
    sql, args = "SELECT id, t, room, topic, initiator, participants, private, lines, context, summary, voiced_by FROM convs WHERE 1=1", []
    if agent:
        sql += " AND participants LIKE ?"
        args.append(f'%"{agent}"%')
    if q:
        sql += " AND (lines LIKE ? OR summary LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    rows = world.db.execute(sql + " ORDER BY id DESC LIMIT ?", args + [limit]).fetchall()
    keys = ["id", "t", "room", "topic", "initiator", "participants", "private", "lines", "context", "summary", "voiced_by"]
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        for k in ("participants", "lines", "context"):
            d[k] = json.loads(d[k])
        out.append(d)
    return out


@app.get("/api/history/{kind}")
def history(kind: str, day: int | None = None):
    if kind not in ("emotion", "rel", "frame"):
        raise HTTPException(400)
    day = world.s["t"] // 1440 if day is None else day
    lo, hi = (day * 1440, (day + 1) * 1440) if kind == "frame" else ((day - 2) * 1440, (day + 1) * 1440)
    rows = world.db.execute("SELECT t, data FROM history WHERE kind=? AND t>=? AND t<? ORDER BY t", (kind, lo, hi)).fetchall()
    return [dict(t=t, data=json.loads(d)) for t, d in rows]


@app.get("/api/story")
def story(day: int):
    """Everything replay needs to tell a day like an episode: who started each conversation and why,
    every argument with its cause and how it ended, and the day's events."""
    lo, hi = day * 1440, (day + 1) * 1440
    convs = [dict(t=t, room=room, topic=topic, initiator=ini, participants=json.loads(p), lines=json.loads(l),
                  summary=summ, reason=json.loads(ctx).get("reason", ""), tension=json.loads(ctx).get("tension", 0),
                  memories=json.loads(ctx).get("memories", {}))
             for t, room, topic, ini, p, l, ctx, summ in world.db.execute(
                 "SELECT t, room, topic, initiator, participants, lines, context, summary FROM convs WHERE t>=? AND t<? ORDER BY t",
                 (lo, hi))]
    events = [dict(t=t, type=ty, actors=json.loads(a), text=x) for t, ty, a, x in world.db.execute(
        "SELECT t, type, actors, text FROM events WHERE t>=? AND t<? AND (type IN ('event','relationship','claim','carryover',"
        "'learning','controller') OR (type='task' AND text LIKE '%missed%')) ORDER BY id", (lo, hi))]
    conflicts = [c for c in world.s["conflicts"] if lo <= c["t"] < hi or lo <= c.get("resolved_t", -1) < hi]
    return dict(convs=convs, events=events, conflicts=conflicts)


@app.get("/api/reports")
def reports():
    return [d for (d,) in world.db.execute("SELECT day FROM reports ORDER BY day")]


@app.get("/api/report/{day}")
def report(day: int, fmt: str = "json"):
    row = world.db.execute("SELECT json, md FROM reports WHERE day=?", (day,)).fetchone()
    if not row:
        raise HTTPException(404, "no report for that day yet")
    name = f"family-report-day-{day + 1:02d}"
    if fmt == "md":
        return PlainTextResponse(row[1], headers={"Content-Disposition": f"attachment; filename={name}.md"})
    if fmt == "csv":
        return PlainTextResponse(world.report_csv(day), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename={name}.csv"})
    return dict(json.loads(row[0]), markdown=row[1])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
