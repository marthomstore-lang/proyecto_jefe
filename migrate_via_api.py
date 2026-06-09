import os
import json
import sqlite3
import urllib.request

DB_PATH = os.path.join(os.path.dirname(__file__), 'campanario.db')
SUPABASE_URL = "https://squfklurqnnoujcmvxjh.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m"

TABLES = ["usuarios", "estudiantes", "docentes", "asistentes", "entrevistas", "contabilidad", "administracion"]

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: No se encontró la base de datos local en {DB_PATH}")
        return

    print("Iniciando migración de datos a Supabase vía API HTTP...")
    conn = sqlite3.connect(DB_PATH)
    
    for table in TABLES:
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
        except Exception as e:
            print(f"Error al leer la tabla '{table}' en SQLite: {e}")
            continue

        if not rows:
            print(f"La tabla '{table}' está vacía. Saltando...")
            continue

        cols = [desc[0] for desc in cursor.description]
        
        # Convertir a lista de diccionarios con nombres de columnas correctos (minúsculas para Supabase)
        data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(cols):
                # Para estudiantes, normalizar los nombres de columnas a minúsculas
                # ya que en SQL de Supabase creamos las tablas en minúsculas.
                db_col = col.lower().replace(" ", "_").replace("/", "_")
                row_dict[db_col] = row[i]
            data.append(row_dict)

        url = f"{SUPABASE_URL}/rest/v1/{table}"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates" # Actúa como un UPSERT
        }

        req_body = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url, data=req_body, headers=headers, method='POST')

        try:
            with urllib.request.urlopen(req) as response:
                print(f"¡Tabla '{table}' migrada con éxito ({len(data)} registros)!")
        except Exception as e:
            print(f"Error al subir la tabla '{table}': {e}")
            if hasattr(e, 'read'):
                print("Detalle del error:", e.read().decode('utf-8'))

    conn.close()
    print("Migración vía API HTTP completada.")

if __name__ == "__main__":
    migrate()
