import MetaTrader5 as mt5, json, datetime as dt
if not mt5.initialize(): print("INIT_FAILED"); raise SystemExit
out = {}
for name, tf, n in [("5m", mt5.TIMEFRAME_M5, 30000), ("15m", mt5.TIMEFRAME_M15, 10500), ("30m", mt5.TIMEFRAME_M30, 5500), ("1H", mt5.TIMEFRAME_H1, 3000), ("4H", mt5.TIMEFRAME_H4, 1000), ("1D", mt5.TIMEFRAME_D1, 500)]:
    r = mt5.copy_rates_from_pos("XAUUSDm", tf, 0, n)
    if r is None: print(name, "NONE", mt5.last_error()); continue
    out[name] = [{"time": int(b["time"]), "open": float(b["open"]), "high": float(b["high"]), "low": float(b["low"]), "close": float(b["close"]), "volume": int(b["tick_volume"])} for b in r]
    print(name, len(out[name]), dt.datetime.fromtimestamp(out[name][0]["time"], dt.timezone.utc).isoformat(), "->", dt.datetime.fromtimestamp(out[name][-1]["time"], dt.timezone.utc).isoformat())
# gap scan on 5m: gaps > 30 min that are not the weekend
b = out["5m"]; gaps = []
for i in range(1, len(b)):
    d = b[i]["time"] - b[i-1]["time"]
    if d > 1800:
        wd = dt.datetime.fromtimestamp(b[i-1]["time"], dt.timezone.utc).weekday()
        gaps.append({"from": dt.datetime.fromtimestamp(b[i-1]["time"], dt.timezone.utc).isoformat(), "to": dt.datetime.fromtimestamp(b[i]["time"], dt.timezone.utc).isoformat(), "minutes": d//60, "weekend": wd in (4,5,6)})
print("GAPS_NON_WEEKEND=", [g for g in gaps if not g["weekend"]][:20])
print("GAPS_TOTAL=", len(gaps))
json.dump(out, open(r"C:\Users\Techn\tradingview-mcp-main\validation\master_edge_validation\xauusdm_bars_master.json", "w"))
print("saved")
