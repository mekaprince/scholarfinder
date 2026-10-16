// Multi-provider router. Default: Google Gemini (free tier via Google AI Studio key).
// Env: LLM_API_KEY, or GEMINI_API_KEY / GOOGLE_API_KEY (unset = AI disabled, zero cost), LLM_PROVIDER=gemini|openai|anthropic, LLM_MODEL (optional).
// Verify the current free-tier model names and limits in Google AI Studio before relying on them.
const FUNDING = ['Fully Funded', 'Partial', 'Tuition Only'];
const COUNSELOR = ['application_fee_waiver', 'english_proficiency_exemptions', 'stay_back_visa_duration', 'in_study_work_allowance', 'local_cost_of_living_estimate'];
const nullable = (t, extra = {}) => ({ type: [t, 'null'], ...extra });
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'host_institution', 'country', 'funding_type', 'eligibility_criteria', 'minimum_cgpa', 'deadline', ...COUNSELOR],
  properties: {
    title: nullable('string'), host_institution: nullable('string'), country: nullable('string'),
    funding_type: { type: ['string', 'null'], enum: [...FUNDING, null] },
    eligibility_criteria: nullable('string'), minimum_cgpa: nullable('number'), deadline: nullable('string')
  }
};
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  required: SCHEMA.required,
  properties: {
    title: { type: 'STRING', nullable: true }, host_institution: { type: 'STRING', nullable: true },
    country: { type: 'STRING', nullable: true }, funding_type: { type: 'STRING', enum: FUNDING, nullable: true },
    eligibility_criteria: { type: 'STRING', nullable: true }, minimum_cgpa: { type: 'NUMBER', nullable: true },
    deadline: { type: 'STRING', nullable: true }
  }
};
for (const k of COUNSELOR) { SCHEMA.properties[k] = nullable('string'); GEMINI_SCHEMA.properties[k] = { type: 'STRING', nullable: true }; }

const SYSTEM = `Extract scholarship facts ONLY from the provided webpage text. Never guess, infer, or use outside knowledge.
Use null for anything not explicitly stated. funding_type must be exactly "Fully Funded", "Partial" or "Tuition Only", else null.
minimum_cgpa only if stated on, or clearly convertible to, a 5.0 scale; otherwise null.
deadline as YYYY-MM-DD only if a full date with year is stated. eligibility_criteria: copy the stated requirements concisely.
Read the whole text carefully, including FAQs, footnotes and fee/immigration/international-student sections, and look for these five counselor facts.
Fill each ONLY if the text states it, quoting or closely paraphrasing the original wording and keeping every number exactly as written; otherwise null:
- application_fee_waiver: any application fee waiver or exemption (for example for applicants from certain countries or regions).
- english_proficiency_exemptions: English language requirements and exemptions, including accepted alternatives to IELTS/TOEFL such as WAEC/NECO results, a previous degree taught in English, or a medium-of-instruction letter.
- stay_back_visa_duration: post-study work or stay-back visa length after graduating.
- in_study_work_allowance: permitted work hours or rules for students while studying.
- local_cost_of_living_estimate: stated living-cost figures or descriptions for the study location.`;

const apiKey = () => process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const enabled = () => !!apiKey();
const provider = () => (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
const DEFAULT_MODEL = { gemini: 'gemini-3.1-flash-lite', openai: 'gpt-4o-mini', anthropic: 'claude-haiku-5-5' };
const modelName = () => process.env.LLM_MODEL || DEFAULT_MODEL[provider()] || DEFAULT_MODEL.gemini;

const PROVIDERS = {
  async gemini(text) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName())}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 }
      })
    });
    if (r.status === 429) throw new Error('LLM rate limited, will retry later');
    const j = await r.json();
    if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    const out = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!out) throw new Error('LLM returned no structured output');
    return JSON.parse(out);
  },
  async openai(text) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey() },
      body: JSON.stringify({
        model: modelName(),
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
        response_format: { type: 'json_schema', json_schema: { name: 'scholarship', strict: true, schema: SCHEMA } }
      })
    });
    if (r.status === 429) throw new Error('LLM rate limited, will retry later');
    const j = await r.json();
    if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    return JSON.parse(j.choices[0].message.content);
  },
  async anthropic(text) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelName(), max_tokens: 1500, system: SYSTEM,
        tools: [{ name: 'record_scholarship', description: 'Record extracted scholarship fields', input_schema: SCHEMA }],
        tool_choice: { type: 'tool', name: 'record_scholarship' },
        messages: [{ role: 'user', content: text }]
      })
    });
    if (r.status === 429) throw new Error('LLM rate limited, will retry later');
    const j = await r.json();
    if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    const block = (j.content || []).find(b => b.type === 'tool_use');
    if (!block) throw new Error('LLM returned no structured output');
    return block.input;
  }
};

// A counselor fact is kept only if its numbers and most of its words appear in the source text.
function grounded(v, text) {
  const t = text.toLowerCase();
  const nums = v.match(/\d+(?:[.,]\d+)?/g) || [];
  if (nums.some(n => !t.includes(n) && !t.includes(n.replace(/,/g, '')))) return false;
  const words = v.toLowerCase().match(/[a-z]{4,}/g) || [];
  return !words.length || words.filter(w => t.includes(w)).length / words.length >= 0.5;
}

// Anything the model returns that the source text does not support becomes null.
function validate(x, text) {
  const s = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : null);
  const out = {
    title: s(x.title), host_institution: s(x.host_institution), country: s(x.country),
    funding_type: FUNDING.includes(x.funding_type) ? x.funding_type : null,
    eligibility_text: s(x.eligibility_criteria),
    minimum_cgpa: typeof x.minimum_cgpa === 'number' && x.minimum_cgpa >= 0 && x.minimum_cgpa <= 5 ? Math.round(x.minimum_cgpa * 100) / 100 : null,
    deadline: null
  };
  for (const k of COUNSELOR) { const v = s(x[k]); out[k] = v && grounded(v, text) ? v.slice(0, 600) : null; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(x.deadline || '') && !isNaN(new Date(x.deadline)) && text.includes(x.deadline.slice(0, 4))) out.deadline = x.deadline;
  if (!out.title) throw new Error('No title found in source text');
  return out;
}

async function extract(text) {
  if (!enabled()) throw new Error('LLM_DISABLED');
  const call = PROVIDERS[provider()];
  if (!call) throw new Error('Unknown LLM_PROVIDER: ' + provider());
  return { data: validate(await call(text), text), model: provider() + ':' + modelName() };
}
module.exports = { extract, enabled, validate, SCHEMA };
