# PrepVerse — Claude/OpenCode Project Guidance

Read `AGENTS.md` and the relevant `docs/` design document before changing code.

The `docs/` directory is the canonical implementation source of truth. Do not
invent architectural decisions when an implementation detail is ambiguous;
stop and report the ambiguity.

The MVP auth strategy is stateless short-lived JWT only. No refresh-token
collection, refresh cookie, rotation, or blacklist.

Keep the skill-evidence boundary intact:
topic → skill → interview → profile.

Implementation must proceed milestone-by-milestone using the master prompt and
CHECK prompt for the current milestone. Do not implement future milestones
unless explicitly instructed.
