// Assistant SOC MCP — Étapes 1+2 : historique (SQLite), menu FAB, provider par chat,
// Options (prompt master + clés + Agents + Skills), complétion @agent / /skill.
(function () {
  if (window.top !== window.self) return;
  if (window.__mcpLoaded) return;
  window.__mcpLoaded = true;

  var BASE = '/mcp-chat/api';
  var MAX_WIN = 3;
  var wins = {};
  var AGENTS = [], SKILLS = [];
  var PROVIDERS = {
    anthropic: { label: 'Anthropic (Claude)', def: 'claude-sonnet-4-6' },
    openai: { label: 'OpenAI-compatible', def: 'gpt-4o' }
  };
  function getKey(p) { return localStorage.getItem('mcp_key_' + p) || ''; }
  function getBase() { return localStorage.getItem('mcp_baseurl_openai') || 'https://api.openai.com/v1'; }

  async function api(path, opts) { var r = await fetch(BASE + path, opts); return r.json(); }
  function jpost(p, b) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); }
  function jpatch(p, b) { return api(p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); }
  function jput(p, b) { return api(p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); }
  function jdel(p) { return api(p, { method: 'DELETE' }); }
  async function loadAgents() { AGENTS = await api('/agents'); return AGENTS; }
  async function loadSkills() { SKILLS = await api('/skills'); return SKILLS; }

  var IC = {
    chat: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 21 11.5z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    min: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'
  };

  var BL = '#2563eb', DK = '#1e3a8a';
  var css = [
    '#mcpDock{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:row-reverse;align-items:flex-end;gap:14px;z-index:2147483600;font-family:"Segoe UI",system-ui,sans-serif}',
    '.mcpW svg,.mcpModal svg,.mcpMenu svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.mcpFab{width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,' + BL + ',' + DK + ');color:#fff;box-shadow:0 4px 16px rgba(37,99,235,.5);display:flex;align-items:center;justify-content:center;flex:0 0 auto;transition:transform .15s}',
    '.mcpFab:hover{transform:scale(1.07)}.mcpFab svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.mcpMenu{width:300px;max-width:92vw;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden;display:none;flex-direction:column;max-height:70vh;animation:mcpUp .15s}.mcpMenu.open{display:flex}',
    '.mcpMenuH{background:linear-gradient(135deg,' + BL + ',' + DK + ');color:#fff;padding:12px 14px;display:flex;align-items:center;gap:8px}.mcpMenuH b{flex:1;font-size:14px}.mcpMenuH button{background:transparent;border:0;color:#fff;cursor:pointer;opacity:.85;padding:4px;border-radius:6px;display:flex}.mcpMenuH button:hover{opacity:1;background:rgba(255,255,255,.18)}',
    '.mcpNew{margin:10px;padding:10px;border:1px dashed ' + BL + ';color:' + BL + ';border-radius:10px;background:#eff6ff;cursor:pointer;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:center}.mcpNew:hover{background:#dbeafe}',
    '.mcpList{overflow-y:auto;padding:0 8px 10px}',
    '.mcpConv{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:9px;cursor:pointer}.mcpConv:hover{background:#f1f5f9}.mcpConv .ci{flex:1;min-width:0}.mcpConv .ct{font-size:13px;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mcpConv .cs{font-size:11px;color:#94a3b8}.mcpConv .cd{background:transparent;border:0;color:#cbd5e1;cursor:pointer;padding:3px;display:flex}.mcpConv .cd:hover{color:#ef4444}',
    '.mcpEmpty{padding:18px;text-align:center;color:#94a3b8;font-size:13px}',
    '.mcpW{width:20vw;min-width:330px;height:auto;max-height:75vh;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;animation:mcpUp .18s;flex:0 0 auto}',
    '.mcpW.big{position:fixed;top:5vh;left:50%;transform:translateX(-50%);width:min(900px,92vw);height:90vh;max-height:90vh;z-index:2147483640}',
    '.mcpW.min{max-height:none}.mcpW.min .mcpBody,.mcpW.min .mcpBar,.mcpW.min .mcpSub,.mcpW.min .mcpChip{display:none}',
    '.mcpBackdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2147483635}',
    '@keyframes mcpUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '.mcpH{background:linear-gradient(135deg,' + BL + ',' + DK + ');color:#fff;padding:9px 12px;display:flex;align-items:center;gap:6px;flex:0 0 auto}.mcpH .t{font-weight:600;font-size:13.5px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.mcpH button{background:transparent;border:0;color:#fff;cursor:pointer;padding:4px;border-radius:6px;display:flex;opacity:.85}.mcpH button:hover{opacity:1;background:rgba(255,255,255,.18)}',
    '.mcpSub{padding:5px 12px;background:#eff6ff;border-bottom:1px solid #dbeafe;font-size:11.5px;color:#1e40af;cursor:pointer;display:flex;align-items:center;gap:6px}.mcpSub:hover{background:#dbeafe}.mcpSub b{font-weight:700}',
    '.mcpChip{display:none;align-items:center;gap:6px;margin:6px 10px 0;background:#ede9fe;color:#5b21b6;border:1px solid #ddd6fe;border-radius:14px;padding:3px 10px;font-size:12px;width:fit-content}.mcpChip.on{display:flex}.mcpChip button{background:transparent;border:0;color:#5b21b6;cursor:pointer;display:flex;padding:0}',
    '.mcpBody{flex:1 1 auto;overflow-y:auto;padding:12px;background:#f5f7fb;display:flex;flex-direction:column;gap:8px;min-height:280px}.mcpW.big .mcpBody{min-height:0}',
    '.mcpM{max-width:88%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere}.mcpM.u{align-self:flex-end;background:' + BL + ';color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}.mcpM.a{align-self:flex-start;background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:4px;max-width:96%}.mcpM.s{align-self:center;background:#fef3c7;color:#92400e;font-size:12px;border-radius:8px}',
    '.mcpM.a h1,.mcpM.a h2,.mcpM.a h3,.mcpM.a h4{margin:.5em 0 .25em;line-height:1.25}.mcpM.a h1{font-size:16px}.mcpM.a h2{font-size:15px}.mcpM.a h3{font-size:14px}.mcpM.a p{margin:.35em 0}.mcpM.a ul,.mcpM.a ol{margin:.35em 0;padding-left:20px}.mcpM.a code{background:#eef2ff;padding:1px 4px;border-radius:4px;font-family:Consolas,monospace;font-size:12px}.mcpM.a pre{background:#0f172a;color:#e2e8f0;padding:9px;border-radius:8px;overflow-x:auto}.mcpM.a pre code{background:transparent;color:inherit;padding:0}.mcpM.a table{border-collapse:collapse;width:100%;margin:.45em 0;font-size:12px;display:block;overflow-x:auto}.mcpM.a th,.mcpM.a td{border:1px solid #d1d5db;padding:4px 7px}.mcpM.a th{background:#f1f5f9}.mcpM.a hr{border:0;border-top:1px solid #e5e7eb;margin:.55em 0}.mcpM.a a{color:' + BL + '}.mcpM.a strong{font-weight:700}',
    '.mcpTools{margin-top:6px;font-size:11px;color:#6b7280;border-top:1px dashed #e5e7eb;padding-top:4px}',
    '.mcpType{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:11px 14px;display:flex;gap:4px}.mcpType i{width:7px;height:7px;border-radius:50%;background:#9ca3af;display:inline-block;animation:mcpB 1.2s infinite}.mcpType i:nth-child(2){animation-delay:.2s}.mcpType i:nth-child(3){animation-delay:.4s}@keyframes mcpB{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}',
    '.mcpBar{position:relative;display:flex;border-top:1px solid #e5e7eb;background:#fff;align-items:stretch;flex:0 0 auto}.mcpBar textarea{flex:1;border:0;outline:0;resize:none;padding:11px;font:14px/1.4 "Segoe UI",sans-serif;max-height:96px}.mcpBar .snd{background:' + BL + ';border:0;color:#fff;cursor:pointer;width:46px;display:flex;align-items:center;justify-content:center}',
    '.mcpComp{position:absolute;bottom:100%;left:0;right:0;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 -4px 16px rgba(0,0,0,.18);max-height:190px;overflow:auto;margin-bottom:4px;display:none;z-index:5}.mcpComp.open{display:block}.mcpComp .ci{padding:8px 10px;cursor:pointer;font-size:13px}.mcpComp .ci .cn{font-weight:600;color:#1f2937}.mcpComp .ci .cc{font-size:11px;color:#6b7280}.mcpComp .ci.sel,.mcpComp .ci:hover{background:#eff6ff}',
    // modales
    '.mcpMask{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:12px}',
    '.mcpModal{background:#fff;border-radius:14px;width:min(560px,96vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden}',
    '.mcpModal .mh{background:linear-gradient(135deg,' + BL + ',' + DK + ');color:#fff;padding:12px 16px;font-weight:600}.mcpModal .mb{padding:16px;display:flex;flex-direction:column;gap:12px;overflow:auto}',
    '.mcpModal label{font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px}.mcpModal input,.mcpModal select,.mcpModal textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:inherit}',
    '.mcpRow{display:flex;gap:8px;align-items:center}.mcpRight{display:flex;gap:8px;justify-content:flex-end}',
    '.mcpBtn{background:' + BL + ';color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer}.mcpBtn.sec{background:#e5e7eb;color:#374151}.mcpBtn.sm{padding:6px 10px;font-size:12px}',
    '.mcpHint{font-size:12px;color:#6b7280}',
    '.mcpTabs{display:flex;gap:2px;background:#f1f5f9;border-radius:9px;padding:3px}.mcpTab{flex:1;text-align:center;padding:7px;border-radius:7px;cursor:pointer;font-size:13px;color:#475569}.mcpTab.on{background:#fff;color:' + BL + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.1)}',
    '.mcpItem{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #e5e7eb;border-radius:9px;margin-bottom:6px}.mcpItem .ii{flex:1;min-width:0}.mcpItem .in{font-weight:600;font-size:13px}.mcpItem .id{font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mcpChk{max-height:170px;overflow:auto;border:1px solid #cbd5e1;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:3px}.mcpChk label{font-weight:400;font-size:12px;display:flex;gap:7px;align-items:center;margin:0}.mcpChk input{width:auto}',
    '@media(max-width:640px){#mcpDock{bottom:0;right:0;left:0;gap:0}.mcpW,.mcpMenu{width:100vw!important;min-width:0!important;max-height:100vh!important;height:100vh!important;border-radius:0!important}.mcpW.big{width:100vw;height:100vh;top:0;transform:none;left:0}}'
  ].join('');

  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function ib(svg, title, cls) { var b = el('button', cls || null, svg); b.title = title || ''; b.type = 'button'; return b; }
  function fmtTime(s) { try { var d = new Date(s); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inl(s) { return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>'); }
  function md(src) {
    src = esc(src); var codes = [];
    src = src.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, function (_, c) { codes.push(c.replace(/\n$/, '')); return ' C' + (codes.length - 1) + ' '; });
    var L = src.split('\n'), out = [], i = 0, isRow = function (s) { return /^\s*\|.*\|\s*$/.test(s); };
    var cells = function (r) { return r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (x) { return inl(x.trim()); }); };
    while (i < L.length) {
      var ln = L[i];
      if (isRow(ln) && i + 1 < L.length && /^\s*\|?[\s:-]*-[-\s:|]*$/.test(L[i + 1])) {
        var th = '<tr>' + cells(ln).map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>'; i += 2; var rs = [];
        while (i < L.length && isRow(L[i])) { rs.push('<tr>' + cells(L[i]).map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'); i++; }
        out.push('<table>' + th + rs.join('') + '</table>'); continue;
      }
      var h = /^(#{1,6})\s+(.*)$/.exec(ln); if (h) { var n = Math.min(h[1].length, 4); out.push('<h' + n + '>' + inl(h[2]) + '</h' + n + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
      if (/^\s*[-*+]\s+/.test(ln) || /^\s*\d+\.\s+/.test(ln)) {
        var ord = /^\s*\d+\.\s+/.test(ln), it = [];
        while (i < L.length && (/^\s*[-*+]\s+/.test(L[i]) || /^\s*\d+\.\s+/.test(L[i]))) { it.push('<li>' + inl(L[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')) + '</li>'); i++; }
        out.push((ord ? '<ol>' : '<ul>') + it.join('') + (ord ? '</ol>' : '</ul>')); continue;
      }
      if (/^\s*$/.test(ln)) { i++; continue; }
      var p = [ln]; i++;
      while (i < L.length && !/^\s*$/.test(L[i]) && !/^#{1,6}\s/.test(L[i]) && !isRow(L[i]) && !/^\s*[-*+]\s+/.test(L[i]) && !/^\s*\d+\.\s+/.test(L[i])) { p.push(L[i]); i++; }
      out.push('<p>' + p.map(inl).join('<br>') + '</p>');
    }
    return out.join('').replace(/ C(\d+) /g, function (_, k) { return '<pre><code>' + codes[k] + '</code></pre>'; });
  }

  function modal(titleTxt) {
    var mask = el('div', 'mcpMask'); var m = el('div', 'mcpModal');
    m.appendChild(el('div', 'mh', titleTxt)); var b = el('div', 'mb'); m.appendChild(b);
    mask.appendChild(m); document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
    return { mask: mask, body: b, close: function () { mask.remove(); } };
  }

  // ---------- Options (onglets : Général / Agents / Skills) ----------
  async function openOptions(tab) {
    var dlg = modal('Options'); var b = dlg.body;
    var tabs = el('div', 'mcpTabs',
      '<div class="mcpTab" data-t="gen">Général</div><div class="mcpTab" data-t="agents">Agents</div><div class="mcpTab" data-t="skills">Skills</div>');
    var pane = el('div'); b.appendChild(tabs); b.appendChild(pane);
    function sel(t) { tabs.querySelectorAll('.mcpTab').forEach(function (x) { x.classList.toggle('on', x.dataset.t === t); }); if (t === 'gen') paneGen(); else if (t === 'agents') paneAgents(); else paneSkills(); }
    tabs.querySelectorAll('.mcpTab').forEach(function (x) { x.onclick = function () { sel(x.dataset.t); }; });

    async function paneGen() {
      var s = await api('/settings');
      pane.innerHTML = '';
      var f = el('div', null,
        '<div><label>Prompt master (système global)</label><textarea id="oP" rows="4" placeholder="Instructions globales…"></textarea></div>' +
        '<div><label>Clé API Anthropic</label><input id="oKA" type="password" placeholder="sk-ant-..."></div>' +
        '<div><label>Clé API OpenAI-compatible</label><input id="oKO" type="password" placeholder="clé"></div>' +
        '<div><label>URL de base OpenAI-compatible</label><input id="oB" placeholder="https://api.openai.com/v1"></div>' +
        '<div class="mcpRow"><button class="mcpBtn sec" id="oT" type="button">Tester MCP</button><span class="mcpHint" id="oR"></span></div>' +
        '<div class="mcpRight"><button class="mcpBtn" id="oS" type="button">Enregistrer</button></div>');
      pane.appendChild(f);
      f.querySelector('#oP').value = s.master_prompt || ''; f.querySelector('#oKA').value = getKey('anthropic'); f.querySelector('#oKO').value = getKey('openai'); f.querySelector('#oB').value = getBase();
      f.querySelector('#oS').onclick = async function () {
        localStorage.setItem('mcp_key_anthropic', f.querySelector('#oKA').value.trim());
        localStorage.setItem('mcp_key_openai', f.querySelector('#oKO').value.trim());
        localStorage.setItem('mcp_baseurl_openai', f.querySelector('#oB').value.trim() || 'https://api.openai.com/v1');
        await jput('/settings', { master_prompt: f.querySelector('#oP').value }); dlg.close();
      };
      f.querySelector('#oT').onclick = async function () { var r = f.querySelector('#oR'); r.textContent = 'Test...'; try { var j = await api('/mcp-test'); r.textContent = j.ok ? ('OK — ' + j.tools_count + ' outils') : ('KO : ' + j.error); r.style.color = j.ok ? '#16a34a' : '#dc2626'; } catch (e) { r.textContent = 'KO'; } };
    }

    async function paneAgents() {
      pane.innerHTML = ''; var ags = await loadAgents();
      var add = el('button', 'mcpBtn sm', '+ Nouvel agent'); add.type = 'button'; pane.appendChild(add);
      var list = el('div'); list.style.marginTop = '10px'; pane.appendChild(list);
      ags.forEach(function (a) {
        var it = el('div', 'mcpItem', '<div class="ii"><div class="in">@' + (a.name || '') + '</div><div class="id">' + (a.tools.length ? a.tools.length + ' outils' : 'tous outils') + (a.model ? ' · ' + a.model : '') + '</div></div>');
        var ed = el('button', 'mcpBtn sec sm', 'Éditer'); ed.type = 'button'; var dl = ib(IC.trash, 'Supprimer', 'cd');
        it.appendChild(ed); it.appendChild(dl); list.appendChild(it);
        ed.onclick = function () { editAgent(a, function () { sel('agents'); }); };
        dl.onclick = async function () { await jdel('/agents/' + a.id); loadAgents(); sel('agents'); };
      });
      if (!ags.length) pane.appendChild(el('div', 'mcpHint', 'Aucun agent. Crée un persona (prompt + outils) appelable via @nom.'));
      add.onclick = function () { editAgent(null, function () { sel('agents'); }); };
    }
    async function editAgent(a, done) {
      var tools = await api('/tools'); a = a || { name: '', system_prompt: '', tools: [], provider: '', model: '' };
      var dlg2 = modal(a.id ? 'Éditer agent' : 'Nouvel agent'); var bb = dlg2.body;
      var checks = tools.map(function (t) { return '<label><input type="checkbox" value="' + t.name + '"' + (a.tools.indexOf(t.name) >= 0 ? ' checked' : '') + '> ' + t.name + '</label>'; }).join('');
      bb.appendChild(el('div', null,
        '<div><label>Nom (sans espace, pour @nom)</label><input id="aN" value="' + (a.name || '').replace(/"/g, '&quot;') + '" placeholder="analyste-alertes"></div>' +
        '<div><label>Prompt système</label><textarea id="aP" rows="4" placeholder="Tu es un expert en…">' + esc(a.system_prompt || '') + '</textarea></div>' +
        '<div class="mcpRow"><div style="flex:1"><label>Provider (optionnel)</label><select id="aPr"><option value="">(défaut conv.)</option><option value="anthropic">Anthropic</option><option value="openai">OpenAI-compatible</option></select></div><div style="flex:1"><label>Modèle (optionnel)</label><input id="aM" value="' + (a.model || '').replace(/"/g, '&quot;') + '"></div></div>' +
        '<div><label>Outils MCP autorisés (aucun coché = tous)</label><div class="mcpChk">' + checks + '</div></div>' +
        '<div class="mcpRight"><button class="mcpBtn sec" id="aC" type="button">Annuler</button><button class="mcpBtn" id="aS" type="button">Enregistrer</button></div>'));
      bb.querySelector('#aPr').value = a.provider || '';
      bb.querySelector('#aC').onclick = dlg2.close;
      bb.querySelector('#aS').onclick = async function () {
        var sel2 = []; bb.querySelectorAll('.mcpChk input:checked').forEach(function (c) { sel2.push(c.value); });
        var payload = { name: bb.querySelector('#aN').value.trim().replace(/\s+/g, '-'), system_prompt: bb.querySelector('#aP').value, tools: sel2, provider: bb.querySelector('#aPr').value, model: bb.querySelector('#aM').value.trim() };
        if (a.id) await jpatch('/agents/' + a.id, payload); else await jpost('/agents', payload);
        await loadAgents(); dlg2.close(); if (done) done();
      };
    }

    async function paneSkills() {
      pane.innerHTML = ''; var sks = await loadSkills();
      var add = el('button', 'mcpBtn sm', '+ Nouveau skill'); add.type = 'button'; pane.appendChild(add);
      var list = el('div'); list.style.marginTop = '10px'; pane.appendChild(list);
      sks.forEach(function (s) {
        var it = el('div', 'mcpItem', '<div class="ii"><div class="in">/' + (s.trigger || '') + '</div><div class="id">' + (s.name || '') + '</div></div>');
        var ed = el('button', 'mcpBtn sec sm', 'Éditer'); ed.type = 'button'; var dl = ib(IC.trash, 'Supprimer', 'cd');
        it.appendChild(ed); it.appendChild(dl); list.appendChild(it);
        ed.onclick = function () { editSkill(s, function () { sel('skills'); }); };
        dl.onclick = async function () { await jdel('/skills/' + s.id); loadSkills(); sel('skills'); };
      });
      if (!sks.length) pane.appendChild(el('div', 'mcpHint', 'Aucun skill. Crée un template de prompt appelable via /déclencheur.'));
      add.onclick = function () { editSkill(null, function () { sel('skills'); }); };
    }
    function editSkill(s, done) {
      s = s || { name: '', trigger: '', template: '' };
      var dlg2 = modal(s.id ? 'Éditer skill' : 'Nouveau skill'); var bb = dlg2.body;
      bb.appendChild(el('div', null,
        '<div><label>Déclencheur (sans espace, pour /trigger)</label><input id="sT" value="' + (s.trigger || '').replace(/"/g, '&quot;') + '" placeholder="triage-alerte"></div>' +
        '<div><label>Nom / description</label><input id="sN" value="' + (s.name || '').replace(/"/g, '&quot;') + '" placeholder="Triage d\'une alerte"></div>' +
        '<div><label>Template (inséré dans le message)</label><textarea id="sTp" rows="5" placeholder="Analyse l\'alerte suivante et propose…">' + esc(s.template || '') + '</textarea></div>' +
        '<div class="mcpRight"><button class="mcpBtn sec" id="sC" type="button">Annuler</button><button class="mcpBtn" id="sS" type="button">Enregistrer</button></div>'));
      bb.querySelector('#sC').onclick = dlg2.close;
      bb.querySelector('#sS').onclick = async function () {
        var payload = { name: bb.querySelector('#sN').value.trim(), trigger: bb.querySelector('#sT').value.trim().replace(/\s+/g, '-'), template: bb.querySelector('#sTp').value };
        if (s.id) await jpatch('/skills/' + s.id, payload); else await jpost('/skills', payload);
        await loadSkills(); dlg2.close(); if (done) done();
      };
    }
    sel(tab || 'gen');
  }

  // ---------- provider par chat ----------
  function openProviderPicker(conv, onSaved) {
    var dlg = modal('Modèle & fournisseur'); var body = dlg.body;
    var cards = Object.keys(PROVIDERS).map(function (p) { return '<div class="mcpItem" data-p="' + p + '" style="cursor:pointer"><div class="ii"><div class="in">' + PROVIDERS[p].label + '</div><div class="id">' + (p === 'anthropic' ? 'Claude' : 'OpenAI / Ollama / OpenRouter…') + '</div></div></div>'; }).join('');
    body.appendChild(el('div', null, cards + '<div><label>Modèle</label><input id="pvM" placeholder="modèle"></div><div class="mcpRight"><button class="mcpBtn sec" id="pvC" type="button">Annuler</button><button class="mcpBtn" id="pvS" type="button">Appliquer</button></div>'));
    var selp = conv.provider || 'anthropic'; var mIn = body.querySelector('#pvM'); mIn.value = conv.model || '';
    function paint() { body.querySelectorAll('.mcpItem[data-p]').forEach(function (c) { c.style.borderColor = c.dataset.p === selp ? BL : '#e5e7eb'; }); if (!mIn.value) mIn.placeholder = PROVIDERS[selp].def; }
    body.querySelectorAll('.mcpItem[data-p]').forEach(function (c) { c.onclick = function () { selp = c.dataset.p; mIn.value = ''; paint(); }; });
    paint();
    body.querySelector('#pvC').onclick = dlg.close;
    body.querySelector('#pvS').onclick = async function () { conv.provider = selp; conv.model = mIn.value.trim(); conv.base_url = selp === 'openai' ? getBase() : ''; await jpatch('/conversations/' + conv.id, { provider: conv.provider, model: conv.model, base_url: conv.base_url }); dlg.close(); if (onSaved) onSaved(); };
  }

  // ---------- fenêtre de chat ----------
  async function openConversation(id) {
    if (wins[id]) { wins[id].classList.remove('min'); return; }
    if (Object.keys(wins).length >= MAX_WIN) { alert('Maximum ' + MAX_WIN + ' fenêtres'); return; }
    var data = await api('/conversations/' + id); if (data.error) return;
    var conv = data.conversation, backdrop = null, activeAgent = null;
    loadAgents(); loadSkills();
    var win = el('div', 'mcpW'); wins[id] = win;
    var head = el('div', 'mcpH');
    var title = el('span', 't'); title.textContent = conv.title || 'Conversation';
    var bGear = ib(IC.gear, 'Options'), bMin = ib(IC.min, 'Réduire'), bExp = ib(IC.expand, 'Agrandir'), bClose = ib(IC.close, 'Fermer');
    [title, bGear, bMin, bExp, bClose].forEach(function (e) { head.appendChild(e); });
    var sub = el('div', 'mcpSub');
    function paintSub() { sub.innerHTML = 'Modèle : <b>&nbsp;' + (PROVIDERS[conv.provider] ? PROVIDERS[conv.provider].label : conv.provider) + '</b>&nbsp;·&nbsp;' + (conv.model || PROVIDERS[conv.provider].def) + ' (changer)'; }
    paintSub();
    var chip = el('div', 'mcpChip'); var chipX = ib(IC.close, 'Retirer l\'agent');
    function setAgent(a) { activeAgent = a; if (a) { chip.innerHTML = 'Agent : @' + a.name + '&nbsp;'; chip.appendChild(chipX); chip.classList.add('on'); } else { chip.classList.remove('on'); } }
    chipX.onclick = function () { setAgent(null); };
    var body = el('div', 'mcpBody'); var bar = el('div', 'mcpBar');
    var comp = el('div', 'mcpComp'); var ta = el('textarea'); ta.rows = 1; ta.placeholder = 'Message…  (@agent, /skill)';
    var snd = el('button', 'snd', IC.send); snd.type = 'button';
    bar.appendChild(comp); bar.appendChild(ta); bar.appendChild(snd);
    win.appendChild(head); win.appendChild(sub); win.appendChild(chip); win.appendChild(body); win.appendChild(bar);

    function add(role, text, tools) {
      var m = el('div', 'mcpM ' + (role === 'user' ? 'u' : role === 'assistant' ? 'a' : 's'));
      if (role === 'assistant') m.innerHTML = md(text); else m.textContent = text;
      if (tools && tools.length) m.appendChild(el('div', 'mcpTools', 'Outils : ' + tools.join(', ')));
      body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
    }
    function typing() { var t = el('div', 'mcpType', '<i></i><i></i><i></i>'); body.appendChild(t); body.scrollTop = body.scrollHeight; return t; }
    if (!data.messages.length) add('sys', 'Nouvelle conversation. @agent pour un persona, /skill pour un template.');
    data.messages.forEach(function (m) { add(m.role, m.content, m.tools); });

    // --- complétion @ / / ---
    var compItems = [], compSel = 0, compMode = null, compTok = null;
    function tokenAt() { var pos = ta.selectionStart, left = ta.value.slice(0, pos), m = /(^|\s)([@/])([\w-]*)$/.exec(left); return m ? { sym: m[2], q: m[3].toLowerCase(), start: pos - m[3].length - 1, end: pos } : null; }
    function closeComp() { comp.classList.remove('open'); comp.innerHTML = ''; compMode = null; }
    function renderComp() {
      comp.innerHTML = '';
      compItems.forEach(function (it, i) {
        var d = el('div', 'ci' + (i === compSel ? ' sel' : ''), '<div class="cn">' + it.label + '</div>' + (it.desc ? '<div class="cc">' + it.desc + '</div>' : ''));
        d.onmousedown = function (e) { e.preventDefault(); pick(i); }; comp.appendChild(d);
      });
      comp.classList.toggle('open', compItems.length > 0);
    }
    function pick(i) {
      var it = compItems[i]; if (!it) return;
      if (compMode === '@') { setAgent(it.obj); replaceToken('@' + it.obj.name + ' '); }
      else { replaceToken(it.obj.template + ' '); }
      closeComp(); ta.focus();
    }
    function replaceToken(txt) { if (!compTok) return; var v = ta.value; ta.value = v.slice(0, compTok.start) + txt + v.slice(compTok.end); var np = compTok.start + txt.length; ta.selectionStart = ta.selectionEnd = np; ta.dispatchEvent(new Event('input')); }
    function updateComp() {
      compTok = tokenAt();
      if (!compTok) { closeComp(); return; }
      compMode = compTok.sym; compSel = 0;
      if (compMode === '@') compItems = AGENTS.filter(function (a) { return a.name.toLowerCase().indexOf(compTok.q) >= 0; }).map(function (a) { return { label: '@' + a.name, desc: (a.tools.length ? a.tools.length + ' outils' : 'tous outils'), obj: a }; });
      else compItems = SKILLS.filter(function (s) { return s.trigger.toLowerCase().indexOf(compTok.q) >= 0; }).map(function (s) { return { label: '/' + s.trigger, desc: s.name, obj: s }; });
      renderComp();
    }

    async function send() {
      var text = ta.value.trim(); if (!text) return;
      var prov = (activeAgent && activeAgent.provider) ? activeAgent.provider : conv.provider;
      var key = getKey(prov);
      if (!key) { add('sys', 'Renseigne ta clé API dans les Options.'); openOptions('gen'); return; }
      add('user', text); ta.value = ''; ta.style.height = 'auto'; closeComp();
      var t = typing();
      try {
        var bd = { apiKey: key, content: text }; if (activeAgent) bd.agent_id = activeAgent.id;
        var j = await jpost('/conversations/' + conv.id + '/chat', bd);
        t.remove();
        if (j.error) { add('sys', 'Erreur : ' + j.error); return; }
        add('assistant', j.reply, j.tools_used);
        var fresh = await api('/conversations/' + conv.id); title.textContent = fresh.conversation.title || title.textContent; refreshMenu();
      } catch (e) { t.remove(); add('sys', 'Erreur : ' + e); }
    }
    snd.onclick = send;
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; updateComp(); });
    ta.addEventListener('keydown', function (e) {
      if (comp.classList.contains('open')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); compSel = (compSel + 1) % compItems.length; renderComp(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); compSel = (compSel - 1 + compItems.length) % compItems.length; renderComp(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(compSel); return; }
        if (e.key === 'Escape') { closeComp(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    sub.onclick = function () { openProviderPicker(conv, paintSub); };
    bGear.onclick = function () { openOptions('gen'); };
    function setBig(on) { if (on) { win.classList.remove('min'); win.classList.add('big'); document.body.appendChild(win); if (!backdrop) { backdrop = el('div', 'mcpBackdrop'); backdrop.onclick = function () { setBig(false); }; document.body.appendChild(backdrop); } } else { win.classList.remove('big'); if (backdrop) { backdrop.remove(); backdrop = null; } dock.appendChild(win); } bExp.innerHTML = on ? IC.shrink : IC.expand; body.scrollTop = body.scrollHeight; }
    bExp.onclick = function () { setBig(!win.classList.contains('big')); };
    bMin.onclick = function () { setBig(false); win.classList.toggle('min'); };
    title.onclick = function () { setBig(false); win.classList.toggle('min'); };
    bClose.onclick = function () { if (backdrop) backdrop.remove(); win.remove(); delete wins[id]; };
    dock.appendChild(win); setTimeout(function () { ta.focus(); }, 50);
  }

  // ---------- menu FAB ----------
  var menu = el('div', 'mcpMenu');
  menu.appendChild(el('div', 'mcpMenuH', '<b>Assistant SOC</b>'));
  var bOpt = ib(IC.gear, 'Options'); menu.querySelector('.mcpMenuH').appendChild(bOpt); bOpt.onclick = function () { openOptions('gen'); };
  var btnNew = el('div', 'mcpNew', IC.plus + ' Nouvelle conversation'); menu.appendChild(btnNew);
  var list = el('div', 'mcpList'); menu.appendChild(list);
  async function refreshMenu() {
    var cs = await api('/conversations'); list.innerHTML = '';
    if (!cs.length) { list.appendChild(el('div', 'mcpEmpty', 'Aucune conversation.')); return; }
    cs.forEach(function (c) {
      var row = el('div', 'mcpConv'); var info = el('div', 'ci'); var t = el('div', 'ct'); t.textContent = c.title || 'Conversation';
      info.appendChild(t); info.appendChild(el('div', 'cs', fmtTime(c.updated_at)));
      var del = ib(IC.trash, 'Supprimer', 'cd'); row.appendChild(info); row.appendChild(del);
      info.onclick = function () { menu.classList.remove('open'); openConversation(c.id); };
      del.onclick = async function (e) { e.stopPropagation(); await jdel('/conversations/' + c.id); if (wins[c.id]) { wins[c.id].remove(); delete wins[c.id]; } refreshMenu(); };
      list.appendChild(row);
    });
  }
  btnNew.onclick = async function () { var conv = await jpost('/conversations', { provider: 'anthropic' }); menu.classList.remove('open'); refreshMenu(); openConversation(conv.id); };

  var dock = el('div'); dock.id = 'mcpDock';
  var fab = el('button', 'mcpFab', IC.chat); fab.type = 'button'; fab.title = 'Assistant SOC (MCP)';
  fab.onclick = function () { menu.classList.toggle('open'); if (menu.classList.contains('open')) refreshMenu(); };
  dock.appendChild(fab); dock.appendChild(menu);
  var style = el('style'); style.id = 'mcp-fab-style'; style.textContent = css;
  function mount() { if (!document.getElementById('mcp-fab-style')) (document.head || document.documentElement).appendChild(style); if (!document.getElementById('mcpDock')) document.body.appendChild(dock); }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
  setInterval(mount, 3000);
})();
