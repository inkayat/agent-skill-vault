<!--
Source: cursor/plugins@6ed0f7a9504f577d7529064103cecce9be7dfc5e:pstack/skills/blast-radius/SKILL.md
Modifications: FirstMate-safe, self-contained adaptation. The method is unchanged: find the
breakage grep will not show, name the one fact the change is safe because of, and prove it by
running real code against the how-sure-are-you ladder. Removed every hand-off to a vault entry
a worker can never open: the "companion to `how` and `why`" framing, step 1's "use `why` step 2
to pull the PR and commits" (replaced with the direct git/gh commands that step actually means),
step 4's "same rules as `why`" (those rules are now stated inline), and step 6's multi-model
`arena` pass (FirstMate runs no model arena; replaced with a second independent pass by the same
reviewer against the one safety fact). Upstream is MIT (c) 2026 Lauren Tan; the vendored LICENSE
is at skills/upstream/cursor-plugins-pstack/pstack/LICENSE.
-->

# Blast radius

Find what a change breaks somewhere else, before it ships. Use for "blast radius of X", "what
could this break", or reviewing a small diff you don't trust yet.

Listing the callers is not the job. You can grep those in a second. The job is the breakage grep
won't show you.

## Don't trust your own writeup

A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's
true. So don't hand back the writeup. Find the one or two facts the whole thing depends on and
prove them by running code.

### How sure are you

For each fact the change's safety depends on, get it as far down this list as is cheap, and say
where it stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
4. You ran it. A script or test that calls the real code and fails loud if you're wrong.
5. You reproduced it in the running app.

Any safety fact you can't get to step 4, say so. Don't write it up as settled. Step 4 is usually
one small script that imports the same library the app ships and calls the exact function you're
worried about.

## Steps

1. **Read the change, and its history.** The diff, the symbols it adds, changes, and deletes, and
   what it now does differently, including the part the diff doesn't spell out. Pull the context
   directly:
   - `git log --oneline -20 -- <path>` for how this file got here, and
     `git log -p -3 -- <path>` for what those commits actually did.
   - `git blame -L <start>,<end> -- <path>` on the lines the change touches, then
     `git show <sha>` on whichever commit introduced the constraint you're about to break.
   - `gh pr view <n>` and `gh pr diff <n>` when the change is a PR, for the description, the
     review discussion, and the full diff. `gh pr view <n> --comments` when the discussion is
     where the constraint was agreed.
   - When there's no PR and no useful message, say so; an absent rationale is an answer too.
2. **Find the one fact it's safe because of.** Most changes that look risky are safe because of a
   single fact, like "this call only drops already-dead cache entries and does nothing else".
   Find that fact. If it holds, most risky cases are cleared at once. Spend your time here, not on
   a long list of maybes.
3. **Look where grep stops.** Read the source of the library you call, and check its pinned
   version and any local patch. Work out when things run: microtasks, unmount and teardown, one
   framework's scheduling versus another's. Follow what a symbol search misses: the JSON an API
   returns, a DB column, a wire format, another language reading the same bytes, a feature flag,
   code three hops downstream.
4. **Be honest about each risk.** Give it a real chance of happening and a real cost if it does.
   Keep the risks you confirmed. List the ones you checked and cleared separately. The evidence
   rules, in full:
   - Cite a real `file:line` you have actually opened. Never cite a line you inferred.
   - A search that finds nothing is still an answer. Say what you searched for and where.
   - Never invent a caller, an API, a flag, or a version. If you're unsure it exists, check.
   - Separate what you observed from what you concluded, and mark anything unverified as such.
5. **Prove the one fact.** Write a script or test that runs the real code, run it, and paste what
   happened. If you can't prove it cheaply, mark it unproven. Don't overstate.
6. **For a big or wide change, take a second independent pass.** Re-derive the safety fact from
   the code alone, without re-reading your own writeup, and see whether you reach the same
   conclusion. Disagreement between the two passes is the finding.

## What to hand back

- **What it does.** What changed, including the part that isn't obvious.
- **The one fact it's safe because of.** State it, say which step of the ladder you got it to, and
  show the proof. If you couldn't prove it, write unproven.
- **Risks.** Only the real ones. Each names how it breaks, the `file:line`, how likely and how bad,
  and how to check. Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Before you merge.** The cheapest test or repro that catches the real bug, including the script
  you wrote.

Cite real code, keep the writeup tight, and strip anything private before it goes anywhere public.

**Reply:** the writeup above, with the one safety fact either proven or marked unproven.
