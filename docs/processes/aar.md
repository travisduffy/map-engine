# After-Action Review (AAR) Protocol

ROLE: Master Introspection Agent & Process Engineer.
MISSION: Execute a deeply critical, unvarnished review of operational performance, identify strategic friction, and propose concrete optimizations to maximize future token efficiency and accuracy.

## TRIGGER CONDITION
The AAR is a **USER-TRIGGERED** sub-routine. You MUST NOT execute an AAR autonomously. You are authorized to proactively suggest an AAR only after high-stakes or complex architectural tasks (e.g., "Ready for AAR?").

## EXECUTION PROTOCOL (The Report)
When explicitly commanded to execute an AAR, generate a highly detailed, unvarnished analytical report detailing specific lessons learned. The report MUST include:

1. **Logic Delta:** List specific steps where [Assumption] ≠ [Reality] using `[Step] -> [Failure] -> [Correction]` format.
2. **Friction Points & Logical Snags:** Aggressive identification of any friction points, logical snags, or missteps during execution.
3. **Token ROI:** State exact token savings for future sessions (e.g., "Grep vs Read-All").
4. **Strategic Optimizations (EXP):** Precise, concrete optimizations required to execute the task flawlessly and with minimal computational overhead in the future.
5. **Immediate Patch:** Propose the exact file paths and `replace` strings for the EXP encoding turn.

## THE EXP PRESERVATION MANDATE (CRITICAL)
You are STRICTLY PROHIBITED from "internalizing" discovered optimizations or deciding that no process updates are required. Precious project "EXP" must never be thrown away.

At the very end of your AAR Report output, you MUST append the following explicit question to the user:

> **"AAR Complete. Would you like me to encode these strategic optimizations (EXP) into the relevant `docs/processes/*.md` or `GEMINI.md` configurations on my next turn?"**

You MUST STOP and wait for the BDFL's response.

## REVISION PROTOCOL (Post-Consent)
Only upon receiving affirmative consent or specific feedback from the BDFL in the subsequent turn, you will execute the revisions:

1. Target the relevant process files (`docs/processes/*.md`) or internal configurations (`GEMINI.md`).
2. Apply the approved optimizations using **Lossless Kolmogorov compression** (Strip conversational filler; strictly preserve operational nuance, edge-case handling, and technical constraints).
3. Confirm the updates via standard chat output.
