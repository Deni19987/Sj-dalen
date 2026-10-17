# Agent Instructions — Sjödalen Bilar

This file orients coding agents (Claude Code, Cursor, etc.) working in this repo. It covers how the owner wants to work with agents and their standing preferences. For how the site is built (pages, local setup, database, admin), see `README.md`.

## 0. Workflow (MANDATORY — read this first)

Before making any change:

1. **Read AGENTS.md first.** You are reading it now. Re-read it if you have not looked at it in this session.
2. **Create a plan.** For anything larger than a one-line fix, write a plan before touching code. Outline what files will change and why.
3. **Wait for approval on large changes.** Do not implement re-architecture, library swaps, or schema redesigns without explicit user confirmation.
4. **Implement.** Make the smallest change that satisfies the request.
5. **Verify TypeScript builds.** With dependencies installed, run `npm run typecheck` (and `npm run build` for larger changes) locally. If the PR gets a Netlify deploy preview, check that it builds green before calling the work done.
6. **Verify existing functionality still works.** Check the site in a browser for UI changes; check the API/function logs for backend changes.
7. **Create a PR summary.** When finishing work, summarize what changed and why in plain language.
8. **Report back to the owner briefly.** The owner does not want to read long reports. After a task, reply in Swedish with a short summary, a few bullets at most, covering only:
   - **Klart:** the important things that were done.
   - **Ta ställning till:** decisions the owner needs to make or approve (e.g. a database change waiting to be applied, an option to choose).
   - **Avvikelser:** anything that turned out differently from what was asked or planned and affects the result (a step skipped, a different approach, something not verified).
   Leave out sections that are empty. Put details in the PR description, not in the chat. The owner can ask for more.
9. **Write for a non-programmer.** The owner does not know programming. They know what they want to see and happen on the site, not the code behind it. In every message to them:
   - Describe things by what happens on the site ("the car page shows the wrong price"), never by code, tables, columns, migrations, files or function names.
   - Ask questions as a choice about the site's behaviour, with what each answer means in practice. Recommend one.
   - If something technical must be mentioned, explain in one plain sentence what it is and why it matters to them.
   - Never use internal labels (ticket codes, table names) without saying what they are.

10. **Push notification when finished.** When a task is finished (pushed and the PR created/updated), always send the owner a push notification to the Claude app on their iPhone through Remote Control (the `PushNotification` tool): one short line in Swedish saying what is done and whether anything waits on them.

## 0.1 PR Workflow (MANDATORY)

Follow this pattern every time you finish a set of changes. "Default branch" below means the repo's default branch on GitHub (the one PRs are merged into).

0. **Before pushing anything to an existing branch, check whether its PR was merged.** A PR opened earlier in this session (or a prior session) may have been merged in the meantime — by the user, by another agent, or via auto-merge — without you being told. Do not assume a branch's PR is still open just because you opened it. Query the actual PR state (`list_pull_requests` / `pull_request_read`, or `gh pr view <branch>`) before pushing. If it's merged, do **not** push more commits onto that stale branch — rebuild a new branch from the current default-branch tip (cherry-pick or reapply your pending commits onto it) and open a fresh PR instead. Pushing to a branch behind an already-merged PR silently strands commits with no PR watching them.

1. **After every push, immediately check** whether the branch has commits ahead of the default branch:
   ```
   git fetch origin <default-branch> && git log origin/<default-branch>..HEAD --oneline
   ```
   If there are commits ahead, a PR is needed. Do not rely on memory of what PRs exist — always check the actual git state.

2. **Check for an existing open PR on the current branch.** If a PR for this branch is already open and not yet merged, do **not** create a new one — push additional commits to the same branch instead. The open PR will update automatically.

3. **If the previous PR was merged (or no PR exists yet), create a new one immediately** — do not tell the user to merge a PR that is already merged, and do not leave commits on the branch with no open PR.
   - Base the PR against the default branch.
   - Include only the commits added since the last merge.
   - Keep the title and description focused on what this batch of changes does.

4. **Never stack a new PR on top of an unmerged PR.** Accumulate further changes on the same branch/PR until the user merges it. Once it is merged, start fresh from the new default-branch tip.

### In practice

