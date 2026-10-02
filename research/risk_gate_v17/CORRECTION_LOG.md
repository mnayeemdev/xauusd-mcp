# V17 CORRECTION / DEVIATION LOG

## D1. Envelope swap: a DEV-frozen maximum instead of a per-entry count (implementation of pre-registration §6)
- **§6 says:** "known maximum swap within the horizon (calendar nights possible × adverse swap rate, triple-aware)".
- **Why not per entry:** counting nights per entry from the timestamps of the following 288 bars would read future data gaps (holidays, outages). That is lookahead.
- **What is used instead:** the maximum charged nights within the 288-bar horizon over all DEV bars, frozen in `configs/v17_freeze.json` = 5, times the adverse rate (BUY 0.5132 USD/oz/night; SELL 0, because swap_short = 0).
- **Status:** conservative, and decided before HOLDOUT.

## D2. Report-level fixes before the final run (gate logic unchanged)
1. **Rounding check:** the walk's rounding-violation check compared the planned cash risk rounded to 2 decimals with the actual exposure rounded to 4 decimals. That produced 2 false flags (0.10 % risk, DEV); `sizePosition` itself rejects any actual > cash.
   - **Fix:** raw values are now compared, giving 0 violations.
2. **Swap statistic sign:** the swap-cost statistic in the swap report was printed negated.
   - **Fix:** costs are now reported positive.
3. **`checkVolume` extraction:** it was moved out of `sizePosition` so the invalid-size path is directly testable.
   - **Effect:** identical decisions. The replay hash changed only because the trade records gained raw fields.

## D3. Conventions kept from the existing models (documented, not changed)
- **Slippage** is applied once, at the exit, including target exits. This is the V9 / V10 simulator convention. Entry slippage on the 2 real fills was 0.
- **Rollover time:** primary = 00:00 broker time (= UTC, V15 calibration). A sensitivity using the instrument's own trading-day boundaries in the broker bars (the daily break) is reported beside it.
