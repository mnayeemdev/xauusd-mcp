#!/usr/bin/env python3
"""
XAUUSD MCP -> MetaTrader 5 DEMO bridge (thin, non-deciding executor).

This process NEVER decides whether to trade. It executes exact, already
authorised instructions received as JSON lines on stdin from
src/engine/mt5Executor.js (Node) and answers with JSON lines on stdout.
Every trading decision (BUY/SELL/WAIT, entry qualification, one-position
rule, budgets, daily caps, dedup) lives on the Node side; this file only
knows how to talk to the terminal and how to REFUSE.

INDEPENDENT HARD GUARDS (second layer -- Node has its own, this one does
not trust Node):
  * The account MUST be ACCOUNT_TRADE_MODE_DEMO (0). No override exists.
  * The account login and server MUST equal the bridge's own expected
    values (env XAUUSD_MT5_LOGIN / XAUUSD_MT5_SERVER, defaulting to the
    verified DEMO account) AND the values Node passes in the request.
  * Only the expected symbol (env XAUUSD_MT5_SYMBOL, default XAUUSDm).
  * Volume never above HARD_MAX_VOLUME (env XAUUSD_MT5_BRIDGE_HARD_MAX_VOLUME,
    default 0.01).
  * Guards are re-evaluated on EVERY trade-changing command (open/close),
    not just at startup, so switching the terminal to a real account while
    the executor runs makes every subsequent order fail closed.
  * close() only ever touches a position carrying OUR magic number.

Protocol: one JSON object per line.
  request : {"id": <int>, "cmd": "<name>", ...params}
  response: {"id": <int>, "ok": true,  "result": {...}}
          | {"id": <int>, "ok": false, "error": {"code": "...", "message": "..."}}
"""
import json
import os
import sys
import time
import traceback

try:
    import MetaTrader5 as mt5
except Exception as exc:  # pragma: no cover - environment dependent
    sys.stdout.write(json.dumps({"id": None, "ok": False, "error": {"code": "MT5_IMPORT_FAILED", "message": str(exc)}}) + "\n")
    sys.stdout.flush()
    sys.exit(3)

ACCOUNT_TRADE_MODE_DEMO = 0  # mt5.ACCOUNT_TRADE_MODE_DEMO

EXPECTED_LOGIN = int(os.environ.get("XAUUSD_MT5_LOGIN", "480236873"))
EXPECTED_SERVER = os.environ.get("XAUUSD_MT5_SERVER", "Exness-MT5Trial11")
EXPECTED_SYMBOL = os.environ.get("XAUUSD_MT5_SYMBOL", "XAUUSDm")
HARD_MAX_VOLUME = float(os.environ.get("XAUUSD_MT5_BRIDGE_HARD_MAX_VOLUME", "0.01"))

SUCCESS_RETCODES = {10008, 10009}  # TRADE_RETCODE_PLACED, TRADE_RETCODE_DONE

_initialized = False


class BridgeError(Exception):
    def __init__(self, code, message, **extra):
        super().__init__(message)
        self.code = code
        self.extra = extra


def _nt(obj, fields):
    if obj is None:
        return None
    out = {}
    for f in fields:
        if hasattr(obj, f):
            v = getattr(obj, f)
            out[f] = v if isinstance(v, (int, float, str, bool)) or v is None else str(v)
    return out


ACCOUNT_FIELDS = ("login", "server", "trade_mode", "currency", "balance", "equity", "margin", "margin_free", "leverage", "trade_allowed", "trade_expert", "margin_mode", "name", "company")
TERMINAL_FIELDS = ("connected", "trade_allowed", "tradeapi_disabled", "company", "name", "build", "path", "data_path", "ping_last")
SYMBOL_FIELDS = ("name", "visible", "trade_mode", "trade_contract_size", "volume_min", "volume_max", "volume_step", "trade_stops_level", "trade_freeze_level", "digits", "point", "spread", "spread_float", "filling_mode", "trade_exemode", "currency_base", "currency_profit", "currency_margin", "swap_long", "swap_short", "swap_mode", "bid", "ask", "time")
POSITION_FIELDS = ("ticket", "time", "time_msc", "time_update", "type", "magic", "identifier", "reason", "volume", "price_open", "sl", "tp", "price_current", "swap", "profit", "symbol", "comment", "external_id")
DEAL_FIELDS = ("ticket", "order", "time", "time_msc", "type", "entry", "magic", "position_id", "reason", "volume", "price", "commission", "swap", "profit", "fee", "symbol", "comment", "external_id")
RESULT_FIELDS = ("retcode", "deal", "order", "volume", "price", "bid", "ask", "comment", "request_id", "retcode_external")


