const test=require('node:test'),a=require('node:assert'),{match}=require('./netlify/functions/match');
test('unknown requirement is uncertain, not eligible',()=>a.equal(match({nationality:'Nigerian'},{degree_levels:[]}).verdict,'uncertain'));
test('confirmed unmet requirement',()=>a.equal(match({nationality:'Nigerian',degree_class:'third'},{eligible_nationalities:['Nigerian'],min_degree_class:'first',degree_levels:[]}).verdict,'not_met'));
test('all confirmed met',()=>a.equal(match({nationality:'Nigerian',degree_class:'first',work_years:3,ielts:7},{eligible_nationalities:['Nigerian'],min_degree_class:'second_upper',min_work_years:2,min_ielts:6.5,degree_levels:[]}).verdict,'eligible'));
