(function(){
  const LS={
    onboarded:'ai-pro-onboarded-v2',
    rememberKeys:'ai-pro-remember-keys',
    sessions:'ai-pro-sessions-v1',
    pinned:'ai-pro-pinned-v1'
  };
  const $=(s)=>document.querySelector(s);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const providerDefaults=()=>{ try{return (typeof PROVIDER_DEFAULTS!=='undefined'&&PROVIDER_DEFAULTS)||{};}catch(_){return {};} };

  const style=document.createElement('style');
  style.textContent=`
  .ux-inline-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
  .ux-inline-actions button{background:var(--bg4);border:1px solid var(--border2);color:var(--text2);padding:6px 10px;border-radius:var(--radius);font-size:11px;cursor:pointer}
  .ux-inline-actions button:hover{background:var(--bg5);color:var(--text)}
  .ux-chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;padding:5px 10px;font-size:11px;color:var(--text2);cursor:pointer}
  #request-metrics{font-size:10px;color:var(--text3);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55vw}
  #setup-wizard{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:none;align-items:center;justify-content:center;padding:16px}
  #setup-wizard.show{display:flex}
  .setup-card{width:min(560px,100%);background:var(--bg2);border:1px solid var(--border2);border-radius:14px;box-shadow:var(--shadow);padding:14px}
  .setup-row{margin:10px 0}
  .setup-row label{display:block;font-size:11px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.6px}
  .setup-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .setup-actions button{background:var(--accent);color:#fff;border:none;padding:8px 12px;border-radius:8px;font-size:12px;cursor:pointer}
  .setup-actions button.secondary{background:var(--bg4);color:var(--text2);border:1px solid var(--border2)}
  .setup-note{font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5}
  .workspace-box{background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:10px;margin-top:10px}
  .workspace-list{display:flex;flex-direction:column;gap:8px;max-height:170px;overflow:auto}
  .workspace-item{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;background:var(--bg4);padding:8px;border-radius:8px}
  .workspace-item small{color:var(--text3)}
  .workspace-item button{background:transparent;border:1px solid var(--border2);color:var(--text2);padding:4px 8px;border-radius:8px;cursor:pointer;font-size:11px}
  `;
  document.head.appendChild(style);

  function normalizeErrorMessage(err){
    const msg=(err&&err.message)||String(err||'Unknown error');
    if(/429|rate/i.test(msg)) return 'Rate limited. Please retry in a few seconds.';
    if(/401|unauthor/i.test(msg)) return 'Authentication failed. Check your API key and provider.';
    if(/403|forbidden/i.test(msg)) return 'Request was forbidden. Verify model and account permissions.';
    if(/cors/i.test(msg)) return 'Request blocked by CORS. Use a compatible endpoint or proxy.';
    if(/failed to fetch|network|TypeError/i.test(msg)) return 'Network/CORS issue while contacting provider.';
    if(/5\d\d|server error/i.test(msg)) return 'Provider is temporarily unavailable. Please retry soon.';
    return msg;
  }

  const metrics={count:0,failed:0,lastMs:0,last:''};
  function paintMetrics(){
    let el=$('#request-metrics');
    if(!el){
      el=document.createElement('div');
      el.id='request-metrics';
      ($('#header-top')||document.body).appendChild(el);
    }
    const ok=Math.max(0,metrics.count-metrics.failed);
    const success=metrics.count?Math.round((ok/metrics.count)*100):100;
    el.textContent=`Req ${metrics.count} · OK ${success}% · ${metrics.lastMs}ms ${metrics.last?`· ${metrics.last}`:''}`;
  }

  if(typeof fetchWithRetry==='function'){
    const base=fetchWithRetry;
    window.fetchWithRetry=async function(url,options,maxRetries){
      const t=performance.now();
      metrics.count++;
      try{
        const res=await base(url,options,maxRetries);
        metrics.lastMs=Math.round(performance.now()-t);
        metrics.last=`HTTP ${res.status}`;
        paintMetrics();
        return res;
      }catch(e){
        metrics.failed++;
        metrics.lastMs=Math.round(performance.now()-t);
        metrics.last='ERR';
        paintMetrics();
        e.message=normalizeErrorMessage(e);
        throw e;
      }
    };
    paintMetrics();
  }

  function ensureOption(sel,val){
    if(!sel||!val) return;
    if(![...sel.options].some(o=>o.value===val)){
      const o=document.createElement('option');o.value=val;o.textContent=val;sel.appendChild(o);
    }
    sel.value=val;
  }

  function buildWizard(){
    const wrapper=document.createElement('div');
    wrapper.id='setup-wizard';
    wrapper.innerHTML=`
      <div class="setup-card">
        <h3 style="font-size:16px;margin-bottom:6px">✨ Quick setup (under 60 seconds)</h3>
        <p style="font-size:12px;color:var(--text2);margin-bottom:8px">Pick a provider, add a key, choose a model, and run a quick test.</p>
        <div class="setup-row"><label>Provider</label><select id="setup-provider" class="field"></select></div>
        <div class="setup-row"><label>API key</label><input id="setup-key" class="field" type="password" placeholder="Paste key (not required for Pollinations)"/></div>
        <div class="setup-row"><label>Model</label><select id="setup-model" class="field"></select></div>
        <div class="setup-row"><label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0"><input type="checkbox" id="setup-remember"/> Remember key on this device</label></div>
        <div id="setup-status" class="status-msg" style="margin-bottom:0"></div>
        <div class="setup-actions">
          <button id="setup-test" type="button">Test connection</button>
          <button id="setup-save" type="button">Save & continue</button>
          <button id="setup-skip" type="button" class="secondary">Skip for now</button>
        </div>
        <p class="setup-note">Privacy: keys are kept in local browser storage only. You can clear them anytime from Settings.</p>
      </div>`;
    document.body.appendChild(wrapper);

    const srcSel=$('#provider-select');
    const pSel=$('#setup-provider');
    pSel.innerHTML=srcSel.innerHTML;

    const mSel=$('#setup-model');
    const rememberEl=$('#setup-remember');
    rememberEl.checked=localStorage.getItem(LS.rememberKeys)!=='0';

    function fillModels(){
      const p=pSel.value;
      const defs=(providerDefaults()[p]||[]).slice(0,20);
      mSel.innerHTML='';
      if(!defs.length){mSel.innerHTML='<option value="">Use Load Models later</option>';return;}
      defs.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;mSel.appendChild(o);});
      if(defs[0])mSel.value=defs[0];
    }
    pSel.addEventListener('change',fillModels);
    fillModels();

    $('#setup-test').onclick=async()=>{
      const st=$('#setup-status');
      st.className='status-msg info show';
      st.textContent='Testing...';
      try{
        const p=pSel.value;
        const key=$('#setup-key').value.trim();
        if(p==='pollinations'){
          const r=await fetch('https://text.pollinations.ai/models');
          if(!r.ok) throw new Error('HTTP '+r.status);
          st.className='status-msg ok show';
          st.textContent='✅ Connection looks good (free provider).';
          return;
        }
        if(!key) throw new Error('Enter an API key first.');
        const base=(typeof PROVIDER_BASES!=='undefined'&&PROVIDER_BASES[p])||'';
        if(!base) throw new Error('No base URL configured for provider.');
        const r=await fetchWithRetry(base+'/models',{headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}},1);
        if(!r.ok) throw new Error('HTTP '+r.status);
        st.className='status-msg ok show';
        st.textContent='✅ Test call succeeded.';
      }catch(e){
        st.className='status-msg err show';
        st.textContent='❌ '+normalizeErrorMessage(e);
      }
    };

    $('#setup-save').onclick=()=>{
      const provider=pSel.value;
      const key=$('#setup-key').value.trim();
      const model=mSel.value;
      localStorage.setItem(LS.rememberKeys,rememberEl.checked?'1':'0');

      $('#provider-select').value=provider;
      onProviderChange(true);
      if(key){
        if(rememberEl.checked){
          $('#api-key-input').value=key;
          saveKey();
        }else{
          savedKeys[provider]=key;
          showToast('Key set for current session only');
        }
      }
      const mainModel=$('#model-select');
      ensureOption(mainModel,model||((providerDefaults()[provider]||[])[0]||''));
      try{localStorage.setItem('ai-pro-model',mainModel.value);}catch(_){ }
      localStorage.setItem(LS.onboarded,'1');
      wrapper.classList.remove('show');
      showToast('✅ Setup complete. You are ready to go.');
    };

    $('#setup-skip').onclick=()=>{
      localStorage.setItem(LS.onboarded,'1');
      wrapper.classList.remove('show');
    };

    const hasOnboard=localStorage.getItem(LS.onboarded)==='1';
    if(!hasOnboard) wrapper.classList.add('show');
  }

  function smartDefaults(){
    const modelSel=$('#model-select');
    if(modelSel && !modelSel.value){
      const defs=providerDefaults()[currentProvider]||[];
      if(defs[0]) ensureOption(modelSel,defs[0]);
    }
    if($('#img-prompt')&&!$('#img-prompt').value) $('#img-prompt').value='Cinematic product photo, dramatic lighting, ultra detailed';
    if($('#edit-instruction')&&!$('#edit-instruction').value) $('#edit-instruction').value='Improve clarity and keep the same meaning.';
    if($('#combine-instruction')&&!$('#combine-instruction').value) $('#combine-instruction').value='Summarize key insights and highlight differences.';
    if($('#video-prompt')&&!$('#video-prompt').value) $('#video-prompt').value='Summarize what happens and list key timestamps.';
  }

  const PRESETS={
    chat:{
      'Code helper':'Write concise, production-ready code with edge cases.',
      'Research analyst':'Give a structured analysis with assumptions and risks.',
      'Data forensics':'Extract anomalies, evidence trails, and likely causes.'
    },
    image:{
      'Product render':'Premium product photo on neutral background, studio lighting, sharp focus',
      'Cinematic scene':'Epic cinematic frame, volumetric light, rich color grading',
      'Anime art':'Anime illustration, dynamic composition, clean linework'
    },
    edit:{
      'Rewrite concise':'Rewrite to be concise and clear while preserving meaning.',
      'Translate (EN→FR)':'Translate to French with natural tone.',
      'Convert to JSON':'Convert content into valid JSON schema.'
    },
    video:{
      'Transcript + summary':'Transcribe first, then summarize key points.',
      'QA mode':'Answer the prompt with precise timestamps if available.',
      'Action items':'Extract action items and decisions.'
    }
  };

  function injectPresetUI(){
    const map=[
      {panel:'#panel-chat .tab-scroll, #panel-chat', id:'chat-preset', target:'#msg-input', key:'chat'},
      {panel:'#panel-image .tab-content', id:'image-preset', target:'#img-prompt', key:'image'},
      {panel:'#panel-edit .tab-content', id:'edit-preset', target:'#edit-instruction', key:'edit'},
      {panel:'#panel-video .tab-content', id:'video-preset', target:'#video-prompt', key:'video'}
    ];
    map.forEach(({panel,id,target,key})=>{
      if(document.getElementById(id)) return;
      const host=document.querySelector(panel);
      const t=document.querySelector(target);
      if(!host||!t) return;
      const wrap=document.createElement('div');
      wrap.className='ux-inline-actions';
      wrap.innerHTML=`<select id="${id}" class="field" style="max-width:280px"><option value="">Quick preset...</option></select><button type="button" data-apply="${id}">Apply</button><button type="button" data-example="${key}">Load example</button>`;
      (host.firstElementChild||host).prepend(wrap);
      const sel=wrap.querySelector('select');
      Object.keys(PRESETS[key]||{}).forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});
      wrap.querySelector('[data-apply]').onclick=()=>{if(sel.value){t.value=PRESETS[key][sel.value];t.dispatchEvent(new Event('input'));}};
      wrap.querySelector('[data-example]').onclick=()=>applyExample(key);
    });
  }

  function applyExample(key){
    if(key==='chat') $('#msg-input').value='Summarize this idea in 5 bullets and then propose 3 next steps.';
    if(key==='image') $('#img-prompt').value='Futuristic electric sports car in rain, neon reflections, photorealistic';
    if(key==='edit'){
      $('#edit-source').value='This app is good but hard for new users to learn quickly.';
      $('#edit-instruction').value='Rewrite as polished product copy.';
    }
    if(key==='video'){
      $('#video-url').value='https://example.com/video.mp4';
      $('#video-prompt').value='Describe scenes and provide an executive summary.';
    }
    showToast('Example loaded');
  }

  function mountWorkspaceMemory(){
    const settingsPanel=$('#panel-settings .tab-content');
    if(!settingsPanel||$('#workspace-memory')) return;
    const box=document.createElement('div');
    box.id='workspace-memory';
    box.className='workspace-box';
    box.innerHTML=`
      <div class="section-label" style="margin-top:0">Workspace Memory</div>
      <div class="ux-inline-actions">
        <button id="save-session-btn">💾 Save chat session</button>
        <button id="clear-keys-btn">🧹 Clear saved keys</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Saved sessions</div>
      <div id="saved-session-list" class="workspace-list"></div>
      <div style="font-size:11px;color:var(--text3);margin:8px 0 6px">Pinned outputs</div>
      <div id="pinned-output-list" class="workspace-list"></div>`;
    settingsPanel.appendChild(box);

    $('#save-session-btn').onclick=()=>{
      const sessions=JSON.parse(localStorage.getItem(LS.sessions)||'[]');
      const title=prompt('Session name?','Session '+new Date().toLocaleString());
      if(!title) return;
      sessions.unshift({id:Date.now(),title,messages:(chatHistory||[]).slice(-40),ts:new Date().toISOString()});
      localStorage.setItem(LS.sessions,JSON.stringify(sessions.slice(0,20)));
      renderSessions();
      showToast('Session saved');
    };

    $('#clear-keys-btn').onclick=()=>{
      if(!confirm('Clear all saved API keys from this browser?')) return;
      savedKeys={};
      try{localStorage.removeItem('ai-pro-keys');}catch(_){ }
      onProviderChange(false);
      showToast('Saved keys cleared');
    };

    function renderSessions(){
      const root=$('#saved-session-list');
      const sessions=JSON.parse(localStorage.getItem(LS.sessions)||'[]');
      if(!sessions.length){root.innerHTML='<div style="color:var(--text3);font-size:12px">No saved sessions yet.</div>';return;}
      root.innerHTML=sessions.map(s=>`<div class="workspace-item"><div><div>${esc(s.title)}</div><small>${new Date(s.ts).toLocaleString()} · ${s.messages.length} msgs</small></div><div><button data-load="${s.id}">Load</button> <button data-del="${s.id}">Delete</button></div></div>`).join('');
      root.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{
        const id=Number(b.getAttribute('data-load'));
        const s=sessions.find(x=>x.id===id); if(!s) return;
        chatHistory=s.messages||[];
        const chat=$('#chat-messages');
        chat.innerHTML='';
        (chatHistory||[]).forEach(m=>addMsg(m.role==='assistant'?'ai':'user', typeof m.content==='string'?m.content:JSON.stringify(m.content)));
        showToast('Session loaded');
      });
      root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
        const id=Number(b.getAttribute('data-del'));
        const next=sessions.filter(x=>x.id!==id);
        localStorage.setItem(LS.sessions,JSON.stringify(next));
        renderSessions();
      });
    }

    function renderPins(){
      const root=$('#pinned-output-list');
      const pins=JSON.parse(localStorage.getItem(LS.pinned)||'[]');
      if(!pins.length){root.innerHTML='<div style="color:var(--text3);font-size:12px">No pinned outputs yet.</div>';return;}
      root.innerHTML=pins.map(p=>`<div class="workspace-item"><div><div>${esc(p.label)}</div><small>${new Date(p.ts).toLocaleString()}</small></div><div><button data-copy="${p.id}">Copy</button> <button data-del="${p.id}">Delete</button></div></div>`).join('');
      root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{
        const p=pins.find(x=>x.id===Number(b.getAttribute('data-copy')));if(!p)return;
        navigator.clipboard?.writeText(p.text||'');showToast('Pinned output copied');
      });
      root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
        const next=pins.filter(x=>x.id!==Number(b.getAttribute('data-del')));
        localStorage.setItem(LS.pinned,JSON.stringify(next));renderPins();
      });
    }

    window.__renderPins=renderPins;
    renderSessions();renderPins();
  }

  function pinOutput(label,text){
    if(!text||!text.trim()) return showToast('Nothing to pin yet','err');
    const pins=JSON.parse(localStorage.getItem(LS.pinned)||'[]');
    pins.unshift({id:Date.now(),label,text:text.slice(0,20000),ts:new Date().toISOString()});
    localStorage.setItem(LS.pinned,JSON.stringify(pins.slice(0,40)));
    if(window.__renderPins) window.__renderPins();
    showToast('Pinned to workspace');
  }

  function mountOutputActions(){
    const actions=[
      {target:'#edit-result', run:'runEdit', tweak:'#edit-instruction', label:'Edit result'},
      {target:'#combine-result', run:'runCombine', tweak:'#combine-instruction', label:'Combine result'},
      {target:'#video-result', run:'runVideo', tweak:'#video-prompt', label:'Video result'},
      {target:'#uni-raw-response', run:'uniSendRequest', tweak:'#uni-body', label:'API response'}
    ];
    actions.forEach(a=>{
      const field=$(a.target); if(!field||field.dataset.uxActions) return;
      field.dataset.uxActions='1';
      const bar=document.createElement('div');
      bar.className='ux-inline-actions';
      bar.innerHTML='<button type="button">📌 Pin</button><button type="button">⬇ Export</button><button type="button">🆚 Compare</button><button type="button">🔁 Retry + tweak</button>';
      field.parentElement?.appendChild(bar);
      const [pin,exp,cmp,retry]=bar.querySelectorAll('button');
      pin.onclick=()=>pinOutput(a.label,field.value||field.textContent||'');
      exp.onclick=()=>{
        const blob=new Blob([field.value||field.textContent||''],{type:'text/plain'});
        const x=document.createElement('a');x.href=URL.createObjectURL(blob);x.download=(a.label.toLowerCase().replace(/\s+/g,'-'))+'-'+Date.now()+'.txt';x.click();
      };
      cmp.onclick=()=>{
        const prev=field.dataset.prevValue||'';
        if(!prev) return showToast('No previous output to compare','err');
        const now=field.value||'';
        alert('Previous length: '+prev.length+' chars\nCurrent length: '+now.length+' chars\nDelta: '+(now.length-prev.length));
      };
      retry.onclick=async()=>{
        const tweak=prompt('Tweak instruction/prompt before retry:', 'Make it more concise and actionable.');
        if(!tweak) return;
        const t=$(a.tweak); if(t){ t.value=(t.value? t.value+'\n':'')+'Tweak: '+tweak; }
        const fn=window[a.run]; if(typeof fn==='function') await fn();
      };
    });

    ['runEdit','runCombine','runVideo','uniSendRequest'].forEach(name=>{
      if(typeof window[name]==='function'&&!window[name].__wrapped){
        const orig=window[name];
        window[name]=async function(){
          const target=name==='runEdit'?'#edit-result':name==='runCombine'?'#combine-result':name==='runVideo'?'#video-result':'#uni-raw-response';
          const el=$(target); if(el) el.dataset.prevValue=el.value||'';
          const t0=performance.now();
          try{ return await orig.apply(this,arguments); }
          catch(e){ e.message=normalizeErrorMessage(e); throw e; }
          finally{ metrics.lastMs=Math.round(performance.now()-t0); paintMetrics(); }
        };
        window[name].__wrapped=true;
      }
    });
  }

  function mountPowerTools(){
    const chatWrap=$('#panel-chat #chat-bottom');
    if(chatWrap&&!$('#route-reco-row')){
      const row=document.createElement('div');
      row.id='route-reco-row';
      row.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px';
      row.innerHTML='<span style="font-size:11px;color:var(--text3);align-self:center">Model routing:</span><span class="ux-chip" data-task="coding">Coding</span><span class="ux-chip" data-task="analysis">Analysis</span><span class="ux-chip" data-task="creative">Creative</span><span class="ux-chip" data-task="vision">Vision</span>';
      chatWrap.prepend(row);
      row.querySelectorAll('.ux-chip').forEach(ch=>ch.onclick=()=>{
        const task=ch.getAttribute('data-task');
        const defs=providerDefaults()[currentProvider]||[];
        const pick=defs.find(m=>task==='coding'?/coder|code|codestral|deepseek/i.test(m):task==='vision'?/vision|vl/i.test(m):task==='creative'?/opus|sonnet|gpt-4o|large/i.test(m):/reason|r1|o1|o3/i.test(m))||defs[0];
        if(!pick) return showToast('Load models first','err');
        ensureOption($('#model-select'),pick);
        showToast('Recommended model selected: '+pick);
      });
    }

    const combinePanel=$('#panel-combine .tab-content');
    if(combinePanel&&!$('#automation-chain-box')){
      const box=document.createElement('div');
      box.id='automation-chain-box';
      box.className='workspace-box';
      box.innerHTML='<div class="section-label" style="margin-top:0">Automation chain</div><p style="font-size:12px;color:var(--text2);margin-bottom:8px">Run: extract → transform → summarize on current combine files.</p><button class="history-btn" id="run-chain-btn">▶ Run chain</button><div id="run-chain-status" style="font-size:11px;color:var(--text3);margin-top:8px"></div>';
      combinePanel.appendChild(box);
      $('#run-chain-btn').onclick=async()=>{
        const key=getKey();const model=$('#model-select')?.value;
        if(!key||!model) return showToast('Set key and model first','err');
        if(!Array.isArray(combineFilesData)||!combineFilesData.length) return showToast('Upload files in Combine tab first','err');
        const st=$('#run-chain-status');
        try{
          st.textContent='Step 1/3: extracting...';
          const raw=combineFilesData.map(f=>`## ${f.name}\n${f.text.slice(0,8000)}`).join('\n\n');
          const maxTok=parseInt($('#max-tokens-select')?.value)||4096;
          const sysp=$('#system-prompt-input')?.value?.trim()||'';
          const s1=await chatCompletion(key,model,[{role:'user',content:'Extract important entities, events, and facts:\n\n'+raw}],sysp,maxTok);
          st.textContent='Step 2/3: transforming...';
          const s2=await chatCompletion(key,model,[{role:'user',content:'Transform this extraction into structured bullet points:\n\n'+s1}],sysp,maxTok);
          st.textContent='Step 3/3: summarizing...';
          const s3=await chatCompletion(key,model,[{role:'user',content:'Summarize in executive format with action items:\n\n'+s2}],sysp,maxTok);
          $('#combine-result').value=s3;
          st.textContent='✅ Chain complete';
        }catch(e){ st.textContent='❌ '+normalizeErrorMessage(e); }
      };
    }

    const videoPanel=$('#panel-video .tab-content');
    if(videoPanel&&!$('#video-batch-box')){
      const box=document.createElement('div');
      box.id='video-batch-box';
      box.className='workspace-box';
      box.innerHTML='<div class="section-label" style="margin-top:0">Batch media analysis</div><textarea id="video-batch-urls" class="field" rows="3" placeholder="One URL per line"></textarea><button class="history-btn" id="run-video-batch" style="margin-top:8px">Run batch</button><div id="video-batch-status" style="font-size:11px;color:var(--text3);margin-top:8px"></div>';
      videoPanel.appendChild(box);
      $('#run-video-batch').onclick=async()=>{
        const key=getKey();const model=$('#model-select')?.value;
        if(!key||!model) return showToast('Set key and model first','err');
        const urls=($('#video-batch-urls').value||'').split(/\n+/).map(v=>v.trim()).filter(Boolean);
        if(!urls.length) return showToast('Paste at least one URL','err');
        const sysp=$('#system-prompt-input')?.value?.trim()||'';
        const maxTok=parseInt($('#max-tokens-select')?.value)||4096;
        const st=$('#video-batch-status');
        const out=[];
        for(let i=0;i<urls.length;i++){
          st.textContent=`Processing ${i+1}/${urls.length}...`;
          try{
            const ans=await chatCompletion(key,model,[{role:'user',content:`Summarize this media URL in 3 bullets: ${urls[i]}`}],sysp,maxTok);
            out.push(`URL: ${urls[i]}\n${ans}`);
          }catch(e){ out.push(`URL: ${urls[i]}\nERROR: ${normalizeErrorMessage(e)}`); }
        }
        $('#video-result').value=out.join('\n\n---\n\n');
        st.textContent='✅ Batch complete';
      };
    }
  }

  function patchPerformance(){
    const oldAddMsg=window.addMsg;
    if(typeof oldAddMsg==='function'&&!oldAddMsg.__limited){
      window.addMsg=function(){
        const node=oldAddMsg.apply(this,arguments);
        const list=document.querySelectorAll('#chat-messages .msg');
        if(list.length>140){
          [...list].slice(0,list.length-140).forEach(n=>n.remove());
        }
        return node;
      };
      window.addMsg.__limited=true;
    }

    const oldHandle=window.handleFile;
    if(typeof oldHandle==='function'&&!oldHandle.__guarded){
      window.handleFile=async function(inp){
        const file=inp?.files?inp.files[0]:inp;
        if(file&&file.size>60*1024*1024){
          showToast('Large file detected (>60MB). Processing may be slow.', 'err');
        }
        return oldHandle.apply(this,arguments);
      };
      window.handleFile.__guarded=true;
    }
  }

  function bootstrap(){
    buildWizard();
    smartDefaults();
    injectPresetUI();
    mountWorkspaceMemory();
    mountOutputActions();
    mountPowerTools();
    patchPerformance();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootstrap);
  else setTimeout(bootstrap,0);
})();
