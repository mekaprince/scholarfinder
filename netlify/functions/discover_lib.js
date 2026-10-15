// Deterministic discovery. Reads only admin-approved sources. Nothing is invented:
// anything it cannot read stays empty and every new record waits for admin review.
const crypto = require('crypto');
const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE = `(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MON})[a-z]*\\.?,?\\s+\\d{4}|(?:${MON})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`;
const DL = new RegExp(`(?:deadline|closes?|closing date|apply by|due)[^.\\n]{0,40}?${DATE}`, 'i');
const strip = h => (h||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#?\w+;/g,' ').replace(/\s+/g,' ').trim();

function extractDeadline(text) {
  const m = DL.exec(text || ''); if (!m) return null;
  const d = new Date(m[1].replace(/(\d)(st|nd|rd|th)/i,'$1') + ' UTC');
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}
function parseFeed(xml) {
  const tag = (s,t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'i').exec(s); return r ? strip(r[1]) : ''; };
  return (xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || []).map(it => {
    const link = tag(it,'link') || (/<link[^>]+href="([^"]+)"/i.exec(it)||[])[1] || '';
    const text = tag(it,'description') + ' ' + tag(it,'summary') + ' ' + tag(it,'content');
    return { title: tag(it,'title'), url: link, text };
  }).filter(c => c.title && /^https?:\/\//.test(c.url));
}
function parsePage(html, url) {
  const title = strip((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]);
  return title ? [{ title, url, text: strip(html).slice(0, 20000) }] : [];
}
async function runDiscovery(sql, fetchFn, limit = 3) {
  const srcs = await sql('select * from sources where active order by last_run nulls first limit $1',[limit]);
  const out = [];
  for (const s of srcs) {
    let found = 0, error = null;
    try {
      const res = await fetchFn(s.url, { headers:{'user-agent':'ScholarFindBot/0.1 (+admin-approved sources only)'}, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = (await res.text()).slice(0, 1500000);
      const items = (s.kind === 'page' ? parsePage(body, s.url) : parseFeed(body)).slice(0, 25);
      for (const c of items) {
        const hash = crypto.createHash('sha256').update(c.title + c.text).digest('hex');
        const ex = (await sql('select id,content_hash,status from scholarships where source_url=$1 and title=$2',[c.url,c.title]))[0];
        if (!ex) { await sql("insert into scholarships(title,source_url,application_url,deadline,content_hash,status) values($1,$2,$2,$3,$4,'needs_review')",[c.title,c.url,extractDeadline(c.text),hash]); found++; }
        else if (ex.content_hash !== hash) await sql("update scholarships set content_hash=$2,last_checked=now(),deadline=coalesce($3,deadline),status=case when status='active' then 'needs_review' else status end where id=$1",[ex.id,hash,extractDeadline(c.text)]);
        else await sql('update scholarships set last_checked=now() where id=$1',[ex.id]);
      }
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    await sql('insert into discovery_runs(source_id,ok,found,error) values($1,$2,$3,$4)',[s.id, !error, found, error]);
    await sql('update sources set last_run=now() where id=$1',[s.id]);
    out.push({ source: s.name, found, error });
  }
  await sql("update scholarships set status='expired' where status='active' and deadline < current_date");
  return out;
}
module.exports = { runDiscovery, parseFeed, parsePage, extractDeadline };
