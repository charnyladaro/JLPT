# JLPT 道場 — Study Dojo

A single-page, offline-capable JLPT study app for N5–N1. No server, no build step, no dependencies — open `index.html` in any modern browser (double-click works).

## What's inside

- **Grammar** — 693 grammar points scraped from japanesetest4you.com, each with meaning, formation, and native example sentences (JP / EN / romaji, with audio streamed from the source site when online). Mark points as known; progress shows on the home dashboard.
- **Vocab** — full word lists per level (4,700+ words), searchable, plus a flashcard drill with mastered-word tracking.
- **Practice** — 516 real exercise sets (grammar・vocabulary・kanji・reading) with 4,600+ answered questions, instant feedback and explanations, per-test best scores, and a random-drill mode. Keyboard: 1–4 to answer, Enter for next.
- **Reviewer** — the five `JLPT_Nx_Reviewer.md` files from `../Reviewer/` rendered with a table of contents and scrollspy.
- **Docs** — the full exam reference from `../jlpt-docs.html` (scoring, tactics, per-level guides).

All progress (known grammar, mastered vocab, best scores, theme) lives in `localStorage`.

## Files

```
webapp/
├── index.html        app shell
├── styles.css        design system (light/dark)
├── app.js            router + all views
├── md.js             markdown renderer for the reviewers
├── build-data.mjs    wraps data/*.json into data/*.js (file:// safe)
├── scrape.py         re-scrapes japanesetest4you.com into data/*.json
└── data/             generated JSON + JS data files
```

## Refreshing data

```powershell
python scrape.py          # re-scrape the source site (few minutes)
node build-data.mjs       # rewrap JSON → JS
```

After editing the reviewers in `../Reviewer/*.md`, regenerate `data/reviewers.json`:

```powershell
node -e "const fs=require('fs');const o={};for(const l of ['N5','N4','N3','N2','N1'])o[l]=fs.readFileSync('../Reviewer/JLPT_'+l+'_Reviewer.md','utf8');fs.writeFileSync('data/reviewers.json',JSON.stringify(o))"
node build-data.mjs
```