def ensure_initialized():
    global _initialized
    if _initialized:
        return
    if not mt5.initialize():
        raise BridgeError("MT5_INIT_FAILED", "mt5.initialize() failed: %s" % (mt5.last_error(),))
    _initialized = True


def guard_snapshot(params=None):
    """Full guard evaluation. Returns a dict describing every check; raises
    nothing by itself so 'hello' can report a failing state without exiting."""
    params = params or {}
    ensure_initialized()
    ai = mt5.account_info()
    ti = mt5.terminal_info()
    si = mt5.symbol_info(EXPECTED_SYMBOL)
    checks = {}
    if ai is None:
        checks["account_readable"] = False
    else:
        checks["account_readable"] = True
        checks["trade_mode_is_demo"] = (ai.trade_mode == ACCOUNT_TRADE_MODE_DEMO)
        checks["login_matches_bridge"] = (int(ai.login) == EXPECTED_LOGIN)
        checks["server_matches_bridge"] = (ai.server == EXPECTED_SERVER)
        req_login = params.get("expected_login")
        req_server = params.get("expected_server")
        checks["login_matches_request"] = (req_login is None) or (int(ai.login) == int(req_login))
        checks["server_matches_request"] = (req_server is None) or (ai.server == req_server)
        checks["account_trade_allowed"] = bool(ai.trade_allowed)
    checks["terminal_connected"] = bool(ti and ti.connected)
    checks["terminal_algo_trading_enabled"] = bool(ti and ti.trade_allowed)
    checks["symbol_available"] = si is not None
    req_symbol = params.get("symbol")
    checks["symbol_matches_request"] = (req_symbol is None) or (req_symbol == EXPECTED_SYMBOL)
    if si is not None:
        checks["symbol_trade_mode_full"] = (si.trade_mode == 4)  # SYMBOL_TRADE_MODE_FULL
    # DEMO verification never depends on algo-trading or connectivity (those
    # are separate, reported flags) -- it is purely "is this the expected
    # DEMO account on the expected server".
    demo_keys = ("account_readable", "trade_mode_is_demo", "login_matches_bridge", "server_matches_bridge", "login_matches_request", "server_matches_request")
    demo_verified = all(checks.get(k, False) for k in demo_keys)
    return {
        "demo_verified": demo_verified,
        "checks": checks,
        "expected": {"login": EXPECTED_LOGIN, "server": EXPECTED_SERVER, "symbol": EXPECTED_SYMBOL, "hard_max_volume": HARD_MAX_VOLUME},
        "account": _nt(ai, ACCOUNT_FIELDS),
        "terminal": _nt(ti, TERMINAL_FIELDS),
        "symbol": _nt(si, SYMBOL_FIELDS),
    }


def require_trade_guard(params):
    """Hard fail-closed guard for every trade-changing command."""
    snap = guard_snapshot(params)
    failed = [k for k, v in snap["checks"].items() if v is False and k in (
        "account_readable", "trade_mode_is_demo", "login_matches_bridge", "server_matches_bridge",
        "login_matches_request", "server_matches_request", "terminal_connected", "symbol_available", "symbol_matches_request")]
    if failed or not snap["demo_verified"]:
        raise BridgeError("DEMO_GUARD_FAILED", "refusing trade-changing command: failed checks %s" % failed, checks=snap["checks"])
    if not snap["checks"].get("terminal_algo_trading_enabled"):
        raise BridgeError("ALGO_TRADING_DISABLED", "terminal Algo Trading is OFF -- refusing to send an order (would be retcode 10027)", checks=snap["checks"])
    if not snap["checks"].get("account_trade_allowed"):
        raise BridgeError("ACCOUNT_TRADE_DISABLED", "account trading is disabled on the server side", checks=snap["checks"])
    return snap


