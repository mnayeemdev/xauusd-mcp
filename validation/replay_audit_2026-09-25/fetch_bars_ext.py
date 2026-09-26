import MetaTrader5 as mt5, json, datetime as dt
if not mt5.initialize(): print("INIT_FAILED"); raise SystemExit
out = {}
for name, tf, n in [("5m", mt5.TIMEFRAME_M5, 9500), ("15m", mt5.TIMEFRAME_M15, 3600), ("30m", mt5.TIMEFRAME_M30, 2000), ("1H", mt5.TIMEFRAME_H1, 1300), ("4H", mt5.TIMEFRAME_H4, 700), ("1D", mt5.TIMEFRAME_D1, 400)]:
    r = mt5.copy_rates_from_pos("XAUUSDm", tf, 0, n)
    out[name] = [{"time": int(b["time"]), "open": float(b["open"]), "high": float(b["high"]), "low": float(b["low"]), "close": float(b["close"]), "volume": int(b["tick_volume"])} for b in r]
    print(name, len(out[name]), dt.datetime.fromtimestamp(out[name][0]["time"], dt.timezone.utc).isoformat(), "->", dt.datetime.fromtimestamp(out[name][-1]["time"], dt.timezone.utc).isoformat())
mt5.shutdown()
json.dump(out, open(r"C:\Users\Techn\tradingview-mcp-main\validation\replay_audit_2026-09-25\xauusdm_bars_extended.json", "w"))
print("saved")
