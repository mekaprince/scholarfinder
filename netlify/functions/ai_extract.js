// PAID API: leave LLM_API_KEY unset and this stays disabled at zero cost; jobs wait as 'pending'.
const FUNDING = ['Fully Funded', 'Partial', 'Tuition Only'];
const nullable = (t, extra = {}) => ({ type: [t, 'null'], ...extra });
const SCHEMA = { type:'object', additionalProperties:false,
  required:['title','host_institution','country','funding_type','eligibility_criteria','minimum_cgpa','deadline'],
  properties:{ title:nullable('string'), host_institution:nullable('string'), country:nullable('string'),
    funding_type:{type:['string','null'],enum:[...FUNDING,null]}, eligibility_criteria:nullable('string'),
    minimum_cgpa:nullable('number'), deadline:nullable('string') } };
const SYSTEM = `Extract scholarship facts ONLY from the provided text. Never guess or infer.
Use null for anything not explicitly stated. funding_type must be exactly "Fully Funded", "Partial" or "Tuition Only", else null.
minimum_cgpa only if stated on, or clearly convertible to, a 5.0 scale; otherwise null.
deadline as YYYY-MM-DD only if a full date with year is stated. eligibility_criteria: copy the stated requirements concisely.`;
const enabled = () => !!process.env.LLM_API_KEY;
const provider = () => (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const modelName = () => process.env.LLM_MODEL || (provider() === 'anthropic' ? 'claude-haiku-5-5' : 'gpt-4o-mini');
async function callLLM(text) {
  const signal = AbortSignal.timeout(8000);
  if (provider() === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', signal,
      headers:{'content-type':'application/json','x-api-key':process.env.LLM_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({ model:modelName(), max_tokens:1000, system:SYSTEM,
        tools:[{name:'record_scholarship',description:'Record extracted scholarship fields',input_schema:SCHEMA}],
        tool_choice:{type:'tool',name:'record_scholarship'}, messages:[{role:'user',content:text}] }) });
    const j = await r.json(); if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    const block = (j.content || []).find(b => b.type === 'tool_use');
    if (!block) throw new Error('LLM returned no structured output'); return block.input;
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', signal,
    headers:{'content-type':'application/json',authorization:'Bearer '+process.env.LLM_API_KEY},
    body: JSON.stringify({ model:modelName(), messages:[{role:'system',content:SYSTEM},{role:'user',content:text}],
      response_format:{type:'json_schema',json_schema:{name:'scholarship',strict:true,schema:SCHEMA}} }) });
  const j = await r.json(); if (!r.ok) throw new Error('LLM HTTP ' + r.status);
  return JSON.parse(j.choices[0].message.content);
}
function validate(x, text) {
  const s = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : null);
  const out = { title:s(x.title), host_institution:s(x.host_institution), country:s(x.country),
    funding_type: FUNDING.includes(x.funding_type) ? x.funding_type : null, eligibility_text:s(x.eligibility_criteria),
    minimum_cgpa: typeof x.minimum_cgpa==='number' && x.minimum_cgpa>=0 && x.minimum_cgpa<=5 ? Math.round(x.minimum_cgpa*100)/100 : null,
    deadline:null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(x.deadline||'') && !isNaN(new Date(x.deadline)) && text.includes(x.deadline.slice(0,4))) out.deadline = x.deadline;
  if (!out.title) throw new Error('No title found in source text');
  return out;
}
async function extract(text) {
  if (!enabled()) throw new Error('LLM_DISABLED');
  return { data: validate(await callLLM(text), text), model: provider() + ':' + modelName() };
}
module.exports = { extract, enabled, validate, SCHEMA };