def pick_filling(symbol_info):
    fm = int(symbol_info.filling_mode)
    if fm & 2:  # SYMBOL_FILLING_IOC
        return mt5.ORDER_FILLING_IOC
    if fm & 1:  # SYMBOL_FILLING_FOK
        return mt5.ORDER_FILLING_FOK
    return mt5.ORDER_FILLING_RETURN


def cmd_hello(params):
    return guard_snapshot(params)


def cmd_ping(_params):
    ensure_initialized()
    ti = mt5.terminal_info()
    return {"connected": bool(ti and ti.connected), "algo_trading_enabled": bool(ti and ti.trade_allowed), "time": time.time()}


def cmd_tick(params):
    ensure_initialized()
    symbol = params.get("symbol") or EXPECTED_SYMBOL
    if symbol != EXPECTED_SYMBOL:
        raise BridgeError("SYMBOL_NOT_ALLOWED", "symbol %s is not the bridge's expected symbol %s" % (symbol, EXPECTED_SYMBOL))
    si = mt5.symbol_info(symbol)
    if si is None:
        raise BridgeError("SYMBOL_UNAVAILABLE", "symbol_info(%s) returned None" % symbol)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise BridgeError("TICK_UNAVAILABLE", "symbol_info_tick(%s) returned None: %s" % (symbol, mt5.last_error()))
    return {
        "symbol": symbol, "bid": tick.bid, "ask": tick.ask, "last": tick.last, "time": tick.time, "time_msc": tick.time_msc,
        "spread_points": si.spread, "spread_price": round(tick.ask - tick.bid, si.digits), "digits": si.digits, "point": si.point,
        "contract_size": si.trade_contract_size, "volume_min": si.volume_min, "volume_max": si.volume_max, "volume_step": si.volume_step,
        "stops_level": si.trade_stops_level, "freeze_level": si.trade_freeze_level, "now": time.time(),
    }


def cmd_positions(params):
    ensure_initialized()
    symbol = params.get("symbol") or EXPECTED_SYMBOL
    magic = params.get("magic")
    pos = mt5.positions_get(symbol=symbol)
    if pos is None:
        pos = ()
    out = []
    for p in pos:
        if magic is not None and int(p.magic) != int(magic):
            continue
        out.append(_nt(p, POSITION_FIELDS))
    return {"positions": out}


def cmd_deals(params):
    """All deals belonging to one position id (entry + exit)."""
    ensure_initialized()
    position_id = int(params["position_id"])
    deals = mt5.history_deals_get(position=position_id)
    if deals is None:
        deals = ()
    return {"deals": [_nt(d, DEAL_FIELDS) for d in deals]}


def cmd_history(params):
    """Deals in a time range filtered by magic (and symbol)."""
    ensure_initialized()
    from_ts = float(params.get("from_ts", time.time() - 86400 * 2))
    to_ts = float(params.get("to_ts", time.time() + 3600))
    magic = params.get("magic")
    symbol = params.get("symbol") or EXPECTED_SYMBOL
    import datetime as _dt
    deals = mt5.history_deals_get(_dt.datetime.fromtimestamp(from_ts, _dt.timezone.utc), _dt.datetime.fromtimestamp(to_ts, _dt.timezone.utc))
    if deals is None:
        deals = ()
    out = []
    for d in deals:
        if magic is not None and int(d.magic) != int(magic):
            continue
        if symbol and d.symbol != symbol:
            continue
        out.append(_nt(d, DEAL_FIELDS))
    return {"deals": out}


def _position_id_for_deal(deal_ticket, attempts=10, delay=0.2):
    for _ in range(attempts):
        deals = mt5.history_deals_get(ticket=int(deal_ticket))
        if deals:
            return _nt(deals[0], DEAL_FIELDS)
        time.sleep(delay)
    return None


