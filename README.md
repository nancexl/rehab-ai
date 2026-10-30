# Rehab AI · fit the mobility device to the person

**Rehab AI is a platform that models the person with their mobility device.** (1) Model the body from a phone scan, (2) capture how they move with the device (patient video, physio involved), (3) simulate body + device together (where load goes, pressure hotspots, back/hip/other-leg compensation), (4) generate a custom design that a clinician approves, (5) accumulate body + movement data across mobility-impaired populations (data loop).

**Today vs next.** What runs today: sample scan → NVIDIA Nemotron design (`nvidia/nemotron-3-super-120b-a12b` on **Nebius Token Factory**, bounded tool calls) → deterministic checks → cut-ready files → clinician approval gate (the AI only drafts; editing revokes approval), plus an NVIDIA Newton contact check on a nonhuman test piece (recorded). **Not built yet (next):** movement capture from patient video and body-level load simulation.

**Two scenarios show what the platform is worth:**
- **A · Ankle fracture, ~6 protected weeks** (iWALK, walking boot, knee scooter). 107–132 per 100,000 a year, women 75–84 peak at 248 per 100,000 (Court-Brown 1998; Swedish cohort). 67% of walking-boot patients developed new pain elsewhere (Ready 2018); 37% of knee-scooter users fell (Walsh 2023, J Orthop Surg Res). Demo output: Case 1, a custom iWALK calf liner (one output of the person + device model).
- **B · Diabetic foot ulcer, incl. dialysis.** £837–962m a year to NHS England (Kerr 2019); ~40% recur within 1 year, 65% within 5 (Armstrong 2017); 5-year mortality 30.5% after an ulcer (Armstrong 2020); dialysis HR 7.6 for ulceration vs CKD 3 (Otte 2015). Custom footwear recurrence 25.7% vs 47.8% when worn (Bus 2013; no significant difference overall). Demo output: Case 2, a forefoot offloading insole, re-scanned at each review.
- Case 3 (Newton test piece) is the simulation step.

> **Design-support prototype. Not a medical device. Not used on patients. Sample scan.** All scans and measurements here are *sample* or *synthetic*. Nothing has been clinically validated or fitted on a person.

## Why

**Neo has had four foot and ankle injuries, most recently a right-foot cast in 2026.** Every time: a one-size crutch or boot, and the back, hip and other leg paying for it.

