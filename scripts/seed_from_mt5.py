"""Post the account's current state and deal history to the dashboard, in the EA's report format.

Use it to backfill history the EA never saw, or to test the dashboard locally:
    python scripts/seed_from_mt5.py http://localhost:3111 [days]
Reads INGEST_TOKEN from .env.local (or the environment). MT5 must be open and logged in.
"""
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.request

import MetaTrader5 as mt5

EA_MAGIC = 20261013
EA_SYMBOL = "XAUUSD-STD"
DEAL_TYPES = {mt5.DEAL_TYPE_BUY: "buy", mt5.DEAL_TYPE_SELL: "sell", mt5.DEAL_TYPE_BALANCE: "balance"}
ENTRIES = {mt5.DEAL_ENTRY_IN: "in", mt5.DEAL_ENTRY_OUT: "out", mt5.DEAL_ENTRY_INOUT: "inout"}


def read_token() -> str:
    token = os.environ.get("INGEST_TOKEN")
    env_file = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
    if not token and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("INGEST_TOKEN="):
                token = line.split("=", 1)[1].strip()
    if not token:
        sys.exit("INGEST_TOKEN not found in the environment or .env.local")
    return token


def deal_row(deal) -> dict:
    sl = tp = risk = 0.0
    if deal.entry == mt5.DEAL_ENTRY_IN:
        orders = mt5.history_orders_get(ticket=deal.order) or ()
        if orders and orders[0].sl:
            sl, tp = orders[0].sl, orders[0].tp
            order_type = mt5.ORDER_TYPE_BUY if deal.type == mt5.DEAL_TYPE_BUY else mt5.ORDER_TYPE_SELL
            loss = mt5.order_calc_profit(order_type, deal.symbol, deal.volume, deal.price, sl)
            risk = -loss if loss is not None and loss < 0 else 0.0
    return {
        "ticket": deal.ticket, "position_id": deal.position_id, "time": deal.time,
        "type": DEAL_TYPES.get(deal.type, "other"), "entry": ENTRIES.get(deal.entry, "none"),
        "symbol": deal.symbol, "volume": deal.volume, "price": deal.price, "profit": deal.profit,
        "swap": deal.swap, "commission": deal.commission, "fee": deal.fee, "magic": deal.magic,
        "comment": deal.comment[:64], "sl": sl, "tp": tp, "risk": risk,
    }


def main() -> None:
    base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3111"
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 90
    if not mt5.initialize():
        sys.exit(f"MT5 not available: {mt5.last_error()}")
    try:
        account, terminal = mt5.account_info(), mt5.terminal_info()
        tick = mt5.symbol_info_tick(EA_SYMBOL)
        gmt = int(dt.datetime.now(dt.timezone.utc).timestamp())
        offset = round((tick.time - gmt) / 1800) * 1800
        now_server = gmt + offset
        start = dt.datetime.fromtimestamp(now_server - days * 86400, dt.timezone.utc)
        end = dt.datetime.fromtimestamp(now_server + 86400, dt.timezone.utc)
        deals = mt5.history_deals_get(start, end) or ()
        report = {
            "v": 1,
            "source": "backfill",
            "time": {"server": now_server, "gmt": gmt},
            "account": {
                "login": account.login, "server": account.server, "currency": account.currency,
                "balance": account.balance, "equity": account.equity,
                "margin_free": account.margin_free, "leverage": account.leverage,
            },
            "ea": {
                "symbol": EA_SYMBOL, "timeframe": "M15", "risk_pct": 9.0, "use_vol": True, "vol_min": 1.2,
                "magic": EA_MAGIC, "ratio": 0.0, "losses_today": 0, "algo_enabled": bool(terminal.trade_allowed),
            },
            "positions": [
                {
                    "ticket": p.ticket, "symbol": p.symbol, "type": "buy" if p.type == mt5.POSITION_TYPE_BUY else "sell",
                    "volume": p.volume, "price_open": p.price_open, "price_current": p.price_current,
                    "sl": p.sl, "tp": p.tp, "profit": p.profit, "swap": p.swap, "magic": p.magic,
                    "comment": p.comment[:64], "time": p.time,
                }
                for p in (mt5.positions_get() or ())
            ],
            "deals": [deal_row(d) for d in deals][-500:],
            "signals": [],
        }
    finally:
        mt5.shutdown()

    request = urllib.request.Request(
        f"{base}/api/ingest", data=json.dumps(report).encode(),
        headers={"Content-Type": "application/json", "X-Ingest-Token": read_token()}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        print(response.status, response.read().decode(), f"({len(report['deals'])} deals, {len(report['positions'])} positions)")


if __name__ == "__main__":
    main()