def cmd_open(params):
    snap = require_trade_guard(params)
    si = mt5.symbol_info(EXPECTED_SYMBOL)
    side = params.get("side")
    if side not in ("BUY", "SELL"):
        raise BridgeError("INVALID_SIDE", "side must be BUY or SELL")
    volume = float(params.get("volume", 0))
    if volume <= 0 or volume > HARD_MAX_VOLUME + 1e-12:
        raise BridgeError("VOLUME_NOT_ALLOWED", "volume %s exceeds the bridge hard cap %s" % (volume, HARD_MAX_VOLUME))
    if volume < si.volume_min - 1e-12:
        raise BridgeError("VOLUME_BELOW_MIN", "volume %s is below symbol minimum %s" % (volume, si.volume_min))
    steps = volume / si.volume_step
    if abs(steps - round(steps)) > 1e-6:
        raise BridgeError("VOLUME_STEP_INVALID", "volume %s is not a multiple of step %s" % (volume, si.volume_step))
    magic = int(params.get("magic"))
    comment = str(params.get("comment", "MCP"))[:31]
    deviation = int(params.get("deviation", 300))
    sl = params.get("sl")
    tp = params.get("tp")
    tick = mt5.symbol_info_tick(EXPECTED_SYMBOL)
    if tick is None:
        raise BridgeError("TICK_UNAVAILABLE", "no tick for %s" % EXPECTED_SYMBOL)
    price = tick.ask if side == "BUY" else tick.bid
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": EXPECTED_SYMBOL,
        "volume": volume,
        "type": mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL,
        "price": price,
        "deviation": deviation,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": pick_filling(si),
    }
    if sl is not None:
        request["sl"] = round(float(sl), si.digits)
    if tp is not None:
        request["tp"] = round(float(tp), si.digits)
    check = mt5.order_check(request)
    check_d = _nt(check, ("retcode", "balance", "equity", "profit", "margin", "margin_free", "margin_level", "comment"))
    if check is None or int(check.retcode) != 0:
        raise BridgeError("ORDER_CHECK_FAILED", "order_check rejected the request: %s" % (check_d,), order_check=check_d, request=request)
    result = mt5.order_send(request)
    if result is None:
        raise BridgeError("ORDER_SEND_NONE", "order_send returned None: %s" % (mt5.last_error(),), request=request)
    rd = _nt(result, RESULT_FIELDS)
    if int(result.retcode) not in SUCCESS_RETCODES:
        raise BridgeError("ORDER_REJECTED", "order_send retcode %s: %s" % (result.retcode, result.comment), result=rd, request=request)
    entry_deal = _position_id_for_deal(result.deal) if result.deal else None
    position_id = entry_deal["position_id"] if entry_deal else int(result.order)
    positions = mt5.positions_get(ticket=int(position_id))
    pos = _nt(positions[0], POSITION_FIELDS) if positions else None
    return {
        "result": rd, "request": {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in request.items()},
        "order_check": check_d, "entry_deal": entry_deal, "position_id": position_id, "position": pos,
        "requested_price": price, "guard": snap["checks"],
    }


def cmd_close(params):
    snap = require_trade_guard(params)
    ticket = int(params["ticket"])
    magic = int(params["magic"])
    deviation = int(params.get("deviation", 300))
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        return {"already_closed": True, "ticket": ticket}
    p = positions[0]
    if int(p.magic) != magic:
        raise BridgeError("POSITION_NOT_OWNED", "position %s has magic %s, not ours (%s) -- refusing to touch it" % (ticket, p.magic, magic))
    if p.symbol != EXPECTED_SYMBOL:
        raise BridgeError("POSITION_SYMBOL_MISMATCH", "position %s is on %s, not %s" % (ticket, p.symbol, EXPECTED_SYMBOL))
    si = mt5.symbol_info(EXPECTED_SYMBOL)
    tick = mt5.symbol_info_tick(EXPECTED_SYMBOL)
    if tick is None:
        raise BridgeError("TICK_UNAVAILABLE", "no tick for %s" % EXPECTED_SYMBOL)
    is_buy = (p.type == mt5.POSITION_TYPE_BUY)
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": EXPECTED_SYMBOL,
        "volume": float(p.volume),
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "position": ticket,
        "price": tick.bid if is_buy else tick.ask,
        "deviation": deviation,
        "magic": magic,
        "comment": str(params.get("comment", "MCP close"))[:31],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": pick_filling(si),
    }
    result = mt5.order_send(request)
    if result is None:
        raise BridgeError("ORDER_SEND_NONE", "order_send returned None: %s" % (mt5.last_error(),), request=request)
    rd = _nt(result, RESULT_FIELDS)
    if int(result.retcode) not in SUCCESS_RETCODES:
        raise BridgeError("CLOSE_REJECTED", "close order_send retcode %s: %s" % (result.retcode, result.comment), result=rd)
    exit_deal = _position_id_for_deal(result.deal) if result.deal else None
    return {"result": rd, "exit_deal": exit_deal, "position_before": _nt(p, POSITION_FIELDS), "guard": snap["checks"]}


