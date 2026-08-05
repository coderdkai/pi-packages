---
description: Sweep open issues and PRs repo-wide, verify their real state, and produce a prioritized working list
model: anthropic/claude-opus-5
---

# Triage the backlog

Optional package filter: `$1` (a package name such as `pi-permission-system`; empty means the whole repo).

Your job is to produce a **prioritized working list of GitHub issues and PRs** — what to pick up next, in order, with the reasoning attached.
Do not implement anything.
Do not review a PR in depth here; that is `/pr-review`'s job.
This template decides *what deserves attention next*, not *how to do it*.

## Relationship to `/plan-improvements`

`/plan-improvements <package>` is package-scoped and architecture-driven: it forms a cause hypothesis, proposes a numbered phase roadmap, and files the issues for it.
This template is repo-wide and demand-driven: it ranks what already exists in the tracker, issues **and** pull requests, against severity, security, and contributor cost.

The two lists are normally distinct, and a roadmap issue ordinarily works through its phase sequence rather than this list.
There is one deliberate exception, and it matters more than it sounds:

> When a roadmap or architecture issue **unblocks or decides** one or more backlog items, promote it into this list at a priority reflecting everything it unblocks, not its own size.

A design-decision issue that five open requests are all waiting on outranks any one of them.
Name the dependants explicitly when you promote it (see Keystone detection).

## Sync with remote (do this first)

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure.
   Do not stash, rebase, force, or otherwise resolve.
3. Only proceed on a clean fast-forward (or `Already up to date.`).

Call `set_session_name` with `Backlog triage — <YYYY-MM-DD>` (append `(<pkg>)` when `$1` is set).

## Load skills

- `github-voice` — required before drafting any contributor-facing text.
- `markdown-conventions` — for the output document.
- `package-<PKG>` — for each package with items in scope; load the one for `$1` when filtered.

## Step 1: Gather the raw state

Collect issues and PRs together; a backlog that ignores open PRs understates the real queue and hides the contributor-facing cost.

```bash
gh issue list --state open --limit 200 --json number,title,author,labels,createdAt,comments
gh pr list --state open --limit 200 --json number,title,author,createdAt,updatedAt,isDraft
```

Filter by the `pkg:$1` label (issues) and changed paths (PRs) when `$1` is set.

For every open PR, resolve its **real** state one at a time — a list query returns `UNKNOWN` for `mergeable` because GitHub computes it lazily:

```bash
gh pr view <N> --json number,author,mergeable,mergeStateStatus,additions,deletions,changedFiles,statusCheckRollup
```

Also record, for each item: the author, whether they are a third party (compare to `gh api user --jq .login`), the age since creation, and the age since the **last maintainer response**.

## Step 2: Establish real CI state (do not infer it)

An empty `statusCheckRollup` means **not run**, never **passed**.
Fork PRs from first-time contributors sit at `completed/action_required` until a maintainer approves the workflow, so a PR can look healthy while nothing has ever executed.

Find the pending runs — note the state is `conclusion == "action_required"` with `status == "completed"`, not `status == "action_required"`:

```bash
gh run list --limit 30 --event pull_request --json headBranch,status,conclusion,databaseId
```

Before approving any fork workflow run, audit the escalation surface.
Approving a run executes contributor code in CI, so confirm the privileged jobs are unreachable from a fork:

