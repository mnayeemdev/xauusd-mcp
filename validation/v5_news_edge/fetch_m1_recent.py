import MetaTrader5 as mt5, json, datetime as dt
mt5.initialize()
for n in (90000,60000,30000):
    r=mt5.copy_rates_from_pos("XAUUSDm",mt5.TIMEFRAME_M1,0,n)
    if r is not None: break
    print("n",n,"err",mt5.last_error())
print("M1 bars",len(r), dt.datetime.fromtimestamp(int(r[0]["time"]),dt.timezone.utc), dt.datetime.fromtimestamp(int(r[-1]["time"]),dt.timezone.utc))
out=[[int(x["time"]),float(x["open"]),float(x["high"]),float(x["low"]),float(x["close"]),int(x["tick_volume"]),int(x["spread"])] for x in r]
json.dump({"symbol":"XAUUSDm","tf":"M1","fields":["t","o","h","l","c","tv","spread_points"],"fetched_at":dt.datetime.now(dt.timezone.utc).isoformat(),"bars":out},open("validation/v5_news_edge/xauusdm_m1_recent.json","w"))
sp=[x[6] for x in out]; print("spread points: min",min(sp),"median",sorted(sp)[len(sp)//2],"max",max(sp), "point", mt5.symbol_info("XAUUSDm").point)
mt5.shutdown()