def cmd_modify(params):
    """Re-align broker-side SL/TP on OUR position only (TRADE_ACTION_SLTP)."""
    snap = require_trade_guard(params)
    ticket = int(params["ticket"])
    magic = int(params["magic"])
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        raise BridgeError("POSITION_NOT_FOUND", "position %s not found" % ticket)
    p = positions[0]
    if int(p.magic) != magic:
        raise BridgeError("POSITION_NOT_OWNED", "position %s has magic %s, not ours (%s) -- refusing to touch it" % (ticket, p.magic, magic))
    if p.symbol != EXPECTED_SYMBOL:
        raise BridgeError("POSITION_SYMBOL_MISMATCH", "position %s is on %s, not %s" % (ticket, p.symbol, EXPECTED_SYMBOL))
    si = mt5.symbol_info(EXPECTED_SYMBOL)
    request = {"action": mt5.TRADE_ACTION_SLTP, "symbol": EXPECTED_SYMBOL, "position": ticket, "magic": magic}
    if params.get("sl") is not None:
        request["sl"] = round(float(params["sl"]), si.digits)
    if params.get("tp") is not None:
        request["tp"] = round(float(params["tp"]), si.digits)
    result = mt5.order_send(request)
    if result is None:
        raise BridgeError("ORDER_SEND_NONE", "order_send returned None: %s" % (mt5.last_error(),), request=request)
    rd = _nt(result, RESULT_FIELDS)
    if int(result.retcode) not in SUCCESS_RETCODES:
        raise BridgeError("MODIFY_REJECTED", "modify order_send retcode %s: %s" % (result.retcode, result.comment), result=rd)
    return {"result": rd, "guard": snap["checks"]}


def cmd_shutdown(_params):
    global _initialized
    if _initialized:
        mt5.shutdown()
        _initialized = False
    return {"shutdown": True}


COMMANDS = {
    "hello": cmd_hello, "ping": cmd_ping, "tick": cmd_tick, "positions": cmd_positions,
    "deals": cmd_deals, "history": cmd_history, "open": cmd_open, "close": cmd_close, "modify": cmd_modify, "shutdown": cmd_shutdown,
}


def respond(obj):
    sys.stdout.write(json.dumps(obj, default=str) + "\n")
    sys.stdout.flush()


def main():
    respond({"id": None, "ok": True, "event": "ready", "bridge_version": "1.0.0", "mt5_package": getattr(mt5, "__version__", None), "expected": {"login": EXPECTED_LOGIN, "server": EXPECTED_SERVER, "symbol": EXPECTED_SYMBOL, "hard_max_volume": HARD_MAX_VOLUME}})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            cmd = req.get("cmd")
            fn = COMMANDS.get(cmd)
            if fn is None:
                raise BridgeError("UNKNOWN_COMMAND", "unknown command %r" % (cmd,))
            result = fn(req)
            respond({"id": req_id, "ok": True, "result": result})
            if cmd == "shutdown":
                break
        except BridgeError as e:
            respond({"id": req_id, "ok": False, "error": {"code": e.code, "message": str(e), **e.extra}})
        except Exception as e:  # never crash the bridge on one bad request
            respond({"id": req_id, "ok": False, "error": {"code": "BRIDGE_EXCEPTION", "message": "%s: %s" % (type(e).__name__, e), "trace": traceback.format_exc()[-2000:]}})
    try:
        cmd_shutdown({})
    except Exception:
        pass


if __name__ == "__main__":
    main()
