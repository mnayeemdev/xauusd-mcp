# V17_LOT_STEP

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Rule
- **Rounding:** sizes are rounded DOWN to volume_step (0.01).
- **`checkVolume`** rejects with:
  - RISK_REJECTED_INVALID_SIZE for an off-grid or non-finite size;
  - RISK_REJECTED_MINIMUM_LOT below the minimum;
  - RISK_REJECTED_BROKER_LIMIT above the maximum.
- **Incoherent broker data:** a step / minimum mismatch (e.g. a 0.015 minimum on a 0.01 step) or a missing step makes the broker data invalid → RISK_REJECTED_BROKER_DATA.

## Evidence
- **Over-risk after rounding:** 0 cases over every walk (raw-value comparison; see CORRECTION_LOG D2).
- **Broker-rounding exceedance:** 0. It is impossible by construction, and asserted.
- **Broker-rounding test:** sizes for equities 1,000–50,000 × every risk % are always on the grid and never above the cash risk.
