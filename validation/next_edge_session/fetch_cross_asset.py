import MetaTrader5 as mt5, datetime as dt, json, time
mt5.initialize()
out={}; restored={}
def rng(y,m1,m2):
    a=dt.datetime(y,m1,1,tzinfo=dt.timezone.utc); b=dt.datetime(y+ (1 if m2==12 else 0), 1 if m2==12 else m2+1,1,tzinfo=dt.timezone.utc); return a,b
for s in ["DXYm","XAGUSDm","USTECm"]:
    was=mt5.symbol_info(s).visible
    if not was: mt5.symbol_select(s, True); time.sleep(3)
    bars=[]
    for n in (20000,5000,1000):
        r=mt5.copy_rates_from_pos(s,mt5.TIMEFRAME_M15,0,n)
        if r is not None and len(r): print(s,"from_pos",n,"ok",len(r)); break
        print(s,"from_pos",n,"err",mt5.last_error())
    for y in range(2022,2027):
        for (m1,m2) in ((1,6),(7,12)):
            a,b=rng(y,m1,m2)
            if a>dt.datetime.now(dt.timezone.utc): continue
            r=mt5.copy_rates_range(s,mt5.TIMEFRAME_M15,a,b)
            if r is not None and len(r): bars.extend([[int(x["time"]),float(x["open"]),float(x["high"]),float(x["low"]),float(x["close"]),int(x["tick_volume"])] for x in r])
            else: print(s,y,m1,"range err",mt5.last_error())
    bars=sorted({b[0]:b for b in bars}.values(), key=lambda b:b[0])
    print(s,"total bars",len(bars), None if not bars else dt.datetime.fromtimestamp(bars[0][0],dt.timezone.utc).isoformat(), None if not bars else dt.datetime.fromtimestamp(bars[-1][0],dt.timezone.utc).isoformat())
    if bars: out[s]=bars
    if not was: restored[s]=mt5.symbol_select(s, False)
print("market watch restored:", restored)
json.dump({"fetched_at":dt.datetime.now(dt.timezone.utc).isoformat(),"tf":"M15","fields":["t","o","h","l","c","tv"],"series":out},open("C:/Users/Techn/tradingview-mcp-main/validation/next_edge_session/cross_asset_bars_15m.json","w"))
mt5.shutdown()
