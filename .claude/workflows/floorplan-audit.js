export const meta = {
  name: 'floorplan-audit',
  description:
    'Audit apartment.json and the rendered floorplan for dimensional, structural, and data-integrity problems, then cross-check the findings and write a report.',
  whenToUse:
    'Run after editing apartment.json or tools/render-floorplan.py, before trusting floorplan.svg for extrusion. Optionally pass a focus area as args (e.g. "slaapk1" or "balcony dimensions") to bias the survey.',
  phases: [
    { title: 'Survey the data' },
    { title: 'Run independent checks' },
    { title: 'Cross-check findings' },
    { title: 'Write report' },
  ],
}

// A single audit observation. Kept tight so every check returns comparable rows.
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'warning', 'note'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          evidence: {
            type: 'string',
            description:
              'Concrete pointer: JSON path/key, a dimension value, an SVG element, or a file:line.',
          },
        },
      },
    },
  },
}

// The reviewer keeps the findings it believes and says why it dropped the rest.
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'rejected'],
  properties: {
    confirmed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'warning', 'note'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'reason'],
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

// args may arrive as a JSON string, a plain string, or nothing.
const input =
  typeof args === 'string'
    ? (() => {
        try {
          return JSON.parse(args)
        } catch {
          return args
        }
      })()
    : args
const focus =
  (input && typeof input === 'object' && input.focus) ||
  (typeof input === 'string' && input.trim()) ||
  null
const focusLine = focus
  ? `\n\nPay particular attention to: ${focus}.`
  : ''

// ---------------------------------------------------------------------------
// Phase 1 — Survey. One agent builds the shared map of the apartment so the
// parallel checks don't each have to re-derive room and dimension inventory.
// ---------------------------------------------------------------------------
phase('Survey the data')

const survey = await agent(
  `Read apartment.json at the repo root. It is a measurement extraction of a Dutch
apartment floor plan (Den Haag, Ypsilon Park) with coordinates in meters.

Produce a concise but complete inventory I can hand to other auditors:
- Each room in rooms_preliminary / room_labels: its name and any stated dimensions.
- The envelope (envelope_preliminary) and overall extent.
- Every entry under raw_dimensions_pdf, grouped by the room/feature it claims to describe.
- What is already flagged in "uncertain" and what is marked in "user_verified" / "high_confidence_facts".

Do not judge correctness yet — just lay out what the file asserts, with the JSON keys
it came from. Be precise about numbers.${focusLine}`,
  { label: 'Survey apartment.json', phase: 'Survey the data' },
)

// ---------------------------------------------------------------------------
// Phase 2 — Independent checks, each in its own clean context. Thunks, not
// promises, so parallel() controls concurrency.
// ---------------------------------------------------------------------------
phase('Run independent checks')

const checkPrompts = [
  {
    label: 'Dimensional closure',
    prompt: `You are auditing apartment.json for DIMENSIONAL CONSISTENCY only.

Here is a survey of the file:
${survey}

Now open apartment.json yourself and verify the geometry closes:
- Do per-room wall spans and section dimensions add up to the room and envelope dimensions?
- The file notes stepped/multi-section walls (e.g. slaapk1's south wall: 3675 vs 1845 are
  NOT additive) — check that such notes are respected, not silently summed.
- Are interior-vs-exterior dimensions reconciled by sane wall thicknesses (~200mm)?
- Flag any pair of dimensions that contradict each other beyond a few cm.

Report every real inconsistency with the exact values and JSON keys involved. If a
"contradiction" is actually explained by an existing note, do NOT report it.`,
  },
  {
    label: 'Render fidelity',
    prompt: `You are checking that the rendered floor plan faithfully reflects apartment.json.

Steps:
1. Run: python3 tools/render-floorplan.py
2. Diff the freshly produced floorplan.svg against the floorplan.svg committed in git
   (git diff --stat floorplan.svg, and inspect the diff if non-empty).
3. Spot-check that polygon coordinates and any dimension labels in the SVG match the
   meter values in apartment.json (the script claims to introduce no new measurements).

Report: (a) whether the committed SVG is stale vs the data, and (b) any place the SVG
geometry diverges from what the JSON says. Include the command output as evidence.
If the renderer errors, that is a blocker — report the traceback.`,
  },
  {
    label: 'Data integrity',
    prompt: `You are checking apartment.json for STRUCTURAL / DATA-INTEGRITY problems only.

Survey for context:
${survey}

Open the file and verify:
- units are consistently meters where the schema claims meters (watch for stray mm/px).
- Coordinates respect the stated axes (x=east, y=south) and the origin definition.
- Required structures (levels, origin, axes, envelope_preliminary, rooms_preliminary)
  are present and well-formed; no rooms referenced in labels but missing geometry.
- No duplicate or orphaned raw_dimensions_pdf entries.

Report concrete defects with JSON keys. Ignore stylistic preferences.`,
  },
  {
    label: 'Confidence audit',
    prompt: `You are auditing the HONESTY of the confidence flags in apartment.json.

Survey for context:
${survey}

The file separates asserted facts from "uncertain" items and "user_verified" items.
Check that this separation is trustworthy:
- Are there best_guess / "approximately" / "could not pin" values that are presented as
  facts but NOT listed under "uncertain"?
- Is anything in "user_verified" or "high_confidence_facts" actually contradicted
  elsewhere in the file?
- Does the nw_zigzag / chamfer geometry rest on guesses that should be flagged?

Report each mis-flagged item: what it is, where it lives, and why its confidence label
is wrong.`,
  },
]

