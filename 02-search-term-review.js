/**
 * Search and Shopping terms, plus campaign-level Performance Max terms.
 * Author: Ishant Sharma, Hustle Marketers (https://hustlemarketers.com)
 * Source: https://github.com/hustlemarketers-art/google-ads-scripts (MIT License)
 * Paste this entire file into ONE Google Ads account script.
 * Preview first. Default output is Logs; no account changes.
 */
const CONFIG = {
  DATE_RANGE: 'LAST_30_DAYS',
  MIN_COST: 100,             // Account currency; choose a meaningful threshold.
  MIN_CLICKS: 30,
  MIN_CONVERSIONS: 5,
  TARGET_CPA: 0,             // 0 disables this rule; enter your own target.
  TARGET_ROAS: 0,            // Ratio, for example 4 means 4x. 0 disables.
  MAX_ROWS: 20000,
  LOG_ROWS: 20,
  OUTPUT_TO_DRIVE: false,     // Set true only when you want a private CSV export.
  INCLUDE_PMAX: true
};


function termRow(row, options, pmax) {
  const m = reviewMetrics(row.metrics);
  return { source: pmax ? 'campaign_search_term_view' : 'search_term_view',
    campaign_id: String(row.campaign.id), campaign: row.campaign.name,
    ad_group_id: pmax ? '' : String(row.adGroup.id), ad_group: pmax ? '' : row.adGroup.name,
    search_term: pmax ? row.campaignSearchTermView.searchTerm : row.searchTermView.searchTerm,
    cost: m.cost, clicks: m.clicks, recorded_conversions: m.conversions,
    conversion_value: m.value, cpa: m.cpa, value_roas: m.roas,
    review: flagsFor(m, options) };
}
function main() {
  validateConfig();
  const metrics = 'metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value ';
  const standard = 'SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, ' + metrics +
    "FROM search_term_view WHERE campaign.advertising_channel_type IN ('SEARCH', 'SHOPPING') " +
    "AND campaign.status != 'REMOVED' AND metrics.cost_micros > 0 AND segments.date DURING " + CONFIG.DATE_RANGE + ' ORDER BY metrics.cost_micros DESC';
  let rows = readRows(standard).map(row => termRow(row, CONFIG, false));
  if (CONFIG.INCLUDE_PMAX) {
    const pmax = 'SELECT campaign.id, campaign.name, campaign_search_term_view.search_term, ' + metrics +
      "FROM campaign_search_term_view WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' " +
      "AND campaign.status != 'REMOVED' AND metrics.cost_micros > 0 AND segments.date DURING " + CONFIG.DATE_RANGE + ' ORDER BY metrics.cost_micros DESC';
    try { rows = rows.concat(readRows(pmax).map(row => termRow(row, CONFIG, true))); }
    catch (error) { throw new Error('Performance Max term query failed. No combined report was exported. If this view is unavailable in your Scripts runtime, set INCLUDE_PMAX=false to run the Search/Shopping report. Detail: ' + error.message); }
  }
  rows.sort((a,b) => b.cost-a.cost);
  emitReport('search-term-review', rows, ['source','campaign_id','campaign','ad_group_id','ad_group','search_term','cost','clicks','recorded_conversions','conversion_value','cpa','value_roas','review']);
}


// Reporting helpers. Account settings, bids, ads and exclusions are never changed.
function amount(value) { const n = Number(value || 0); if (!Number.isFinite(n)) throw new Error('Invalid numeric report value'); return n; }
function ratio(a, b) { return b > 0 ? a / b : null; }
function reviewMetrics(metrics) {
  const cost = amount(metrics.costMicros) / 1000000;
  const clicks = amount(metrics.clicks), impressions = amount(metrics.impressions);
  const conversions = amount(metrics.conversions), value = amount(metrics.conversionsValue);
  return { cost, clicks, impressions, conversions, value, cpa: ratio(cost, conversions), roas: ratio(value, cost), cpc: ratio(cost, clicks) };
}
function flagsFor(m, options) {
  const flags = [];
  if (m.cost >= options.MIN_COST && m.clicks >= options.MIN_CLICKS && m.conversions === 0) flags.push('REVIEW_COST_WITHOUT_RECORDED_CONVERSIONS');
  if (options.TARGET_CPA > 0 && m.conversions >= options.MIN_CONVERSIONS && m.cpa > options.TARGET_CPA) flags.push('REVIEW_CPA_ABOVE_ENTERED_TARGET');
  if (options.TARGET_ROAS > 0 && m.cost >= options.MIN_COST && m.conversions >= options.MIN_CONVERSIONS && m.value > 0 && m.roas < options.TARGET_ROAS) flags.push('REVIEW_ROAS_BELOW_ENTERED_TARGET');
  return flags.length ? flags.join('; ') : 'NO_RULE_TRIGGERED';
}
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') return String(Math.round(value * 1000000) / 1000000);
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function toCSV(rows, headers) {
  return [headers.map(csvCell).join(',')].concat(rows.map(row => headers.map(key => csvCell(row[key])).join(','))).join('\r\n');
}
function readRows(query) {
  const iterator = AdsApp.search(query), result = [];
  while (iterator.hasNext()) { result.push(iterator.next()); if (result.length >= CONFIG.MAX_ROWS) { Logger.log('Row cap reached. Results may be incomplete. Increase MAX_ROWS or shorten the date range.'); break; } }
  return result;
}
function validateConfig() {
  if (!/^(LAST_7_DAYS|LAST_14_DAYS|LAST_30_DAYS|THIS_MONTH|LAST_MONTH)$/.test(CONFIG.DATE_RANGE)) throw new Error('Unsupported DATE_RANGE.');
  if (!Number.isInteger(CONFIG.MAX_ROWS) || CONFIG.MAX_ROWS < 1) throw new Error('MAX_ROWS must be a positive integer.');
  ['MIN_COST','MIN_CLICKS','TARGET_CPA','TARGET_ROAS','MIN_CONVERSIONS'].forEach(key => {
    if (key in CONFIG && (!Number.isFinite(CONFIG[key]) || CONFIG[key] < 0)) throw new Error(key + ' must be zero or more.');
  });
}
function emitReport(name, rows, headers) {
  const account = AdsApp.currentAccount();
  Logger.log(name + ': ' + rows.length + ' rows | account ' + account.getCustomerId() + ' | ' + account.getCurrencyCode() + ' | ' + CONFIG.DATE_RANGE);
  rows.slice(0, CONFIG.LOG_ROWS).forEach(row => Logger.log(JSON.stringify(row)));
  if (rows.length > CONFIG.LOG_ROWS) Logger.log('Logs show only the first ' + CONFIG.LOG_ROWS + ' rows. Enable the CSV export for the full report.');
  if (!CONFIG.OUTPUT_TO_DRIVE) return;
  if (AdsApp.getExecutionInfo().isPreview()) { Logger.log('Preview: Drive export skipped.'); return; }
  const filename = name + '-' + account.getCustomerId().replace(/-/g, '') + '-' + new Date().toISOString().slice(0,10) + '.csv';
  const file = DriveApp.createFile(filename, toCSV(rows, headers), 'text/csv');
  Logger.log('CSV saved to your own Google Drive: ' + file.getUrl());
}
