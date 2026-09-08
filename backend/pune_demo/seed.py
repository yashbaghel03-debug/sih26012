from __future__ import annotations
import argparse
from .store import get_conn, seed_demo
from .alu_catalog import seed_catalog

def main():
    p=argparse.ArgumentParser(description='Seed/reset the deterministic Pune fictional demo dataset and ALU catalog')
    p.add_argument('--reset',action='store_true')
    a=p.parse_args()
    with get_conn() as conn:
        print({'parcel_demo': seed_demo(conn,a.reset), 'alu_catalog': seed_catalog(conn,a.reset)})

if __name__=='__main__': main()
