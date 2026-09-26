"""Offline harness for mt5/mt5_bridge_real.py and mt5/mt5_bridge.py.

Injects a FAKE `MetaTrader5` module (no terminal, no network, no orders),
imports the bridge as a module and drives its COMMANDS directly with
scripted broker behaviour. Prints one JSON line per scenario. Used by
tests/weekend_hardening.test.js; never touches a real terminal.
"""
import importlib.util
import json
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE = sys.argv[1] if len(sys.argv) > 1 else "real"


class Obj(dict):
    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k)


class FakeMT5(types.ModuleType):
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_SLTP = 6
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TIME_GTC = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_RETURN = 2
    POSITION_TYPE_BUY = 0
    __version__ = "fake"

    def __init__(self):
        super().__init__("MetaTrader5")
        self.script = {}
        self.sent = []
        self.inits = 0
        self.shutdowns = 0

    def initialize(self, *a, **k):
        self.inits += 1
        return True

    def shutdown(self):
        self.shutdowns += 1

    def last_error(self):
        return (-1, "fake error")

    def account_info(self):
        return self.script.get("account")

    def terminal_info(self):
        v = self.script.get("terminal")
        if callable(v):
            return v()
        return v

    def symbol_info(self, s):
        return self.script.get("symbol")

    def symbol_info_tick(self, s):
        return self.script.get("tick")

    def positions_get(self, **k):
        v = self.script.get("positions")
        return v(**k) if callable(v) else v

    def history_deals_get(self, *a, **k):
        v = self.script.get("deals")
        return v(*a, **k) if callable(v) else v

    def order_check(self, req):
        return Obj(retcode=0, balance=1, equity=1, profit=0, margin=1, margin_free=1, margin_level=1, comment="ok")

    def order_send(self, req):
        self.sent.append(req)
        v = self.script.get("send")
        return v(req) if callable(v) else v


fake = FakeMT5()
sys.modules["MetaTrader5"] = fake

if PROFILE == "real":
    path = os.path.join(ROOT, "mt5", "mt5_bridge_real.py")
    login, server, mode, magic = 460149329, "Exness-MT5Real51", 2, 88052001
else:
    path = os.path.join(ROOT, "mt5", "mt5_bridge.py")
    login, server, mode, magic = 480236873, "Exness-MT5Trial11", 0, 88051512

spec = importlib.util.spec_from_file_location("bridge_under_test", path)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

account = Obj(login=login, server=server, trade_mode=mode, currency="USD", balance=62.0, equity=62.0, margin=0, margin_free=62.0, margin_level=0, leverage=200, trade_allowed=True, trade_expert=True, margin_mode=0, margin_so_mode=0, margin_so_call=60, margin_so_so=0, name="x", company="y")
terminal = Obj(connected=True, trade_allowed=True, tradeapi_disabled=False, company="y", name="t", build=1, path="C:/fake", data_path="", ping_last=1)
symbol = Obj(name="XAUUSDm", visible=True, trade_mode=4, trade_contract_size=100, volume_min=0.01, volume_max=10, volume_step=0.01, trade_stops_level=0, trade_freeze_level=0, digits=3, point=0.001, spread=20, spread_float=True, filling_mode=2, trade_exemode=2, currency_base="XAU", currency_profit="USD", currency_margin="USD", swap_long=0, swap_short=0, swap_mode=0, bid=4000.0, ask=4000.2, time=1)
tick = Obj(bid=4000.0, ask=4000.2, last=4000.1, time=1790000000, time_msc=1790000000000)
pos = Obj(ticket=555, time=1, time_msc=1, time_update=1, type=0, magic=magic, identifier=555, reason=0, volume=0.01, price_open=4000.2, sl=3990.0, tp=4010.0, price_current=4000.1, swap=0, profit=0, symbol="XAUUSDm", comment="MCP:x", external_id="")
base = {"account": account, "terminal": terminal, "symbol": symbol, "tick": tick, "positions": (), "deals": (), "send": Obj(retcode=10009, deal=1, order=2, volume=0.01, price=4000.2, bid=4000, ask=4000.2, comment="done", request_id=1, retcode_external=0)}
ident = {"expected_login": login, "expected_server": server, "symbol": "XAUUSDm"}


