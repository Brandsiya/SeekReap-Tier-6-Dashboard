import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def inspect_db():
    try:
        conn = psycopg2.connect(os.getenv('DATABASE_URL'))
        cur = conn.cursor()
        
        # Query to get all table names
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cur.fetchall()
        
        print("\n=== CURRENT DATABASE STRUCTURE ===")
        if not tables:
            print("Database is empty.")
        
        for table in tables:
            t_name = table[0]
            print(f"\nTABLE: {t_name}")
            # Query to get columns for each table
            cur.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{t_name}'
            """)
            columns = cur.fetchall()
            for col in columns:
                print(f"  - {col[0]} ({col[1]})")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error connecting to database: {e}")

if __name__ == "__main__":
    inspect_db()
