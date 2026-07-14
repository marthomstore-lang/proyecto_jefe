import os
import sqlite3
import psycopg2
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), 'campanario.db')
SUPABASE_DB_URL = os.getenv('SUPABASE_DB_URL')

SCHEMAS = {
    "usuarios": """
        CREATE TABLE IF NOT EXISTS usuarios (
            username TEXT PRIMARY KEY,
            rut TEXT,
            nombre TEXT,
            password TEXT,
            perfil TEXT
        );
    """,
    "estudiantes": """
        CREATE TABLE IF NOT EXISTS estudiantes (
            rut TEXT PRIMARY KEY,
            nombres TEXT,
            apellido_paterno TEXT,
            apellido_materno TEXT,
            curso TEXT,
            profesor_jefe TEXT,
            profesor_asignatura TEXT,
            profesor_pie TEXT,
            fecha_nacimiento TEXT,
            estado TEXT,
            edad INTEGER,
            anotaciones TEXT DEFAULT ''
        );
    """,
    "docentes": """
        CREATE TABLE IF NOT EXISTS docentes (
            rut TEXT PRIMARY KEY,
            nombres TEXT,
            apellido_paterno TEXT,
            apellido_materno TEXT,
            asignatura TEXT,
            funcion_curso TEXT,
            horas_contrato INTEGER,
            idoneidad TEXT
        );
    """,
    "asistentes": """
        CREATE TABLE IF NOT EXISTS asistentes (
            rut TEXT PRIMARY KEY,
            nombres TEXT,
            apellido_paterno TEXT,
            apellido_materno TEXT,
            funcion_curso TEXT,
            horas_contrato INTEGER,
            idoneidad TEXT
        );
    """,
    "entrevistas": """
        CREATE TABLE IF NOT EXISTS entrevistas (
            id TEXT PRIMARY KEY,
            rut TEXT,
            nombre TEXT,
            cargo TEXT,
            curso TEXT,
            jefe TEXT,
            asig TEXT,
            pie TEXT,
            fecha TEXT,
            hora TEXT,
            resp TEXT,
            estado TEXT,
            seguimiento TEXT,
            objetivo TEXT,
            motivo TEXT,
            acuerdos TEXT,
            obs TEXT
        );
    """,
    "contabilidad": """
        CREATE TABLE IF NOT EXISTS contabilidad (
            id SERIAL PRIMARY KEY,
            fecha TEXT,
            tipo TEXT,
            programa TEXT,
            monto DOUBLE PRECISION,
            resp TEXT,
            detalle TEXT
        );
    """,
    "administracion": """
        CREATE TABLE IF NOT EXISTS administracion (
            id SERIAL PRIMARY KEY,
            fecha TEXT,
            tipo TEXT,
            titulo TEXT,
            resp TEXT,
            estado TEXT,
            descripcion TEXT
        );
    """
}

TABLE_KEYS = {
    "usuarios": "username",
    "estudiantes": "rut",
    "docentes": "rut",
    "asistentes": "rut",
    "entrevistas": "id",
    "contabilidad": "id",
    "administracion": "id"
}

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: No se encontró la base de datos local en {DB_PATH}")
        return

    if not SUPABASE_DB_URL or "postgresql://" not in SUPABASE_DB_URL or "[PASSWORD]" in SUPABASE_DB_URL:
        print("Error: No se ha configurado una URL de base de datos válida en el archivo .env")
        print("Por favor abre el archivo .env y configura tu SUPABASE_DB_URL con tus credenciales reales.")
        return

    print("Iniciando migración a Supabase...")
    
    # Conectar a base de datos
    sqlite_conn = sqlite3.connect(DB_PATH)
    pg_conn = None
    try:
        pg_conn = psycopg2.connect(SUPABASE_DB_URL)
        print("Conexión exitosa a Supabase PostgreSQL.")
    except Exception as e:
        print(f"Error al conectar con Supabase: {e}")
        sqlite_conn.close()
        return

    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()

    try:
        # 1. Crear tablas en PostgreSQL
        for table, schema in SCHEMAS.items():
            print(f"Creando tabla '{table}' si no existe en Supabase...")
            pg_cursor.execute(schema)
        pg_conn.commit()

        # 2. Migrar datos de cada tabla
        for table, pk_col in TABLE_KEYS.items():
            # Obtener datos de SQLite
            sqlite_cursor.execute(f"SELECT * FROM {table}")
            rows = sqlite_cursor.fetchall()
            
            if not rows:
                print(f"La tabla local '{table}' está vacía. Saltando...")
                continue
            
            # Obtener nombres de columnas
            cols = [desc[0] for desc in sqlite_cursor.description]
            cols_str = ", ".join(cols)
            placeholders = ", ".join(["%s"] * len(cols))
            
            # Generar cláusula ON CONFLICT para PostgreSQL
            update_cols = [c for c in cols if c != pk_col]
            update_str = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
            
            insert_query = f"""
                INSERT INTO {table} ({cols_str})
                VALUES ({placeholders})
                ON CONFLICT ({pk_col})
                DO UPDATE SET {update_str}
            """
            
            print(f"Migrando {len(rows)} registros a la tabla '{table}'...")
            for row in rows:
                pg_cursor.execute(insert_query, row)
            pg_conn.commit()
            print(f"¡Tabla '{table}' migrada con éxito!")

            # Restablecer el autoincremento para SERIAL si aplica
            if table in ["contabilidad", "administracion"]:
                seq_query = f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM {table};"
                pg_cursor.execute(seq_query)
                pg_conn.commit()
                print(f"Secuencia ID restablecida para '{table}'.")

        print("¡Migración completa y exitosa!")

    except Exception as e:
        print(f"Ocurrió un error durante la migración: {e}")
        pg_conn.rollback()
    finally:
        sqlite_conn.close()
        pg_conn.close()

if __name__ == "__main__":
    migrate()
