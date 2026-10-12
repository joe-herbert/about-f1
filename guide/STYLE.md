# Writing for the guide

Each page lives at `guide/<section>/<slug>.md` and is published at `/guide/<section>/<slug>/`. Sections and their order are in `sections.json`. Run `npm run dev` and open `/guide/` to see changes as you save.

## Frontmatter

```
---
title: The safety car
description: One or two sentences, under 160 characters. Shown in search results, section lists and Google.
keywords: SC, neutralised, bunching, slow zone
order: 4
updated: 2026-10
---
```

- `title`: plain and specific. What a fan would type into a search box. No colons, no puns.
- `description`: answers the question in brief. Not a teaser.
- `keywords`: other words people might search for that aren't in the title: abbreviations, old names, slang (e.g. `DRS` on the overtake mode page). Comma separated.
- `order`: position within the section.

## Voice

Write the way a knowledgeable friend explains things at the track. Short sentences, everyday words, correct terms.

- Start with the answer. The first paragraph should tell the reader the thing they came for. Background comes after.
- Use the real terminology (parc fermé, undercut, MGU-K) and explain it the first time it appears.
- British spelling: tyre, colour, kerb, programme, neutralise.
- Numbers: use digits for anything measurable (5 seconds, 22 cars, 3 laps).
- Say what the rule is, then why it exists if that helps it make sense, then a real example if there's a good one.
- Where the rules leave room for judgement, say so. Don't make the stewards sound more consistent than they are.
- If a rule changed recently, say what it used to be. Lots of readers remember the old version.

Avoid these:

- Em dashes. Use a full stop, comma, colon or brackets.
- Filler openings ("In the world of Formula 1…", "When it comes to…", "Let's dive in").
- "It's not just X, it's Y" and similar setups.
- Grouping things in threes for rhythm.
- Words like delve, crucial, vital, pivotal, landscape, realm, intricate, navigate (unless it's about driving), tapestry, testament, seamless, robust, game-changer, ever-evolving.
- Summary paragraphs that repeat the page ("In short…", "In conclusion…", "Overall…").
- Bold text at the start of every bullet. Use bold sparingly, for a term being defined.
- Exclamation marks and hype.
- Questions as headings unless it really is a question people ask ("Why don't they just use one tyre?").

## Structure

- Use `##` for main parts of the page and `###` below that. The `##` headings appear in the "On this page" box and in search results, so make them descriptive.
- Paragraphs over bullets. Use lists for things that really are lists (steps in order, a set of options).
- Use tables for reference data: points, flags, compounds.
- Use a blockquote for one-off notes like a rule that changed this season. Don't overuse it.
- Link to other guide pages using root-relative paths: `[safety car](/guide/race/safety-car/)`. Broken links fail the build.
- Most pages land between 400 and 1,000 words. Shorter is fine if the topic is small.

## Accuracy

The guide describes the current season's sporting and technical regulations. Check numbers against the FIA regulations or formula1.com before publishing. If something is unclear or disputed, say that rather than guessing.
