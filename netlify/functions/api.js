const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { match } = require('./match');
const { runDiscovery } = require('./discover_lib');
const { runReminders } = require('./reminders_lib'), mailer = require('./mailer'), crypto = require('crypto');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const sql = (q, p=[]) => neon(process.env.DATABASE_URL).query(q, p);
const SECRET = process.env.JWT_SECRET;
const ok = (b, c=200) => ({ statusCode:c, headers:{'content-type':'application/json'}, body:JSON.stringify(b) });
const PROFILE = ['full_name','nationality','highest_degree','degree_class','field','grad_year','institution','work_years','ielts','dest_countries','target_levels','fully_funded_only','email_notify'];

exports.handler = async (e) => {
  try {
    if (!SECRET || !process.env.DATABASE_URL) return ok({error:'Server not configured: set DATABASE_URL and JWT_SECRET'},500);
    const path = e.path.replace(/^\/(\.netlify\/functions\/api|api)/,'') || '/';
    const m = e.httpMethod, body = e.body ? JSON.parse(e.body) : {};
    if (path==='/register' && m==='POST') {
      const {email,password}=body;
      if(!/^\S+@\S+\.\S+$/.test(email||'')||(password||'').length<8) return ok({error:'Use a valid email and a password of 8+ characters'},400);
      const r = await sql('insert into users(email,password_hash) values($1,$2) on conflict do nothing returning id',[email.toLowerCase(),await bcrypt.hash(password,10)]);
      if(!r.length) return ok({error:'That email is already registered'},409);
      await sql('insert into profiles(user_id) values($1)',[r[0].id]);
      return ok({token:jwt.sign({id:r[0].id,admin:false},SECRET,{expiresIn:'7d'})});
    }
    if (path==='/login' && m==='POST') {
      const r = await sql('select * from users where email=$1',[(body.email||'').toLowerCase()]);
      if(!r.length||!(await bcrypt.compare(body.password||'',r[0].password_hash))) return ok({error:'Email or password is incorrect'},401);
      return ok({token:jwt.sign({id:r[0].id,admin:r[0].is_admin},SECRET,{expiresIn:'7d'}),admin:r[0].is_admin});
    }
    if (path==='/forgot' && m==='POST') {
      if(!mailer.enabled()) return ok({error:'Password recovery by email is not set up yet'},503);
      const base = process.env.SITE_URL || process.env.URL;
      const u = (await sql('select id,email from users where email=$1',[(body.email||'').toLowerCase()]))[0];
      if (u && base) {
        const n = (await sql("select count(*)::int as n from password_resets where user_id=$1 and created_at>now()-interval '1 hour'",[u.id]))[0].n;
        if (n < 3) {
          const t = crypto.randomBytes(32).toString('hex'), link = `${base}/#reset=${t}`;
          await sql("insert into password_resets(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",[hash(t),u.id]);
          try { await mailer.send({to:u.email,subject:'Reset your ScholarFind password',text:`Open this link within 1 hour to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`,html:`<p>Open this link within 1 hour to choose a new password:</p><p><a href="${link}">Reset my password</a></p><p>If you did not ask for this, ignore this email.</p>`}); } catch { console.error('reset email failed'); }
        }
      }
      return ok({ok:true});
    }
    if (path==='/reset' && m==='POST') {
      if((body.password||'').length<8) return ok({error:'Password must be 8+ characters'},400);
      const r = await sql('update password_resets set used=true where token_hash=$1 and not used and expires_at>now() returning user_id',[hash(body.token||'')]);
      if(!r.length) return ok({error:'This reset link is invalid or has expired'},400);
      await sql('update users set password_hash=$2 where id=$1',[r[0].user_id,await bcrypt.hash(body.password,10)]);
      return ok({ok:true});
    }
    let user; try { user = jwt.verify((e.headers.authorization||'').replace('Bearer ',''),SECRET); } catch { return ok({error:'Please sign in'},401); }
    const uid = user.id;
    if (path==='/profile') {
      if (m==='PUT') {
        const ks = PROFILE.filter(k=>k in body);
        if(ks.length) await sql(`update profiles set ${ks.map((k,i)=>`${k}=$${i+2}`).join(',')} where user_id=$1`,[uid,...ks.map(k=>body[k]===''?null:body[k])]);
      }
      return ok((await sql('select * from profiles where user_id=$1',[uid]))[0]);
    }
    if (path==='/scholarships' && m==='GET') {
      const p = (await sql('select * from profiles where user_id=$1',[uid]))[0];
      const rows = await sql("select s.*, (sv.user_id is not null) as saved from scholarships s left join saved sv on sv.scholarship_id=s.id and sv.user_id=$1 where s.status='active' order by s.deadline nulls last",[uid]);
      return ok(rows.map(s=>({...s, match:require('./controllers').matchAll(p,s)})));
    }
    const sv = path.match(/^\/saved\/(\d+)$/);
    if (sv) { await sql(m==='DELETE'?'delete from saved where user_id=$1 and scholarship_id=$2':'insert into saved values($1,$2) on conflict do nothing',[uid,sv[1]]); return ok({ok:true}); }
    if (path==='/applications' && m==='GET') return ok(await sql('select a.*,s.title,s.deadline from applications a join scholarships s on s.id=a.scholarship_id where a.user_id=$1 order by s.deadline nulls last',[uid]));
    const ap = path.match(/^\/applications\/(\d+)$/);
    if (ap && m==='PUT') { await sql('insert into applications(user_id,scholarship_id,status,notes) values($1,$2,$3,$4) on conflict(user_id,scholarship_id) do update set status=$3,notes=$4,updated_at=now()',[uid,ap[1],body.status||'planning',body.notes||null]); return ok({ok:true}); }
    if (path.startsWith('/admin')) {
      if(!user.admin) return ok({error:'Admins only'},403);
      if (path==='/admin/review') return ok(await sql("select * from scholarships where status='needs_review' order by id"));
      const ed = path.match(/^\/admin\/scholarships\/(\d+)$/);
      if (ed && m==='PUT') {
        const bad = msg => ok({error:msg},400), t = v => (typeof v==='string' && v.trim()) ? v.trim() : null;
        const num = v => (v===''||v==null) ? null : Number(v), arr = v => Array.isArray(v) ? v.map(x=>String(x).trim()).filter(Boolean) : [];
        const cg=num(body.minimum_cgpa), wy=num(body.min_work_years), ie=num(body.min_ielts);
        if(!t(body.title)) return bad('Title is required');
        if([cg,wy,ie].some(x=>x!==null&&isNaN(x))) return bad('CGPA, work years and IELTS must be numbers');
        if(cg!==null&&(cg<0||cg>5)) return bad('CGPA must be between 0 and 5');
        if(t(body.deadline)&&!/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return bad('Deadline must be a valid date');
        if(t(body.application_url)&&!/^https:\/\//.test(body.application_url)) return bad('Application link must start with https://');
        const ft=['Fully Funded','Partial','Tuition Only'].includes(body.funding_type)?body.funding_type:'unknown';
        const dc=['first','second_upper','second_lower','third','pass'].includes(body.min_degree_class)?body.min_degree_class:null;
        const nat=arr(body.eligible_nationalities);
        await sql('update scholarships set title=$2,provider=$3,host_institution=$3,country=$4,funding_type=$5,eligibility_text=$6,funding_details=$7,deadline=$8,application_url=coalesce($9,source_url),min_degree_class=$10,min_work_years=$11,min_ielts=$12,minimum_cgpa=$13,degree_levels=$14,eligible_nationalities=$15 where id=$1',
          [ed[1],t(body.title),t(body.provider),t(body.country),ft,t(body.eligibility_text),t(body.funding_details),t(body.deadline),t(body.application_url),dc,wy,ie,cg,arr(body.degree_levels),nat.length?nat:null]);
        return ok({ok:true});
      }
      const st = path.match(/^\/admin\/scholarships\/(\d+)\/status$/);
      if (st && m==='PUT') { await sql('update scholarships set status=$2 where id=$1',[st[1],body.status]); return ok({ok:true}); }
      if (path==='/admin/scholarships' && m==='POST') {
        if(!body.title||!body.source_url) return ok({error:'title and source_url are required'},400);
        await sql("insert into scholarships(title,provider,country,degree_levels,eligible_nationalities,fields,min_degree_class,min_work_years,min_ielts,funding_type,funding_details,deadline,source_url,application_url,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'needs_review')",
          [body.title,body.provider,body.country,body.degree_levels||[],body.eligible_nationalities||null,body.fields||null,body.min_degree_class||null,body.min_work_years||null,body.min_ielts||null,body.funding_type||'unknown',body.funding_details||null,body.deadline||null,body.source_url,body.application_url||body.source_url]);
        return ok({ok:true},201);
      }
      if (path==='/admin/sources') {
        if (m==='POST') { if(!/^https:\/\//.test(body.url||'')) return ok({error:'Source URL must start with https://'},400);
          await sql('insert into sources(name,url,kind) values($1,$2,$3) on conflict(url) do nothing',[body.name||body.url,body.url,body.kind==='page'?'page':'rss']); }
        return ok(await sql('select * from sources order by id')); }
      if (path==='/admin/run' && m==='POST') return ok(await runDiscovery(sql, fetch, 3));
      if (path==='/admin/reminders' && m==='POST') return ok(await runReminders(sql, mailer));
      if (path==='/admin/runs') return ok(await sql('select r.*,s.name from discovery_runs r left join sources s on s.id=r.source_id order by r.id desc limit 50'));
    }
    return ok({error:'Not found'},404);
  } catch (err) { console.error(err); return ok({error:'Something went wrong on the server'},500); }
};
