import MetaTrader5 as mt5, json, datetime as dt
if not mt5.initialize(): print("INIT_FAILED"); raise SystemExit
utc = dt.timezone.utc
def conv(r): return [{"time": int(b["time"]), "open": float(b["open"]), "high": float(b["high"]), "low": float(b["low"]), "close": float(b["close"]), "volume": int(b["tick_volume"])} for b in r]
out = {}
r = mt5.copy_rates_from_pos("XAUUSDm", mt5.TIMEFRAME_H1, 0, 99000); out["1H"] = conv(r) if r is not None else []; print("1H", len(out["1H"]), mt5.last_error())
r = mt5.copy_rates_from_pos("XAUUSDm", mt5.TIMEFRAME_M5, 0, 99000); out["5m"] = conv(r) if r is not None else []; print("5m", len(out["5m"]), mt5.last_error())
m15 = []
for y in range(2016, 2027):
    for half in (0, 1):
        a = dt.datetime(y, 1 if half == 0 else 7, 1, tzinfo=utc); b = dt.datetime(y if half == 0 else y, 7 if half == 0 else 12, 1 if half == 0 else 31, 23, 59, tzinfo=utc)
        r = mt5.copy_rates_range("XAUUSDm", mt5.TIMEFRAME_M15, a, b)
        n = 0 if r is None else len(r)
        if n: m15.extend(conv(r))
        print("15m", y, half, n, mt5.last_error() if r is None else "")
seen = set(); m15u = []
for b in m15:
    if b["time"] not in seen: seen.add(b["time"]); m15u.append(b)
m15u.sort(key=lambda x: x["time"]); out["15m"] = m15u
r = mt5.copy_rates_from_pos("XAUUSDm", mt5.TIMEFRAME_D1, 0, 5000); out["1D"] = conv(r) if r is not None else []
for k, v in out.items():
    if v: print("COVERAGE", k, len(v), dt.datetime.fromtimestamp(v[0]["time"], utc).isoformat(), "->", dt.datetime.fromtimestamp(v[-1]["time"], utc).isoformat())
mt5.shutdown()
json.dump(out, open(r"C:\Users\Techn\tradingview-mcp-main\validation\v3_multiyear_event_study\xauusdm_multiyear_bars.json", "w"))
print("saved")
