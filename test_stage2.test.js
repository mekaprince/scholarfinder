const test=require('node:test'),a=require('node:assert'),{validate}=require('./netlify/functions/ai_extract');
test('rejects unsupported values',()=>{const r=validate({title:'X Award',funding_type:'Everything Paid',minimum_cgpa:9,deadline:'2031-01-01',host_institution:null,country:null,eligibility_criteria:null},'text from 2027');
  a.equal(r.funding_type,null);a.equal(r.minimum_cgpa,null);a.equal(r.deadline,null);});
test('accepts supported values',()=>{const r=validate({title:'X Award',funding_type:'Partial',minimum_cgpa:3.5,deadline:'2027-02-01'},'Deadline 1 Feb 2027');
  a.equal(r.funding_type,'Partial');a.equal(r.minimum_cgpa,3.5);a.equal(r.deadline,'2027-02-01');});
