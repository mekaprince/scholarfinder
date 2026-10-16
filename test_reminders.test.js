const test=require('node:test'),a=require('node:assert'),{runReminders}=require('./netlify/functions/reminders_lib');
const row=(uid,email,days)=>({uid,email,sid:1,title:'Test <Award>',deadline:'2027-01-10',application_url:'https://x.edu/a',days});
test('sends, records, and skips marking failures',async()=>{
  const marks=[],sent=[];
  const sql=async(q,p)=>q.includes('insert into reminders_sent')?(marks.push(p),[]):[row(1,'a@x.com',1),row(2,'bad@x.com',5)];
  const mailer={enabled:()=>true,send:async m=>{if(m.to==='bad@x.com')throw new Error('x');sent.push(m)}};
  const r=await runReminders(sql,mailer);
  a.deepEqual(r,{sent:1,failed:1});a.deepEqual(marks,[[1,1,1]]);a.ok(sent[0].html.includes('&lt;Award&gt;'));
});
test('disabled mailer sends nothing',async()=>a.equal((await runReminders(async()=>[],{enabled:()=>false})).email,'disabled'));
