const $=s=>document.querySelector(s), app=$('#app'), nav=$('#nav');
let token=localStorage.token, isAdmin=localStorage.admin==='1', tab='matches', data=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,method='GET',body){
  const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+(token||'')},body:body?JSON.stringify(body):undefined});
  const j=await r.json(); if(r.status===401&&token){logout();} if(!r.ok) throw new Error(j.error||'Request failed'); return j;
}
function logout(){localStorage.clear();token=null;isAdmin=false;render();}
function render(){
  nav.hidden=!token;
  if(!token){window.unmountChat&&unmountChat();return authView();}
  window.mountChat&&mountChat();
  const tabs=[['matches','Matches'],['saved','Saved'],['apps','Applications'],['profile','Profile'],...(isAdmin?[['admin','Review']]:[])];
  nav.innerHTML=tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')+'<button id="out">Sign out</button>';
  nav.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;data=[];render()});$('#out').onclick=logout;
  ({matches:matchesView,saved:savedView,apps:appsView,profile:profileView,admin:adminView})[tab]();
}
function authView(){
  if(location.hash.startsWith('#reset=')) return resetView(location.hash.slice(7));
  app.innerHTML=`<h1>Find funded master's programmes that fit your background.</h1>
  <p class="mute">We list only real opportunities from official sources, link you to the provider, and show exactly which requirements you meet. A match is not a prediction of winning.</p>
  <div class="card"><label>Email<input id="e" type="email"></label><label>Password (8+ characters)<input id="p" type="password"></label>
  <p id="msg" class="err"></p><button class="btn" id="in">Sign in</button><button class="btn alt" id="up">Create account</button><p><a href="#" id="fg">Forgot password?</a></p></div>`;
  const go=path=>async()=>{try{const r=await api(path,'POST',{email:$('#e').value,password:$('#p').value});
    token=localStorage.token=r.token;isAdmin=!!r.admin;localStorage.admin=r.admin?'1':'0';tab=path==='/register'?'profile':'matches';render();}catch(x){$('#msg').textContent=x.message}};
  $('#in').onclick=go('/login');$('#up').onclick=go('/register');$('#fg').onclick=e=>{e.preventDefault();forgotView()};
}
function forgotView(){
  app.innerHTML=`<h1>Reset your password</h1><div class="card"><label>Email<input id="e" type="email"></label><p id="msg" class="mute"></p>
  <button class="btn" id="go">Send reset link</button><button class="btn alt" id="bk">Back</button></div>`;
  $('#bk').onclick=authView;
  $('#go').onclick=async()=>{try{await api('/forgot','POST',{email:$('#e').value});$('#msg').textContent='If that email has an account, a reset link is on its way. It works for 1 hour.'}catch(x){$('#msg').textContent=x.message}};
}
function resetView(t){
  app.innerHTML=`<h1>Choose a new password</h1><div class="card"><label>New password (8+ characters)<input id="p" type="password"></label><p id="msg" class="err"></p><button class="btn" id="go">Save password</button></div>`;
  $('#go').onclick=async()=>{try{await api('/reset','POST',{token:t,password:$('#p').value});history.replaceState(null,'',location.pathname);authView();$('#msg').className='mute';$('#msg').textContent='Password changed. Please sign in.'}catch(x){$('#msg').textContent=x.message}};
}
const ctxMap={};
function card(s){
  ctxMap[s.id]=s;
  const m=s.match,label={eligible:'You appear eligible',uncertain:'Eligibility uncertain',not_met:'A confirmed requirement is not met'}[m.verdict];
  return `<div class="card ${m.verdict}"><span class="tag">${label}</span>
  <h3 style="margin:.2rem 0">${esc(s.title)}</h3><div class="mute">${esc(s.provider)} · ${esc(s.country)} · ${esc(s.funding_type)} funding · Deadline: ${s.deadline?esc(s.deadline.slice(0,10)):'not confirmed'}</div>
  ${s.host_institution?`<div class="mute">Host: ${esc(s.host_institution)}</div>`:''}${s.minimum_cgpa!=null?`<p class="mute">Minimum CGPA: ${esc(s.minimum_cgpa)} / 5.0</p>`:''}${s.eligibility_text?`<p>${esc(s.eligibility_text)}</p>`:''}${s.funding_details?`<p>${esc(s.funding_details)}</p>`:''}${[['Application fee',s.application_fee_waiver],['English requirement',s.english_proficiency_exemptions],['Stay-back visa',s.stay_back_visa_duration],['Work while studying',s.in_study_work_allowance],['Cost of living',s.local_cost_of_living_estimate]].filter(x=>x[1]).map(x=>`<div class="mute"><b>${x[0]}:</b> ${esc(x[1])}</div>`).join('')}
  ${m.met.length?`<div><b>Met:</b> ${m.met.map(esc).join(', ')}</div>`:''}
  ${m.unmet.length?`<div><b>Not met:</b> ${m.unmet.map(esc).join(', ')}</div>`:''}
  ${m.unknown.length?`<div><b>Unclear:</b><ul>${m.unknown.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
  <div class="mute">Last checked ${esc(s.last_checked?.slice(0,10))} · <a href="${esc(s.source_url)}" target="_blank" rel="noopener">Source</a></div>
  <a class="btn" href="${esc(s.application_url||s.source_url)}" target="_blank" rel="noopener">Apply on official site</a>
  <button class="btn alt" data-save="${s.id}" data-on="${s.saved}">${s.saved?'Unsave':'Save'}</button>
  <button class="btn alt" data-track="${s.id}">Track application</button>
  <button class="btn alt" data-ask="${s.id}">Ask the Counselor</button></div>`;
}
function wire(){
  app.querySelectorAll('[data-ask]').forEach(b=>b.onclick=()=>openChat(ctxMap[b.dataset.ask]));
  app.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{await api('/saved/'+b.dataset.save,b.dataset.on==='true'?'DELETE':'POST');const s=data.find(x=>x.id==b.dataset.save);if(s)s.saved=b.dataset.on!=='true';render()});
  app.querySelectorAll('[data-track]').forEach(b=>b.onclick=async()=>{await api('/applications/'+b.dataset.track,'PUT',{status:'planning'});b.textContent='Tracking'});
}
async function load(){data=await api('/scholarships');render();}
let cursor=0,more=true;
async function loadMore(){const r=await api('/stage2/matches?cursor='+cursor);data=data.concat(r.items);cursor=r.next_cursor;more=r.next_cursor!=null;}
async function matchesView(){
  if(!data.length){cursor=0;more=true;await loadMore();}
  app.innerHTML=`<h1>Your matches</h1><input id="q" placeholder="Search by title, provider or country"><select id="f" style="margin-top:.5rem">
  <option value="">All results</option><option value="eligible">Appear eligible</option><option value="uncertain">Uncertain</option><option value="not_met">Requirement not met</option></select><div id="list"></div><button class="btn alt" id="mb" hidden>Load more</button>`;
  const draw=()=>{const q=$('#q').value.toLowerCase(),f=$('#f').value;
    const rows=data.filter(s=>(!f||s.match.verdict===f)&&(s.title+s.provider+s.country).toLowerCase().includes(q));
    $('#list').innerHTML=rows.length?rows.map(card).join(''):'<p class="mute">No listings yet. Verified scholarships are added after admin review; check back soon.</p>';
    $('#mb').hidden=!more;wire();};
  $('#q').oninput=draw;$('#f').onchange=draw;$('#mb').onclick=async()=>{await loadMore();draw()};draw();
}
async function savedView(){const all=await api('/scholarships');const r=all.filter(s=>s.saved);
  app.innerHTML='<h1>Saved</h1>'+(r.map(card).join('')||'<p class="mute">Nothing saved yet. Save a scholarship from Matches.</p>');wire();}
async function appsView(){
  const a=await api('/applications');
  app.innerHTML='<h1>Applications and deadlines</h1>'+(a.map(x=>`<div class="card"><b>${esc(x.title)}</b><div class="mute">Deadline: ${x.deadline?esc(x.deadline.slice(0,10)):'not confirmed'}</div>
  <select data-id="${x.scholarship_id}">${['planning','in_progress','submitted','accepted','rejected'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')||'<p class="mute">You are not tracking any applications. Use "Track application" on a match.</p>');
  app.querySelectorAll('select').forEach(s=>s.onchange=()=>api('/applications/'+s.dataset.id,'PUT',{status:s.value}));
}
const F=[['full_name','Full name'],['nationality','Nationality (e.g. Nigerian)'],['institution','Institution'],['field','Field of study'],['grad_year','Graduation year','number'],['work_years','Years of work experience','number'],['ielts','IELTS overall (if taken)','number'],['cgpa','CGPA (out of 5.0)','number']];
async function profileView(){
  const p=await api('/profile');
  app.innerHTML=`<h1>Your profile</h1><p class="mute">Leave a field empty if it does not apply. Missing details show as "uncertain" instead of guessed.</p>
  <div class="row">${F.map(([k,l,t])=>`<label>${l}<input id="${k}" type="${t||'text'}" step="any" value="${esc(p[k])}"></label>`).join('')}
  <label>Highest degree<select id="highest_degree">${['','bachelors','masters','phd'].map(v=>`<option ${p.highest_degree===v?'selected':''}>${v}</option>`).join('')}</select></label>
  <label>Degree class<select id="degree_class">${['','first','second_upper','second_lower','third','pass'].map(v=>`<option ${p.degree_class===v?'selected':''}>${v}</option>`).join('')}</select></label>
  <label>Destination countries (comma-separated)<input id="dest_countries" value="${esc((p.dest_countries||[]).join(', '))}"></label>
  <label>Degree levels sought (masters, phd)<input id="target_levels" value="${esc((p.target_levels||[]).join(', '))}"></label></div>
  <label><input type="checkbox" id="fully_funded_only" style="width:auto" ${p.fully_funded_only?'checked':''}> Fully funded only</label>
  <label><input type="checkbox" id="email_notify" style="width:auto" ${p.email_notify?'checked':''}> Deadline reminders by email (when available)</label>
  <button class="btn" id="sv">Save profile</button> <span id="ok" class="mute"></span>`;
  $('#sv').onclick=async()=>{const b={};[...F.map(f=>f[0]),'highest_degree','degree_class'].forEach(k=>b[k]=$('#'+k).value);
    ['dest_countries','target_levels'].forEach(k=>b[k]=$('#'+k).value.split(',').map(x=>x.trim()).filter(Boolean));
    b.fully_funded_only=$('#fully_funded_only').checked;b.email_notify=$('#email_notify').checked;
    await api('/profile','PUT',b);await api('/stage2/cgpa','PUT',{cgpa:$('#cgpa').value});data=[];$('#ok').textContent='Saved';};
}
function editForm(s){
  const v=k=>esc(s[k]), opt=(list,cur)=>list.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('');
  return `<div class="row">
  <label>Title<input name="title" value="${v('title')}"></label>
  <label>Host institution / provider<input name="provider" value="${esc(s.host_institution||s.provider)}"></label>
  <label>Country<input name="country" value="${v('country')}"></label>
  <label>Funding<select name="funding_type">${opt(['unknown','Fully Funded','Partial','Tuition Only'],s.funding_type)}</select></label>
  <label>Deadline<input name="deadline" type="date" value="${s.deadline?esc(String(s.deadline).slice(0,10)):''}"></label>
  <label>Official application link (https)<input name="application_url" value="${v('application_url')}"></label>
  <label>Degree levels (masters, phd)<input name="degree_levels" value="${esc((s.degree_levels||[]).join(', '))}"></label>
  <label>Eligible nationalities (blank = not stated)<input name="eligible_nationalities" value="${esc((s.eligible_nationalities||[]).join(', '))}"></label>
  <label>Minimum degree class<select name="min_degree_class">${opt(['','first','second_upper','second_lower','third','pass'],s.min_degree_class||'')}</select></label>
  <label>Minimum CGPA (out of 5.0)<input name="minimum_cgpa" type="number" step="any" value="${v('minimum_cgpa')}"></label>
  <label>Minimum work years<input name="min_work_years" type="number" step="any" value="${v('min_work_years')}"></label>
  <label>Minimum IELTS<input name="min_ielts" type="number" step="any" value="${v('min_ielts')}"></label></div>
  <label>Eligibility (as stated by the provider)<textarea name="eligibility_text" rows="3">${v('eligibility_text')}</textarea></label>
  <label>Funding details (as stated)<textarea name="funding_details" rows="2">${v('funding_details')}</textarea></label>
  <label>Application fee waiver (as stated)<textarea name="application_fee_waiver" rows="2">${v('application_fee_waiver')}</textarea></label>
  <label>English requirement / exemptions (as stated)<textarea name="english_proficiency_exemptions" rows="2">${v('english_proficiency_exemptions')}</textarea></label>
  <label>Stay-back visa duration (as stated)<textarea name="stay_back_visa_duration" rows="2">${v('stay_back_visa_duration')}</textarea></label>
  <label>Work allowance while studying (as stated)<textarea name="in_study_work_allowance" rows="2">${v('in_study_work_allowance')}</textarea></label>
  <label>Cost of living (as stated)<textarea name="local_cost_of_living_estimate" rows="2">${v('local_cost_of_living_estimate')}</textarea></label>
  <p class="mute">Only enter what the official page states. Leave blank if unknown.</p>
  <button class="btn" data-save-e="${s.id}">Save details</button><span class="err"></span>`;
}
async function adminView(){
  const [r,src,runs,jobs]=await Promise.all([api('/admin/review'),api('/admin/sources'),api('/admin/runs'),api('/stage2/jobs')]);
  app.innerHTML='<h1>Records to review</h1>'+(r.map(s=>`<div class="card"><b>${esc(s.title)}</b> <span class="mute">${esc(s.provider)} · deadline ${s.deadline?esc(s.deadline.slice(0,10)):'not found'}</span><div><a href="${esc(s.source_url)}" target="_blank" rel="noopener">Open source and verify</a></div>
  <button class="btn" data-s="${s.id}" data-v="active">Approve</button><button class="btn alt" data-s="${s.id}" data-v="inactive">Reject</button><button class="btn alt" data-e="${s.id}">Edit details</button><div id="ef${s.id}" hidden>${editForm(s)}</div></div>`).join('')||'<p class="mute">Nothing waiting for review.</p>')+
  `<h2>Add scholarship text for AI extraction</h2><p class="mute">AI: ${jobs.llm_enabled?'on':'off (no API key found; jobs wait in the queue). Key-like variable names the server can see: '+((jobs.env_hints||[]).join(', ')||'none')} · Queue: ${jobs.counts.map(c=>c.status+' '+c.n).join(', ')||'empty'}</p>
  <div class="card"><label>Official page URL (https)<input id="iu"></label><label>Paste the scholarship page text<textarea id="it" rows="6"></textarea></label>
  <button class="btn" id="ia">Queue for extraction</button><button class="btn alt" id="ip">Process queue now</button> <span id="im" class="mute"></span></div>
  <h2>Discovery sources</h2>`+src.map(x=>`<div class="mute">${esc(x.name)} (${esc(x.kind)}) · last run ${x.last_run?esc(x.last_run.slice(0,16)):'never'}</div>`).join('')+
  `<div class="card"><label>Name<input id="sn"></label><label>Feed or page URL (https)<input id="su"></label>
  <label>Type<select id="sk"><option value="rss">RSS/Atom feed</option><option value="page">Single web page</option></select></label>
  <button class="btn" id="sa">Add source</button><button class="btn alt" id="sr">Run discovery now</button><button class="btn alt" id="rm">Send deadline reminders now</button> <span id="sm" class="mute"></span></div>
  <h2>Recent runs</h2>`+runs.slice(0,10).map(x=>`<div class="${x.ok?'mute':'err'}">${esc(x.name)}: ${x.ok?x.found+' new':'failed: '+esc(x.error)} · ${esc(x.started_at.slice(0,16))}</div>`).join('');
  app.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{await api(`/admin/scholarships/${b.dataset.s}/status`,'PUT',{status:b.dataset.v});adminView()});
  $('#sa').onclick=async()=>{try{await api('/admin/sources','POST',{name:$('#sn').value,url:$('#su').value,kind:$('#sk').value});adminView()}catch(x){$('#sm').textContent=x.message}};
  app.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const d=$('#ef'+b.dataset.e);d.hidden=!d.hidden});
  app.querySelectorAll('[data-save-e]').forEach(b=>b.onclick=async()=>{const id=b.dataset.saveE,g=k=>document.querySelector(`#ef${id} [name=${k}]`).value,list=k=>g(k).split(',').map(x=>x.trim()).filter(Boolean);
    const body={title:g('title'),provider:g('provider'),country:g('country'),funding_type:g('funding_type'),eligibility_text:g('eligibility_text'),funding_details:g('funding_details'),deadline:g('deadline'),application_url:g('application_url'),min_degree_class:g('min_degree_class'),min_work_years:g('min_work_years'),min_ielts:g('min_ielts'),minimum_cgpa:g('minimum_cgpa'),degree_levels:list('degree_levels'),eligible_nationalities:list('eligible_nationalities'),application_fee_waiver:g('application_fee_waiver'),english_proficiency_exemptions:g('english_proficiency_exemptions'),stay_back_visa_duration:g('stay_back_visa_duration'),in_study_work_allowance:g('in_study_work_allowance'),local_cost_of_living_estimate:g('local_cost_of_living_estimate')};
    try{await api('/admin/scholarships/'+id,'PUT',body);adminView()}catch(x){document.querySelector(`#ef${id} .err`).textContent=' '+x.message}});
  $('#ia').onclick=async()=>{try{const r=await api('/stage2/ingest','POST',{source_url:$('#iu').value,text:$('#it').value});$('#im').textContent='Queued job '+r.job_id+(r.domains_saved.length?' · '+r.domains_saved.length+' official domain(s) saved for review':'');}catch(x){$('#im').textContent=x.message}};
  $('#ip').onclick=async()=>{$('#im').textContent='Processing…';try{const r=await api('/stage2/process','POST');if(r.llm==='disabled')$('#im').textContent='AI is off (no API key set). Jobs stay queued.';else adminView()}catch(x){$('#im').textContent=x.message}};
  $('#rm').onclick=async()=>{$('#sm').textContent='Sending…';try{const r=await api('/admin/reminders','POST');$('#sm').textContent=r.email==='disabled'?'Email is not set up (BREVO_API_KEY and MAIL_FROM are missing).':r.sent+' sent, '+r.failed+' failed'}catch(x){$('#sm').textContent=x.message}};
  $('#sr').onclick=async()=>{$('#sm').textContent='Running…';try{await api('/admin/run','POST');adminView()}catch(x){$('#sm').textContent=x.message}};
}
render();
