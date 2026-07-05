# JLPT 合格リビューア — Reviewer & Study App

Targeted JLPT reviewers for all five levels (N5–N1), plus a static, mobile-friendly web app that turns them into an interactive study tool — reader, flashcards, and quizzes. No server, no database, no build tools beyond PowerShell.

## What's inside

```
Reviewer/
├── JLPT_N5_Reviewer.md    ← the reviewers (source of truth)
├── JLPT_N4_Reviewer.md
├── JLPT_N3_Reviewer.md
├── JLPT_N2_Reviewer.md
├── JLPT_N1_Reviewer.md
└── webapp/
    ├── index.html         ← open this in a browser
    ├── styles.css
    ├── app.js
    ├── data.js            ← GENERATED from the .md files — don't edit by hand
    └── build.ps1          ← regenerates data.js
```

Each reviewer covers the three sections that decide most passes and fails — **Grammar (文法)**, **Vocab/Kanji (語彙・漢字)**, and **Reading (読解)** — plus the scoring rules, time budgets, a final-48-hours checklist, and a multi-month study plan for that level. Listening is intentionally out of scope.

## Using the app

Open `webapp/index.html` in any modern browser (double-click works — no server needed), or host the `webapp/` folder on any static host (GitHub Pages, Netlify, etc.).

**Pick a level** (N5–N1, each color-coded), then switch between three modes:

- **📖 Review** — the full reviewer as collapsible sections, with live search that filters sections and highlights matches. Tables scroll sideways on phones.
- **🎴 Cards** — flashcards auto-extracted from the reviewer text:
  - *漢字読み*: kanji on the front; reading + English meaning on the back
  - *言い換え*: word on the front; paraphrase + English gloss on the back

  Tap to flip, then **✓ Got it** (marks mastered) or **↻ Again** (recycles it to the end of the deck). Mastered cards can be skipped, reshuffled, or reset.
- **✅ Quiz** — 10 multiple-choice questions drawn from the same decks, with instant feedback, the English meaning revealed after each answer, and a best-score record per level and deck.

All progress (mastered cards, best scores, theme, last level) is saved in the browser's `localStorage` — on that device only. The 🌓 button toggles dark/light mode.

## Editing the reviewers

The `.md` files are the single source of truth. After changing any of them, regenerate the app data:

```powershell
pwsh ./webapp/build.ps1
```

That rewrites `webapp/data.js` (the only generated file) and prints the new size. Refresh the browser to see changes.

### Flashcard format contract

The app parses flashcards straight out of the markdown, so formatting matters:

| Card type | Markdown pattern | Example |
|---|---|---|
| Kanji reading | `漢字(よみ — meaning)` | `滞る(とどこおる — to be delayed/stagnate)` |
| Paraphrase | `A ≒ B (english gloss)`, items separated by ` / ` | `案の定 ≒ 思ったとおり (just as expected)` |

Rules that bite:

- The separator inside the parentheses must be an **em dash `—`** (not a hyphen `-`). A hyphen still displays fine in the reader, but the entry won't get a meaning on its flashcard.
- The reading must be **hiragana** (multiple readings joined with `/` or `・` are fine: `家(いえ/うち — house; home)`).
- The English meaning is optional — `漢字(よみ)` alone still becomes a card, just without a gloss.
- Anything that doesn't match these patterns is simply ignored by the card parser; the reader view renders everything regardless.

New entries anywhere in a reviewer automatically become cards on the next build — there is no separate card list to maintain.

## The levels at a glance

| Level | Pass line | Scored sections | Combined LK+Reading block |
|---|---|---|---|
| N5 | 80/180 | 2 (LK・Reading pooled / Listening) | 20 + 40 min |
| N4 | 90/180 | 2 (LK・Reading pooled / Listening) | 25 + 55 min |
| N3 | 95/180 | 3 × 60, min 19 each | 30 + 70 min |
| N2 | 90/180 | 3 × 60, min 19 each | 105 min |
| N1 | 100/180 | 3 × 60, min 19 each | 110 min |

頑張ってください — perfection isn't the goal, points are. 💪
