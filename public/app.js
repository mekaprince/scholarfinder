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
  if(!token) return authView();
  const tabs=[['matches','Matches'],['saved','Saved'],['apps','Applications'],['profile','Profile'],...(isAdmin?[['admin','Review']]:[])];
  nav.innerHTML=tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')+'<button id="out">Sign out</button>';
  nav.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});$('#out').onclick=logout;
  ({matches:matchesView,saved:savedView,apps:appsView,profile:profileView,admin:adminView})[tab]();
}
function authView(){
  app.innerHTML=`<h1>Find funded master's programmes that fit your background.</h1>
  <p class="mute">We list only real opportunities from official sources, link you to the provider, and show exactly which requirements you meet. A match is not a prediction of winning.</p>
  <div class="card"><label>Email<input id="e" type="email"></label><label>Password (8+ characters)<input id="p" type="password"></label>
  <p id="msg" class="err"></p><button class="btn" id="in">Sign in</button><button class="btn alt" id="up">Create account</button></div>`;
  const go=path=>async()=>{try{const r=await api(path,'POST',{email:$('#e').value,password:$('#p').value});
    token=localStorage.token=r.token;isAdmin=!!r.admin;localStorage.admin=r.admin?'1':'0';tab=path==='/register'?'profile':'matches';render();}catch(x){$('#msg').textContent=x.message}};
  $('#in').onclick=go('/login');$('#up').onclick=go('/register');
}
function card(s){
  const m=s.match,label={eligible:'You appear eligible',uncertain:'Eligibility uncertain',not_met:'A confirmed requirement is not met'}[m.verdict];
  return `<div class="card ${m.verdict}"><span class="tag">${label}</span>
  <h3 style="margin:.2rem 0">${esc(s.title)}</h3><div class="mute">${esc(s.provider)} · ${esc(s.country)} · ${esc(s.funding_type)} funding · Deadline: ${s.deadline?esc(s.deadline.slice(0,10)):'not confirmed'}</div>
  ${s.funding_details?`<p>${esc(s.funding_details)}</p>`:''}
  ${m.met.length?`<div><b>Met:</b> ${m.met.map(esc).join(', ')}</div>`:''}
  ${m.unmet.length?`<div><b>Not met:</b> ${m.unmet.map(esc).join(', ')}</div>`:''}
  ${m.unknown.length?`<div><b>Unclear:</b><ul>${m.unknown.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
  <div class="mute">Last checked ${esc(s.last_checked?.slice(0,10))} · <a href="${esc(s.source_url)}" target="_blank" rel="noopener">Source</a></div>
  <a class="btn" href="${esc(s.application_url||s.source_url)}" target="_blank" rel="noopener">Apply on official site</a>
  <button class="btn alt" data-save="${s.id}" data-on="${s.saved}">${s.saved?'Unsave':'Save'}</button>
  <button class="btn alt" data-track="${s.id}">Track application</button></div>`;
}
function wire(){
  app.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{await api('/saved/'+b.dataset.save,b.dataset.on==='true'?'DELETE':'POST');load()});
  app.querySelectorAll('[data-track]').forEach(b=>b.onclick=async()=>{await api('/applications/'+b.dataset.track,'PUT',{status:'planning'});b.textContent='Tracking'});
}
async function load(){data=await api('/scholarships');render();}
async function matchesView(){
  if(!data.length) data=await api('/scholarships');
  app.innerHTML=`<h1>Your matches</h1><input id="q" placeholder="Search by title, provider or country"><select id="f" style="margin-top:.5rem">
  <option value="">All results</option><option value="eligible">Appear eligible</option><option value="uncertain">Uncertain</option><option value="not_met">Requirement not met</option></select><div id="list"></div>`;
  const draw=()=>{const q=$('#q').value.toLowerCase(),f=$('#f').value;
    const rows=data.filter(s=>(!f||s.match.verdict===f)&&(s.title+s.provider+s.country).toLowerCase().includes(q));
    $('#list').innerHTML=rows.length?rows.map(card).join(''):'<p class="mute">No listings yet. Verified scholarships are added after admin review; check back soon.</p>';wire();};
  $('#q').oninput=draw;$('#f').onchange=draw;draw();
}
async function savedView(){data=await api('/scholarships');const r=data.filter(s=>s.saved);
  app.innerHTML='<h1>Saved</h1>'+(r.map(card).join('')||'<p class="mute">Nothing saved yet. Save a scholarship from Matches.</p>');wire();}
async function appsView(){
  const a=await api('/applications');
  app.innerHTML='<h1>Applications and deadlines</h1>'+(a.map(x=>`<div class="card"><b>${esc(x.title)}</b><div class="mute">Deadline: ${x.deadline?esc(x.deadline.slice(0,10)):'not confirmed'}</div>
  <select data-id="${x.scholarship_id}">${['planning','in_progress','submitted','accepted','rejected'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')||'<p class="mute">You are not tracking any applications. Use "Track application" on a match.</p>');
  app.querySelectorAll('select').forEach(s=>s.onchange=()=>api('/applications/'+s.dataset.id,'PUT',{status:s.value}));
}
const F=[['full_name','Full name'],['nationality','Nationality (e.g. Nigerian)'],['institution','Institution'],['field','Field of study'],['grad_year','Graduation year','number'],['work_years','Years of work experience','number'],['ielts','IELTS overall (if taken)','number']];
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
    await api('/profile','PUT',b);data=[];$('#ok').textContent='Saved';};
}
async function adminView(){
  const [r,src,runs]=await Promise.all([api('/admin/review'),api('/admin/sources'),api('/admin/runs')]);
  app.innerHTML='<h1>Records to review</h1>'+(r.map(s=>`<div class="card"><b>${esc(s.title)}</b> <span class="mute">${esc(s.provider)} · deadline ${s.deadline?esc(s.deadline.slice(0,10)):'not found'}</span><div><a href="${esc(s.source_url)}" target="_blank" rel="noopener">Open source and verify</a></div>
  <button class="btn" data-s="${s.id}" data-v="active">Approve</button><button class="btn alt" data-s="${s.id}" data-v="inactive">Reject</button></div>`).join('')||'<p class="mute">Nothing waiting for review.</p>')+
  `<h2>Discovery sources</h2>`+src.map(x=>`<div class="mute">${esc(x.name)} (${esc(x.kind)}) · last run ${x.last_run?esc(x.last_run.slice(0,16)):'never'}</div>`).join('')+
  `<div class="card"><label>Name<input id="sn"></label><label>Feed or page URL (https)<input id="su"></label>
  <label>Type<select id="sk"><option value="rss">RSS/Atom feed</option><option value="page">Single web page</option></select></label>
  <button class="btn" id="sa">Add source</button><button class="btn alt" id="sr">Run discovery now</button> <span id="sm" class="mute"></span></div>
  <h2>Recent runs</h2>`+runs.slice(0,10).map(x=>`<div class="${x.ok?'mute':'err'}">${esc(x.name)}: ${x.ok?x.found+' new':'failed: '+esc(x.error)} · ${esc(x.started_at.slice(0,16))}</div>`).join('');
  app.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{await api(`/admin/scholarships/${b.dataset.s}/status`,'PUT',{status:b.dataset.v});adminView()});
  $('#sa').onclick=async()=>{try{await api('/admin/sources','POST',{name:$('#sn').value,url:$('#su').value,kind:$('#sk').value});adminView()}catch(x){$('#sm').textContent=x.message}};
  $('#sr').onclick=async()=>{$('#sm').textContent='Running…';try{await api('/admin/run','POST');adminView()}catch(x){$('#sm').textContent=x.message}};
}
render();