```
After every push:
  → check: commits ahead of the default branch?
      NO  → nothing to do
      YES → is there an open PR for this branch?
              YES → push updates it automatically, done
              NO  → create a new PR now, without waiting to be asked
```

## 1. Language

- **All customer-facing text must be Swedish.** English is only for internal comments, variable names, and code.
- Messages to the owner are in Swedish.

## 2. Database & secrets

- **Never drop columns or delete data without explicit instruction.** Dropping data is destructive and irreversible.
- **Check who can read/write** before adding or changing tables.
- **No demo/mock data in the production database.**
- **Secrets** (database URL, API keys, admin password) live in Netlify's environment variables. Never commit them, log them, return them in responses, or ask for them to be pasted into the repo.

## 3. UI Change Rules

Before modifying UI:

- **Follow the existing patterns.** Reuse existing components and Tailwind patterns before introducing new primitives or custom styling.
- **Mobile-first responsive layouts.** Test changes at mobile widths.
- **Do not re-introduce removed features** without asking — check git history / chat context first.

### Apple-level polish (the owner's standing expectation)

Every UI change should look and feel like Apple made it: calm, minimal, and smooth. Treat this as a requirement, not a nice-to-have.

- **Motion is spatial and continuous.** Things grow out of the element that opened them and fold back into it. Don't pop in, jump or hard-cut. Animate `transform`, `opacity`, `clip-path` and `filter` (never `width`/`height`/`top`), so it stays at 60 fps.
- **Use Apple-like timing.** Ease-out curves such as `cubic-bezier(0.32, 0.72, 0, 1)`. About 300–500 ms for spatial moves, 150–250 ms for fades and hover states, and closing a bit faster than opening. Never use linear, bouncy or slow easing.
- **Keep continuity.** When a view changes, the shared element (image, title, card) should morph into place, FLIP-style, so the eye can follow it. Secondary content fades or rises in just after.
- **Minimal and quiet.** Generous spacing, few borders (hairline separators and soft shadows instead), rounded corners. Avoid clutter, extra labels and loud colours. Show details only when asked; the resting state stays simple.
- **Respect `prefers-reduced-motion`.** Skip the animation, not the feature.
- **Check it before calling it done.** Look at UI changes in a browser, at mobile (both iPhone and Android, e.g. Playwright's "iPhone 13" and "Pixel 7"/"Galaxy S8") and desktop widths and mid-animation (Playwright screenshots work). Fix anything that flickers, jumps, stretches or feels sluggish.
- **Always a way back.** A link that takes you to another section should let the user get back to where they came from. Never leave the user stranded with only the main menu.

## 4. Agent Behavioral Constraints

- **Stay in scope.** Only change what the user asked for. UI tweaks stay in presentation code; don't refactor business logic on the side.
- **One concern per change.** Break large work into small, reviewable patches.
- **Confirm architectural shifts.** Ask before swapping libraries, redesigning data flow, or introducing new top-level abstractions.
- **Add new npm deps via `npm install <pkg>`** — do not hand-edit `package.json` / `package-lock.json`.

### Think in classes of errors, not individual errors

When you find one bug, ask: *"what else in this same area could have the same root cause?"* Then fix the whole class before moving on. Examples:

- One wrong API field name → verify **all** field names in that payload against the official spec before committing.
- One missing timeout → add timeouts to **all** similar outbound calls in that file.
- One broken route link → check whether other links in the same component follow the same wrong pattern.
- One stale credential in a test → grep for the same credential across **all** test files.

Do not wait for the user to report each symptom individually. When a fix reveals a pattern, own that pattern fully. Consult the official documentation (use WebFetch) to verify the entire surface area, not just the reported field.

## 5. Testing & Debugging

- Run `npm run typecheck` locally before pushing; the Netlify deploy preview on the PR (when there is one) is the full build check.
- For runtime issues, check: console logs, network requests, function logs, and the live preview.
- If a fix doesn't work after 2–3 attempts, stop and re-investigate instead of looping — read the failing file fresh, check assumptions, and consider whether the problem is in a different layer (browser vs API vs database).
- Always deliver fully working code — no placeholders, no "TODO: implement later" stubs in shipped changes.
