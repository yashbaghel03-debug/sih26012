from __future__ import annotations
import argparse
from .store import get_conn, seed_demo

def main():
    p=argparse.ArgumentParser(description='Seed/reset the deterministic Pune fictional demo dataset')
    p.add_argument('--reset',action='store_true')
    a=p.parse_args()
    with get_conn() as conn: print(seed_demo(conn,a.reset))

if __name__=='__main__': main()
