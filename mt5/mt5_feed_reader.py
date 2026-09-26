# READ-ONLY MT5 market-data reader for the STAGE 12 DEMO VALIDATOR (market data only).
# JSON-lines request/response over stdin/stdout. It can only read rates, ticks and symbol info and select a
# symbol in Market Watch. It contains NO trading call of any kind by design; tests scan this file for the
# MetaTrader5 trading function names. It attaches to the terminal given by XAUUSD_MT5_FEED_TERMINAL_PATH
# (default: the installed terminal) purely to READ XAUUSDm bars; execution goes through the separate DEMO
# bridge (mt5/mt5_bridge.py) attached to the DEMO terminal.
import os, sys, json, time
import MetaTrader5 as mt5

TF = {"5": mt5.TIMEFRAME_M5, "15": mt5.TIMEFRAME_M15, "30": mt5.TIMEFRAME_M30, "60": mt5.TIMEFRAME_H1, "120": mt5.TIMEFRAME_H2, "240": mt5.TIMEFRAME_H4, "480": mt5.TIMEFRAME_H8, "D": mt5.TIMEFRAME_D1, "W": mt5.TIMEFRAME_W1, "M": mt5.TIMEFRAME_MN1,
      "5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15, "30m": mt5.TIMEFRAME_M30, "1H": mt5.TIMEFRAME_H1}

def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n"); sys.stdout.flush()

def rates(symbol, tf, count):
    r = mt5.copy_rates_from_pos(symbol, TF[str(tf)], 0, int(count))
    if r is None:
        return {"ok": False, "error": str(mt5.last_error())}
    return {"ok": True, "bars": [{"time": int(x["time"]), "open": float(x["open"]), "high": float(x["high"]), "low": float(x["low"]), "close": float(x["close"]), "volume": int(x["tick_volume"]), "spread_points": int(x["spread"])} for x in r]}

def main():
    path = os.environ.get("XAUUSD_MT5_FEED_TERMINAL_PATH") or None
    ok = mt5.initialize(path) if path else mt5.initialize()
    if not ok:
        out({"ok": False, "error": "INIT_FAILED " + str(mt5.last_error())}); return
    ai = mt5.account_info(); ti = mt5.terminal_info()
    out({"ok": True, "hello": True, "login": ai.login if ai else None, "server": ai.server if ai else None, "terminal_connected": bool(ti.connected) if ti else None, "terminal_path": ti.path if ti else None, "read_only": True})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line); cmd = req.get("cmd")
            if cmd == "rates":
                out({"id": req.get("id"), **rates(req["symbol"], req.get("tf", "5"), req.get("count", 500))})
            elif cmd == "tick":
                t = mt5.symbol_info_tick(req["symbol"])
                out({"id": req.get("id"), "ok": t is not None, "tick": None if t is None else {"time": int(t.time), "bid": float(t.bid), "ask": float(t.ask)}, "now": time.time()})
            elif cmd == "select":
                si = mt5.symbol_info(req["symbol"])
                out({"id": req.get("id"), "ok": si is not None and (bool(si.visible) or bool(mt5.symbol_select(req["symbol"], True)))})
            elif cmd == "ping":
                ti = mt5.terminal_info(); out({"id": req.get("id"), "ok": True, "connected": bool(ti.connected) if ti else None, "now": time.time()})
            elif cmd == "quit":
                out({"id": req.get("id"), "ok": True}); break
            else:
                out({"id": req.get("id"), "ok": False, "error": "UNKNOWN_CMD"})
        except Exception as e:
            out({"ok": False, "error": "EXC " + str(e)})
    mt5.shutdown()

if __name__ == "__main__":
    main()
