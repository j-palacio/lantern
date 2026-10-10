# Grilling session

Goal: have Claude Code attack our plan before we write code. Expect 1-2 hours.

## Setup

1. Install Matt Pocock's skills: https://github.com/mattpocock/skills (use `grill-me`).
2. Open Claude Code in this repo.
3. Paste or point it at `docs/NOTES.md` and `docs/ARCHITECTURE.md`.

## Prompt

> Read docs/NOTES.md and docs/ARCHITECTURE.md. Use the grill-me skill to critique our idea, our technical understanding, and every claim in the notes. Ask one question at a time. Push back where we're vague or wrong. Don't write code.

## After the grilling

Prompt:

> Based on this session, draft ~6 milestones in docs/MILESTONES.md. For each one: the goal, detailed implementation steps, files touched, and exactly how I test that it works. Each milestone must be buildable in a fresh session with only CLAUDE.md, ARCHITECTURE.md and that milestone as context. Also update docs/ARCHITECTURE.md with any decisions we made.

## Decisions made

-