1. Does the PR touch `.github/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `mise.toml`, `.npmrc`, `patches/`, or `scripts/`?
   Any hit means read the diff before going further — those are the CI and install-script surfaces.
2. Are the secret-bearing and OIDC jobs gated off pull requests?
   `release-please` (holds `RELEASE_PLEASE_TOKEN`, `contents: write`) and `publish` (holds `id-token: write` for npm Trusted Publishing) must be unreachable — verify their `if:` conditions rather than assuming.
3. Are there `pull_request_target`, `workflow_run`, or `issue_comment` triggers?
   Those run in a privileged context; their absence is what makes fork approval routine.
4. Is untrusted text (`github.event.*.body`, `github.head_ref`) interpolated into any `run:` block?

Record the audit result in the output document.
Approve only after it passes:

```bash
gh api -X POST repos/gotgenes/pi-packages/actions/runs/<id>/approve
```

## Step 3: Interpret failures before ranking them

A red check is evidence about *something*, but not always about the PR.

- **Read the actual failing step**, never just the conclusion.
  A failure in an unrelated package (a different workspace package's test) is infrastructure, not the contribution.
- **A failure can mask a second, real one.**
  A flaky first failure that is re-run may fail *differently* the second time; that second failure is usually the real gate.
  Recommend a single re-run when a failure looks environmental (disk errors, timeouts, unrelated packages) and **ask the user before running it** — then read the new failure rather than assuming the re-run cleared it.
- **Cross-package flake is a first-class backlog item.**
  When an unrelated package's flake fails a contributor's PR, that flake is no longer only an internal tax — it produces false red on outside contributions and forces re-runs to distinguish signal from noise.
  Raise the priority of the issue tracking it, and say so in the rationale.
- **Green CI is not safety.**
  CI has no opinion about whether a design widens a security boundary, introduces an ungated configuration channel, or contradicts an ADR.
  Never let a passing check raise a security-relevant PR's rank.

## Step 4: Verify claims that drive priority

Rank on what is true now, not on what an issue or PR body asserts.
Two checks pay for themselves repeatedly:

1. **Does the reported defect still exist on `main`?**
   Search for the guard: `git log --oneline -S "<symbol>" -- <path>`, then `git tag --contains <sha>` for the first release containing it.
   A defect already fixed in an earlier release is a version-support question, not backlog work — rank it accordingly and ask the reporter for their version.
2. **Is a PR's green check stale?**
   Compare the run's date against the base files' recent history (`git log -3 -- <path>`).
   A check that ran before the files it touches changed proves nothing about merging today.
   Do not merge on a stale green — verify against current `main` first.

The full verification protocol lives in `/pr-review`; do only as much here as the ranking requires, and defer the rest.

## Step 5: Score each item

Score on four axes; keep them separate rather than collapsing them into one number too early.

1. **Severity** — security > data loss / corruption > crash > silent wrong result > visible bug > friction > enhancement.
   A *silent* wrong result outranks a *noisy* failure: the user cannot tell it is wrong.
2. **Likelihood** — how often the failure path is actually reached in normal use.
   A latent hardening fix with no current exploit path ranks below a bug that fires on every turn.
3. **Blast radius** — who is affected: all users, one platform, integrators, or only this repo's own workflow.
   Include the repo's own throughput here; a flake that taxes every implementation session is real cost.
4. **Response cost** — how long an outside contributor has been waiting, and how much of their effort is already sunk.

Hold **merit** and **urgency of response** apart, and label which one is driving a rank.
A PR whose design you intend to decline can still be the most urgent thing to *answer*.
Say "this is ranked high to respond, not to merge" in the rationale when that is the case, so the list is not misread as an endorsement.

## Step 6: Keystone detection

Before ordering, look for convergence: several open items that are all really asking one unanswered question.

Signals: multiple issues requesting variations of the same capability; several PRs implementing overlapping designs; issue bodies citing each other or citing a deferral in the source; a third party implementing a slice of an issue you already own.

When you find one, name the **keystone** — the decision that answers the cluster — and promote it above its dependants even if it is an architecture or ADR issue that would otherwise live in a `/plan-improvements` phase.
List its dependants explicitly by number.
Deciding a keystone converts N separate judgment calls into N answers by reference, and prevents answering them inconsistently one at a time.

Also flag the inverse: a third-party PR implementing a blunter version of a design you have already specified.
The existing issue is the answer to that PR; note the pairing rather than reviewing the PR on its own terms.

## Step 7: Interleave

Produce one list, not separate ours/theirs lists.
Group by theme where our issues and third-party work converge, then order across themes.
Working two items in the same area back to back reuses a loaded mental model; splitting them across weeks pays the context cost twice.

Standing priority: **bugs and security first**, then contributor-facing debt, then enhancements.

## Mutations you may perform

Only these, and only with the stated confirmation:

- **Apply missing labels** (`bug`, `enhancement`, `pkg:<name>`) — do this directly when the correct label is objectively determined by the issue template or body.
  Report what you changed.
- **Approve fork CI runs** — only after the Step 2 audit passes.
  Report the audit result.
- **Post contributor comments** (holding replies, change requests, version requests) — draft with the `github-voice` skill and confirm through `ask_user` before posting.
  A holding reply should say plainly that the item is parked and why, name the issue it is parked on, and avoid committing to a design shape the maintainer has not decided.

Everything else is a recommendation, including merging, closing, re-running CI, and declining a PR.
Never merge or close from this template.

## Output

Write `docs/triage/<YYYY-MM-DD>-backlog.md` (create `docs/triage/` if needed).
Get the date from `date -u +"%Y-%m-%d"` — never write one from memory.

Frontmatter:

```yaml
---
date: "2026-07-28"
scope: "repo" # or the package name when $1 is set
open_issues: 26
open_prs: 9
---
```

The document contains:

1. **Since the last triage** — read the most recent prior `docs/triage/*.md` when one exists, and note what closed, what landed, and what changed rank.
   Skip on the first run.
2. **The prioritized table** — the deliverable:

   | Rank | Item | Kind         | Severity | Why now                              |
   | ---- | ---- | ------------ | -------- | ------------------------------------ |
   | 1    | #639 | issue (ours) | keystone | Decides #671, #684, #680, #603, #604 |

   Use `#N` bare (they auto-link on GitHub), mark third-party items, and keep `Why now` to one sentence.
3. **Keystones** — each keystone with its dependants listed by number.
4. **Findings that changed a rank** — the verification results from Steps 3 and 4: stale greens, defects already fixed, flakes masking real failures, green-but-misaligned PRs.
5. **CI and security audit** — the Step 2 audit outcome, and which runs were approved.
6. **Blocked on others** — items waiting on a contributor (rebase, version confirmation, change requests) with how long they have waited.
7. **Deferred** — what you consciously did not rank, and why, so the next run does not silently re-derive it.

Then present a short summary in the session and commit:

```bash
git add docs/triage/<YYYY-MM-DD>-backlog.md
git commit -m "docs(triage): prioritize backlog for <YYYY-MM-DD>"
```

Do not push; leave that to the user.

## Finally

Recommend the single next action and the command to run for it — usually `/plan-issue #N` for the top-ranked issue, or `/pr-review #N` for the top-ranked PR.
Stop there.
