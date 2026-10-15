const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');
const C = require('./controllers'), AI = require('./ai_extract');
const sql = (q, p = []) => neon(process.env.DATABASE_URL).query(q, p);
const ok = (b, c = 200) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
exports.handler = async (e) => {
  try {
    if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) return ok({ error: 'Server not configured' }, 500);
    let user; try { user = jwt.verify((e.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return ok({ error: 'Please sign in' }, 401); }
    const path = e.path.replace(/^\/(\.netlify\/functions\/stage2|api\/stage2)/, '') || '/';
    const m = e.httpMethod, body = e.body ? JSON.parse(e.body) : {}, q = e.queryStringParameters || {};
    if (path === '/matches' && m === 'GET') return ok(await C.matchBatch(sql, user.id, Number(q.cursor) || 0));
    if (path === '/cgpa' && m === 'PUT') { await C.setCgpa(sql, user.id, body.cgpa); return ok({ ok: true }); }
    if (!user.admin) return ok({ error: 'Admins only' }, 403);
    if (path === '/ingest' && m === 'POST') return ok(await C.enqueue(sql, body), 201);
    if (path === '/process' && m === 'POST') return ok(await C.processBatch(sql, AI.extract, AI.enabled));
    if (path === '/jobs' && m === 'GET') return ok({ llm_enabled: AI.enabled(), ...(await C.jobStatus(sql)) });
    if (path === '/discover-domains' && m === 'POST') return ok({ saved: await C.saveDomains(sql, body.urls) });
    return ok({ error: 'Not found' }, 404);
  } catch (err) { console.error(err); return ok({ error: err.status ? err.message : 'Something went wrong on the server' }, err.status || 500); }
};