const checkResults = await parallel(
  checkPrompts.map(
    (c) => () =>
      agent(c.prompt, {
        label: c.label,
        phase: 'Run independent checks',
        schema: FINDINGS_SCHEMA,
      }),
  ),
)

// parallel() yields null for any agent the user skips; drop those, then flatten.
const rawFindings = checkResults
  .filter((r) => r && Array.isArray(r.findings))
  .flatMap((r) => r.findings)

log(`Collected ${rawFindings.length} candidate findings from ${checkResults.length} checks.`)

// ---------------------------------------------------------------------------
// Phase 3 — Adversarial cross-check. A fresh agent re-validates each finding
// against the actual file so false positives don't reach the report.
// ---------------------------------------------------------------------------
phase('Cross-check findings')

let review = { confirmed: rawFindings, rejected: [] }
if (rawFindings.length > 0) {
  const reviewed = await agent(
    `Independent auditors produced the candidate findings below for apartment.json.
Some may be wrong, duplicated, or already explained by notes in the file.

Open apartment.json (and floorplan.svg if a finding cites it) and verify each one against
the real data. Confirm only findings you can substantiate; reject the rest with a reason.
Merge duplicates. Do not invent new findings here.

Candidate findings (JSON):
${JSON.stringify(rawFindings, null, 2)}`,
    { label: 'Cross-check candidate findings', phase: 'Cross-check findings', schema: REVIEW_SCHEMA },
  )
  if (reviewed) review = reviewed
}

// ---------------------------------------------------------------------------
// Phase 4 — Report. Turn the confirmed findings into a readable markdown brief.
// ---------------------------------------------------------------------------
phase('Write report')

const confirmed = review.confirmed || []
const counts = confirmed.reduce(
  (acc, f) => ((acc[f.severity] = (acc[f.severity] || 0) + 1), acc),
  {},
)

const report = await agent(
  `Write a concise markdown audit report for apartment.json titled "# Floorplan audit".

Confirmed findings (JSON):
${JSON.stringify(confirmed, null, 2)}

Rejected candidates, for transparency (JSON):
${JSON.stringify(review.rejected || [], null, 2)}

Structure:
1. A one-line verdict: is floorplan.svg safe to extrude/trust yet?
2. Blockers, then Warnings, then Notes — each as a bullet with the title, the detail,
   and the evidence pointer.
3. A short "Cleared / rejected" section summarizing what was checked and dismissed.
Keep it tight and actionable. Output only the markdown.`,
  { label: 'Write audit report', phase: 'Write report', model: 'opus' },
)

return {
  focus: focus || null,
  summary: {
    candidates: rawFindings.length,
    confirmed: confirmed.length,
    blockers: counts.blocker || 0,
    warnings: counts.warning || 0,
    notes: counts.note || 0,
  },
  report,
}
