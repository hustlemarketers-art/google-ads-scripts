'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(filename, datasets = []) {
  const logs=[], queries=[], exports=[];
  let queryIndex=0;
  const context=vm.createContext({
    Logger:{log:value=>logs.push(String(value))},
    AdsApp:{
      search:query=>{queries.push(query); const rows=datasets[queryIndex++] || []; let index=0; return {hasNext:()=>index<rows.length,next:()=>rows[index++]};},
      currentAccount:()=>({getCustomerId:()=> '000-000-0000',getCurrencyCode:()=> 'USD',getTimeZone:()=> 'Etc/UTC'}),
      getExecutionInfo:()=>({isPreview:()=>true})
    },
    DriveApp:{createFile:(name,body,type)=>{exports.push({name,body,type});return{getUrl:()=> 'https://example.invalid/private-report'};}},
    Utilities:{formatDate:()=> '2026-10-12',sleep:()=>{}},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getHeaders:()=>({})})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),context);
  return {context,logs,queries,exports,run:source=>vm.runInContext(source,context)};
}

const sampleMetrics={costMicros:200000000,clicks:40,impressions:1000,conversions:0,conversionsValue:0};

test('All five scripts compile and defaults remain reporting-only',()=>{
  for(const name of fs.readdirSync(path.join(__dirname,'..')).filter(name=>name.endsWith('.js'))){
    const script=load(name);
    assert.equal(script.run('CONFIG.OUTPUT_TO_DRIVE'),false);
    assert.equal(script.run('ratio(1,0)'),null);
  }
});

test('Campaign audit converts micros and identifies cost without conversions',()=>{
  const row={campaign:{id:123,name:'Demo',status:'ENABLED',advertisingChannelType:'SEARCH'},metrics:sampleMetrics};
  const script=load('01-campaign-performance-audit.js',[[row]]);
  script.run('main()');
  assert.ok(script.queries[0].includes('FROM campaign'));
  const parsed=JSON.parse(script.logs.find(value=>value.startsWith('{')));
  assert.equal(parsed.cost,200);
  assert.equal(parsed.cpa,null);
  assert.equal(parsed.review,'REVIEW_COST_WITHOUT_RECORDED_CONVERSIONS');
  assert.equal(script.exports.length,0);
});

test('CPA and ROAS rules apply only with configured targets and enough conversions',()=>{
  const script=load('01-campaign-performance-audit.js');
  assert.equal(script.run("flagsFor({cost:200,clicks:40,conversions:2,value:100,cpa:100,roas:0.5},{MIN_COST:100,MIN_CLICKS:30,MIN_CONVERSIONS:5,TARGET_CPA:20,TARGET_ROAS:4})"),'NO_RULE_TRIGGERED');
  assert.ok(script.run("flagsFor({cost:200,clicks:40,conversions:10,value:400,cpa:20,roas:2},{MIN_COST:100,MIN_CLICKS:30,MIN_CONVERSIONS:5,TARGET_CPA:10,TARGET_ROAS:4})").includes('CPA_ABOVE'));
});

test('Search-term review uses separate Search/Shopping and PMax views',()=>{
  const standard={campaign:{id:1,name:'Search'},adGroup:{id:2,name:'Demo'},searchTermView:{searchTerm:'sample term'},metrics:sampleMetrics};
  const pmax={campaign:{id:3,name:'PMax'},campaignSearchTermView:{searchTerm:'sample pmax term'},metrics:sampleMetrics};
  const script=load('02-search-term-review.js',[[standard],[pmax]]);
  script.run('main()');
  assert.equal(script.queries.length,2);
  assert.ok(script.queries[1].includes('FROM campaign_search_term_view'));
  const reports=script.logs.filter(line=>line.startsWith('{')).map(JSON.parse);
  assert.equal(reports[0].source,'search_term_view');
  assert.equal(reports[1].source,'campaign_search_term_view');
  assert.equal(reports[1].ad_group_id,'');
});

test('Shopping product IDs remain strings and undefined CPA is not zero',()=>{
  const row={campaign:{id:1,name:'Shopping'},segments:{productMerchantId:42,productFeedLabel:'US',productLanguage:'en',productItemId:'000123',productTitle:'Demo product'},metrics:sampleMetrics};
  const script=load('03-shopping-product-performance.js',[[row]]);
  script.run('main()');
  const report=JSON.parse(script.logs.find(line=>line.startsWith('{')));
  assert.equal(report.item_id,'000123');
  assert.equal(report.cpa,null);
});

