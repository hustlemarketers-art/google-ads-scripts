/**
 * HTTP status inventory for enabled ad final URLs.
 * Author: Ishant Sharma, Hustle Marketers (https://hustlemarketers.com)
 * Source: https://github.com/hustlemarketers-art/google-ads-scripts (MIT License)
 * Paste this entire file into ONE Google Ads account script.
 * Preview first. Default output is Logs; no account changes.
 */
const CONFIG = {
  DATE_RANGE: 'LAST_30_DAYS',
  MAX_ROWS: 10000,
  MAX_URLS: 50,             // Caps outbound URL checks per run.
  DELAY_MS: 200,
  LOG_ROWS: 20,
  OUTPUT_TO_DRIVE: false
};


function statusReview(status) {
  if (status === 404 || status === 410) return 'BROKEN_URL_REVIEW';
  if (status === 401 || status === 403 || status === 429) return 'ACCESS_OR_RATE_LIMIT_REVIEW';
  if (status >= 500) return 'SERVER_ERROR_REVIEW';
  if (status >= 300 && status < 400) return 'REDIRECT_NOT_FOLLOWED_REVIEW';
  return status >= 200 && status < 300 ? 'HTTP_OK_CONTENT_NOT_VALIDATED' : 'HTTP_STATUS_REVIEW';
}
function inspectFinalURL(url) {
  if (!/^https?:\/\//i.test(url) || /\{[^}]*\}/.test(url)) return { url, http_status: '', redirect_location: '', review: 'URL_REQUIRES_MANUAL_RESOLUTION', detail: 'Only literal HTTP(S) URLs are fetched.' };
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true });
    const status = response.getResponseCode(), headers = response.getHeaders();
    const locationKey = Object.keys(headers).find(key => key.toLowerCase() === 'location');
    return { url, http_status: status, redirect_location: locationKey ? String(headers[locationKey]) : '', review: statusReview(status), detail: 'Tracking templates and landing-page content were not tested.' };
  } catch (error) { return { url, http_status: '', redirect_location: '', review: 'REQUEST_FAILED_REVIEW', detail: String(error.message || error) }; }
}
function main() {
  validateConfig();
  if (!Number.isInteger(CONFIG.MAX_URLS) || CONFIG.MAX_URLS < 1) throw new Error('MAX_URLS must be positive.');
  const query = 'SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.final_urls ' +
    "FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'";
  const uses = {};
  readRows(query).forEach(row => {
    (row.adGroupAd.ad.finalUrls || []).forEach(url => {
      if (!Object.prototype.hasOwnProperty.call(uses,url)) uses[url] = [];
      uses[url].push(row.campaign.name + ' / ' + row.adGroup.name + ' / ad ' + row.adGroupAd.ad.id);
    });
  });
  const urls = Object.keys(uses);
  const rows = urls.slice(0,CONFIG.MAX_URLS).map(url => {
    const report = inspectFinalURL(url); report.used_by = uses[url].join(' | ');
    if (CONFIG.DELAY_MS > 0) Utilities.sleep(CONFIG.DELAY_MS);
    return report;
  });
  if (urls.length > CONFIG.MAX_URLS) Logger.log('URL cap reached: checked ' + CONFIG.MAX_URLS + ' of ' + urls.length + '.');
  emitReport('ad-final-url-checker', rows, ['url','http_status','redirect_location','review','detail','used_by']);
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
