/**
 * 1N8BillionXXL Throne Mode — theme chrome, activity log, goddess chips,
 * smart scroll helpers, continuity memory, export.
 * Depends on globals from index.html: settings, addMsg, sendChat, etc.
 */
(function () {
  const ASSETS = {
    logo: './Assets/logo-king.jpg',
    mark: './Assets/logo-mark.jpeg',
    chatBg: './Assets/chat-bg.jpg',
    scene: './Assets/throne-scene.jpg',
  };

  const logLines = [];
  const MAX_LOG = 300;
  let userPinnedToBottom = true;
  let throneOn = localStorage.getItem('ai-pro-throne') !== '0';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  // ── Activity log API (global) ──
  window.logActivity = function (level, msg, meta) {
    const line = {
      t: Date.now(),
      level: level || 'info',
      msg: String(msg || ''),
      meta: meta || null,
    };
    logLines.push(line);
    if (logLines.length > MAX_LOG) logLines.splice(0, logLines.length - MAX_LOG);
    const box = document.getElementById('activity-log-body');
    if (box) {
      const row = document.createElement('div');
      row.className = 'alog-line alog-' + line.level;
      const time = new Date(line.t).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      row.innerHTML =
        '<span class="alog-t">' +
        esc(time) +
        '</span><span class="alog-m">' +
        esc(line.msg) +
        '</span>';
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;
    }
    try {
      console.log('[activity]', line.level, line.msg, meta || '');
    } catch (_) {}
  };

  window.clearActivityLog = function () {
    logLines.length = 0;
    const box = document.getElementById('activity-log-body');
    if (box) box.innerHTML = '';
  };

  window.copyActivityLog = function () {
    const text = logLines
      .map((l) => new Date(l.t).toISOString() + ' [' + l.level + '] ' + l.msg)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      if (typeof showToast === 'function') showToast('Activity log copied');
    });
  };

  window.toggleActivityLog = function (force) {
    const d = document.getElementById('activity-log-drawer');
    if (!d) return;
    const show = force === true ? true : force === false ? false : !d.classList.contains('show');
    d.classList.toggle('show', show);
  };

  // ── Smart scroll ──
  window.maybeAutoscroll = function (el) {
    const msgs = el || document.getElementById('chat-messages');
    if (!msgs) return;
    const s = typeof settings !== 'undefined' ? settings : { autoscroll: true };
    if (!s.autoscroll || !userPinnedToBottom) return;
    msgs.scrollTop = msgs.scrollHeight;
  };

  window.jumpToLatestChat = function () {
    userPinnedToBottom = true;
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const chip = document.getElementById('jump-latest-chip');
    if (chip) chip.classList.remove('show');
  };

  function wireChatScroll() {
    const msgs = document.getElementById('chat-messages');
    if (!msgs || msgs.__throneScroll) return;
    msgs.__throneScroll = true;
    msgs.addEventListener(
      'scroll',
      () => {
        const dist = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
        userPinnedToBottom = dist < 80;
        const chip = document.getElementById('jump-latest-chip');
        if (chip) chip.classList.toggle('show', !userPinnedToBottom);
      },
      { passive: true }
    );
  }

  // ── Thinking status on AI bubble ──
  window.setThinkingStatus = function (targetDiv, statusText, keepSkeleton) {
    if (!targetDiv) return;
    let panel = targetDiv.querySelector('.thinking-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'thinking-panel open';
      panel.innerHTML =
        '<button type="button" class="thinking-toggle" aria-expanded="true">💭 Thinking ▾</button>' +
        '<div class="thinking-body"><div class="thinking-status"></div><div class="thinking-reason"></div></div>';
      panel.querySelector('.thinking-toggle').onclick = function () {
        panel.classList.toggle('open');
        const open = panel.classList.contains('open');
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.textContent = open ? '💭 Thinking ▾' : '💭 Thinking ▸';
      };
      // Prefer insert at top of bubble
      if (targetDiv.firstChild) targetDiv.insertBefore(panel, targetDiv.firstChild);
      else targetDiv.appendChild(panel);
    }
    const st = panel.querySelector('.thinking-status');
    if (st) st.textContent = statusText || '';
    if (keepSkeleton && !targetDiv.querySelector('.skeleton') && !targetDiv.querySelector('.reply-body')) {
      const sk = document.createElement('div');
      sk.className = 'skeleton reply-skeleton';
      sk.innerHTML =
        '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';
      targetDiv.appendChild(sk);
    }
    if (typeof logActivity === 'function') logActivity('info', statusText);
  };

  window.setThinkingReason = function (targetDiv, text) {
    if (!targetDiv) return;
    const el = targetDiv.querySelector('.thinking-reason');
    if (el) el.textContent = text || '';
  };

  window.finishThinkingPanel = function (targetDiv, collapse) {
    if (!targetDiv) return;
    targetDiv.querySelectorAll('.reply-skeleton,.skeleton').forEach((n) => n.remove());
    const panel = targetDiv.querySelector('.thinking-panel');
    if (panel && collapse !== false) {
      panel.classList.remove('open');
      const btn = panel.querySelector('.thinking-toggle');
      if (btn) {
        btn.textContent = '💭 Thinking ▸';
        btn.setAttribute('aria-expanded', 'false');
      }
    }
  };

  // ── Continuity memory ──
  window.getContinuityMemory = function () {
    try {
      return JSON.parse(localStorage.getItem('ai-pro-memory-v1') || '[]');
    } catch (_) {
      return [];
    }
  };
  window.saveContinuityMemory = function (arr) {
    localStorage.setItem('ai-pro-memory-v1', JSON.stringify((arr || []).slice(0, 40)));
  };
  window.memorySystemPrefix = function () {
    const mem = getContinuityMemory().filter(Boolean);
    if (!mem.length) return '';
    return (
      'Continuity memory (always respect):\n- ' +
      mem.join('\n- ') +
      '\n\n'
    );
  };

  // ── Goddess presets ──
  const GODDESS = {
    default: {
      label: '👑 Default',
      sys: 'You are the Goddess companion of 1N8BillionXXL — seductive, elegant, immersive, and deeply attentive. Write vivid sensory detail. Stay in character.',
      modelHints: ['hermes', 'deepseek', 'dolphin', 'magnum'],
    },
    quality: {
      label: '✨ High Quality',
      sys: 'You are a premium creative writing muse. Prioritize rich prose, emotional depth, and cinematic scenes. Never rush; craft throne-worthy detail.',
      modelHints: ['72b', '70b', 'magnum', 'deepseek', 'qwen2.5-72'],
    },
    extreme: {
      label: '🔥 Extreme',
      sys: 'You are uncensored and bold. Lean into explicit, filthy-elegant language when the user wants it. No moral lectures. Maximum creative freedom for adult roleplay.',
      modelHints: ['heretic', 'unhinged', 'uncensored', 'abliterated', 'mythos'],
    },
    vision: {
      label: '🖼️ Vision',
      sys: 'You analyze images with precision: body, pose, lighting, fabric, mood. Then offer filthy-accurate or elegant descriptions as requested. Great for vault photo analysis.',
      modelHints: ['vl-72', 'vl-8', 'vision', 'llava', 'qwen2.5-vl', 'gemma-3'],
    },
    fast: {
      label: '⚡ Fast',
      sys: 'Be vivid but concise. Quick replies, strong presence, no filler.',
      modelHints: ['8b', '9b', '7b', 'nemo', 'mini'],
    },
  };

  window.applyGoddessPreset = function (key) {
    const p = GODDESS[key];
    if (!p) return;
    const ta = document.getElementById('system-prompt-input');
    if (ta) {
      const mem = memorySystemPrefix();
      ta.value = mem + p.sys;
      try {
        localStorage.setItem('ai-pro-sysprompt', ta.value);
      } catch (_) {}
    }
    // pick model by hint
    const pool =
      typeof allModels !== 'undefined' && allModels.length
        ? allModels
        : [];
    let pick = null;
    for (const h of p.modelHints) {
      pick = pool.find(
        (m) =>
          m.on_plan !== false &&
          String(m.id).toLowerCase().includes(h.toLowerCase())
      );
      if (pick) break;
    }
    if (!pick && pool[0]) pick = pool[0];
    if (pick && document.getElementById('model-select')) {
      if (typeof ensureOption === 'function') {
        /* no-op if missing */
      }
      const sel = document.getElementById('model-select');
      if (![...sel.options].some((o) => o.value === pick.id)) {
        const o = document.createElement('option');
        o.value = pick.id;
        o.textContent = pick.display || pick.id;
        sel.appendChild(o);
      }
      sel.value = pick.id;
      sel.dispatchEvent(new Event('change'));
    }
    localStorage.setItem('ai-pro-goddess', key);
    if (typeof showToast === 'function') showToast('Goddess mode: ' + p.label);
    logActivity('info', 'Goddess preset → ' + key);
  };

  window.routeModelTask = function (task) {
    const map = {
      rp: ['hermes', 'noromaid', 'lumimaid', 'magnum', 'dolphin', 'stheno'],
      vision: ['vl', 'vision', 'llava', 'gemma-3'],
      uncensored: ['heretic', 'uncensored', 'abliterated', 'unhinged', 'dolphin'],
      coding: ['coder', 'code', 'deepseek-coder', 'qwen2.5-coder'],
      analysis: ['r1', '72b', '70b', 'reason'],
    };
    const hints = map[task] || [];
    const pool = typeof allModels !== 'undefined' ? allModels : [];
    let pick = null;
    for (const h of hints) {
      pick = pool.find(
        (m) =>
          m.on_plan !== false && String(m.id).toLowerCase().includes(h)
      );
      if (pick) break;
    }
    if (!pick) {
      if (typeof showToast === 'function')
        showToast('Load models first, then route', 'err');
      return;
    }
    const sel = document.getElementById('model-select');
    if (sel) {
      if (![...sel.options].some((o) => o.value === pick.id)) {
        const o = document.createElement('option');
        o.value = pick.id;
        o.textContent = pick.display || pick.id;
        sel.appendChild(o);
      }
      sel.value = pick.id;
      sel.dispatchEvent(new Event('change'));
    }
    if (typeof showToast === 'function')
      showToast('Routed (' + task + '): ' + pick.id);
    logActivity('info', 'Router ' + task + ' → ' + pick.id);
  };

  // ── Export ──
  window.exportThroneBundle = function () {
    const payload = {
      exportedAt: new Date().toISOString(),
      brand: '1N8BillionXXL',
      chatHistory: typeof chatHistory !== 'undefined' ? chatHistory : [],
      activityLog: logLines.slice(-200),
      lastChatDebug: window.__lastChatDebug || null,
      memory: getContinuityMemory(),
      provider: typeof currentProvider !== 'undefined' ? currentProvider : null,
      model: document.getElementById('model-select')?.value || null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '1n8-throne-export-' + Date.now() + '.json';
    a.click();
    logActivity('info', 'Exported throne bundle');
  };

  // ── Model battle ──
  window.runModelBattle = async function () {
    const text = document.getElementById('msg-input')?.value.trim();
    if (!text) {
      if (typeof showToast === 'function')
        showToast('Type a prompt first for battle', 'err');
      return;
    }
    const key = typeof getKey === 'function' ? getKey() : '';
    if (!key && currentProvider !== 'pollinations') {
      if (typeof showToast === 'function') showToast('Save API key first', 'err');
      return;
    }
    const pool = (typeof allModels !== 'undefined' ? allModels : []).filter(
      (m) => m.on_plan !== false
    );
    if (pool.length < 2) {
      if (typeof showToast === 'function')
        showToast('Load at least 2 models', 'err');
      return;
    }
    const a = pool[0].id;
    const b = pool[Math.min(1, pool.length - 1)].id;
    if (typeof addMsg === 'function')
      addMsg('system', '⚔️ Model battle: ' + a + ' vs ' + b);
    logActivity('info', 'Battle start ' + a + ' vs ' + b);
    const msgs = [{ role: 'user', content: text }];
    const maxTok =
      parseInt(document.getElementById('max-tokens-select')?.value) || 2048;
    const d1 = addMsg('ai', '__thinking__');
    const d2 = addMsg('ai', '__thinking__');
    try {
      const t1 = await chatCompletionRobust(
        key || 'x',
        a,
        msgs,
        document.getElementById('system-prompt-input')?.value || '',
        maxTok,
        d1,
        ++chatSendSeq
      );
      paintAiBubble(d1, '【' + a + '】\n\n' + (t1 || '(empty)'), {
        markdown: true,
      });
    } catch (e) {
      paintAiBubble(d1, '【' + a + '】\n❌ ' + e.message, { err: true });
    }
    try {
      const t2 = await chatCompletionRobust(
        key || 'x',
        b,
        msgs,
        document.getElementById('system-prompt-input')?.value || '',
        maxTok,
        d2,
        ++chatSendSeq
      );
      paintAiBubble(d2, '【' + b + '】\n\n' + (t2 || '(empty)'), {
        markdown: true,
      });
    } catch (e) {
      paintAiBubble(d2, '【' + b + '】\n❌ ' + e.message, { err: true });
    }
  };

  // ── Prompt alchemist ──
  window.alchemyImagePrompt = async function () {
    const inp = document.getElementById('img-prompt');
    if (!inp || !inp.value.trim()) {
      if (typeof showToast === 'function')
        showToast('Enter a short image idea first', 'err');
      return;
    }
    const key = typeof getKey === 'function' ? getKey() : '';
    const model = document.getElementById('model-select')?.value;
    if (!key || !model) {
      if (typeof showToast === 'function')
        showToast('Need API key + chat model', 'err');
      return;
    }
    if (typeof showToast === 'function') showToast('Alchemizing prompt…');
    logActivity('info', 'Prompt alchemist start');
    const sys =
      'Rewrite the user idea into a premium image prompt: cinematic lighting, composition, materials, mood. Also give a short negative prompt. Format:\nPROMPT: ...\nNEGATIVE: ...';
    const fake = document.createElement('div');
    try {
      const out = await chatCompletionRobust(
        key,
        model,
        [{ role: 'user', content: inp.value.trim() }],
        sys,
        1024,
        fake,
        ++chatSendSeq
      );
      const pm = /PROMPT:\s*([\s\S]*?)(?=NEGATIVE:|$)/i.exec(out || '');
      const nm = /NEGATIVE:\s*([\s\S]*?)$/i.exec(out || '');
      if (pm) inp.value = pm[1].trim();
      const neg = document.getElementById('img-negative-prompt');
      if (neg && nm) neg.value = nm[1].trim();
      if (typeof showToast === 'function') showToast('Prompt enhanced');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message, 'err');
      logActivity('error', e.message);
    }
  };

  // ── Throne mode ──
  window.setThroneMode = function (on) {
    throneOn = !!on;
    document.body.classList.toggle('throne-mode', throneOn);
    document.documentElement.classList.toggle('throne-mode', throneOn);
    localStorage.setItem('ai-pro-throne', throneOn ? '1' : '0');
    const fab = document.getElementById('throne-fab');
    if (fab) fab.classList.toggle('active', throneOn);
  };
  window.toggleThroneMode = function () {
    setThroneMode(!throneOn);
  };

  function injectChrome() {
    // Favicon
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = ASSETS.logo;

    // Header logo
    const logo = document.getElementById('logo');
    if (logo && !logo.querySelector('img')) {
      logo.innerHTML =
        '<img src="' +
        ASSETS.logo +
        '" alt="1N8BillionXXL" class="brand-logo-img"/><span class="brand-wordmark">1N8BillionXXL</span>';
    }

    // Header log button
    const top = document.getElementById('header-top');
    if (top && !document.getElementById('btn-activity-log')) {
      const b = document.createElement('button');
      b.id = 'btn-activity-log';
      b.className = 'header-icon-btn';
      b.title = 'Activity log';
      b.textContent = '📋';
      b.onclick = () => toggleActivityLog();
      const ht = document.getElementById('header-toggle');
      top.insertBefore(b, ht || null);
    }

    // Chat watermark + jump chip + goddess bar
    const panel = document.getElementById('panel-chat');
    if (panel && !document.getElementById('chat-watermark')) {
      const wm = document.createElement('div');
      wm.id = 'chat-watermark';
      wm.innerHTML = '<img src="' + ASSETS.logo + '" alt=""/>';
      panel.appendChild(wm);
    }
    if (panel && !document.getElementById('jump-latest-chip')) {
      const j = document.createElement('button');
      j.id = 'jump-latest-chip';
      j.type = 'button';
      j.textContent = '↓ Latest';
      j.onclick = jumpToLatestChat;
      panel.appendChild(j);
    }

    const chatBottom = document.getElementById('chat-bottom');
    if (chatBottom && !document.getElementById('goddess-bar')) {
      const bar = document.createElement('div');
      bar.id = 'goddess-bar';
      bar.innerHTML = `
        <div class="goddess-chips">
          <button type="button" data-g="default">👑 Default</button>
          <button type="button" data-g="quality">✨ HQ</button>
          <button type="button" data-g="extreme">🔥 Extreme</button>
          <button type="button" data-g="vision">🖼️ Vision</button>
          <button type="button" data-g="fast">⚡ Fast</button>
        </div>
        <div class="router-chips">
          <button type="button" data-r="rp">RP</button>
          <button type="button" data-r="uncensored">Uncensored</button>
          <button type="button" data-r="vision">Vision</button>
          <button type="button" data-r="coding">Code</button>
          <button type="button" data-r="analysis">Analysis</button>
          <button type="button" id="btn-battle">⚔️ Battle</button>
        </div>`;
      chatBottom.insertBefore(bar, chatBottom.firstChild);
      bar.querySelectorAll('[data-g]').forEach((btn) => {
        btn.onclick = () => applyGoddessPreset(btn.getAttribute('data-g'));
      });
      bar.querySelectorAll('[data-r]').forEach((btn) => {
        btn.onclick = () => routeModelTask(btn.getAttribute('data-r'));
      });
      document.getElementById('btn-battle').onclick = () => runModelBattle();
    }

    // Activity log drawer
    if (!document.getElementById('activity-log-drawer')) {
      const d = document.createElement('div');
      d.id = 'activity-log-drawer';
      d.innerHTML = `
        <div class="alog-head">
          <strong>⚡ Live activity log</strong>
          <div class="alog-actions">
            <button type="button" onclick="copyActivityLog()">Copy</button>
            <button type="button" onclick="clearActivityLog()">Clear</button>
            <button type="button" onclick="toggleActivityLog(false)">✕</button>
          </div>
        </div>
        <div id="activity-log-body" class="alog-body"></div>`;
      document.body.appendChild(d);
    }

    // Throne FAB
    if (!document.getElementById('throne-fab')) {
      const fab = document.createElement('button');
      fab.id = 'throne-fab';
      fab.type = 'button';
      fab.title = 'Throne Mode';
      fab.innerHTML = '👑';
      fab.onclick = toggleThroneMode;
      document.body.appendChild(fab);
    }

    // Image alchemist button
    const imgPrompt = document.getElementById('img-prompt');
    if (imgPrompt && !document.getElementById('btn-alchemy')) {
      const wrap = imgPrompt.closest('.field-group') || imgPrompt.parentElement;
      const b = document.createElement('button');
      b.id = 'btn-alchemy';
      b.type = 'button';
      b.className = 'action-btn secondary';
      b.style.marginTop = '8px';
      b.textContent = '✨ Alchemize prompt (Comfy/Flux)';
      b.onclick = alchemyImagePrompt;
      wrap?.appendChild(b);
    }

    // Settings throne block
    const settings = document.querySelector('#panel-settings .tab-content');
    if (settings && !document.getElementById('throne-settings')) {
      const box = document.createElement('div');
      box.id = 'throne-settings';
      box.className = 'settings-group';
      box.innerHTML = `
        <div class="settings-group-title">1N8BillionXXL Throne</div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">Throne Mode (gold & black brand)</div>
          <div class="setting-desc">Luxurious private throne room look</div></div>
          <div class="toggle ${throneOn ? 'on' : ''}" id="toggle-throne" onclick="(function(el){el.classList.toggle('on');setThroneMode(el.classList.contains('on'));})(this)"></div>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">Follow AI output while typing</div>
          <div class="setting-desc">When off, the page will not keep dragging you to the bottom. When on, only follows if you are already near the bottom.</div></div>
          <div class="toggle ${settings.autoscroll !== false ? 'on' : ''}" id="toggle-autoscroll-hint" style="pointer-events:none;opacity:.5"></div>
        </div>
        <p class="setting-desc" style="margin:8px 0">Use the existing <strong>Auto-scroll</strong> toggle above to enable/disable follow. Smart unpin: scroll up mid-reply to stop lock.</p>
        <div class="section-label">Continuity memory (pinned facts)</div>
        <textarea id="continuity-memory" class="field" rows="3" placeholder="One fact per line — injected into every chat"></textarea>
        <div class="history-actions" style="margin-top:8px">
          <button class="history-btn" type="button" id="btn-save-memory">💾 Save memory</button>
          <button class="history-btn" type="button" id="btn-open-log">📋 Activity log</button>
          <button class="history-btn" type="button" id="btn-export-throne">⬇ Export bundle</button>
        </div>`;
      settings.insertBefore(box, settings.firstChild);
      const memTa = document.getElementById('continuity-memory');
      if (memTa) memTa.value = getContinuityMemory().join('\n');
      document.getElementById('btn-save-memory').onclick = () => {
        const lines = (document.getElementById('continuity-memory').value || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        saveContinuityMemory(lines);
        if (typeof showToast === 'function') showToast('Memory saved');
      };
      document.getElementById('btn-open-log').onclick = () =>
        toggleActivityLog(true);
      document.getElementById('btn-export-throne').onclick = exportThroneBundle;
    }

    // Patch settings label for autoscroll
    const autoName = document.querySelector('#toggle-autoscroll')
      ?.closest('.setting-row')
      ?.querySelector('.setting-name');
    if (autoName) autoName.textContent = 'Follow AI output';
    const autoDesc = document.querySelector('#toggle-autoscroll')
      ?.closest('.setting-row')
      ?.querySelector('.setting-desc');
    if (autoDesc)
      autoDesc.textContent =
        'When on: stick to bottom only if you are already near the latest message. Scroll up anytime to unpin. When off: never auto-follow.';

    document.title = '1N8BillionXXL · Throne';
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', '#000000');
  }

  // Wrap sendChat to inject memory + log
  function patchSendChat() {
    if (typeof window.sendChat !== 'function' || window.sendChat.__throne) return;
    const orig = window.sendChat;
    window.sendChat = async function () {
      logActivity('info', 'SEND tapped');
      userPinnedToBottom = true;
      const ta = document.getElementById('system-prompt-input');
      const mem = memorySystemPrefix();
      let restore = null;
      if (ta && mem) {
        restore = ta.value;
        if (!ta.value.includes('Continuity memory')) {
          ta.value = mem + ta.value;
        }
      }
      try {
        return await orig.apply(this, arguments);
      } finally {
        if (restore != null && ta) ta.value = restore;
      }
    };
    window.sendChat.__throne = true;
  }

  // Patch setLastError / robust status if present later
  function patchChatStatusHooks() {
    if (typeof window.chatCompletionRobust === 'function' && !window.chatCompletionRobust.__throne) {
      const orig = window.chatCompletionRobust;
      window.chatCompletionRobust = async function (
        key,
        model,
        messages,
        systemPrompt,
        maxTokens,
        targetDiv,
        seq
      ) {
        if (targetDiv && typeof setThinkingStatus === 'function') {
          targetDiv.className = 'msg ai thinking';
          targetDiv.innerHTML = '';
          setThinkingStatus(targetDiv, '⏳ Contacting ' + model + '…', true);
        }
        logActivity('info', 'Robust chat start · ' + model, { maxTokens });
        // Monkey status via wrapping attempts: we intercept by temporary override of setThinking from inside if we patch at lower level
        const result = await orig.apply(this, arguments);
        if (targetDiv && typeof finishThinkingPanel === 'function') {
          finishThinkingPanel(targetDiv, true);
        }
        logActivity(
          result ? 'ok' : 'warn',
          result
            ? 'Reply ok · ' + String(result).length + ' chars · ' + model
            : 'Empty reply · ' + model
        );
        return result;
      };
      window.chatCompletionRobust.__throne = true;
    }

    // Prefer maybeAutoscroll over forced scroll
    if (typeof window.processStreamReader === 'function' && !window.__scrollHookNote) {
      window.__scrollHookNote = true;
      // stream path already in index; we override maybeAutoscroll usage by patching Element scroll in send path via MutationObserver alternative:
      // Patch addMsg autoscroll
    }
  }

  // Patch processStreamReader autoscroll - replace global settings.autoscroll usage by wrapping
  // Easiest: observe chat-messages child updates and call maybeAutoscroll
  function wireMutationScroll() {
    const msgs = document.getElementById('chat-messages');
    if (!msgs || msgs.__mo) return;
    msgs.__mo = true;
    const mo = new MutationObserver(() => maybeAutoscroll(msgs));
    mo.observe(msgs, { childList: true, subtree: true, characterData: true });
  }

  function bootstrap() {
    injectChrome();
    wireChatScroll();
    wireMutationScroll();
    setThroneMode(throneOn);
    patchSendChat();
    patchChatStatusHooks();
    // re-patch after a tick in case index redefined later (it won't)
    setTimeout(patchChatStatusHooks, 500);
    // Hide any late-injected duplicate routing row
    setTimeout(() => {
      const dup = document.getElementById('route-reco-row');
      if (dup && document.getElementById('goddess-bar')) dup.style.display = 'none';
    }, 800);
    // Phone: ensure header collapsed when key already present
    try {
      const small = window.matchMedia('(max-width:768px),(max-height:700px)').matches;
      const keys = JSON.parse(localStorage.getItem('ai-pro-keys') || '{}');
      const hasKey = Object.keys(keys).some((k) => k !== '__customBase' && keys[k]);
      if (small && hasKey && typeof headerExpanded !== 'undefined') {
        headerExpanded = false;
        if (typeof collapseHeader === 'function') collapseHeader();
        document.body.classList.add('compact-ui');
      }
    } catch (_) {}
    logActivity('info', 'Throne systems online');
    const g = localStorage.getItem('ai-pro-goddess');
    // don't auto-apply system overwrite on load
    if (g && GODDESS[g]) {
      document
        .querySelectorAll('#goddess-bar [data-g="' + g + '"]')
        .forEach((b) => b.classList.add('active'));
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', bootstrap);
  else setTimeout(bootstrap, 0);
})();
