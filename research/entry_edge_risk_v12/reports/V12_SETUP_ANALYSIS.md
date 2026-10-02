# V12_SETUP_ANALYSIS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## SETUP stage: probe outcomes per model and side
| Split | Model | Side | Bars | Days | Net R | Gross R | Edge vs baseline (gross) | Direction value (side − opposite) | Win | MFE | MAE | 1.70R reach |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | MC | BUY | 2839 | 178 | -0.043 | 0.039 | 0.022 [-0.065, 0.116] · | 0.037 [-0.139, 0.217] · | 44.4 % | 1.21 | 1.14 | 44.4 % |
| DEV | MC | SELL | 2748 | 173 | -0.128 | -0.047 | -0.021 [-0.114, 0.077] · | -0.105 [-0.295, 0.093] · | 40.0 % | 1.21 | 1.11 | 40.0 % |
| DEV | PB | BUY | 14330 | 199 | -0.092 | 0.011 | -0.006 [-0.088, 0.073] · | 0.013 [-0.142, 0.157] · | 43.7 % | 1.19 | 1.17 | 43.7 % |
| DEV | PB | SELL | 12979 | 197 | -0.156 | -0.069 | -0.043 [-0.120, 0.028] · | -0.099 [-0.252, 0.048] · | 39.6 % | 1.20 | 1.15 | 39.6 % |
| DEV | BO | BUY | 11134 | 188 | -0.137 | -0.034 | -0.051 [-0.133, 0.035] · | -0.084 [-0.243, 0.085] · | 42.4 % | 1.15 | 1.21 | 42.4 % |
| DEV | BO | SELL | 9885 | 191 | -0.170 | -0.078 | -0.052 [-0.131, 0.022] · | -0.147 [-0.296, -0.000] ▼ | 39.2 % | 1.20 | 1.17 | 39.2 % |
| DEV | SR | BUY | 734 | 174 | -0.098 | 0.013 | -0.004 [-0.147, 0.133] · | 0.050 [-0.213, 0.295] · | 43.9 % | 1.16 | 1.20 | 43.9 % |
| DEV | SR | SELL | 646 | 163 | -0.127 | -0.038 | -0.012 [-0.156, 0.124] · | -0.080 [-0.350, 0.187] · | 41.3 % | 1.19 | 1.20 | 41.3 % |
| DEV | MR | BUY | 986 | 103 | -0.121 | -0.036 | -0.053 [-0.266, 0.151] · | -0.053 [-0.459, 0.339] · | 42.4 % | 1.19 | 1.18 | 42.4 % |
| DEV | MR | SELL | 1071 | 101 | -0.175 | -0.083 | -0.057 [-0.246, 0.122] · | -0.167 [-0.526, 0.192] · | 38.8 % | 1.20 | 1.16 | 38.8 % |
| HOLD | MC | BUY | 2764 | 202 | -0.048 | -0.007 | 0.061 [-0.049, 0.169] · | -0.028 [-0.236, 0.175] · | 42.4 % | 1.26 | 1.10 | 42.4 % |
| HOLD | MC | SELL | 3020 | 202 | 0.069 | 0.110 | 0.046 [-0.044, 0.130] · | 0.226 [0.057, 0.388] ▲ | 45.6 % | 1.33 | 1.05 | 45.6 % |
| HOLD | PB | BUY | 15537 | 221 | -0.108 | -0.056 | 0.012 [-0.058, 0.087] · | -0.103 [-0.238, 0.043] · | 41.2 % | 1.22 | 1.15 | 41.2 % |
| HOLD | PB | SELL | 15974 | 220 | 0.037 | 0.086 | 0.021 [-0.044, 0.087] · | 0.170 [0.041, 0.301] ▲ | 45.2 % | 1.30 | 1.11 | 45.2 % |
| HOLD | BO | BUY | 11223 | 207 | -0.103 | -0.051 | 0.017 [-0.066, 0.094] · | -0.108 [-0.271, 0.041] · | 41.5 % | 1.22 | 1.16 | 41.5 % |
| HOLD | BO | SELL | 11972 | 211 | 0.027 | 0.075 | 0.011 [-0.054, 0.081] · | 0.158 [0.028, 0.299] ▲ | 44.9 % | 1.31 | 1.12 | 44.9 % |
| HOLD | SR | BUY | 856 | 197 | -0.228 | -0.172 | -0.104 [-0.222, 0.022] · | -0.338 [-0.552, -0.092] ▼ | 37.7 % | 1.13 | 1.25 | 37.7 % |
| HOLD | SR | SELL | 808 | 187 | 0.047 | 0.093 | 0.029 [-0.104, 0.167] · | 0.173 [-0.072, 0.410] · | 46.3 % | 1.25 | 1.16 | 46.3 % |
| HOLD | MR | BUY | 1199 | 107 | 0.019 | 0.072 | 0.140 [-0.058, 0.341] · | 0.119 [-0.280, 0.521] · | 46.0 % | 1.31 | 1.24 | 46.0 % |
| HOLD | MR | SELL | 1310 | 109 | -0.041 | 0.013 | -0.051 [-0.241, 0.147] · | 0.026 [-0.329, 0.413] · | 42.8 % | 1.31 | 1.14 | 42.8 % |

## Pooled
| Split | Observations | Pooled edge vs baseline |
|---|---|---|
| DEV | 57352 | -0.032 [-0.076, 0.016] · |
| HOLD | 64663 | 0.019 [-0.018, 0.053] · |

## PATTERN → SETUP
| Split | Transition | Change in gross edge |
|---|---|---|
| DEV | PATTERN->SETUP | -0.019 [-0.051, 0.018] · |
| HOLD | PATTERN->SETUP | 0.013 [-0.016, 0.043] · |

## Reading
- **The setup conditions don't add measurable edge, and they don't remove any.** The transition interval includes 0 on both splits.
- **No SETUP_ERROR** exists among losing trades.

Probe: entry at the stage bar close, SL = 1.35 × ATR14, fixed 1.70 R exit; GROSS = zero spread / slippage, swap added back. Edge vs baseline = gross R minus the unconditional same-side gross R (removes market drift). Intervals: 95 % day-block bootstrap. ▲ / ▼ = interval entirely above / below 0; · = includes 0.
