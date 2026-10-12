# Google Ads Scripts for PPC Audits and Reporting

Five free, read-only Google Ads scripts I use to audit and monitor accounts: a campaign performance audit, a search term report that includes Performance Max search terms, Shopping product performance, monthly budget pacing and a broken final URL checker.

Each script uses GAQL through `AdsApp.search()`, runs on its own (paste one file into one account) and **never changes the account**. No bids, budgets, negatives, product exclusions or tracking settings are touched.

Built by [Ishant Sharma](https://ishantsharmamarketer.com/), Google Ads specialist and founder of [Hustle Marketers](https://hustlemarketers.com/).

## The scripts

| Script | What it reports | First setting to review |
| --- | --- | --- |
| [`01-campaign-performance-audit.js`](01-campaign-performance-audit.js) | Campaign spend, clicks, conversions, CPA, conversion-value ROAS and review flags (spend with no conversions, CPA above target, ROAS below target). | Spend/click thresholds and your optional CPA or ROAS target. |
| [`02-search-term-review.js`](02-search-term-review.js) | Search and Shopping search terms at ad-group level plus Performance Max search terms at campaign level, in one report. | Date range, thresholds and `INCLUDE_PMAX`. |
| [`03-shopping-product-performance.js`](03-shopping-product-performance.js) | Product (item ID) performance by campaign, Merchant Center ID, feed label and language. Title variants are combined. | Thresholds and a value-based target suited to your products. |
| [`04-account-budget-pacing.js`](04-account-budget-pacing.js) | Calendar-month spend through yesterday versus your monthly media budget, projected month-end spend and the daily spend left. | `MONTHLY_BUDGET` (required). |
| [`05-ad-final-url-checker.js`](05-ad-final-url-checker.js) | HTTP status and redirects for every unique final URL used by enabled ads, so 404s and server errors are caught before they waste spend. | URL cap and delay. |

All results are review suggestions for a human to act on.

## Install in a Google Ads account

1. In Google Ads, open **Tools > Bulk actions > Scripts** and create a new script.
2. Paste one entire `.js` file.
3. Review its `CONFIG` block. Cost thresholds use the account's currency. CPA and ROAS targets are off by default because every account has different economics.
4. Authorize the script, click **Preview** and read the Logs.
5. For a full CSV in your own Google Drive, set `OUTPUT_TO_DRIVE: true` and run the script normally. Drive writes are skipped in Preview.
6. Once a run works, schedule it in Google Ads if you want recurring reports.

These are single-account scripts, not manager-account (MCC) scripts. Copy them into each account, or adapt them with an explicit account allowlist.

## How to read the results

- **Conversions** are the account's primary conversion metrics. Check conversion actions, attribution and reporting lag before acting on a flag.
- **Value ROAS** is conversion value divided by cost. If conversion value is a lead value, ROAS is not sales revenue or profit. See the [PPC profitability calculator](https://github.com/hustlemarketers-art/ppc-profitability-calculator) for margin-adjusted break-even ROAS.
- **NO_RULE_TRIGGERED** does not mean an account is optimized. It means none of the configured rules fired.
- **Search terms:** `search_term_view` excludes Performance Max, so PMax terms come from `campaign_search_term_view`. Both include only the terms Google exposes, not every search.
- **PMax compatibility:** if the Scripts runtime rejects the campaign-level term view, the script stops with a clear error. Set `INCLUDE_PMAX: false` to run the Search/Shopping report on its own.
- **Products:** based on `shopping_performance_view`. It is not a Merchant Center diagnostics or disapproval report. The row cap can limit the data retrieved.
- **Budget pacing:** the budget is your planning figure, not Google's billing cap. The projection is linear over completed account-local days and does not model demand changes, billing adjustments or tax.
- **URL checks:** a 200 response does not validate page content or conversion tracking. Redirects are recorded, not followed. A 403 or 429 means access or rate limiting, not necessarily a broken page. Feed URLs, PMax asset-group URLs, sitelinks and tracking templates are outside this inventory.

## Tests

With Node.js 18 or later:

```sh
npm test
```

13 tests run every script against synthetic Google Ads responses and mocked services. They cover micros conversion, review flags, Search plus PMax term merging, product aggregation, calendar dates, CSV escaping (including spreadsheet formula injection) and the Preview export guard. They do not call the live API, so run **Preview** in each account before relying on a report.

## Official documentation

- [Google Ads Scripts reports](https://developers.google.com/google-ads/scripts/docs/concepts/reports)
- [AdsApp reference](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp)
- [search_term_view](https://developers.google.com/google-ads/api/fields/v22/search_term_view)
- [campaign_search_term_view](https://developers.google.com/google-ads/api/fields/v22/campaign_search_term_view)
- [shopping_performance_view](https://developers.google.com/google-ads/api/fields/v22/shopping_performance_view)
- [ExecutionInfo (Preview detection)](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_executioninfo)
- [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)

## Related

- [seo-audit-toolkit](https://github.com/hustlemarketers-art/seo-audit-toolkit): technical SEO audit and Search Console query overlap scripts.
- [Google Ads Audit Checklist](https://hustlemarketers.com/tools/google-ads-audit-checklist/): a 64-check manual audit to pair with these reports.
- [Free PPC and SEO tools](https://hustlemarketers.com/tools/) from Hustle Marketers.

## Author

**Ishant Sharma** (Chandigarh, India) has managed Google Ads, Microsoft Advertising and Meta Ads accounts since 2013 and leads [Hustle Marketers](https://hustlemarketers.com/), a digital marketing agency. Need a hand with an account? [Get in touch](https://hustlemarketers.com/contact-us/).

## License

[MIT](LICENSE). Use, modify and share freely. All example data in the tests is fictional.
