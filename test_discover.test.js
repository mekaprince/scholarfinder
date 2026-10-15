const test=require('node:test'),a=require('node:assert'),{parseFeed,extractDeadline}=require('./netlify/functions/discover_lib');
test('deadline formats',()=>{a.equal(extractDeadline('Application deadline: 15 January 2027.'),'2027-01-15');
  a.equal(extractDeadline('Closes on March 3rd, 2027'),'2027-03-03');a.equal(extractDeadline('no date here'),null);});
test('rss parsing',()=>{const r=parseFeed('<rss><channel><item><title>Test Award</title><link>https://example.org/a</link><description><![CDATA[<p>Apply by 1 Feb 2027</p>]]></description></item></channel></rss>');
  a.equal(r.length,1);a.equal(r[0].title,'Test Award');a.equal(extractDeadline(r[0].text),'2027-02-01');});
test('items without a link are dropped',()=>a.equal(parseFeed('<item><title>x</title></item>').length,0));
