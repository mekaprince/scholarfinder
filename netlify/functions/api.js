const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { match } = require('./match');
const { runDiscovery } = require('./discover_lib');
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
      return ok(rows.map(s=>({...s, match:match(p,s)})));
    }
    const sv = path.match(/^\/saved\/(\d+)$/);
    if (sv) { await sql(m==='DELETE'?'delete from saved where user_id=$1 and scholarship_id=$2':'insert into saved values($1,$2) on conflict do nothing',[uid,sv[1]]); return ok({ok:true}); }
    if (path==='/applications' && m==='GET') return ok(await sql('select a.*,s.title,s.deadline from applications a join scholarships s on s.id=a.scholarship_id where a.user_id=$1 order by s.deadline nulls last',[uid]));
    const ap = path.match(/^\/applications\/(\d+)$/);
    if (ap && m==='PUT') { await sql('insert into applications(user_id,scholarship_id,status,notes) values($1,$2,$3,$4) on conflict(user_id,scholarship_id) do update set status=$3,notes=$4,updated_at=now()',[uid,ap[1],body.status||'planning',body.notes||null]); return ok({ok:true}); }
    if (path.startsWith('/admin')) {
      if(!user.admin) return ok({error:'Admins only'},403);
      if (path==='/admin/review') return ok(await sql("select * from scholarships where status='needs_review' order by id"));
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
      if (path==='/admin/runs') return ok(await sql('select r.*,s.name from discovery_runs r left join sources s on s.id=r.source_id order by r.id desc limit 50'));
    }
    return ok({error:'Not found'},404);
  } catch (err) { console.error(err); return ok({error:'Something went wrong on the server'},500); }
};