test('Product title variants aggregate under the same SKU identity',()=>{
  const row={campaign:{id:1,name:'Shopping'},segments:{productMerchantId:42,productFeedLabel:'US',productLanguage:'en',productItemId:'000123',productTitle:'Original title'},metrics:sampleMetrics};
  const second={...row,segments:{...row.segments,productTitle:'Revised title'}};
  const script=load('03-shopping-product-performance.js',[[row,second]]);
  script.run('main()');
  const report=JSON.parse(script.logs.find(line=>line.startsWith('{')));
  assert.equal(report.cost,400);
  assert.equal(report.clicks,80);
  assert.ok(report.title.includes('Original title') && report.title.includes('Revised title'));
});

test('Calendar pacing excludes the current partial day and handles month lengths',()=>{
  const script=load('04-account-budget-pacing.js');
  const report=script.run("pacing(1100,'2026-10-12',3100)");
  assert.equal(report.completed_days,11);
  assert.equal(report.planned_spend_through_yesterday,1100);
  assert.equal(report.projected_month_spend,3100);
  assert.equal(report.average_daily_spend_remaining,100);
  assert.equal(script.run("pacing(0,'2024-02-01',2900).days_in_month"),29);
  assert.equal(script.run("pacing(0,'2024-02-01',2900).projected_month_spend"),null);
  assert.throws(()=>script.run("pacing(100,'2026-10-12',0)"));
  assert.throws(()=>script.run("pacing(100,'2026-02-30',1000)"));
});

test('Budget main queries only completed days',()=>{
  const script=load('04-account-budget-pacing.js',[[{metrics:{costMicros:1100000000}}]]);
  script.run('CONFIG.MONTHLY_BUDGET=3100; main()');
  assert.ok(script.queries[0].includes("'2026-10-01' AND '2026-10-11'"));
});

test('HTTP access denials are not classified as broken links',()=>{
  const script=load('05-ad-final-url-checker.js');
  assert.equal(script.run('statusReview(403)'),'ACCESS_OR_RATE_LIMIT_REVIEW');
  assert.equal(script.run('statusReview(429)'),'ACCESS_OR_RATE_LIMIT_REVIEW');
  assert.equal(script.run('statusReview(404)'),'BROKEN_URL_REVIEW');
  assert.equal(script.run('statusReview(301)'),'REDIRECT_NOT_FOLLOWED_REVIEW');
  assert.equal(script.run("inspectFinalURL('https://example.com/{lpurl}').review"),'URL_REQUIRES_MANUAL_RESOLUTION');
});

test('URL checker deduplicates URLs and records usage',()=>{
  const ad={campaign:{name:'Demo'},adGroup:{name:'A'},adGroupAd:{ad:{id:1,finalUrls:['https://example.com/a']}}};
  const script=load('05-ad-final-url-checker.js',[[ad,ad]]);
  script.run('main()');
  assert.ok(script.logs[0].includes('1 rows'));
});

test('CSV escapes quoted text, formulas, and preserves negative numeric values',()=>{
  const script=load('01-campaign-performance-audit.js');
  assert.equal(script.run("csvCell('=SUM(A1:A2)')"),'"\'=SUM(A1:A2)"');
  assert.equal(script.run('csvCell(-10)'),'-10');
  assert.equal(script.run("csvCell('a\"b')"),'"a""b"');
  assert.equal(script.run('csvCell(null)'),'""');
});

test('Preview suppresses Drive writes even when export is configured',()=>{
  const script=load('01-campaign-performance-audit.js');
  script.run("CONFIG.OUTPUT_TO_DRIVE=true;emitReport('demo',[{cost:5}],['cost'])");
  assert.equal(script.exports.length,0);
  assert.ok(script.logs.includes('Preview: Drive export skipped.'));
});

test('A normal run with export enabled produces the intended CSV only',()=>{
  const script=load('01-campaign-performance-audit.js');
  script.context.AdsApp.getExecutionInfo=()=>({isPreview:()=>false});
  script.run("CONFIG.OUTPUT_TO_DRIVE=true;emitReport('demo',[{cost:5}],['cost'])");
  assert.equal(script.exports.length,1);
  assert.equal(script.exports[0].body,'"cost"\r\n5');
});