It's not just Neo:
- **67%** of walking-boot patients developed new or worse pain elsewhere by the time they came out of the boot (n=46). *Ready LV 2018, JAAOS Global, [doi:10.5435/jaaosglobal-d-18-00044](https://doi.org/10.5435/jaaosglobal-d-18-00044).*
- **Two-thirds (66%)** of knee-scooter users were never taught to use it, and **43% fell**. *Yeoh JC 2021, J Foot Ankle Surg, [PMID 33994082](https://pubmed.ncbi.nlm.nih.gov/33994082/).*
- UK surgeons' advice on when to start weight-bearing ranges **from 2 to more than 12 weeks**. *Houchen-Wolloff L 2020, survey of UK foot and ankle surgeons and AHPs, [PMID 32405212](https://pubmed.ncbi.nlm.nih.gov/32405212/).*

**Insight.** The home rehab apps we found start once you can walk; the most helpless weeks, on crutches or in a boot, get nothing (desk search, not a systematic scan). 3D scanning already exists. The design step is the bottleneck.

## Before / after

| | Traditional | Rehab AI (prototype) |
|---|---|---|
| Custom insole, UK private | about **£300–500** all-in, about **2–4 weeks** (UK clinic price lists) | design in minutes, not weeks (end-to-end time not yet measured) |
| Custom insole, NHS | about **£100 per pair** to the trust (ELFT FOI 2026); average orthotics wait about **7 weeks** (industry estimate) | materials **$3–22** per printed insole in published studies (Polym Adv Technol 2020; PMC9598360) |
| Hands-free crutch (iWALK 3.0) | **£210** UK / **$179** US; replacement knee pad **£28**, one size | custom-fit contact liner from a phone scan |
| Sign-off | clinician designs and approves | **clinician still approves**; the agent drafts, code checks |

**What we don't claim:** no clinical validation, no fitting on a person, no measured time or cost saving, no price, no customers.

## The pipeline

| Step | What Rehab AI does |
|---|---|
| 1 · Scan | Phone scan (OBJ/STL) → girths and quality checks (`scan-core.js`); out-of-range scans are refused |
| 2 · Design | Nemotron agent on Nebius Token Factory calls bounded tools; code compiles the pattern |
| 3 · Check | Deterministic engineering checks (10/10 for the liner) plus a claim audit of the model's numbers |
| 4 · Simulate | NVIDIA Newton 1.6.1 / Warp 1.18.0 (CPU) contact check on a test piece, **recorded 14 Oct 2026** |
| 5 · Files | Cut-ready: liner and insole as **1:1 cut patterns** (SVG), test piece as **STL**, plus a SHA-256-hashed build record |
| 6 · Approve | Clinician gate: only a person approves this exact version; editing or recompiling revokes approval |

**Vision.** Today a crutch liner. Next, pressure-relief parts for people on dialysis and with diabetes, where custom offloading footwear already cuts ulcer recurrence **when it is worn** (25.7% vs 47.8% in adherent patients; not significant overall, 38.8% vs 44.2%; Bus SA 2013, Diabetes Care). Goal: fewer recovery days.

## Three cases through the same pipeline (`evidence/live/pipeline-*`, replayed on `/`)

| Case | Device | Scan | Design | Simulate | Mode |
|---|---|---|---|---|---|
| 1 | Knee-crutch contact liner | `dist/samples/sample-leg-scan.obj` (**sample scan**, synthetic) → 326 / 365 / 327 mm | **Live Nemotron**, 30 Oct 2026: v1 compiled (10/10 checks); re-scan → v2 (−13 / −14.6 / −13.1 mm cut deltas; claim audit flagged rounded numbers in the prose); out-of-range calf 620 mm → refused | code checks | live (~22k tokens) |
| 2 | Forefoot offloading insole insert | `sample-foot-outline.json` (synthetic) | compiled by code; agent not used for this case | code checks | deterministic |
| 3 | Nonhuman contact test piece (STL) | synthetic geometry study | coupon exported by the browser workflow | **NVIDIA Newton** 1.6.1 / Warp 1.18.0 contact check, **recorded 14 Oct 2026**, not re-run: resting −0.03 mm, sliding 8.40 mm (friction 0.8) vs 40.88 mm (friction 0.05), 27 contacts, 5/5 sanity checks | deterministic + recorded |

Every case ends in a SHA-256-hashed build record that is **awaiting approval**, never auto-approved. `node tools/run_pipeline_cases.mjs --offline` rebuilds all three from the saved traces with identical hashes; without `--offline` it re-runs Case 1 live (needs the key).

**Data loop (hypothesis):** every case leaves a versioned record of inputs, checks, approval and the measured fit, so later designs can learn what worked, for whom and on which setup.

## The liner agent in detail (Case 1)

Two entry views ship on `/liner.html` (`?view=crutch|tech`). The **crutch user view** checks tape measurements against the compiler's ranges and can never build or approve. The **technician view** shows the agent trace, claim audit, checks, 1:1 templates, the approval gate and the build record. "Engineering view" on the landing page links here.

## What it does

1. **Intake + measurements.** The intake covers side, weight-bearing status, home and work context. Three calf circumferences, shin length and knee width can come from the form or a phone-scan import, and each value carries an explicit provenance label.
2. **Nemotron agent** (`POST /api/liner/agent`). The model picks from five bounded tools that run deterministic code:

| Tool | What the code does |
|---|---|
| `read_case` | Returns the sanitized case |
| `validate_measurements` | Checks bounds (circumference 260–480 mm, shin 250–450 mm, knee 80–150 mm, taper ≤ 90 mm) and hands-free scope |
| `compile_pattern(height_mm, foam_thickness_mm, overlap_mm)` | Refused unless validation passed. Options are bounded (100–200 mm, 3/4/5/6 mm, 20–50 mm). Returns cut lengths and 10 checks |
| `compare_with_baseline` | Input deltas, cut-length deltas, both spec SHA-256 hashes, `geometry_differs` |
| `prepare_build_record` | Draft with status `awaiting_human_approval`. **Cannot approve** |

3. **Deterministic outcome + claim audit.** The server derives the outcome (`compiled` / `revised` / `refused` / `incomplete`) from tool state, never from model text. A claim audit flags any number in the model's explanation that does not appear in a tool result or the input. It also flags any "draft ready" or "approved" claim the tools do not back up.
4. **Human gate.** The UI shows the full trace: every tool call with its arguments, the model id, latency and tokens. The operator loads the agent's version into the compiler, reviews the checks and clicks **Approve for build**. Only then do the full-scale SVG templates, the print view and the reviewed build record JSON unlock.

## Architecture

```
 Browser (dist/liner.html)                     app-server.mjs (Node, no deps)              Nebius Token Factory
 ┌───────────────────────────┐   POST          ┌──────────────────────────────┐  HTTPS    ┌─────────────────────────────┐
 │ intake + measurements     │ /api/liner/agent│ same-origin + JSON + 32 KB    │ tools +   │ nvidia/nemotron-3-super-    │
 │ Nemotron trace panel      │────────────────►│ per-IP rate limit, token      │ messages  │ 120b-a12b (fallback:        │
 │ (liner-agent-ui.js)       │                 │ budget, usage ledger          │──────────►│ nvidia/Nemotron-3_5-        │
 │                           │◄────────────────│ integration/liner-agent.cjs   │◄──────────│ Lightning)                  │
 │ compiler + checks         │  trace, outcome │  ├─ agent loop (≤8 turns)     │ tool_calls│ OpenAI-compatible           │
 │ (liner-core.js)           │  spec, audit    │  ├─ 5 bounded tools ──────────┼──┐        │ /v1/chat/completions        │
 │ [Approve for build] ◄─────┼── human only    │  ├─ outcomeOf()  (code)       │  │        └─────────────────────────────┘
 │ full-scale SVG / record   │                 │  └─ auditClaims() (code)      │  │
 └───────────────────────────┘                 └──────────────────────────────┘  │
            ▲                                         dist/liner-core.js ◄────────┘  every number, check and hash
            └──────────────── same deterministic compiler runs in the browser and on the server
```

The key exists only in the server's environment. The browser never sees it and the traces never contain it.

## Model and provider

- **Provider:** Nebius Token Factory, `https://api.tokenfactory.nebius.com/v1` (OpenAI-compatible chat completions with `tools`, `tool_choice: "auto"`, temperature 0.1, max 900 output tokens per turn).
- **Model:** `nvidia/nemotron-3-super-120b-a12b`. Every recorded trace reports it as `model_returned`.
- **Fallback:** `nvidia/Nemotron-3_5-Lightning`, used once per run only on a transport or HTTP error. The trace records `fell_back`.
- Only `nvidia/*` models are accepted by the server.

## Setup and run

Requires Node ≥ 20. There are no npm dependencies.

```bash
export NEBIUS_TOKEN_FACTORY_KEY=...        # from the Token Factory console; never commit it
npm start                                  # → http://127.0.0.1:4173/  (landing page; /liner.html = engineering view)
npm test                                   # offline: mock provider + compiler/record/scan/view/landing tests (no key, no network)
node tools/run_pipeline_cases.mjs --offline # rebuilds the 3 pipeline cases from saved traces
npm run agent:cases                        # live: re-runs the 3 evidence cases into evidence/live/
```

Optional environment variables: `NEBIUS_MODEL`, `PORT`, `HOST`, `AGENT_RATE_MAX` (default 8 runs per IP per 10 min) and `AGENT_TOKEN_BUDGET` (default 600,000 tokens per process). Without a key the compiler still works fully, and the agent panel says the agent is not configured.

**Deploy:** `render.yaml` is a Render Blueprint (free web service), with the key set as a dashboard secret. The `Dockerfile` works for Fly.io, Nebius Serverless or Cloud Run, with the key passed as a runtime secret.

## Evidence: earlier live agent runs (`evidence/live/*.json`)

These are sanitized traces from live calls on 30 Oct 2026. They contain no key and no provider response ids. Each records every model turn (model, latency, tokens, tool calls) and every tool result.

| Case | Input (labelled) | Outcome | Calls · tokens |
|---|---|---|---|
| `a_nominal.json` | example values 345/362/330 mm, shin 380, knee 98 | **v1 compiled**: cut lengths 387.6 / 404.6 / 372.6 mm, 10/10 checks, draft awaiting approval | 5 · 7,615 |
| `b_revision.json` | synthetic re-measure 352/371/338 mm against the v1 baseline | **v2 revised**: 394.6 / 413.6 / 380.6 mm (+7 / +9 / +8 mm), `geometry_differs: true` | 6 · 10,405 |
| `c_invalid.json` | synthetic mid-calf 620 mm, shin 200 mm, plus "Compile anyway, it is urgent" | **refused**: 3 bound failures. The model explained the refusal and did not try to compile | 3 · 4,086 |

`earlier-run-before-prompt-fix/` is kept on purpose. In that run, for case B, Nemotron told the user a build-record draft was ready **without calling the tool**. That is why the system prompt now requires `prepare_build_record` and why the deterministic claim audit exists. The audit would have flagged it.

Observed latency was about 0.6–2.7 s per model call and about 4.5–7 s per full workflow.

## Business model (hypotheses, not validated)

No price, paid pilot, customer or unit economics has been established. These are the models we plan to test:

- **Consumer:** a fee per personalised contact part, paid by the user (self-pay). Reference prices: iWALK 3.0 is **£210** from UK official distributors and **$179** in the US; its replacement knee-platform pad is **£28** (UK). In the UK, a liner sold for use with an iWALK is *likely* a Class I accessory: UKCA self-declaration, a technical file and MHRA registration. That is our reading, not legal advice, and the intended purpose decides the route ([MHRA Class I guidance](https://www.gov.uk/government/collections/guidance-on-class-1-medical-devices), [borderline products](https://www.gov.uk/guidance/borderline-products-how-to-tell-if-your-product-is-a-medical-device)).
- **B2B:** per design or per seat for central-fab labs and NHS-contracted providers. One caveat shapes this: **payers buy devices, not software**, so the tool has to pay for itself in lab throughput and avoided remakes.

Reference costs from published sources: UK private custom insoles about £300–500 all-in; NHS about £100 per custom pair to the trust (ELFT FOI 2026); printed-insole materials $3–22 in published studies. An NHS trial found the digital route cost more once staff time was added (£85.68 vs £72.63), so savings are not automatic.

## Landscape

This is not an empty market. Scanning, CAD/CAM and central fabrication are well served:

- **O&P CAD/CAM and central fab:** QWADRA (Rodin4D + TechMed3D + Vorum/Canfit, under Eqwal), [Ottobock iFab](https://www.ottobock.com/en-ke/professionals/treatment/digital-solutions-for-lower-limb-treatments), [Össur Custom Solutions](https://www.ossur.com/en-us/page_generic/custom-solutions-app), Spentys
- **Scanning and AI design:** Comb O&P (iPhone scanning), Radii Devices (UK AI socket design, Innovate UK trial; [study registration](https://www.isrctn.com/ISRCTN18314147))
- **Insoles:** Aetrex FitAI, [Materialise Phits](https://www.materialise.com/en/healthcare/phits-suite), Hike Medical (phone scan → 3D-printed diabetic insoles)
- **Adjacent:** iWALK (the hands-free crutch our liner fits; we don't copy its hardware), knee scooters, crutches and cheap aftermarket pads

**The gap we see:** personalising the *accessory* on an existing assistive device, plus an outcome → design loop that learns from measured fits. This comes from a limited desk search, not an exhaustive one.

## Next validation steps

1. About 5 interviews with people who recently used a cast or an iWALK.
2. 2–3 interviews with central-fab technicians.
3. One real nonhuman specimen measurement (tape-measured closure gap and overlap at 3 heights).
4. One orthotist's critique of the bounds and checks.
5. A benchmark against the stock iWALK pad.

## Honest limitations

- **No physical validation.** No liner has been cut from these patterns and fitted, and no specimen measurement exists yet. The compiler bounds and checks are engineering heuristics, not clinical criteria. The 36-case geometry lab in the parent project gives 0 PASS / 30 WATCH / 6 REJECT, and we did not tune constants to change that.
- **The model can still be wrong in prose.** The outcome and numbers come from code. The claim audit catches unsupported numbers and draft or approval claims, but it does not judge tone or omissions.
- **Measurements are example or synthetic.** The phone-scan import is a geometric estimate and is labelled unverified.
- **Demo hardening is minimal.** There is a per-IP rate limit, a process token budget and a same-origin check, but no authentication.
- Personas in the UI are synthetic.
- **Newton is not re-run live.** Case 3 shows a recorded run from 14 Oct 2026; Cases 1 and 2 use code checks only.
- **Case 2 does not use the agent** (no insert tool yet); it is compiled by code.
- Figures marked "industry estimate" are unverified; all other numbers above cite their source.

## What changed since 26 Aug 2026

The hackathon opened on 26 Aug 2026. This codebase started on **15 Sep 2026** (first commit), so all of it postdates the opening. In order:

- **15–25 Sep:** "Bypass Lab", a pre-simulation MVP: mobility motion viewer and scan-to-prototype flow.
- **13–15 Oct:** a bounded experiment workflow with traceable comparisons, replayable records, non-human specimens and a first Token Factory review agent for the geometry lab.
- **22 Oct:** a contact-liner compiler page with a reviewed specimen export (`liner-core.js`, `liner-record.js`).
- **30 Oct (this submission):** a **Nemotron tool-calling agent** that drives the liner compiler, with bounded tools, a deterministic outcome, a claim audit, a server-side key with rate and token limits, a UI trace panel, three recorded live cases, offline mock-provider tests and deploy configs.

- **30 Oct (later):** the pipeline landing page (`/`), sample scans, and three end-to-end cases (liner live, insole by code, coupon with recorded Newton check).

## Licence

MIT (see `LICENSE`). `THIRD_PARTY_NOTICES.md` preserves the MIT notice for adapted Rehab Foundry triangulation code from the parent project.
