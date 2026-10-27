# Eval Hiring Radar

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
| `npm run seeds` | Probes ~170 candidate companies' Ashby / Greenhouse / Lever boards and writes `config/sources.csv` (98 companies today) | – |
| `npm run fetch` | Reads every board + `data/raw/manual/`, stage-1 title lists, US/remote scope, 60-day cut-off, dedupe, removes closed roles | – |
| `npm run extract` | Title check for AI-ish titles, then one extraction per posting; verifies spans; stage 2 + both gates. `--limit 20`, `--force`, `--ids a,b` | `claude-haiku-5-5`, `claude-sonnet-5-5` |
| `npm run news` | Google News RSS + company feeds + lab model-release feeds → triggers | `claude-haiku-5-5` |
| `npm run sizes` | Employee band + public source URL via web search (LinkedIn/Glassdoor/Indeed blocked) | `claude-sonnet-5-5` |
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
- `config/weights.json`: score weights, trigger points, tiers, load factor, 60-day cut-off
- `config/sources.csv`: seed companies
- `config/model_release_feeds.json`, `config/company_feeds.json`, `config/manual_triggers.json` (manual "public complaints" flags)
- `config/site.json`: builder name for the footer, optional GitHub/LinkedIn URLs for the footer buttons
- `prompts/*.md`: extraction, title check, themes, briefs

## Pages

`/` landing · `/leads` ranked table, live weight sliders, Rejected tab with reasons · `/companies/[slug]` brief · `/postings/[id]` evidence with highlighted spans · `/gaps` · `/cost` · `/try` live demo (`POST /api/analyze`, streams progress, stores nothing, 10/hour per IP + `LIVE_DEMO_DAILY_LIMIT`) · `/method`.

"Refresh data" in the nav runs `npm run all` in the background (log in `data/pipeline.log`).

## Decisions taken on the spec's open questions

- **Non-US postings:** excluded in v1 (US + remote-from-US only), as the scope section says.
- **Real company names:** shown. Anonymizing for a NeoSigma demo is not built yet.
