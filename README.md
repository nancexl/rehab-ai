# Rehab AI · hands-free crutch contact-liner compiler, driven by an NVIDIA Nemotron agent

Crutches take both hands. A hands-free (knee) crutch gives them back, but the place where the shin rests, the **contact liner**, is where it hurts. Rehab AI is a small *hardware compiler* for that liner. Leg measurements go in. Out comes a versioned, full-scale cut pattern with engineering checks and a build record that a **person has to approve**.

An **NVIDIA Nemotron** model running on **Nebius Token Factory** drives the compiler through function calling. It reads the case, validates it, compiles, compares against the previous version and prepares a draft build record. It then explains the result in plain language. It never computes a number and it can never approve.

> **Not a medical device.** This is a design prototype. The liner is a comfort layer for an existing commercial hands-free crutch. It is **not load-bearing** and **not for patient use**. All measurements in this repo are *example* or *synthetic* values. Nothing here has been clinically validated or fitted on a person.

## Who it's for

Two users, and possibly two businesses. Neither has been validated with real customers yet.

| | **Crutch users after a foot/ankle injury** | **Central-fab orthotic labs and NHS-contracted providers** |
|---|---|---|
| Role | End user of a hands-free (iWALK-type) knee crutch | Operator and buyer of the design tool (for example Opcare, Peacocks, Blatchford, Ottobock UK; Hanger in the US) |
| Problem | For 6–8+ weeks after a foot/ankle injury, people lose independence. Mobility aids are one-size-fits-all, take up the hands, hurt at the contact points and don't match the person's home and tasks. With a hands-free crutch the pain moves to where the shin rests, and nobody makes that liner to fit you | Technicians are scarce. The baseline workflow is 30–60+ minutes of manual rectification per device and 1–2 weeks for an insole (2–4 weeks for an AFO/socket). Remakes run from 3% (traditional AFO) to 17% (early CAD/CAM AFO) |
| Value proposition | Comfort and fit: a liner pattern made from your own measurements, re-compiled when your leg changes | Throughput and fewer remakes: a versioned, checked, human-approved pattern with a build record, aiming to cut manual rectification time and remakes (not yet measured) |

**The moat we are aiming for (a hypothesis):** a long-term *outcome → design* learning loop. Every version records the inputs, the checks, who approved it and what was measured after fitting. Over time that data shows what worked, for whom and on which fabrication setup.

Context numbers, from the founder's 19 Oct 2026 market research report (not re-verified for this submission): about 1,250 HCPC-registered prosthetists/orthotists in the UK, and an estimated 1,133–1,803 more technicians needed to meet WHO standards (see the [BAPO workforce report](https://www.bapo.com/landmark-study-reveals-critical-shortage-in-uk-prosthetic-and-orthotic-workforce/)). NHS orthotics waits average 7 weeks (maximum 34).

## User flow

1. **Intake.** Side, weight-bearing status, home and work context, plus three calf circumferences, shin length and knee width (typed, or imported from a phone scan). Each value carries a provenance label.
2. **Nemotron agent plans and calls bounded tools.** Deterministic code computes every number. A claim audit then checks the model's explanation against the tool results.
3. **Checks, a 1:1 A4 pattern and a build record.** 10 engineering checks, full-scale tiled templates with a 100 mm ruler, and a draft build record with spec hashes.
4. **A human approves this version.** Only a person can approve, and only for the version they reviewed. Editing or recompiling revokes the approval.
5. **Make, fit on a nonhuman specimen, measure, recompile v2.** The measured result feeds back into the next version.

Two demo views are being added in parallel: a **patient view** (plain-language intake and result) and a **technician view** (full trace, checks, approval and build record).

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
npm start                                  # → http://127.0.0.1:4173/liner.html
npm test                                   # offline: mock provider + compiler/record/scan tests (no key, no network)
npm run agent:cases                        # live: re-runs the 3 evidence cases into evidence/live/
```

Optional environment variables: `NEBIUS_MODEL`, `PORT`, `HOST`, `AGENT_RATE_MAX` (default 8 runs per IP per 10 min) and `AGENT_TOKEN_BUDGET` (default 600,000 tokens per process). Without a key the compiler still works fully, and the agent panel says the agent is not configured.

**Deploy:** `render.yaml` is a Render Blueprint (free web service), with the key set as a dashboard secret. The `Dockerfile` works for Fly.io, Nebius Serverless or Cloud Run, with the key passed as a runtime secret.

## Evidence: real live runs (`evidence/live/`)

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

- **Consumer:** a fee per personalised liner, paid by the user (self-pay). The iWALK 3.0 itself costs about $179 in the US and about £169 in the UK, and buyers pay out of pocket (19 Oct market report). In the UK, a liner sold for use with an iWALK is *likely* a Class I accessory: UKCA self-declaration, a technical file and MHRA registration. That is our reading, not legal advice, and the intended purpose decides the route ([MHRA Class I guidance](https://www.gov.uk/government/collections/guidance-on-class-1-medical-devices), [borderline products](https://www.gov.uk/guidance/borderline-products-how-to-tell-if-your-product-is-a-medical-device)).
- **B2B:** per design or per seat for central-fab labs and NHS-contracted providers. One caveat shapes this: **payers buy devices, not software**, so the tool has to pay for itself in lab throughput and avoided remakes.

The handoff also holds an **illustrative** market model (annual potential, low/base/high, GBP; scenario assumptions, not a validated TAM; segments overlap and must not be added together): acute non-weight-bearing £8.9m / £28.4m / £70.2m; Achilles £1.4m / £6.3m / £16.5m; diabetic foot £7.2m / £50.7m / £176m; Charcot £0.8m / £5.6m / £26.3m.

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

## What changed since 26 Aug 2026

The hackathon opened on 26 Aug 2026. This codebase started on **15 Sep 2026** (first commit), so all of it postdates the opening. In order:

- **15–25 Sep:** "Bypass Lab", a pre-simulation MVP: mobility motion viewer and scan-to-prototype flow.
- **13–15 Oct:** a bounded experiment workflow with traceable comparisons, replayable records, non-human specimens and a first Token Factory review agent for the geometry lab.
- **22 Oct:** a contact-liner compiler page with a reviewed specimen export (`liner-core.js`, `liner-record.js`).
- **30 Oct (this submission):** a **Nemotron tool-calling agent** that drives the liner compiler, with bounded tools, a deterministic outcome, a claim audit, a server-side key with rate and token limits, a UI trace panel, three recorded live cases, offline mock-provider tests and deploy configs.

## Licence

MIT (see `LICENSE`). `THIRD_PARTY_NOTICES.md` preserves the MIT notice for adapted Rehab Foundry triangulation code from the parent project.
