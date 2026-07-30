import os
import json
import sqlite3
import urllib.request
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), 'campanario.db')
SUPABASE_URL = "https://squfklurqnnoujcmvxjh.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m"

TABLES = ["usuarios", "estudiantes", "docentes", "asistentes", "entrevistas", "anotaciones_estudiante", "contabilidad", "administracion"]

def sync_from_supabase():
    print(f"Sincronizando desde Supabase a base de datos local ({DB_PATH})...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }

    for table in TABLES:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=*"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if not data:
                    print(f"Tabla '{table}': sin registros en Supabase.")
                    continue

                # Obtener columnas de la tabla en SQLite
                cursor.execute(f"PRAGMA table_info({table})")
                pragma_cols = [col[1] for col in cursor.fetchall()]
                if not pragma_cols:
                    print(f"Tabla '{table}' no existe en SQLite, se omitirá.")
                    continue

                # Insertar o reemplazar cada fila
                cols_str = ", ".join(pragma_cols)
                placeholders = ", ".join(["?"] * len(pragma_cols))
                query = f"INSERT OR REPLACE INTO {table} ({cols_str}) VALUES ({placeholders})"

                count = 0
                for row in data:
                    values = [row.get(col) for col in pragma_cols]
                    cursor.execute(query, values)
                    count += 1

                conn.commit()
                print(f"¡Tabla '{table}' actualizada con {count} registros desde Supabase!")
        except Exception as e:
            print(f"Error al sincronizar tabla '{table}': {e}")

    conn.close()
    print("Sincronización completada exitosamente.")

if __name__ == "__main__":
    sync_from_supabase()
