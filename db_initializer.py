import os
import json
import sqlite3
import subprocess

orig_path = r"c:\proyectos\Proyecto jefe\index.html"
db_path = r"c:\proyectos\Proyecto jefe\campanario.db"

print("Iniciando extracción de base de datos desde index.html...")

# Escribir script temporal de Node para parsear el objeto JS de forma infalible
js_extractor = f"""
const fs = require('fs');
const content = fs.readFileSync({json.dumps(orig_path)}, 'utf8');
const match = content.match(/const DB\\s*=\\s*(\\{{\\s*[\\s\\S]*?\\}});/);
if (match) {{
    try {{
        // Evaluar el literal del objeto JS para parsearlo correctamente
        const db = eval("(" + match[1] + ")");
        console.log(JSON.stringify(db));
    }} catch(e) {{
        console.error("Error al evaluar DB:", e);
        process.exit(1);
    }}
}} else {{
    console.error("No se encontró la constante DB en index.html");
    process.exit(1);
}}
"""

temp_extractor_path = "temp_extractor.js"
with open(temp_extractor_path, "w", encoding="utf-8") as f:
    f.write(js_extractor)

db_data = None
try:
    result = subprocess.run(["node", temp_extractor_path], capture_output=True, text=True, check=True, encoding="utf-8")
    db_json = result.stdout.strip()
    db_data = json.loads(db_json)
    print("¡Base de datos extraída y convertida a JSON exitosamente!")
finally:
    if os.path.exists(temp_extractor_path):
        os.remove(temp_extractor_path)

if not db_data:
    print("Error: No se pudieron obtener los datos de la base de datos.")
    exit(1)

# Conectar a SQLite y crear las tablas
print(f"Creando base de datos SQLite en: {db_path}")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Tabla Estudiantes
cursor.execute("""
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
)
""")

# 2. Tabla Docentes
cursor.execute("""
CREATE TABLE IF NOT EXISTS docentes (
    rut TEXT PRIMARY KEY,
    nombres TEXT,
    apellido_paterno TEXT,
    apellido_materno TEXT,
    asignatura TEXT,
    funcion_curso TEXT,
    horas_contrato INTEGER,
    idoneidad TEXT
)
""")

# 3. Tabla Asistentes
cursor.execute("""
CREATE TABLE IF NOT EXISTS asistentes (
    rut TEXT PRIMARY KEY,
    nombres TEXT,
    apellido_paterno TEXT,
    apellido_materno TEXT,
    funcion_curso TEXT,
    horas_contrato INTEGER,
    idoneidad TEXT
)
""")

# 4. Tabla Entrevistas
cursor.execute("""
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
)
""")

# 5. Tabla Contabilidad
cursor.execute("""
CREATE TABLE IF NOT EXISTS contabilidad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    tipo TEXT,
    programa TEXT,
    monto REAL,
    resp TEXT,
    detalle TEXT
)
""")

# 6. Tabla Administracion
cursor.execute("""
CREATE TABLE IF NOT EXISTS administracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    tipo TEXT,
    titulo TEXT,
    resp TEXT,
    estado TEXT,
    descripcion TEXT
)
""")

# 7. Tabla Usuarios
cursor.execute("""
CREATE TABLE IF NOT EXISTS usuarios (
    username TEXT PRIMARY KEY,
    rut TEXT,
    nombre TEXT,
    password TEXT,
    perfil TEXT
)
""")

conn.commit()

# Crear admin por defecto si no existe
cursor.execute("SELECT COUNT(*) FROM usuarios")
if cursor.fetchone()[0] == 0:
    cursor.execute("""
    INSERT INTO usuarios (username, rut, nombre, password, perfil)
    VALUES (?, ?, ?, ?, ?)
    """, ("admin", "1-9", "Administrador Principal", "admin", "Administrador"))
    conn.commit()


# Poblar Estudiantes
estudiantes = db_data.get("estudiantes", [])
print(f"Poblando tabla estudiantes ({len(estudiantes)} registros)...")
for e in estudiantes:
    cursor.execute("""
    INSERT OR REPLACE INTO estudiantes (
        rut, nombres, apellido_paterno, apellido_materno, curso, 
        profesor_jefe, profesor_asignatura, profesor_pie, fecha_nacimiento, estado, edad
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        e.get("RUT"),
        e.get("Nombres"),
        e.get("Apellido Paterno"),
        e.get("Apellido Materno"),
        e.get("Curso"),
        e.get("Profesor Jefe"),
        e.get("Profesor de Asignatura"),
        e.get("Profesor PIE"),
        e.get("Fecha de Nacimiento"),
        e.get("Estado Matrícula", "Vigente"),
        e.get("Edad")
    ))

# Poblar Docentes
docentes = db_data.get("docentes", [])
print(f"Poblando tabla docentes ({len(docentes)} registros)...")
for d in docentes:
    cursor.execute("""
    INSERT OR REPLACE INTO docentes (
        rut, nombres, apellido_paterno, apellido_materno, asignatura, 
        funcion_curso, horas_contrato, idoneidad
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        d.get("RUT"),
        d.get("Nombres"),
        d.get("Apellido paterno"),
        d.get("Apellido materno"),
        d.get("Profesor de asignatura"),
        d.get("Función/curso"),
        d.get("Horas contrato"),
        d.get("Estado/Idoneidad", "OK")
    ))

# Poblar Asistentes
asistentes = db_data.get("asistentes", [])
print(f"Poblando tabla asistentes ({len(asistentes)} registros)...")
for a in asistentes:
    cursor.execute("""
    INSERT OR REPLACE INTO asistentes (
        rut, nombres, apellido_paterno, apellido_materno, 
        funcion_curso, horas_contrato, idoneidad
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        a.get("RUT"),
        a.get("Nombres"),
        a.get("Apellido paterno"),
        a.get("Apellido materno"),
        a.get("Función/curso"),
        a.get("Horas contrato"),
        a.get("Estado/Idoneidad", "HABILITADO")
    ))

conn.commit()
conn.close()

print("¡Base de datos SQLite creada y poblada exitosamente!")
