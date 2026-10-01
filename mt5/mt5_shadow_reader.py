# READ-ONLY MT5 reader for the FORWARD SHADOW OBSERVER (Stage 11C).
# JSON-lines request/response over stdin/stdout. It can only read: rates, ticks, symbol info, account
# identity (login/server for the audit trail) and the read-only market book (2026-10-01). It contains NO trading call of any kind by design; a test
# (tests/shadow_observer.test.js) scans this file for the MetaTrader5 trading function names.
import sys, json, time
import MetaTrader5 as mt5

BOOK_SUBSCRIBED = {}
TF = {"5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15, "30m": mt5.TIMEFRAME_M30, "1H": mt5.TIMEFRAME_H1}

def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n"); sys.stdout.flush()

def rates(symbol, tf, count):
    r = mt5.copy_rates_from_pos(symbol, TF[tf], 0, int(count))
    if r is None:
        return {"ok": False, "error": str(mt5.last_error())}
    return {"ok": True, "bars": [{"time": int(x["time"]), "open": float(x["open"]), "high": float(x["high"]), "low": float(x["low"]), "close": float(x["close"]), "volume": int(x["tick_volume"]), "spread_points": int(x["spread"])} for x in r]}

def main():
    if not mt5.initialize():
        out({"ok": False, "error": "INIT_FAILED " + str(mt5.last_error())}); return
    ai = mt5.account_info(); ti = mt5.terminal_info()
    out({"ok": True, "hello": True, "login": ai.login if ai else None, "server": ai.server if ai else None, "terminal_connected": bool(ti.connected) if ti else None, "read_only": True})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("cmd")
            if cmd == "rates":
                out({"id": req.get("id"), **rates(req["symbol"], req.get("tf", "5m"), req.get("count", 300))})
            elif cmd == "tick":
                t = mt5.symbol_info_tick(req["symbol"])
                out({"id": req.get("id"), "ok": t is not None, "tick": None if t is None else {"time": int(t.time), "bid": float(t.bid), "ask": float(t.ask)}, "now": time.time()})
            elif cmd == "select":
                si = mt5.symbol_info(req["symbol"])
                if si is None:
                    out({"id": req.get("id"), "ok": False, "error": "SYMBOL_ABSENT"})
                else:
                    ok = True if si.visible else bool(mt5.symbol_select(req["symbol"], True))
                    out({"id": req.get("id"), "ok": ok, "was_visible": bool(si.visible)})
            elif cmd == "book":
                # READ-ONLY market depth (DOM): market_book_add subscribes, market_book_get reads the current book.
                # No trading call is involved. A symbol without depth returns None: recorded as unavailable, never fabricated.
                sym = req["symbol"]
                if sym not in BOOK_SUBSCRIBED:
                    BOOK_SUBSCRIBED[sym] = bool(mt5.market_book_add(sym))
                items = mt5.market_book_get(sym) if BOOK_SUBSCRIBED.get(sym) else None
                if items is None:
                    out({"id": req.get("id"), "ok": False, "error": "NO_BOOK " + str(mt5.last_error()), "subscribed": BOOK_SUBSCRIBED.get(sym, False), "time": time.time()})
                else:
                    out({"id": req.get("id"), "ok": True, "time": time.time(), "levels": [{"type": "BID" if it.type == mt5.BOOK_TYPE_BUY else "ASK" if it.type == mt5.BOOK_TYPE_SELL else str(it.type), "price": float(it.price), "volume": float(it.volume_real if getattr(it, "volume_real", 0) else it.volume)} for it in items]})
            elif cmd == "ping":
                out({"id": req.get("id"), "ok": True, "now": time.time()})
            elif cmd == "quit":
                for sym in list(BOOK_SUBSCRIBED.keys()):
                    try:
                        mt5.market_book_release(sym)
                    except Exception:
                        pass
                out({"id": req.get("id"), "ok": True}); break
            else:
                out({"id": req.get("id"), "ok": False, "error": "UNKNOWN_CMD"})
        except Exception as e:  # never crash the reader on one bad request
            out({"ok": False, "error": "EXC " + str(e)})
    mt5.shutdown()

if __name__ == "__main__":
    main()
