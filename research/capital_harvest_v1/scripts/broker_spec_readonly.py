import MetaTrader5 as mt5, json
if not mt5.initialize(): print("INIT_FAILED", mt5.last_error()); raise SystemExit
ai=mt5.account_info(); si=mt5.symbol_info("XAUUSDm"); t=mt5.symbol_info_tick("XAUUSDm")
out={"account":{"login":ai.login,"server":ai.server,"balance":ai.balance,"equity":ai.equity,"margin_free":ai.margin_free,"leverage":ai.leverage,"currency":ai.currency,"trade_allowed":ai.trade_allowed},
 "symbol":{"name":si.name,"digits":si.digits,"point":si.point,"trade_contract_size":si.trade_contract_size,"volume_min":si.volume_min,"volume_max":si.volume_max,"volume_step":si.volume_step,"trade_stops_level":si.trade_stops_level,"trade_freeze_level":si.trade_freeze_level,"spread_points":si.spread,"spread_float":si.spread_float,"margin_initial":si.margin_initial,"trade_tick_value":si.trade_tick_value,"trade_tick_size":si.trade_tick_size,"swap_long":si.swap_long,"swap_short":si.swap_short,"trade_mode":si.trade_mode,"filling_mode":si.filling_mode},
 "tick":{"time":t.time,"bid":t.bid,"ask":t.ask,"spread_usd":round(t.ask-t.bid,3)},
 "positions":len(mt5.positions_get() or []),"orders":len(mt5.orders_get() or [])}
m=mt5.order_calc_margin(mt5.ORDER_TYPE_BUY,"XAUUSDm",0.01,t.ask); out["margin_for_0_01_lot_usd"]=m
p=mt5.order_calc_profit(mt5.ORDER_TYPE_BUY,"XAUUSDm",0.01,t.ask,t.ask+1.0); out["profit_for_1usd_move_0_01_lot"]=p
mt5.shutdown(); print(json.dumps(out,indent=1)); json.dump(out,open("broker_spec.json","w"),indent=1)
