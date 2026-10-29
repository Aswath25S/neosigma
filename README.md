# Potential Market for Neosigma

Finds companies paying people to do, by hand, the work NeoSigma automates, and ranks them as sales leads.

Independent prototype, not affiliated with or endorsed by NeoSigma.

## Setup

```bash
npm install
cp .env.example .env.local     # then set ANTHROPIC_API_KEY (Claude Platform key)
npm run all                    # fetch → extract → news → sizes → score → themes → score → briefs
npm run dev                    # http://localhost:3000
```

No Python or virtualenv is needed; everything is Node (dependencies live in `node_modules`). The database is a single SQLite file at `data/radar.db`, created and migrated on first use.

## Pipeline

| Script | What it does | Claude model |
| --- | --- | --- |
| `npm run seeds` | Builds `config/sources.csv`: curated agent and vertical-AI companies probed on Ashby / Greenhouse / Lever / Workable, enterprises on Workday / SmartRecruiters, and Hacker News "Who is hiring?" posts (Claude keeps companies running a customer-facing agent) | `claude-haiku-5-5` |
| `npm run fetch` | Reads every board + `data/raw/manual/`; keeps postings selected by title or by a keyword pre-screen of the description; English only, all regions, 180-day cut-off, dedupe; removes closed roles; saves ECB exchange rates | – |
| `npm run extract` | Claude description screen for every posting not selected by a keep/conditional title, then one extraction per posting; verifies spans; stage 2 + both gates. `--limit 20`, `--force`, `--ids a,b` | `claude-haiku-5-5`, `claude-sonnet-5-5` |
| `npm run news` | Google News RSS + company feeds + lab model-release feeds → triggers | `claude-haiku-5-5` |
| `npm run sizes` | Employee band + public source URL via web search for lead companies (LinkedIn/Glassdoor/Indeed blocked; `--all` for every company) | `claude-sonnet-5-5` |
| `npm run score` | All scores, tiers, lead/rejected status — in code, no Claude | – |
| `npm run themes` | Groups not-covered duties into gap themes (keeps founder status across runs) | `claude-opus-5-5` |
| `npm run briefs` | Briefs for the top 10 leads (`--slug x`, `--all`); uncited sentences are dropped | `claude-opus-5-5` |
| `npm run eval` | Duty-label accuracy vs. `data/eval/hand_labels.json` (`--template` writes 20 postings to label) | – |

Claude results are cached in `data/cache/claude/` by a hash of model + prompt + input, so re-runs only pay for what changed. Sonnet/Opus calls use the server-side refusal fallback (`fallbacks: "default"`).

### Accuracy check (do this before scaling)

```bash
npm run fetch && npm run extract -- --limit 20
npm run eval -- --template      # data/eval/to_label.json: posting text + duty spans, no model labels
# write data/eval/hand_labels.json:
# { "labeller": "...", "method": "...", "postings": [ { "posting_id": "...", "company": "...", "title": "...",
#     "duties": [ { "source_span": "exact text", "label": "covered|assisted|not_covered", "task_id": "T1" | null } ] } ] }
npm run eval                    # needs ≥ 85%; result shows on /method
```

## Config (editable without code changes)

- `config/coverage_map.json`: T1–T6, labels, proof studies
- `config/roles.json`: keep / conditional / drop title lists and patterns, gate thresholds
- `config/weights.json`: score weights, trigger points, tiers, salary basis, posting age cut-off
- `config/sources.csv`: seed companies
- `config/model_release_feeds.json`, `config/company_feeds.json`, `config/manual_triggers.json` (manual "public complaints" flags)
- `config/site.json`: builder name for the footer, optional GitHub/LinkedIn URLs for the footer buttons
- `prompts/*.md`: extraction, title check, themes, briefs

## Pages

`/` landing · `/leads` ranked table, live weight sliders, Rejected tab with reasons · `/companies/[slug]` brief · `/postings/[id]` evidence with highlighted spans · `/gaps` · `/salary` (Salary & Roles: posted salaries by role, company and role family) · `/method`.

`POST /api/refresh` runs `npm run all` in the background when running locally (log in `data/pipeline.log`); it is disabled on Vercel.

## Changes from the build spec

- **Wider net (spec: 60–100 seeds, title-first filter).** Hundreds of seed companies, and every posting not on the keep/conditional/drop title lists is judged on its description by a Claude screen. The Drop list still applies by title, as the spec requires.
- **180-day cut-off** instead of 60 (`config/weights.json` → `fetch.max_posting_age_days`).
- **All regions, English only** instead of US + remote (`fetch.regions`). Non-USD salaries are converted at ECB reference rates.
- **Workable, SmartRecruiters and Workday** boards added. On Workday and SmartRecruiters only jobs returned by the board's search for AI and eval terms are read (at most 150 per board).
- **Looser overlap gates:** at least 35% of duties Covered or Assisted (spec: 50%), and conditional titles need 2 of T1–T6 (spec: 3). The live-agent gate is unchanged. Both values are in `config/roles.json`.
- **Real company names** are shown. Anonymizing for a NeoSigma demo is not built yet.
