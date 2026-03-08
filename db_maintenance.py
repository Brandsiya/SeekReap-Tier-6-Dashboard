import os
import psycopg2
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Tier5-Maintenance")

def run_maintenance():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        logger.error("DATABASE_URL not found in environment.")
        return

    try:
        conn = psycopg2.connect(db_url, sslmode='require')
        conn.autocommit = True
        cur = conn.cursor()

        logger.info("Starting Tier-5 database maintenance...")

        # 1. Log current orphans to tracking table (for audit)
        cur.execute("""
            INSERT INTO tier5_orphaned_scans (scan_id, platform_type, created_at, status_flag)
            SELECT id, platform, created_at, 'orphaned'
            FROM platform_scans
            WHERE submission_id NOT IN (SELECT id FROM submissions)
            ON CONFLICT (scan_id) DO NOTHING;
        """)
        logger.info(f"Logged {cur.rowcount} orphans for audit.")

        # 2. Prune true orphans (>5min old)
        cur.execute("""
            DELETE FROM platform_scans
            WHERE submission_id NOT IN (SELECT id FROM submissions)
            AND created_at < (NOW() - INTERVAL '5 minutes');
        """)
        logger.info(f"Pruned {cur.rowcount} old orphaned records.")

        # 3. Optimize table
        cur.execute("VACUUM ANALYZE platform_scans;")
        logger.info("Vacuum complete.")

        cur.close()
        conn.close()
        logger.info("Maintenance complete.")

    except Exception as e:
        logger.error(f"Maintenance failed: {e}")

if __name__ == "__main__":
    run_maintenance()
