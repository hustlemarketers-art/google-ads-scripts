/**
 * Calendar-month pacing against your entered account-wide media budget.
 * Author: Ishant Sharma, Hustle Marketers (https://hustlemarketers.com)
 * Source: https://github.com/hustlemarketers-art/google-ads-scripts (MIT License)
 * Paste this entire file into ONE Google Ads account script.
 * Preview first. Default output is Logs; no account changes.
 */
const CONFIG = {
  DATE_RANGE: 'THIS_MONTH',
  MONTHLY_BUDGET: 0,        // REQUIRED: your calendar-month media budget, in account currency.
  MAX_ROWS: 100,
  LOG_ROWS: 20,
  OUTPUT_TO_DRIVE: false
};


function pacing(spend, today, budget) {
  if (!Number.isFinite(budget) || budget <= 0) throw new Error('Set MONTHLY_BUDGET to your positive calendar-month media budget.');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) throw new Error('Invalid account-local date.');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days) throw new Error('Invalid account-local date.');
  const elapsed = day - 1, remaining = days-elapsed;
  const left = budget-spend;
  return { account_local_date: today, monthly_media_budget: budget,
    completed_days: elapsed, days_in_month: days, spend_through_yesterday: spend,
    planned_spend_through_yesterday: budget*elapsed/days,
    projected_month_spend: elapsed > 0 ? spend/elapsed*days : null,
    budget_remaining: left, average_daily_spend_remaining: Math.max(0,left)/remaining,
    review: left < 0 ? 'ENTERED_MONTHLY_BUDGET_ALREADY_EXCEEDED' : elapsed === 0 ? 'FIRST_DAY_NO_COMPLETED_DAY_PROJECTION' : 'REVIEW_AGAINST_ENTERED_CALENDAR_BUDGET' };
}
function main() {
  validateConfig();
  if (!Number.isFinite(CONFIG.MONTHLY_BUDGET) || CONFIG.MONTHLY_BUDGET <= 0) throw new Error('Set MONTHLY_BUDGET first.');
  const account = AdsApp.currentAccount();
  const today = Utilities.formatDate(new Date(), account.getTimeZone(), 'yyyy-MM-dd');
  const parts = today.split('-').map(Number);
  let spend = 0;
  if (parts[2] > 1) {
    const yesterday = new Date(Date.UTC(parts[0],parts[1]-1,parts[2]-1)).toISOString().slice(0,10);
    const query = 'SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN ' +
      "'" + today.slice(0,8) + "01' AND '" + yesterday + "'";
    readRows(query).forEach(row => { spend += amount(row.metrics.costMicros)/1000000; });
  }
  const rows = [pacing(spend,today,CONFIG.MONTHLY_BUDGET)];
  emitReport('account-budget-pacing', rows, Object.keys(rows[0]));
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
