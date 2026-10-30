# Rehab AI · hands-free crutch contact-liner compiler, driven by an NVIDIA Nemotron agent

Crutches take both hands. A hands-free (knee) crutch gives them back, but the place where the shin rests, the **contact liner**, is where it hurts. Rehab AI is a small *hardware compiler* for that liner. Leg measurements go in. Out comes a versioned, full-scale cut pattern with engineering checks and a build record that a **person has to approve**.

An **NVIDIA Nemotron** model running on **Nebius Token Factory** drives the compiler through function calling. It reads the case, validates it, compiles, compares against the previous version and prepares a draft build record. It then explains the result in plain language. It never computes a number and it can never approve.

> **Not a medical device.** This is a design prototype. The liner is a comfort layer for an existing commercial hands-free crutch. It is **not load-bearing** and **not for patient use**. All measurements in this repo are *example* or *synthetic* values. Nothing here has been clinically validated or fitted on a person.

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