def run(name, cmd, params, **overrides):
    fake.script = dict(base)
    fake.script.update(overrides)
    fake.sent = []
    try:
        res = bridge.COMMANDS[cmd](dict(ident, **params))
        out = {"scenario": name, "ok": True, "result": res}
    except bridge.BridgeError as e:
        out = {"scenario": name, "ok": False, "code": e.code, "message": str(e)}
    except Exception as e:  # noqa
        out = {"scenario": name, "ok": False, "code": "PY_EXCEPTION", "message": "%s: %s" % (type(e).__name__, e)}
    out["orders_sent"] = len(fake.sent)
    print(json.dumps(out, default=str))


def deals_for_entry(*a, **k):
    return (Obj(ticket=1, order=2, time=1, time_msc=1, type=0, entry=0, magic=magic, position_id=555, reason=0, volume=0.01, price=4000.2, commission=0, swap=0, profit=0, fee=0, symbol="XAUUSDm", comment="MCP:x", external_id=""),)


def positions_by_ticket(**k):
    return (pos,)


run("positions_none_is_error", "positions", {"magic": magic}, positions=None)
run("positions_empty_is_empty", "positions", {"magic": magic}, positions=())
run("deals_none_is_error", "deals", {"position_id": 555}, deals=None)
run("history_none_is_error", "history", {"magic": magic}, deals=None)
run("open_ok", "open", {"side": "BUY", "volume": 0.01, "magic": magic, "sl": 3990, "tp": 4010}, deals=deals_for_entry, positions=positions_by_ticket)
run("open_wrong_magic", "open", {"side": "BUY", "volume": 0.01, "magic": 12345})
run("open_retcode_10008_ambiguous", "open", {"side": "BUY", "volume": 0.01, "magic": magic}, send=Obj(retcode=10008, deal=0, order=2, volume=0.01, price=4000.2, bid=4000, ask=4000.2, comment="placed", request_id=1, retcode_external=0))
run("open_retcode_10012_ambiguous", "open", {"side": "BUY", "volume": 0.01, "magic": magic}, send=Obj(retcode=10012, deal=0, order=0, volume=0.01, price=0, bid=4000, ask=4000.2, comment="timeout", request_id=1, retcode_external=0))
run("open_retcode_10004_rejected", "open", {"side": "BUY", "volume": 0.01, "magic": magic}, send=Obj(retcode=10004, deal=0, order=0, volume=0.01, price=0, bid=4000, ask=4000.2, comment="requote", request_id=1, retcode_external=0))


def deals_raise(*a, **k):
    raise RuntimeError("IPC lost after send")


run("open_post_send_exception", "open", {"side": "BUY", "volume": 0.01, "magic": magic}, deals=deals_raise)
run("open_wrong_volume", "open", {"side": "BUY", "volume": 0.02, "magic": magic})
run("close_positions_none_is_error", "close", {"ticket": 555, "magic": magic}, positions=None)
run("close_already_closed", "close", {"ticket": 555, "magic": magic}, positions=())
run("close_wrong_magic", "close", {"ticket": 555, "magic": 12345}, positions=positions_by_ticket)
run("close_ambiguous_10012", "close", {"ticket": 555, "magic": magic}, positions=positions_by_ticket, send=Obj(retcode=10012, deal=0, order=0, volume=0.01, price=0, bid=4000, ask=4000.2, comment="timeout", request_id=1, retcode_external=0))
run("modify_sl_zero_rejected", "modify", {"ticket": 555, "magic": magic, "sl": 0, "tp": 4010}, positions=positions_by_ticket)
run("modify_noop_rejected", "modify", {"ticket": 555, "magic": magic}, positions=positions_by_ticket)
run("modify_ok", "modify", {"ticket": 555, "magic": magic, "sl": 3991.5, "tp": 4010}, positions=positions_by_ticket)
run("modify_wrong_magic", "modify", {"ticket": 555, "magic": 777}, positions=positions_by_ticket)

# terminal handle lost => hello re-attaches once
calls = {"n": 0}


def terminal_lost_then_back():
    calls["n"] += 1
    return None if calls["n"] == 1 else terminal


before = fake.inits
run("hello_reattaches_when_terminal_info_none", "hello", {}, terminal=terminal_lost_then_back)
print(json.dumps({"scenario": "reinit_count", "ok": True, "inits_delta": fake.inits - before, "shutdowns": fake.shutdowns}))
