"""
Chat SOC (Wazuh + MCP) — BYOK, multi-providers, historique persistant (SQLite).
Étape 1 : conversations + messages + réglages (prompt master, préférences).
La boucle d'outils MCP Wazuh tourne via Anthropic ou une API OpenAI-compatible.
Les clés API ne sont JAMAIS stockées (envoyées par le navigateur à chaque requête).
"""
import os
import json
import sqlite3
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

MCP_URL = os.environ.get("MCP_URL", "http://mcp-server:8000/mcp")
DB_PATH = os.environ.get("DB_PATH", "/data/soc.db")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MCP_HEADERS = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
DEFAULT_SYSTEM = ("Tu es un assistant SOC connecté à Wazuh via MCP. Tu réponds en français, "
                  "de façon concise et actionnable. Utilise les outils Wazuh disponibles pour "
                  "fonder tes réponses sur des données réelles. Cite règles, agents et IP pertinents.")

app = FastAPI()


# ----------------------------- base de données ----------------------------- #
def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS conversations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT 'Nouvelle conversation',
      provider TEXT DEFAULT 'anthropic',
      model TEXT DEFAULT '',
      base_url TEXT DEFAULT '',
      created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER, role TEXT, content TEXT, tools TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS agents(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, system_prompt TEXT DEFAULT '', tools TEXT DEFAULT '[]',
      provider TEXT DEFAULT '', model TEXT DEFAULT '', base_url TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS skills(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, trigger TEXT, template TEXT DEFAULT '');
    """)
    c.commit()
    c.close()


def now():
    return datetime.now(timezone.utc).isoformat()


def get_setting(k, default=""):
    c = db(); r = c.execute("SELECT v FROM settings WHERE k=?", (k,)).fetchone(); c.close()
    return r["v"] if r else default


init_db()


# ------------------------------- MCP plumbing ------------------------------ #
def parse_sse(text):
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            return json.loads(line[5:].strip())
    return json.loads(text)


async def mcp_session(client):
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "soc-chat", "version": "1"}}}
    r = await client.post(MCP_URL, headers=MCP_HEADERS, json=init)
    h = dict(MCP_HEADERS)
    sid = r.headers.get("mcp-session-id")
    if sid:
        h["mcp-session-id"] = sid
    await client.post(MCP_URL, headers=h, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
    return h


async def mcp_list_tools(client, h):
    r = await client.post(MCP_URL, headers=h, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    return parse_sse(r.text)["result"]["tools"]


async def mcp_call_tool(client, h, name, args):
    r = await client.post(MCP_URL, headers=h, json={"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                          "params": {"name": name, "arguments": args or {}}})
    d = parse_sse(r.text)
    if "error" in d:
        return f"(erreur MCP: {d['error']})"
    parts = d.get("result", {}).get("content", [])
    return "\n".join(p.get("text", "") for p in parts if p.get("type") == "text") or json.dumps(d.get("result", {}))


def tool_schema(t):
    s = t.get("inputSchema") or {"type": "object", "properties": {}}
    if "type" not in s:
        s = {"type": "object", "properties": s.get("properties", {})}
    return s


async def run_anthropic(client, h, mcp_tools, key, model, system, messages):
    tools = [{"name": t["name"], "description": t.get("description", ""), "input_schema": tool_schema(t)} for t in mcp_tools]
    ah = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    convo = [{"role": m["role"], "content": m["content"]} for m in messages]
    used = []
    for _ in range(8):
        payload = {"model": model or "claude-sonnet-4-6", "max_tokens": 1500, "system": system, "messages": convo, "tools": tools}
        r = await client.post(ANTHROPIC_URL, headers=ah, json=payload)
        if r.status_code != 200:
            return {"error": f"Anthropic {r.status_code}: {r.text[:400]}"}
        data = r.json(); content = data.get("content", [])
        convo.append({"role": "assistant", "content": content})
        if data.get("stop_reason") == "tool_use":
            results = []
            for b in content:
                if b.get("type") == "tool_use":
                    used.append(b["name"])
                    out = await mcp_call_tool(client, h, b["name"], b.get("input", {}))
                    results.append({"type": "tool_result", "tool_use_id": b["id"], "content": out})
            convo.append({"role": "user", "content": results}); continue
        text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
        return {"reply": text, "tools_used": used}
    return {"reply": "(arrêt : trop d'appels d'outils)", "tools_used": used}


async def run_openai(client, h, mcp_tools, key, model, base_url, system, messages):
    base = (base_url or "https://api.openai.com/v1").rstrip("/")
    tools = [{"type": "function", "function": {"name": t["name"], "description": t.get("description", ""), "parameters": tool_schema(t)}} for t in mcp_tools]
    oh = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    convo = [{"role": "system", "content": system}] + [{"role": m["role"], "content": m["content"]} for m in messages]
    used = []
    for _ in range(8):
        payload = {"model": model or "gpt-4o", "messages": convo, "tools": tools, "tool_choice": "auto"}
        r = await client.post(base + "/chat/completions", headers=oh, json=payload)
        if r.status_code != 200:
            return {"error": f"API {r.status_code}: {r.text[:400]}"}
        msg = r.json()["choices"][0]["message"]; calls = msg.get("tool_calls")
        if calls:
            convo.append(msg)
            for cc in calls:
                fn = cc["function"]; used.append(fn["name"])
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {}
                out = await mcp_call_tool(client, h, fn["name"], args)
                convo.append({"role": "tool", "tool_call_id": cc["id"], "content": out})
            continue
        return {"reply": msg.get("content") or "", "tools_used": used}
    return {"reply": "(arrêt : trop d'appels d'outils)", "tools_used": used}


# --------------------------------- routes ---------------------------------- #
@app.get("/")
def index():
    return {"service": "mcp-chat", "ui": "injecté dans le dashboard (proxy/fab.js)"}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/mcp-test")
async def mcp_test():
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            h = await mcp_session(client)
            tools = await mcp_list_tools(client, h)
            sample = await mcp_call_tool(client, h, "get_wazuh_cluster_health", {})
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=502)
    return {"ok": True, "tools_count": len(tools), "tools": [t["name"] for t in tools],
            "sample_call": {"tool": "get_wazuh_cluster_health", "result": sample}}


@app.get("/api/settings")
def settings_get():
    return {"master_prompt": get_setting("master_prompt", ""),
            "preferences": json.loads(get_setting("preferences", "{}") or "{}")}


@app.put("/api/settings")
async def settings_put(req: Request):
    b = await req.json(); c = db()
    if "master_prompt" in b:
        c.execute("INSERT INTO settings(k,v) VALUES('master_prompt',?) ON CONFLICT(k) DO UPDATE SET v=?",
                  (b["master_prompt"], b["master_prompt"]))
    if "preferences" in b:
        v = json.dumps(b["preferences"])
        c.execute("INSERT INTO settings(k,v) VALUES('preferences',?) ON CONFLICT(k) DO UPDATE SET v=?", (v, v))
    c.commit(); c.close()
    return {"ok": True}


@app.get("/api/tools")
async def tools_list():
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            h = await mcp_session(client)
            tools = await mcp_list_tools(client, h)
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return [{"name": t["name"], "description": t.get("description", "")} for t in tools]


# ---- Agents (personas IA : prompt + outils + provider) ----
@app.get("/api/agents")
def agents_list():
    c = db(); rows = c.execute("SELECT * FROM agents ORDER BY name").fetchall(); c.close()
    return [{**dict(r), "tools": json.loads(r["tools"] or "[]")} for r in rows]


@app.post("/api/agents")
async def agents_create(req: Request):
    b = await req.json(); c = db()
    cur = c.execute("INSERT INTO agents(name,system_prompt,tools,provider,model,base_url) VALUES(?,?,?,?,?,?)",
                    (b.get("name", "Agent"), b.get("system_prompt", ""), json.dumps(b.get("tools", [])),
                     b.get("provider", ""), b.get("model", ""), b.get("base_url", "")))
    c.commit(); aid = cur.lastrowid; c.close()
    return {"id": aid}


@app.patch("/api/agents/{aid}")
async def agents_update(aid: int, req: Request):
    b = await req.json(); c = db()
    for f in ("name", "system_prompt", "provider", "model", "base_url"):
        if f in b:
            c.execute(f"UPDATE agents SET {f}=? WHERE id=?", (b[f], aid))
    if "tools" in b:
        c.execute("UPDATE agents SET tools=? WHERE id=?", (json.dumps(b["tools"]), aid))
    c.commit(); c.close()
    return {"ok": True}


@app.delete("/api/agents/{aid}")
def agents_delete(aid: int):
    c = db(); c.execute("DELETE FROM agents WHERE id=?", (aid,)); c.commit(); c.close()
    return {"ok": True}


# ---- Skills (templates de prompt réutilisables) ----
@app.get("/api/skills")
def skills_list():
    c = db(); rows = c.execute("SELECT * FROM skills ORDER BY trigger").fetchall(); c.close()
    return [dict(r) for r in rows]


@app.post("/api/skills")
async def skills_create(req: Request):
    b = await req.json(); c = db()
    cur = c.execute("INSERT INTO skills(name,trigger,template) VALUES(?,?,?)",
                    (b.get("name", "Skill"), b.get("trigger", "skill"), b.get("template", "")))
    c.commit(); sid = cur.lastrowid; c.close()
    return {"id": sid}


@app.patch("/api/skills/{sid}")
async def skills_update(sid: int, req: Request):
    b = await req.json(); c = db()
    for f in ("name", "trigger", "template"):
        if f in b:
            c.execute(f"UPDATE skills SET {f}=? WHERE id=?", (b[f], sid))
    c.commit(); c.close()
    return {"ok": True}


@app.delete("/api/skills/{sid}")
def skills_delete(sid: int):
    c = db(); c.execute("DELETE FROM skills WHERE id=?", (sid,)); c.commit(); c.close()
    return {"ok": True}


@app.get("/api/conversations")
def conv_list():
    c = db()
    rows = c.execute("SELECT id,title,provider,model,updated_at FROM conversations ORDER BY updated_at DESC").fetchall()
    c.close()
    return [dict(r) for r in rows]


@app.post("/api/conversations")
async def conv_create(req: Request):
    b = {}
    try:
        b = await req.json()
    except Exception:
        pass
    t = now(); c = db()
    cur = c.execute("INSERT INTO conversations(title,provider,model,base_url,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                    (b.get("title", "Nouvelle conversation"), b.get("provider", "anthropic"),
                     b.get("model", ""), b.get("base_url", ""), t, t))
    c.commit(); cid = cur.lastrowid
    row = dict(c.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()); c.close()
    return row


@app.get("/api/conversations/{cid}")
def conv_get(cid: int):
    c = db()
    conv = c.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
    if not conv:
        c.close(); return JSONResponse({"error": "introuvable"}, status_code=404)
    msgs = c.execute("SELECT role,content,tools FROM messages WHERE conversation_id=? ORDER BY id", (cid,)).fetchall()
    c.close()
    return {"conversation": dict(conv),
            "messages": [{"role": m["role"], "content": m["content"], "tools": json.loads(m["tools"] or "[]")} for m in msgs]}


@app.patch("/api/conversations/{cid}")
async def conv_update(cid: int, req: Request):
    b = await req.json(); c = db()
    for f in ("title", "provider", "model", "base_url"):
        if f in b:
            c.execute(f"UPDATE conversations SET {f}=? WHERE id=?", (b[f], cid))
    c.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now(), cid))
    c.commit(); c.close()
    return {"ok": True}


@app.delete("/api/conversations/{cid}")
def conv_delete(cid: int):
    c = db()
    c.execute("DELETE FROM messages WHERE conversation_id=?", (cid,))
    c.execute("DELETE FROM conversations WHERE id=?", (cid,))
    c.commit(); c.close()
    return {"ok": True}


@app.post("/api/conversations/{cid}/chat")
async def conv_chat(cid: int, req: Request):
    b = await req.json()
    key = (b.get("apiKey") or "").strip()
    content = (b.get("content") or "").strip()
    if not key:
        return JSONResponse({"error": "Clé API manquante."}, status_code=400)
    if not content:
        return JSONResponse({"error": "Message vide."}, status_code=400)

    c = db()
    conv = c.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
    if not conv:
        c.close(); return JSONResponse({"error": "conversation introuvable"}, status_code=404)
    conv = dict(conv)
    hist = c.execute("SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id", (cid,)).fetchall()
    messages = [{"role": m["role"], "content": m["content"]} for m in hist]
    messages.append({"role": "user", "content": content})
    # persiste le message user + titre auto au 1er message
    c.execute("INSERT INTO messages(conversation_id,role,content,tools,created_at) VALUES(?,?,?,?,?)",
              (cid, "user", content, "[]", now()))
    if conv["title"] in ("", "Nouvelle conversation") and not hist:
        c.execute("UPDATE conversations SET title=? WHERE id=?", (content[:48], cid))
    c.commit(); c.close()

    # agent éventuel (persona) : override prompt / outils / provider-modèle
    agent = None
    if b.get("agent_id"):
        cc = db(); ar = cc.execute("SELECT * FROM agents WHERE id=?", (b["agent_id"],)).fetchone(); cc.close()
        if ar:
            agent = {**dict(ar), "tools": json.loads(ar["tools"] or "[]")}
    base = get_setting("master_prompt", "").strip()
    if agent and agent.get("system_prompt"):
        system = (base + "\n\n" + agent["system_prompt"]) if base else agent["system_prompt"]
    else:
        system = base or DEFAULT_SYSTEM
    provider = (agent["provider"] if agent and agent.get("provider") else conv["provider"])
    model = (agent["model"] if agent and agent.get("model") else conv["model"])
    base_url = (agent["base_url"] if agent and agent.get("base_url") else conv["base_url"])

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            h = await mcp_session(client)
            mcp_tools = await mcp_list_tools(client, h)
        except Exception as e:
            return JSONResponse({"error": f"Serveur MCP injoignable: {e}"}, status_code=502)
        if agent and agent.get("tools"):
            allow = set(agent["tools"]); mcp_tools = [t for t in mcp_tools if t["name"] in allow]
        try:
            if provider == "openai":
                out = await run_openai(client, h, mcp_tools, key, model, base_url, system, messages)
            else:
                out = await run_anthropic(client, h, mcp_tools, key, model, system, messages)
        except Exception as e:
            return JSONResponse({"error": f"Erreur {provider}: {e}"}, status_code=502)

    if "error" in out:
        return JSONResponse(out, status_code=502)
    c = db()
    c.execute("INSERT INTO messages(conversation_id,role,content,tools,created_at) VALUES(?,?,?,?,?)",
              (cid, "assistant", out["reply"], json.dumps(out.get("tools_used", [])), now()))
    c.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now(), cid))
    c.commit(); c.close()
    return out
