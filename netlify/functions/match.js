// Deterministic eligibility matching. Never a "chance of winning" score.
const RANK = { pass:1, third:2, second_lower:3, second_upper:4, first:5 };
function match(p, s) {
  const met = [], unmet = [], unknown = [];
  const chk = (label, required, test, have) => {
    if (required == null || (Array.isArray(required) && !required.length)) return unknown.push(`${label}: not stated by the provider`);
    if (have == null || have === '') return unknown.push(`${label}: add this to your profile`);
    (test() ? met : unmet).push(label);
  };
  chk('Nationality', s.eligible_nationalities, () => s.eligible_nationalities.map(x=>x.toLowerCase()).includes((p.nationality||'').toLowerCase()), p.nationality);
  chk('Degree class', s.min_degree_class, () => (RANK[p.degree_class]||0) >= (RANK[s.min_degree_class]||0), p.degree_class);
  chk('Work experience', s.min_work_years, () => Number(p.work_years) >= Number(s.min_work_years), p.work_years);
  chk('English test', s.min_ielts, () => Number(p.ielts) >= Number(s.min_ielts), p.ielts);
  if (s.degree_levels?.length && p.target_levels?.length)
    (s.degree_levels.some(l => p.target_levels.includes(l)) ? met : unmet).push('Degree level');
  if (p.dest_countries?.length && s.country)
    (p.dest_countries.includes(s.country) ? met : unmet).push('Destination country');
  if (s.deadline && new Date(s.deadline) < new Date()) unmet.push('Deadline has passed');
  return { verdict: unmet.length ? 'not_met' : unknown.length ? 'uncertain' : 'eligible', met, unmet, unknown };
}
module.exports = { match };
