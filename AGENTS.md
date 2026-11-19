# AGENTS.md

Project rules for every AI agent or contributor working in **IndStream**.

Use logic and judgment on every task. If two rules conflict, correctness wins.

## 1. Code Style

- IMPORTANT: Add a comment only when it is very necessary. Keep it short and generic.
- Never put specific developer, plugin, website, or content names in comments, logs, or user-facing messages. Word such text generically instead (e.g. "the main site", "a title/a movie/a series", "this provider"). Exception: keep any specific name the code itself needs to work (URLs, domains, identifiers, parameters, displayed plugin name).
- Refactor or change code (even across the whole codebase) only when sure the result is correct and better for the long term with low maintenance and good performance.

## 2. Architecture

- Check the existing codebase first; create a new file only when it is necessary and use logic to decide.
- Keep related logic in the same file and object. Split it out only when that clearly makes the code easier to maintain.
- Use meaningful names and follow the existing project structure.

## 3. Implementation

- IMPORTANT: Understand the relevant code and execution flow before making changes.
- IMPORTANT: Before researching, testing, adding or replacing any stream provider/server, read `REJECTED_SERVERS.md`. Do not re-add a rejected source without fresh live-probe evidence that the issue is fixed. Record every provider you reject in `REJECTED_SERVERS.md` with the reason and the evidence.
- Take references from the internet.
- Never emit a stream below 720p; filter out any stream whose height is known to be less than 720. Streams below 720p are not allowed in the server list.
- Stream/link display names show at most 3 audio language names (title's original language first, then Hindi, then English, then any); when more than 3 audio languages are detected, render `Multi` instead of listing them. Keep this rule for all future providers and name-formatting changes.
- When a stream's audio language cannot be determined with certainty, keep `Unknown` rather than guessing; resolve it from declared evidence only (manifest audio tracks, file/button labels, release title), never from the title's original language alone.
- A source belongs in the Recommended set (the default install selection) only with fresh live-probe evidence of speed and reliability across diverse titles — use the addon's twice-daily check or probe locally with the same titles as evidence. Multi-language support is a bonus. Promote with measured results (streams emitted, avg ms), re-check before and after changing the set, and drop or replace any Recommended source that goes down.
- Source classes beyond general movies/series (anime now, later live TV, sports, …) belong in their own clearly separated category, kept on by default, not mixed into the general list. A category that fails live probes must not stay on by default even if popular.

## 4. Verification

- Confirm that the root cause is fixed, not only the visible symptom.
- Run the relevant tests or build whenever possible.
- Before finishing, review your diff for regressions, unneeded files, and unrelated edits.
- If you could not verify a fix, or something is still broken, say so plainly. Never claim success without evidence.
- Validate once on the final sources only; stream build/test logs to a file instead of tail-filtering, so progress is visible live.

## 5. Decision-Making

- Think long-term: choose the solution that stays correct, fast, and maintainable over time, not only what works today.
- Prefer correctness.
- If you are in doubt about a decision, ask the user or check on internet.

## 6. Git & Releases

- Commit only when asked. Never push or bump the version until the user explicitly says so.
- Describe the change and its implementation in the commit message. The size of the message depends on the changes.
- Version bumps follow the owner's scheme: routine changes take the next patch in the
  current series (e.g., v1.2.71 → v1.2.72 → v1.2.75); a `big update` bumps the
  minor-ish component (v1.2.75 → v1.2.8), as with v1.2.8 (four new sources,
  recommended-only installs, size limits). When in doubt about the target number, ask
  instead of guessing — the number is the owner's call, not semver math.
- Keep `package.json` and `package-lock.json` in sync when bumping (the root
  `"version"` in both files; verify with a search for the old number).
- Bump, push and deploy are separate verbs: push goes to `origin/main` (CI runs
  `npm test` there); deploy is `fly deploy` (fly.toml: app `indstream`, builds the
  Dockerfile, serves `https://indstream.fly.dev`) — only when the user says so.
- Before releasing, run the test suite (stream logs to a file) and review the diff for
  scope; include everything the user asked to ship, nothing unrelated, nothing you
  could not verify.
