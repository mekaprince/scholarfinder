const crypto = require('crypto');
const { match } = require('./match');
const BATCH = 3, MAX_ATTEMPTS = 3;
const ALLOWED = /\.(edu|gov|ac\.uk)$/i;
const autoActivate = () => process.env.AUTO_ACTIVATE_SOURCES === '1';
async function saveDomains(sql, urls) {
  const saved = [], seen = new Set();
  for (const raw of urls || []) {
    if (saved.length >= BATCH) break;
    let u; try { u = new URL(raw); } catch { continue; }
    if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname) || seen.has(u.origin)) continue;
    seen.add(u.origin);
    const r = await sql(`insert into sources(name,url,kind,active,verified,discovered_by,domain)
      values($1,$2,'page',$3,true,'ai_pipeline',$1) on conflict(url) do nothing returning id,url,active`, [u.hostname, u.origin, autoActivate()]);
    if (r.length) saved.push(r[0]);
  }
  return saved;
}
async function enqueue(sql, { source_url, text }) {
  if (!/^https:\/\//.test(source_url || '')) throw Object.assign(new Error('source_url must start with https://'), { status: 400 });
  if ((text || '').length < 50) throw Object.assign(new Error('text is too short to extract from'), { status: 400 });
  const links = [...new Set(text.match(/https:\/\/[^\s"'<>)\]]+/g) || [])];
  const domains = await saveDomains(sql, links);
  const r = await sql('insert into ingestion_jobs(source_url,raw_text) values($1,$2) returning id', [source_url, text.slice(0, 15000)]);
  return { job_id: r[0].id, domains_saved: domains };
}
async function handle(sql, job, extract) {
  const { data, model } = await extract(job.raw_text);
  const hash = crypto.createHash('sha256').update(job.raw_text).digest('hex');
  const s = await sql(`insert into scholarships(title,provider,host_institution,country,funding_type,eligibility_text,minimum_cgpa,deadline,
      source_url,application_url,status,ai_extracted,ai_model,content_hash,last_checked)
    values($1,$2,$2,$3,$4,$5,$6,$7,$8,$8,'needs_review',true,$9,$10,now())
    on conflict(source_url,title) do update set host_institution=excluded.host_institution, provider=excluded.provider, country=excluded.country,
      funding_type=excluded.funding_type, eligibility_text=excluded.eligibility_text, minimum_cgpa=excluded.minimum_cgpa, deadline=excluded.deadline,
      ai_extracted=true, ai_model=excluded.ai_model, content_hash=excluded.content_hash, last_checked=now(),
      status=case when scholarships.status='active' and scholarships.content_hash<>excluded.content_hash then 'needs_review' else scholarships.status end
    returning id`, [data.title, data.host_institution, data.country, data.funding_type || 'unknown', data.eligibility_text, data.minimum_cgpa, data.deadline, job.source_url, model, hash]);
  await sql("update ingestion_jobs set status='done', scholarship_id=$2, error=null, updated_at=now() where id=$1", [job.id, s[0].id]);
}
async function processBatch(sql, extract, enabled) {
  if (!enabled()) return { llm: 'disabled', processed: 0 };
  const jobs = await sql(`update ingestion_jobs set status='running', attempts=attempts+1, locked_at=now(), updated_at=now()
    where id in (select id from ingestion_jobs where attempts<$2 and (status='pending' or (status='running' and locked_at < now() - interval '5 minutes'))
      order by id limit $1 for update skip locked) returning *`, [BATCH, MAX_ATTEMPTS]);
  const results = await Promise.allSettled(jobs.map(j => handle(sql, j, extract)));
  for (let i = 0; i < jobs.length; i++) if (results[i].status === 'rejected')
    await sql('update ingestion_jobs set status=$2, error=$3, updated_at=now() where id=$1',
      [jobs[i].id, jobs[i].attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', String(results[i].reason.message).slice(0, 300)]);
  return { processed: jobs.length, ok: results.filter(r => r.status === 'fulfilled').length };
}
async function jobStatus(sql) {
  return { counts: await sql('select status, count(*)::int as n from ingestion_jobs group by status'),
    recent_failures: await sql("select id,source_url,error,attempts from ingestion_jobs where status='failed' order by id desc limit 10") };
}
function matchAll(p, s) {
  const r = match(p, s);
  if (s.minimum_cgpa == null) r.unknown.push('CGPA: not stated by the provider');
  else if (p.cgpa == null) r.unknown.push('CGPA (5.0 scale): add this to your profile');
  else (Number(p.cgpa) >= Number(s.minimum_cgpa) ? r.met : r.unmet).push('CGPA');
  r.verdict = r.unmet.length ? 'not_met' : r.unknown.length ? 'uncertain' : 'eligible';
  return r;
}
async function matchBatch(sql, uid, cursor) {
  const p = (await sql('select * from profiles where user_id=$1', [uid]))[0] || {};
  const rows = await sql("select * from scholarships where status='active' and id>$1 order by id limit $2", [cursor, BATCH]);
  return { items: rows.map(s => ({ ...s, match: matchAll(p, s) })), next_cursor: rows.length === BATCH ? rows[rows.length - 1].id : null };
}
async function setCgpa(sql, uid, cgpa) {
  const n = cgpa === '' || cgpa == null ? null : Number(cgpa);
  if (n !== null && (isNaN(n) || n < 0 || n > 5)) throw Object.assign(new Error('CGPA must be between 0 and 5'), { status: 400 });
  await sql('update profiles set cgpa=$2 where user_id=$1', [uid, n]);
}
module.exports = { BATCH, saveDomains, enqueue, processBatch, jobStatus, matchBatch, setCgpa };
