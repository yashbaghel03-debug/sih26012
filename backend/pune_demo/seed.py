from __future__ import annotations
import argparse
from .store import get_conn, seed_demo
from .alu_catalog import seed_catalog
from .realistic_records import sync_seeded_portal_records

def main():
    p = argparse.ArgumentParser(description='Seed/reset the Pune fictional demo dataset, linked government portal records and ALU catalog')
    p.add_argument('--reset', action='store_true')
    a = p.parse_args()
    with get_conn() as conn:
        parcel_result = seed_demo(conn, a.reset)
        linked_result = sync_seeded_portal_records(conn)
        alu_result = seed_catalog(conn, a.reset)
        print({'parcel_demo': parcel_result, 'linked_portal_records': linked_result, 'alu_catalog': alu_result})

if __name__ == '__main__':
    main()
