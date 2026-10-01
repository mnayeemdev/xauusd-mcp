# V8_COST_STRESS

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

Costs: NORMAL spread 0.24 + slippage 0.10 USD; STRESS 0.60 + 0.20; DRIFT = fill at the next bar open; swap 0.56 USD per BUY night.

## DEV
| Variant | Stress exp (R) | Drift exp (R) | Fixed 1.70 R exp | Block CI 95 % | Trades / session (median, p90) | Max DD USD (0.01 lot) |
|---|---|---|---|---|---|---|
| CONTROL | -0.185 | -0.059 | -0.070 | [-0.164, 0.064] | 4, 8 | 327.03 |
| D1 | -0.256 | -0.116 | -0.079 | [-0.232, -0.009] | 5, 9 | 538.78 |
| D2 | -0.193 | -0.058 | -0.065 | [-0.175, 0.041] | 4, 8 | 337.09 |
| D3 | -0.172 | -0.046 | -0.078 | [-0.155, 0.074] | 4, 8 | 292.32 |
| D4 | -0.200 | -0.077 | -0.081 | [-0.175, 0.05] | 4, 8 | 364.38 |
| D5 | -0.183 | -0.056 | -0.067 | [-0.163, 0.068] | 4, 8 | 320.32 |
| D6 | -0.191 | -0.059 | -0.076 | [-0.167, 0.055] | 4, 8 | 307.82 |
| ALL | -0.241 | -0.082 | -0.077 | [-0.206, 0.009] | 5, 9 | 497.28 |

## HOLD
| Variant | Stress exp (R) | Drift exp (R) | Fixed 1.70 R exp | Block CI 95 % | Trades / session (median, p90) | Max DD USD (0.01 lot) |
|---|---|---|---|---|---|---|
| CONTROL | -0.157 | -0.067 | -0.040 | [-0.172, 0.047] | 6, 9 | 744.10 |
| D1 | -0.107 | -0.016 | -0.028 | [-0.12, 0.081] | 6, 10 | 632.71 |
| D2 | -0.175 | -0.087 | -0.043 | [-0.179, 0.024] | 6, 10 | 809.05 |
| D3 | -0.151 | -0.063 | -0.030 | [-0.169, 0.05] | 5, 9 | 762.73 |
| D4 | -0.162 | -0.068 | -0.048 | [-0.176, 0.043] | 6, 9 | 836.71 |
| D5 | -0.153 | -0.060 | -0.036 | [-0.169, 0.051] | 6, 9 | 724.73 |
| D6 | -0.153 | -0.064 | -0.035 | [-0.165, 0.049] | 6, 9 | 703.92 |
| ALL | -0.112 | -0.017 | -0.022 | [-0.115, 0.069] | 6, 10 | 679.18 |

## Capital feasibility (0.01 lot, corrected engine, HOLD; no fixed-dollar loss assumption)
| Capital (USD) | Max DD % | Mean broker SL risk % | Margin % | 0.01 lot feasible |
|---|---|---|---|---|
| 62 | 1095.5 % | 21.7 % | 36.8 % | NO (MARGIN_SAFETY_VETO: equity below ~71 USD) |
| 100 | 679.2 % | 13.5 % | 22.8 % | YES |
| 1000 | 67.9 % | 1.3 % | 2.3 % | YES |
| 10000 | 6.8 % | 0.1 % | 0.2 % | YES |

NORMAL and STRESS are negative for every variant on both splits. Mean broker SL ≈ 13.45 USD at 0.01 lot.
