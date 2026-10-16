const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const Q = `select u.id as uid, u.email, s.id as sid, s.title, s.deadline, s.application_url, s.source_url, (s.deadline - current_date) as days
  from users u
  join profiles p on p.user_id=u.id and p.email_notify
  join (select user_id, scholarship_id from saved union select user_id, scholarship_id from applications where status in ('planning','in_progress')) t on t.user_id=u.id
  join scholarships s on s.id=t.scholarship_id and s.status='active'
  where s.deadline between current_date and current_date + 7
  and not exists (select 1 from reminders_sent r where r.user_id=u.id and r.scholarship_id=s.id and r.bucket = case when s.deadline - current_date <= 1 then 1 else 7 end)
  order by s.deadline, u.id limit $1`;
async function runReminders(sql, mailer, limit = 25) {
  if (!mailer.enabled()) return { email: 'disabled', sent: 0, failed: 0 };
  const rows = await sql(Q, [limit]);
  let sent = 0, failed = 0;
  for (const r of rows) {
    const days = Number(r.days), when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    const d = String(r.deadline).slice(0, 10), link = r.application_url || r.source_url;
    try {
      await mailer.send({ to: r.email, subject: `Deadline ${when}: ${r.title}`,
        text: `"${r.title}" is on your ScholarFind list.\nListed deadline: ${d} (${when}).\nDeadlines can change, so confirm on the official page before you apply:\n${link}\n\nTo stop these emails, turn off deadline reminders in your profile.`,
        html: `<p><b>${esc(r.title)}</b> is on your ScholarFind list.</p><p>Listed deadline: ${esc(d)} (${when}).</p><p>Deadlines can change, so confirm on the <a href="${esc(link)}">official page</a> before you apply.</p><p>To stop these emails, turn off deadline reminders in your profile.</p>` });
      await sql('insert into reminders_sent(user_id,scholarship_id,bucket) values($1,$2,$3) on conflict do nothing', [r.uid, r.sid, days <= 1 ? 1 : 7]);
      sent++;
    } catch (e) { failed++; }
  }
  return { sent, failed };
}
module.exports = { runReminders };
