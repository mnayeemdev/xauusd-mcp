# V10_TOTAL_EXPOSURE

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Equity definition
- **Authoritative equity:** the account EQUITY (balance + floating P/L) at the decision instant, as reported by the platform. It is never free margin, never a starting balance and never a fixed number.
- **In this study:** a new trade is only considered when flat (MAX_SIMULTANEOUS_TRADES = 1), so equity = closed-trade balance at every decision.
- **Day and week anchors:** day-start equity and week-start equity are snapshots of that equity at the first event of the UTC day and ISO week.

## Open-exposure handling
- **MAX_SIMULTANEOUS_TRADES = 1.** A decision while a position is open is rejected (POSITION_OPEN_MAX_SIMULTANEOUS_1). There is no pyramiding, no second position and no averaging down.
- **Remaining capacity:** with no open position the per-trade capacity is the full per-trade budget (equity × r), capped by the remaining daily capacity when a daily limit is configured.
- **Total planned exposure** is therefore at most one position's actual risk (≤ equity × r) at any time.
- **Cross-symbol exposure:** none (XAUUSD only).

## Measured (PCT 0.50 %, 10,000 USD, NORMAL cost)
| Split | Trades | Signals arriving while the single position was open | Share of all signals |
|---|---|---|---|
| DEV | 1141 | 3333 | 68.6 % |
| HOLD | 1541 | 4316 | 65.9 % |

These signals are not traded (not queued, not added). The existing one-position walk (`canReenter`) also blocks same-setup repeats and revenge re-entries; that is unchanged from V8/V9.

## Prohibited (asserted by tests)
- Increasing risk after a loss (martingale).
- Recovery sizing.
- Averaging down.
- Size growth from recent profit beyond equity proportionality.
- AUTO_SCALING stays OFF; CAPITAL_HARVEST stays OFF.
