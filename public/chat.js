(() => {
  const GREETING = 'Hi! I can help with university courses, scholarship criteria, application fee waivers, English test exemptions like WAEC/NECO, stay-back visas and student living costs. I can make mistakes, so always confirm details on the official page.';
  const KEYS = ['title','host_institution','provider','country','funding_type','deadline','eligibility_text','minimum_cgpa','application_fee_waiver','english_proficiency_exemptions','stay_back_visa_duration','in_study_work_allowance','local_cost_of_living_estimate','source_url'];
  let ctx = null, hist = [], busy = false;
  const $c = id => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  function add(role, text) { const m = el('div', 'msg ' + role, text), box = $c('cm'); box.appendChild(m); box.scrollTop = box.scrollHeight; return m; }
  function toggle(open) { $c('cb').hidden = !open; $c('cf').hidden = open; $c('cf').setAttribute('aria-expanded', String(open)); if (open) $c('ci').focus(); }
  function showCtx() {
    const c = $c('cc'); c.textContent = '';
    if (!ctx) { c.hidden = true; return; }
    c.hidden = false; c.append('Asking about: ' + (ctx.title || 'this scholarship') + ' ');
    const b = el('button', 'chat-link', 'Clear'); b.type = 'button';
    b.onclick = () => { ctx = null; hist = []; showCtx(); }; c.appendChild(b);
  }
  async function send(ev) {
    ev.preventDefault();
    const input = $c('ci'), text = input.value.trim();
    if (!text || busy) return;
    busy = true; input.value = ''; add('user', text);
    const wait = add('bot wait', 'Thinking…');
    try {
      const r = await fetch('/api/chat', { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (localStorage.token || '') },
        body: JSON.stringify({ message: text, scholarshipContext: ctx, history: hist.slice(-6) }) });
      const j = await r.json().catch(() => ({}));
      wait.classList.remove('wait');
      if (r.ok && j.reply) { wait.textContent = j.reply; hist.push({ role: 'user', text }, { role: 'model', text: j.reply }); }
      else { wait.textContent = j.error || 'Something went wrong. Please try again.'; wait.classList.add('err'); }
    } catch { wait.classList.remove('wait'); wait.textContent = 'Could not reach the server. Check your connection.'; wait.classList.add('err'); }
    busy = false; $c('cm').scrollTop = $c('cm').scrollHeight;
  }
  function mount() {
    if ($c('chat')) return;
    const root = el('div'); root.id = 'chat';
    root.innerHTML = `<button class="chat-fab" id="cf" aria-expanded="false">Ask the Counselor</button>
    <section class="chat-box" id="cb" hidden aria-label="Scholarly AI Counselor">
      <div class="chat-head"><b>Scholarly AI Counselor</b><button id="cx" aria-label="Close chat">×</button></div>
      <div id="cm" class="chat-msgs" aria-live="polite"></div><div id="cc" class="chat-ctx" hidden></div>
      <form id="cfm" class="chat-form"><input id="ci" maxlength="800" autocomplete="off" placeholder="Ask about fees, English tests, visas, costs…" aria-label="Your question"><button class="btn" type="submit">Send</button></form>
    </section>`;
    document.body.appendChild(root);
    $c('cf').onclick = () => toggle(true); $c('cx').onclick = () => toggle(false); $c('cfm').onsubmit = send;
    add('bot', GREETING);
  }
  window.mountChat = mount;
  window.unmountChat = () => { const r = $c('chat'); if (r) r.remove(); ctx = null; hist = []; };
  window.openChat = s => { mount(); ctx = {}; KEYS.forEach(k => { if (s && s[k] != null && s[k] !== '') ctx[k] = s[k]; }); hist = []; showCtx(); toggle(true); };
})();
