# Draft email to the team — the Explorer is working again

*Draft for review, not sent. Plain-language version; the detailed write-up is in
`docs/QUERY-MATRIX.md` and the plans under `docs/plans/active/`.*

---

**Subject:** SAWGraph Explorer is working again — what was wrong, and what changed

Hi all,

The Explorer is working again on the development site
(https://sawgraph-explorer-development.up.railway.app). Production gets it at
our next release.

**The short version of what was wrong**

Questions were failing with an error that said "Too Many Requests". That message
was misleading. We were not sending too many requests — each individual question
was simply taking longer than 30 seconds, which is the time limit the knowledge
graph gives any single query. When it hits that limit it gives up, and the code
it returns happens to be the same one used for rate limiting.

Underneath that, our questions were asking for far more data than they needed.
One step in every question only needs a list of IDs — which sample points are
downstream of these facilities. But the query we sent also pulled every chemical
measurement at every one of those sample points, then threw all of it away.

It's a bit like asking "which houses are downstream of the airport?" by listing
every item of furniture in every room of every house, and then reading back only
the street addresses. Combined with tracing every river in the state, that was
enough to run past the time limit.

Two other things made it worse. Every question was answered from scratch every
single time, even when the same question had just been asked — and the graph is
about twenty times faster answering something it has seen recently. And opening
a shared link re-ran the whole thing in the visitor's browser rather than
showing the results the person who shared it had already produced.

**What's different now**

- Questions only ask for what they actually need.
- A question too big to answer in one go is automatically split into smaller
  pieces and the answers are stitched back together.
- Results are saved, so the dashboard cards and shared links open more or less
  instantly instead of running for a minute.
- When something does fail, the message says what to change rather than just
  "Something went wrong".

To put numbers on it: we tested every kind of question the editor can build —
156 queries covering 95 combinations. Before, **37 failed outright** and another
32 were slow enough to fail on a bad day. Now **34 of those 37 work**, and
nothing that previously worked has broken. The dashboard cards went from 10–70
seconds to well under a second.

**What still doesn't work, and why**

Three questions are still too large to answer. They all have the same shape: the
second block is left with no filter and no region, which means "every facility
in the country" — about 1.5 million of them — traced through the national river
network.

The useful thing to know is which end to narrow. Shrinking the *first* block (a
smaller area for the results you want to see) does not help at all. Adding an
industry, type, or region to the *second* block does. The error message now says
this.

**One thing to be aware of**

When a map is showing saved results rather than a fresh run, it says so at the
top, with the date it was computed and a "Re-run live" button. Worth knowing if
you are putting a screenshot in a report — if you want to be certain you are
looking at current data, press that button.

Happy to walk anyone through it.

Thanks,
Prayas
