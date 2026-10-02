# V17 READ-ONLY broker specification capture (RESEARCH ONLY).
# Reads symbol_info, account_info (no identity: login / server / name are never written), symbol_info_tick and the terminal's own
# calculation functions order_calc_margin / order_calc_profit (pure calculations: no request is sent to the broker).
# There is no trading call of any kind in this file (a test scans it).
import sys, json, time
import MetaTrader5 as mt5

SYMBOL = "XAUUSDm"
OUT = sys.argv[1] if len(sys.argv) > 1 else "broker_spec_live.json"

def main():
    if not mt5.initialize():
        print(json.dumps({"ok": False, "error": "INIT_FAILED " + str(mt5.last_error())})); return 2
    try:
        si = mt5.symbol_info(SYMBOL); ai = mt5.account_info(); ti = mt5.terminal_info(); tick = mt5.symbol_info_tick(SYMBOL)
        if si is None or ai is None or tick is None:
            print(json.dumps({"ok": False, "error": "DATA_UNAVAILABLE"})); return 3
        sym = {k: getattr(si, k, None) for k in ["name", "digits", "point", "trade_contract_size", "trade_tick_size", "trade_tick_value", "trade_tick_value_profit", "trade_tick_value_loss",
               "volume_min", "volume_max", "volume_step", "volume_limit", "trade_stops_level", "trade_freeze_level", "spread", "spread_float", "swap_mode", "swap_long", "swap_short", "swap_rollover3days",
               "margin_initial", "margin_maintenance", "margin_hedged", "trade_calc_mode", "trade_mode", "trade_exemode", "filling_mode", "currency_base", "currency_profit", "currency_margin"]}
        acc = {k: getattr(ai, k, None) for k in ["trade_mode", "leverage", "limit_orders", "margin_so_mode", "margin_so_call", "margin_so_so", "currency", "margin_mode"]}
        acc["trade_mode_label"] = {0: "DEMO", 1: "CONTEST", 2: "REAL"}.get(acc.get("trade_mode"), "UNKNOWN")
        calc = {}
        for lots in (0.01, 0.10, 1.00):
            calc[f"margin_buy_{lots:.2f}"] = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, SYMBOL, lots, tick.ask)
            calc[f"margin_sell_{lots:.2f}"] = mt5.order_calc_margin(mt5.ORDER_TYPE_SELL, SYMBOL, lots, tick.bid)
        calc["profit_buy_0.01_plus_1usd"] = mt5.order_calc_profit(mt5.ORDER_TYPE_BUY, SYMBOL, 0.01, tick.ask, tick.ask + 1.0)
        calc["profit_sell_0.01_plus_1usd"] = mt5.order_calc_profit(mt5.ORDER_TYPE_SELL, SYMBOL, 0.01, tick.bid, tick.bid - 1.0)
        out = {"ok": True, "captured_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "read_only": True, "identity": "OMITTED (login / server / name never recorded)",
               "terminal_connected": bool(ti.connected) if ti else None, "symbol": sym, "account": acc,
               "tick": {"time_msc": int(tick.time_msc), "bid": float(tick.bid), "ask": float(tick.ask), "spread_usd": round(float(tick.ask) - float(tick.bid), 3)}, "terminal_calculations": calc}
        with open(OUT, "w") as f: json.dump(out, f, indent=1)
        print(json.dumps({"ok": True, "out": OUT}))
        return 0
    finally:
        mt5.shutdown()

if __name__ == "__main__":
    sys.exit(main())
