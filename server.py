import os
import json
import sqlite3
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv
import unicodedata

def unidecode_simple(s):
    if not s:
        return ""
    s = unicodedata.normalize('NFD', str(s))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()

def asegurar_usuarios_funcionarios(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT username, rut FROM usuarios")
        existing_users = {row[0]: row[1] for row in cursor.fetchall()}
        existing_ruts = set(existing_users.values())

        cursor.execute("SELECT rut, nombres, apellido_paterno, apellido_materno FROM docentes")
        docentes = cursor.fetchall()

        cursor.execute("SELECT rut, nombres, apellido_paterno, apellido_materno FROM asistentes")
        asistentes = cursor.fetchall()

        todos = docentes + asistentes
        nuevos_usuarios = []

        for row in todos:
            rut, nombres, ape_pat, ape_mat = row[0], row[1], row[2], row[3]
            if not rut or rut in existing_ruts:
                continue
            
            nombre_comp = f"{nombres or ''} {ape_pat or ''} {ape_mat or ''}".strip().title()
            prim_nom = (nombres or '').strip().split()[0] if nombres else ''
            ape_p = (ape_pat or '').strip().split()[0] if ape_pat else ''
            
            base_user = unidecode_simple(f"{prim_nom[:1]}{ape_p}") if (prim_nom and ape_p) else ''
            base_user = ''.join(ch for ch in base_user if ch.isalnum())
            
            if not base_user:
                base_user = rut.replace('.', '').replace('-', '').lower()
                
            uname = base_user
            counter = 1
            while uname in existing_users:
                uname = f"{base_user}{counter}"
                counter += 1
                
            clean_pass = rut.replace('.', '').split('-')[0]
            
            u_obj = {
                'username': uname,
                'rut': rut,
                'nombre': nombre_comp,
                'password': clean_pass,
                'perfil': 'Entrevistador'
            }

            cursor.execute('''
                INSERT INTO usuarios (username, rut, nombre, password, perfil)
                VALUES (?, ?, ?, ?, ?)
            ''', (uname, rut, nombre_comp, clean_pass, 'Entrevistador'))
            existing_users[uname] = rut
            existing_ruts.add(rut)
            nuevos_usuarios.append(u_obj)

        conn.commit()

        if nuevos_usuarios:
            try:
                import urllib.request
                sb_url = "https://squfklurqnnoujcmvxjh.supabase.co/rest/v1/usuarios"
                sb_headers = {
                    'apikey': 'sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m',
                    'Authorization': 'Bearer sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m',
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                }
                req = urllib.request.Request(sb_url, data=json.dumps(nuevos_usuarios).encode('utf-8'), headers=sb_headers, method='POST')
                urllib.request.urlopen(req, timeout=5)
            except Exception as sb_e:
                print("Nota: No se pudo enviar sync a Supabase:", sb_e)
    except Exception as err:
        print("Error al asegurar usuarios de funcionarios:", err)

# Cargar variables de entorno del archivo .env si existe
load_dotenv()

def clean_rut_str(s):
    if not s:
        return ""
    return re.sub(r'[^0-9kK]', '', str(s)).upper()

def match_rut_or_text(q, q_clean, target_raw, text_to_check=""):
    if not q:
        return True
    target_str = str(target_raw or '').lower()
    if q in target_str:
        return True
    if text_to_check and q in str(text_to_check).lower():
        return True
    if q_clean:
        target_clean = clean_rut_str(target_raw)
        if target_clean and (q_clean in target_clean or target_clean in q_clean):
            return True
    return False

PORT = 8080
DB_PATH = os.path.join(os.path.dirname(__file__), 'campanario.db')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

SUPABASE_DB_URL = os.getenv('SUPABASE_DB_URL')

# Determinar qué base de datos usar
if SUPABASE_DB_URL and "postgresql://" in SUPABASE_DB_URL and "[PASSWORD]" not in SUPABASE_DB_URL:
    try:
        import psycopg2
        from psycopg2 import pool
        import psycopg2.extras
        DB_ENGINE = "postgresql"
        # Inicializar el pool de conexiones (min=1, max=10)
        db_pool = psycopg2.pool.SimpleConnectionPool(1, 10, SUPABASE_DB_URL)
        print("Conectado a Base de Datos Supabase (PostgreSQL)")
    except Exception as e:
        print(f"Error al iniciar el pool de Supabase: {e}. Usando SQLite local como respaldo.")
        DB_ENGINE = "sqlite"
else:
    DB_ENGINE = "sqlite"
    print("Usando Base de Datos local SQLite (campanario.db)")

active_sessions = {}

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"



class RowWrapper(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class QueryAdapterCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        if DB_ENGINE == "postgresql":
            # 1. Convertir ? a %s
            query = query.replace('?', '%s')
            
            # 2. Traducir INSERT OR REPLACE a ON CONFLICT
            query_upper = query.strip().upper()
            if "INSERT OR REPLACE INTO USUARIOS" in query_upper:
                query = """
                    INSERT INTO usuarios (username, rut, nombre, password, perfil)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (username) 
                    DO UPDATE SET rut = EXCLUDED.rut, nombre = EXCLUDED.nombre, 
                                  password = EXCLUDED.password, perfil = EXCLUDED.perfil
                """
            elif "INSERT OR REPLACE INTO ESTUDIANTES" in query_upper:
                query = """
                    INSERT INTO estudiantes (
                        rut, nombres, apellido_paterno, apellido_materno, curso, 
                        profesor_jefe, profesor_asignatura, profesor_pie, fecha_nacimiento, estado, edad, anotaciones
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (rut) 
                    DO UPDATE SET nombres = EXCLUDED.nombres, 
                                  apellido_paterno = EXCLUDED.apellido_paterno, 
                                  apellido_materno = EXCLUDED.apellido_materno, 
                                  curso = EXCLUDED.curso, 
                                  profesor_jefe = EXCLUDED.profesor_jefe, 
                                  profesor_asignatura = EXCLUDED.profesor_asignatura, 
                                  profesor_pie = EXCLUDED.profesor_pie, 
                                  fecha_nacimiento = EXCLUDED.fecha_nacimiento, 
                                  estado = EXCLUDED.estado, 
                                  edad = EXCLUDED.edad,
                                  anotaciones = EXCLUDED.anotaciones
                """
            elif "INSERT OR REPLACE INTO DOCENTES" in query_upper:
                query = """
                    INSERT INTO docentes (
                        rut, nombres, apellido_paterno, apellido_materno, asignatura, 
                        funcion_curso, horas_contrato, idoneidad
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (rut) 
                    DO UPDATE SET nombres = EXCLUDED.nombres, 
                                  apellido_paterno = EXCLUDED.apellido_paterno, 
                                  apellido_materno = EXCLUDED.apellido_materno, 
                                  asignatura = EXCLUDED.asignatura, 
                                  funcion_curso = EXCLUDED.funcion_curso, 
                                  horas_contrato = EXCLUDED.horas_contrato, 
                                  idoneidad = EXCLUDED.idoneidad
                """
            elif "INSERT OR REPLACE INTO ASISTENTES" in query_upper:
                query = """
                    INSERT INTO asistentes (
                        rut, nombres, apellido_paterno, apellido_materno, 
                        funcion_curso, horas_contrato, idoneidad
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (rut) 
                    DO UPDATE SET nombres = EXCLUDED.nombres, 
                                  apellido_paterno = EXCLUDED.apellido_paterno, 
                                  apellido_materno = EXCLUDED.apellido_materno, 
                                  funcion_curso = EXCLUDED.funcion_curso, 
                                  horas_contrato = EXCLUDED.horas_contrato, 
                                  idoneidad = EXCLUDED.idoneidad
                """
            elif "INSERT OR REPLACE INTO ENTREVISTAS" in query_upper:
                query = """
                    INSERT INTO entrevistas (
                        id, rut, nombre, cargo, curso, jefe, asig, pie, fecha, 
                        hora, resp, estado, seguimiento, objetivo, motivo, acuerdos, obs
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) 
                    DO UPDATE SET rut = EXCLUDED.rut, 
                                  nombre = EXCLUDED.nombre, 
                                  cargo = EXCLUDED.cargo, 
                                  curso = EXCLUDED.curso, 
                                  jefe = EXCLUDED.jefe, 
                                  asig = EXCLUDED.asig, 
                                  pie = EXCLUDED.pie, 
                                  fecha = EXCLUDED.fecha, 
                                  hora = EXCLUDED.hora, 
                                  resp = EXCLUDED.resp, 
                                  estado = EXCLUDED.estado, 
                                  seguimiento = EXCLUDED.seguimiento, 
                                  objetivo = EXCLUDED.objetivo, 
                                  motivo = EXCLUDED.motivo, 
                                  acuerdos = EXCLUDED.acuerdos, 
                                  obs = EXCLUDED.obs
                """

        if params is not None:
            return self.cursor.execute(query, params)
        else:
            return self.cursor.execute(query)

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return RowWrapper(row) if DB_ENGINE == "postgresql" else row

    def fetchall(self):
        rows = self.cursor.fetchall()
        if DB_ENGINE == "postgresql":
            return [RowWrapper(r) for r in rows]
        return rows

    def __getattr__(self, name):
        return getattr(self.cursor, name)


def get_db_connection():
    if DB_ENGINE == "postgresql":
        return db_pool.getconn()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def release_db_connection(conn):
    if DB_ENGINE == "postgresql":
        db_pool.putconn(conn)
    else:
        conn.close()


def get_db_cursor(conn):
    if DB_ENGINE == "postgresql":
        import psycopg2.extras
        raw_cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        raw_cursor = conn.cursor()
    return QueryAdapterCursor(raw_cursor)

class CampanarioRequestHandler(BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Evitar inundar la consola con peticiones de estáticos, pero loguear APIs
        if "api" in self.path:
            super().log_message(format, *args)
            
    def end_headers(self):
        # Cabeceras estándar de CORS, seguridad y no caché
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        try:
            response_bytes = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        except Exception as e:
            response_bytes = json.dumps({"error": f"JSON Serialization Error: {str(e)}"}).encode('utf-8')
            status = 500

        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        # ── API ENDPOINTS ──
        if path.startswith('/api/'):
            self.handle_api_get(path, query)
        else:
            # Servir archivos estáticos
            self.serve_static_file(path)

    def serve_static_file(self, path):
        # Por defecto servir index.html
        if path == '/' or path == '':
            path = '/index.html'
            
        file_path = os.path.abspath(os.path.join(PUBLIC_DIR, path.lstrip('/')))
        
        # Seguridad básica para evitar salirse del directorio public
        if not file_path.startswith(os.path.abspath(PUBLIC_DIR)):
            self.send_error(403, "Access Denied")
            return

        if not os.path.exists(file_path) or os.path.isdir(file_path):
            # Servir index.html para rutas SPA si el archivo no existe
            file_path = os.path.join(PUBLIC_DIR, 'index.html')
            if not os.path.exists(file_path):
                self.send_error(404, "File Not Found")
                return

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {str(e)}")

    def handle_api_get(self, path, query):
        conn = None
        try:
            if path == '/api/multivista/live':
                session = query.get('session', [''])[0].strip()
                self.send_json(active_sessions.get(session, {}))
                return
            elif path == '/api/multivista/info':
                self.send_json({"ip": get_local_ip(), "port": PORT})
                return
            elif path == '/api/config/logo':
                logo_path = os.path.join(PUBLIC_DIR, 'uploads', 'logo.png')
                if os.path.exists(logo_path):
                    self.send_json({"success": True, "logo_url": "/uploads/logo.png"})
                else:
                    self.send_json({"success": True, "logo_url": None})
                return

            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            
            if path == '/api/usuarios':
                cursor.execute("SELECT * FROM usuarios")
                self.send_json([dict(row) for row in cursor.fetchall()])
                return

            elif path == '/api/entrevistas/participantes':
                entrevista_id = query.get('entrevista_id', [''])[0].strip()
                cursor.execute("""
                    SELECT p.*, u.nombre as nombre_completo, u.perfil as perfil 
                    FROM participantes_entrevista p
                    LEFT JOIN usuarios u ON p.username = u.username
                    WHERE p.entrevista_id = ?
                """, (entrevista_id,))
                rows = cursor.fetchall()
                self.send_json([dict(row) for row in rows])
                return

            elif path == '/api/anotaciones':
                rut = query.get('rut', [''])[0].strip()
                cursor.execute("""
                    SELECT * FROM anotaciones_estudiante 
                    WHERE rut_estudiante = ? 
                    ORDER BY fecha DESC
                """, (rut,))
                rows = cursor.fetchall()
                self.send_json([dict(row) for row in rows])
                return

            elif path == '/api/anotaciones/todas':
                cursor.execute("""
                    SELECT a.*, e.nombres as estudiante_nombre, e.apellido_paterno as estudiante_paterno, e.apellido_materno as estudiante_materno, e.curso as estudiante_curso
                    FROM anotaciones_estudiante a
                    LEFT JOIN estudiantes e ON a.rut_estudiante = e.rut
                    ORDER BY a.fecha DESC, a.id DESC
                """)
                rows = cursor.fetchall()
                self.send_json([dict(row) for row in rows])
                return

            elif path == '/api/usuarios/notificaciones':
                username = query.get('username', [''])[0].strip()
                cursor.execute("""
                    SELECT p.*, e.nombre as estudiante_nombre, e.objetivo as objetivo, e.fecha as fecha, e.resp as entrevistador
                    FROM participantes_entrevista p
                    LEFT JOIN entrevistas e ON p.entrevista_id = e.id
                    WHERE p.username = ? AND p.visto = 0
                """, (username,))
                rows = cursor.fetchall()
                self.send_json([dict(row) for row in rows])
                return

            # ── 1. ESTADÍSTICAS INSTITUCIONALES ──
            elif path == '/api/stats':
                # Totales base de datos
                cursor.execute("SELECT COUNT(*) FROM estudiantes")
                tot_ests = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM docentes")
                tot_docs = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM asistentes")
                tot_asis = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM entrevistas")
                tot_ents = cursor.fetchone()[0]
                
                # Matrículas vigentes y retiradas
                cursor.execute("SELECT COUNT(*) FROM estudiantes WHERE estado = 'Vigente'")
                vig = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM estudiantes WHERE estado = 'Retirado'")
                ret = cursor.fetchone()[0]
                
                self.send_json({
                    "totalEstudiantes": tot_ests,
                    "totalDocentes": tot_docs,
                    "totalAsistentes": tot_asis,
                    "totalEntrevistas": tot_ents,
                    "vigentes": vig,
                    "retirados": ret
                })

            # ── 2. BUSCADOR GLOBAL Y PERSONA INDIVIDUAL ──
            elif path == '/api/persona':
                rut_param = query.get('rut', [''])[0].strip()
                target_clean = clean_rut_str(rut_param)
                found_person = None
                
                if target_clean:
                    # 1. Estudiantes
                    cursor.execute("SELECT * FROM estudiantes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        if clean_rut_str(r['rut']) == target_clean:
                            found_person = {
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Estudiante",
                                "Curso": r['curso'] or 'No asignado',
                                "Función/curso": r['curso'] or 'No asignado',
                                "Profesor Jefe": r['profesor_jefe'] or 'No asignado',
                                "Profesor de Asignatura": r['profesor_asignatura'] or 'No asignado',
                                "Profesor PIE": r['profesor_pie'] or 'No asignado',
                                "Fecha de Nacimiento": r['fecha_nacimiento'],
                                "Estado Matrícula": r['estado']
                            }
                            break
                            
                    if not found_person:
                        # 2. Docentes
                        cursor.execute("SELECT * FROM docentes")
                        for row in cursor.fetchall():
                            r = dict(row)
                            if clean_rut_str(r['rut']) == target_clean:
                                found_person = {
                                    "RUT": r['rut'],
                                    "Nombres": r['nombres'],
                                    "Apellido Paterno": r['apellido_paterno'],
                                    "Apellido Materno": r['apellido_materno'],
                                    "Cargo": "Docente",
                                    "Curso": r['funcion_curso'] or 'Docente de Aula',
                                    "Función/curso": r['funcion_curso'] or 'Docente de Aula',
                                    "Asignatura": r['asignatura'] or 'General',
                                    "Profesor Jefe": "No aplica",
                                    "Profesor de Asignatura": r['asignatura'] or 'General',
                                    "Profesor PIE": "No aplica"
                                }
                                break

                    if not found_person:
                        # 3. Asistentes
                        cursor.execute("SELECT * FROM asistentes")
                        for row in cursor.fetchall():
                            r = dict(row)
                            if clean_rut_str(r['rut']) == target_clean:
                                found_person = {
                                    "RUT": r['rut'],
                                    "Nombres": r['nombres'],
                                    "Apellido Paterno": r['apellido_paterno'],
                                    "Apellido Materno": r['apellido_materno'],
                                    "Cargo": "Asistente de la educación",
                                    "Curso": r['funcion_curso'] or 'Asistente de la educación',
                                    "Función/curso": r['funcion_curso'] or 'Asistente de la educación',
                                    "Asignatura": "No aplica",
                                    "Profesor Jefe": "No aplica",
                                    "Profesor de Asignatura": "No aplica",
                                    "Profesor PIE": "No aplica"
                                }
                                break

                if found_person:
                    self.send_json(found_person)
                else:
                    self.send_json({"error": "Persona no encontrada"}, status=404)

            elif path == '/api/personas/buscar':
                q = query.get('q', [''])[0].strip().lower()
                q_clean = clean_rut_str(q)
                filtro = query.get('filtro', [''])[0].strip()
                
                results = []
                
                # Estudiantes
                if not filtro or filtro == 'Estudiante':
                    cursor.execute("SELECT *, (SELECT COUNT(*) FROM anotaciones_estudiante WHERE rut_estudiante = estudiantes.rut) as anotaciones_count FROM estudiantes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}"
                        if match_rut_or_text(q, q_clean, r['rut'], name_str):
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Estudiante",
                                "Curso": r['curso'] or 'No asignado',
                                "Función/curso": r['curso'] or 'No asignado',
                                "Profesor Jefe": r['profesor_jefe'] or 'No asignado',
                                "Profesor de Asignatura": r['profesor_asignatura'] or 'No asignado',
                                "Profesor PIE": r['profesor_pie'] or 'No asignado',
                                "Fecha de Nacimiento": r['fecha_nacimiento'],
                                "Estado Matrícula": r['estado'],
                                "Anotaciones": r.get('anotaciones_count', 0)
                            })
                            
                # Docentes
                if not filtro or filtro == 'Docente':
                    cursor.execute("SELECT * FROM docentes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''} {r['asignatura'] or ''}"
                        if match_rut_or_text(q, q_clean, r['rut'], name_str):
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Docente",
                                "Curso": r['funcion_curso'] or 'Docente de Aula',
                                "Función/curso": r['funcion_curso'] or 'Docente de Aula',
                                "Asignatura": r['asignatura'] or 'General',
                                "Horas Contrato": r['horas_contrato'],
                                "Estado/Idoneidad": r['idoneidad']
                            })
                            
                # Asistentes
                if not filtro or filtro == 'Asistente de la educación':
                    cursor.execute("SELECT * FROM asistentes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''} {r['funcion_curso'] or ''}"
                        if match_rut_or_text(q, q_clean, r['rut'], name_str):
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Asistente de la educación",
                                "Curso": r['funcion_curso'] or 'Asistente de la educación',
                                "Función/curso": r['funcion_curso'] or 'Asistente de la educación',
                                "Horas Contrato": r['horas_contrato'],
                                "Estado/Idoneidad": r['idoneidad']
                            })

                self.send_json(results[:100]) # Limitar a 100 resultados

            # ── 3. LISTADO DE ESTUDIANTES ──
            elif path == '/api/estudiantes':
                q = query.get('q', [''])[0].strip().lower()
                q_clean = clean_rut_str(q)
                curso = query.get('curso', [''])[0].strip()
                estado = query.get('estado', [''])[0].strip()
                
                sql = "SELECT *, (SELECT COUNT(*) FROM anotaciones_estudiante WHERE rut_estudiante = estudiantes.rut) as anotaciones_count FROM estudiantes WHERE 1=1"
                params = []
                if curso:
                    sql += " AND curso = ?"
                    params.append(curso)
                if estado:
                    sql += " AND estado = ?"
                    params.append(estado)
                    
                cursor.execute(sql, params)
                results = []
                for row in cursor.fetchall():
                    r = dict(row)
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}"
                    if match_rut_or_text(q, q_clean, r['rut'], name_str):
                        results.append({
                            "RUT": r['rut'],
                            "Nombres": r['nombres'],
                            "Apellido Paterno": r['apellido_paterno'],
                            "Apellido Materno": r['apellido_materno'],
                            "Curso": r['curso'],
                            "Profesor Jefe": r['profesor_jefe'],
                            "Profesor de Asignatura": r['profesor_asignatura'],
                            "Profesor PIE": r['profesor_pie'],
                            "Fecha de Nacimiento": r['fecha_nacimiento'],
                            "Estado Matrícula": r['estado'],
                            "Edad": r['edad'],
                            "Anotaciones": r.get('anotaciones_count', 0)
                        })
                self.send_json(results)

            # ── 4. LISTADO DE DOCENTES ──
            elif path == '/api/docentes':
                q = query.get('q', [''])[0].strip().lower()
                q_clean = clean_rut_str(q)
                func = query.get('func', [''])[0].strip()
                
                sql = "SELECT * FROM docentes WHERE 1=1"
                params = []
                if func:
                    sql += " AND funcion_curso = ?"
                    params.append(func)
                    
                cursor.execute(sql, params)
                results = []
                for row in cursor.fetchall():
                    r = dict(row)
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''} {r['asignatura'] or ''}"
                    if match_rut_or_text(q, q_clean, r['rut'], name_str):
                        results.append({
                            "RUT": r['rut'],
                            "Nombres": r['nombres'],
                            "Apellido paterno": r['apellido_paterno'],
                            "Apellido materno": r['apellido_materno'],
                            "Profesor de asignatura": r['asignatura'],
                            "Función/curso": r['funcion_curso'],
                            "Horas contrato": r['horas_contrato'],
                            "Estado/Idoneidad": r['idoneidad']
                        })
                self.send_json(results)

            # ── 5. LISTADO DE ASISTENTES ──
            elif path == '/api/asistentes':
                q = query.get('q', [''])[0].strip().lower()
                q_clean = clean_rut_str(q)
                func = query.get('func', [''])[0].strip()
                
                sql = "SELECT * FROM asistentes WHERE 1=1"
                params = []
                if func:
                    sql += " AND funcion_curso = ?"
                    params.append(func)
                    
                cursor.execute(sql, params)
                results = []
                for row in cursor.fetchall():
                    r = dict(row)
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''} {r['funcion_curso'] or ''}"
                    if match_rut_or_text(q, q_clean, r['rut'], name_str):
                        results.append({
                            "RUT": r['rut'],
                            "Nombres": r['nombres'],
                            "Apellido paterno": r['apellido_paterno'],
                            "Apellido materno": r['apellido_materno'],
                            "Función/curso": r['funcion_curso'],
                            "Horas contrato": r['horas_contrato'],
                            "Estado/Idoneidad": r['idoneidad']
                        })
                self.send_json(results)

            # ── 6. LISTADO DE ENTREVISTAS ──
            elif path == '/api/entrevistas':
                q = query.get('q', [''])[0].strip().lower()
                q_clean = clean_rut_str(q)
                estado = query.get('estado', [''])[0].strip()
                
                sql = "SELECT * FROM entrevistas WHERE 1=1"
                params = []
                if estado:
                    sql += " AND estado = ?"
                    params.append(estado)
                    
                cursor.execute(sql, params)
                results = []
                for row in cursor.fetchall():
                    r = dict(row)
                    name_str = f"{r['nombre'] or ''} {r['resp'] or ''} {r['id'] or ''}"
                    if match_rut_or_text(q, q_clean, r['rut'], name_str):
                        results.append(r)
                self.send_json(results)

            # ── 7. LISTADO DE CONTABILIDAD ──
            elif path == '/api/contabilidad':
                cursor.execute("SELECT * FROM contabilidad ORDER BY id DESC")
                self.send_json([dict(row) for row in cursor.fetchall()])

            # ── 8. LISTADO DE ADMINISTRACIÓN ──
            elif path == '/api/administracion':
                cursor.execute("SELECT * FROM administracion ORDER BY id DESC")
                self.send_json([dict(row) for row in cursor.fetchall()])

            # ── 9. META 2 ADECO 2026 ──
            elif path == '/api/meta2/fichas':
                cursor.execute("SELECT * FROM meta2_fichas ORDER BY id ASC")
                fichas = [dict(r) for r in cursor.fetchall()]
                for f in fichas:
                    f_id = f['id']
                    cursor.execute("SELECT COUNT(*) FROM meta2_evidencias WHERE recomendacion_id = ?", (f_id,))
                    f['evidencias_count'] = cursor.fetchone()[0]
                    cursor.execute("SELECT COUNT(*) FROM meta2_acuerdos WHERE recomendacion_id = ?", (f_id,))
                    f['acuerdos_count'] = cursor.fetchone()[0]
                self.send_json(fichas)

            elif path == '/api/meta2/ficha':
                rec_id = int(query.get('id', [1])[0])
                cursor.execute("SELECT * FROM meta2_fichas WHERE id = ?", (rec_id,))
                row = cursor.fetchone()
                if not row:
                    self.send_json({"error": "Ficha no encontrada"}, status=404)
                    return
                ficha = dict(row)
                cursor.execute("SELECT * FROM meta2_evidencias WHERE recomendacion_id = ? ORDER BY id ASC", (rec_id,))
                ficha['evidencias'] = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT * FROM meta2_acuerdos WHERE recomendacion_id = ? ORDER BY id ASC", (rec_id,))
                ficha['acuerdos'] = [dict(r) for r in cursor.fetchall()]
                self.send_json(ficha)

            elif path == '/api/meta2/evaluacion':
                cursor.execute("SELECT * FROM meta2_evaluacion WHERE id = 1")
                row = cursor.fetchone()
                self.send_json(dict(row) if row else {})

            else:
                self.send_error(404, "Endpoint Not Found")
                
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            if conn:
                release_db_connection(conn)

    def do_POST(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        # Leer cuerpo de petición
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self.send_json({"error": "Invalid JSON Body"}, status=400)
            return

        if path == '/api/upload':
            filename = body.get("filename", "archivo.dat")
            base64_data = body.get("base64Data", "")
            if not base64_data:
                self.send_json({"success": False, "error": "Falta contenido base64Data"}, status=400)
                return
            
            import base64, time, re
            uploads_dir = os.path.join(PUBLIC_DIR, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            # Sanitizar nombre de archivo
            clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)
            timestamp = int(time.time())
            saved_filename = f"{timestamp}_{clean_name}"
            target_path = os.path.join(uploads_dir, saved_filename)
            
            try:
                # Decodificar base64 (removiendo prefijo data:image/png;base64, si existe)
                if ',' in base64_data:
                    base64_data = base64_data.split(',', 1)[1]
                file_bytes = base64.b64decode(base64_data)
                with open(target_path, 'wb') as f:
                    f.write(file_bytes)
                
                url = f"/uploads/{saved_filename}"
                self.send_json({"success": True, "url": url, "filename": clean_name})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            return

        elif path == '/api/config/logo':
            base64_data = body.get("base64Data", "")
            logo_url = body.get("logoUrl", "")
            
            import base64
            uploads_dir = os.path.join(PUBLIC_DIR, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            logo_path = os.path.join(uploads_dir, 'logo.png')
            
            try:
                if base64_data:
                    if ',' in base64_data:
                        base64_data = base64_data.split(',', 1)[1]
                    file_bytes = base64.b64decode(base64_data)
                    with open(logo_path, 'wb') as f:
                        f.write(file_bytes)
                    url = "/uploads/logo.png"
                elif logo_url == "RESET":
                    if os.path.exists(logo_path):
                        os.remove(logo_path)
                    url = None
                else:
                    url = logo_url
                
                self.send_json({"success": True, "logo_url": url})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            return

        elif path == '/api/multivista/update':
            session_id = body.get("sessionId")
            if session_id:
                active_sessions[session_id] = body
                self.send_json({"success": True})
            else:
                self.send_json({"success": False, "error": "Missing sessionId"}, status=400)
            return
        elif path == '/api/multivista/end':
            session_id = body.get("sessionId")
            if session_id and session_id in active_sessions:
                del active_sessions[session_id]
                self.send_json({"success": True})
            else:
                self.send_json({"success": False, "error": "Invalid or missing sessionId"}, status=400)
            return

        elif path == '/api/entrevistas/participantes/invitar':
            entrevista_id = body.get("entrevistaId")
            username = body.get("username")
            if not entrevista_id or not username:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            
            import uuid
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                cursor.execute("SELECT COUNT(*) FROM participantes_entrevista WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
                count = cursor.fetchone()[0]
                if count > 0:
                    self.send_json({"success": True, "message": "Already invited"})
                    return
                
                uid = uuid.uuid4().hex
                cursor.execute("""
                    INSERT INTO participantes_entrevista (id, entrevista_id, username, estado, comentario, fecha_comentario, visto)
                    VALUES (?, ?, ?, 'PENDIENTE', '', '', 0)
                """, (uid, entrevista_id, username))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        elif path == '/api/entrevistas/participantes/comentar':
            entrevista_id = body.get("entrevistaId")
            username = body.get("username")
            comentario = body.get("comentario", "").strip()
            if not entrevista_id or not username or not comentario:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                # 1. Obtener nombre completo y perfil del participante para firmar el aporte
                cursor.execute("SELECT nombre, perfil FROM usuarios WHERE username = ?", (username,))
                user_row = cursor.fetchone()
                user_fullname = user_row[0] if (user_row and user_row[0]) else username
                user_profile = user_row[1] if (user_row and user_row[1]) else "Docente"
                
                # 2. Obtener y actualizar el campo obs de la entrevista en la base de datos local
                cursor.execute("SELECT obs FROM entrevistas WHERE id = ?", (entrevista_id,))
                ent_row = cursor.fetchone()
                if ent_row:
                    current_obs = ent_row[0] if ent_row[0] else ""
                    new_contribution = f"\n\n[Aporte de {user_fullname} ({user_profile})]: {comentario}"
                    updated_obs = current_obs + new_contribution
                    cursor.execute("UPDATE entrevistas SET obs = ? WHERE id = ?", (updated_obs, entrevista_id))
                
                # 3. Eliminar la invitación para que el participante desaparezca de la lista
                # de "Participantes Invitados" y quede liberado para futuras invitaciones.
                cursor.execute("DELETE FROM participantes_entrevista WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        elif path == '/api/usuarios/notificaciones/leer':
            entrevista_id = body.get("entrevistaId")
            username = body.get("username")
            if not entrevista_id or not username:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                cursor.execute("UPDATE participantes_entrevista SET visto = 1 WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        elif path == '/api/entrevistas/participantes/recordar':
            entrevista_id = body.get("entrevistaId")
            username = body.get("username")
            if not entrevista_id or not username:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                cursor.execute("UPDATE participantes_entrevista SET visto = 0 WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        elif path == '/api/entrevistas/participantes/eliminar':
            entrevista_id = body.get("entrevistaId")
            username = body.get("username")
            if not entrevista_id or not username:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                cursor.execute("DELETE FROM participantes_entrevista WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
        elif path == '/api/anotaciones':
            import uuid
            rut = body.get("rut")
            fecha = body.get("fecha")
            tipo = body.get("tipo")
            detalle = body.get("detalle")
            autor = body.get("autor", "admin")
            if not rut or not fecha or not tipo or not detalle:
                self.send_json({"success": False, "error": "Missing parameters"}, status=400)
                return
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                uid = uuid.uuid4().hex
                cursor.execute("""
                    INSERT INTO anotaciones_estudiante (id, rut_estudiante, fecha, tipo, detalle, autor)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (uid, rut, fecha, tipo, detalle, autor))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        elif path == '/api/anotaciones/eliminar':
            uid = body.get("id")
            if not uid:
                self.send_json({"success": False, "error": "Missing id"}, status=400)
                return
            conn = get_db_connection()
            cursor = get_db_cursor(conn)
            try:
                cursor.execute("DELETE FROM anotaciones_estudiante WHERE id = ?", (uid,))
                conn.commit()
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            finally:
                release_db_connection(conn)
            return

        conn = get_db_connection()
        cursor = get_db_cursor(conn)
        
        try:
            # ── LOGIN ──
            if path == '/api/login':
                username = body.get("username", "").strip()
                password = body.get("password", "").strip()
                if not username or not password:
                    self.send_json({"success": False, "error": "Credenciales incompletas"}, status=400)
                    return
                cursor.execute("SELECT * FROM usuarios WHERE username = ?", (username,))
                row = cursor.fetchone()
                if row:
                    user_dict = dict(row)
                    if user_dict["password"] == password:
                        self.send_json({
                            "success": True,
                            "username": user_dict["username"],
                            "nombre": user_dict["nombre"],
                            "perfil": user_dict["perfil"],
                            "rut": user_dict["rut"]
                        })
                        return
                self.send_json({"success": False, "error": "Usuario o contraseña incorrectos"})

            # ── GUARDAR USUARIO ──
            elif path == '/api/usuarios':
                username = body.get("username", "").strip()
                nombre = body.get("nombre", "").strip()
                rut = body.get("rut", "").strip()
                password = body.get("password", "").strip()
                perfil = body.get("perfil", "").strip()
                
                if not username or not password or not perfil or not nombre:
                    self.send_json({"success": False, "error": "Campos obligatorios incompletos"}, status=400)
                    return
                
                cursor.execute("""
                INSERT OR REPLACE INTO usuarios (username, rut, nombre, password, perfil)
                VALUES (?, ?, ?, ?, ?)
                """, (username, rut, nombre, password, perfil))
                conn.commit()
                self.send_json({"success": True})

            # ── A. GUARDAR ESTUDIANTE ──
            elif path == '/api/estudiantes':
                rut = body.get("RUT")
                nombres = body.get("Nombres")
                paterno = body.get("Apellido Paterno")
                materno = body.get("Apellido Materno")
                curso = body.get("Curso")
                profesor_jefe = body.get("Profesor Jefe")
                asignatura = body.get("Profesor de Asignatura")
                pie = body.get("Profesor PIE")
                fnac = body.get("Fecha de Nacimiento")
                estado = body.get("Estado Matrícula", "Vigente")
                edad = body.get("Edad")
                
                # Propagación y herencia de Profesor Jefe
                if curso:
                    curso = curso.strip()
                    if profesor_jefe and profesor_jefe.strip():
                        profesor_jefe = profesor_jefe.strip()
                        cursor.execute("""
                        UPDATE estudiantes 
                        SET profesor_jefe = ? 
                        WHERE curso = ?
                        """, (profesor_jefe, curso))
                    else:
                        cursor.execute("""
                        SELECT profesor_jefe 
                        FROM estudiantes 
                        WHERE curso = ? AND profesor_jefe IS NOT NULL AND profesor_jefe != ''
                        LIMIT 1
                        """, (curso,))
                        row = cursor.fetchone()
                        if row:
                            profesor_jefe = row[0]
                
                cursor.execute("""
                INSERT OR REPLACE INTO estudiantes (
                    rut, nombres, apellido_paterno, apellido_materno, curso, 
                    profesor_jefe, profesor_asignatura, profesor_pie, fecha_nacimiento, estado, edad, anotaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    rut,
                    nombres,
                    paterno,
                    materno,
                    curso,
                    profesor_jefe,
                    asignatura,
                    pie,
                    fnac,
                    estado,
                    edad,
                    body.get("Anotaciones", "")
                ))
                conn.commit()
                self.send_json({"success": True})

            # ── B. GUARDAR DOCENTE ──
            elif path == '/api/docentes':
                cursor.execute("""
                INSERT OR REPLACE INTO docentes (
                    rut, nombres, apellido_paterno, apellido_materno, asignatura, 
                    funcion_curso, horas_contrato, idoneidad
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    body.get("RUT"),
                    body.get("Nombres"),
                    body.get("Apellido paterno"),
                    body.get("Apellido materno"),
                    body.get("Profesor de asignatura"),
                    body.get("Función/curso"),
                    body.get("Horas contrato"),
                    body.get("Estado/Idoneidad", "OK")
                ))
                conn.commit()
                self.send_json({"success": True})

            # ── C. GUARDAR ASISTENTE ──
            elif path == '/api/asistentes':
                cursor.execute("""
                INSERT OR REPLACE INTO asistentes (
                    rut, nombres, apellido_paterno, apellido_materno, 
                    funcion_curso, horas_contrato, idoneidad
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    body.get("RUT"),
                    body.get("Nombres"),
                    body.get("Apellido paterno"),
                    body.get("Apellido materno"),
                    body.get("Función/curso"),
                    body.get("Horas contrato"),
                    body.get("Estado/Idoneidad", "HABILITADO")
                ))
                conn.commit()
                self.send_json({"success": True})

            # ── D. GUARDAR/ACTUALIZAR ENTREVISTA ──
            elif path == '/api/entrevistas':
                ent_id = body.get("id")
                if not ent_id or ent_id == '(vista previa)':
                    # Generar ID robusto sin colisiones
                    cursor.execute("SELECT id FROM entrevistas WHERE id LIKE 'ENT-%'")
                    existing_ids = {row[0] for row in cursor.fetchall()}
                    suffix = 1
                    while f"ENT-{str(suffix).zfill(4)}" in existing_ids:
                        suffix += 1
                    ent_id = f"ENT-{str(suffix).zfill(4)}"
                
                cursor.execute("""
                INSERT OR REPLACE INTO entrevistas (
                    id, rut, nombre, cargo, curso, jefe, asig, pie, fecha, 
                    hora, resp, estado, seguimiento, objetivo, motivo, acuerdos, obs, participantes_relatos
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ent_id,
                    body.get("rut"),
                    body.get("nombre"),
                    body.get("cargo"),
                    body.get("curso"),
                    body.get("jefe"),
                    body.get("asig"),
                    body.get("pie"),
                    body.get("fecha"),
                    body.get("hora"),
                    body.get("resp"),
                    body.get("estado"),
                    body.get("seguimiento"),
                    body.get("objetivo"),
                    body.get("motivo"),
                    body.get("acuerdos"),
                    body.get("obs"),
                    body.get("participantes_relatos", "[]")
                ))
                conn.commit()
                self.send_json({"success": True, "id": ent_id})

            # ── E. REGISTRAR TRANSACCIÓN CONTABLE ──
            elif path == '/api/contabilidad':
                cursor.execute("""
                INSERT INTO contabilidad (fecha, tipo, programa, monto, resp, detalle)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    body.get("fecha"),
                    body.get("tipo"),
                    body.get("programa"),
                    body.get("monto"),
                    body.get("resp"),
                    body.get("detalle")
                ))
                conn.commit()
                self.send_json({"success": True})

            # ── F. REGISTRAR DOCUMENTO ADMINISTRATIVO ──
            elif path == '/api/administracion':
                cursor.execute("""
                INSERT INTO administracion (fecha, tipo, titulo, resp, estado, descripcion)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    body.get("fecha"),
                    body.get("tipo"),
                    body.get("titulo"),
                    body.get("resp"),
                    body.get("estado"),
                    body.get("desc")
                ))
                conn.commit()
                self.send_json({"success": True})

            # ── META 2 ADECO 2026 ──
            elif path == '/api/meta2/ficha':
                rec_id = int(body.get('id', 1))
                fields = ['objetivo', 'brecha', 'accion', 'descripcion', 'responsable', 'frecuencia', 'estamentos', 'fecha_inicio', 'fecha_termino', 'ind_ejecucion', 'ind_resultado', 'linea_base', 'meta', 'avance', 'resultado_observado', 'dificultades', 'ajuste', 'responsable_ajuste', 'proxima_revision', 'observaciones']
                set_clauses = []
                params = []
                for f in fields:
                    if f in body:
                        set_clauses.append(f"{f} = ?")
                        params.append(body[f])
                set_clauses.append("fecha_actualizacion = CURRENT_TIMESTAMP")
                params.append(rec_id)
                sql = f"UPDATE meta2_fichas SET {', '.join(set_clauses)} WHERE id = ?"
                cursor.execute(sql, params)
                conn.commit()
                self.send_json({"success": True, "message": f"Ficha {rec_id} actualizada exitosamente"})

            elif path == '/api/meta2/evidencia':
                rec_id = int(body.get('recomendacion_id', 1))
                tipo = body.get('tipo', 'Documento')
                nombre = body.get('nombre', 'Sin título')
                fecha = body.get('fecha', '')
                url = body.get('url', '#')
                cursor.execute("INSERT INTO meta2_evidencias (recomendacion_id, tipo, nombre, fecha, url) VALUES (?, ?, ?, ?, ?)", (rec_id, tipo, nombre, fecha, url))
                conn.commit()
                self.send_json({"success": True})

            elif path == '/api/meta2/evidencia/delete':
                ev_id = int(body.get('id', 0))
                cursor.execute("DELETE FROM meta2_evidencias WHERE id = ?", (ev_id,))
                conn.commit()
                self.send_json({"success": True})

            elif path == '/api/meta2/acuerdo':
                rec_id = int(body.get('recomendacion_id', 1))
                acuerdo = body.get('acuerdo', '')
                resp = body.get('responsable', '')
                plazo = body.get('plazo', '')
                estado = body.get('estado', 'En ejecución')
                obs = body.get('observacion', '')
                cursor.execute("INSERT INTO meta2_acuerdos (recomendacion_id, acuerdo, responsable, plazo, estado, observacion) VALUES (?, ?, ?, ?, ?, ?)", (rec_id, acuerdo, resp, plazo, estado, obs))
                conn.commit()
                self.send_json({"success": True})

            elif path == '/api/meta2/acuerdo/delete':
                ac_id = int(body.get('id', 0))
                cursor.execute("DELETE FROM meta2_acuerdos WHERE id = ?", (ac_id,))
                conn.commit()
                self.send_json({"success": True})

            elif path == '/api/meta2/evaluacion':
                fields = ['logros', 'colaborativo', 'bienestar', 'comunicacion', 'participacion', 'practicas', 'continuidad', 'meta3']
                set_clauses = []
                params = []
                for f in fields:
                    if f in body:
                        set_clauses.append(f"{f} = ?")
                        params.append(body[f])
                set_clauses.append("fecha_actualizacion = CURRENT_TIMESTAMP")
                sql = f"UPDATE meta2_evaluacion SET {', '.join(set_clauses)} WHERE id = 1"
                cursor.execute(sql, params)
                conn.commit()
                self.send_json({"success": True, "message": "Evaluación consolidada guardada exitosamente"})

            else:
                self.send_error(404, "Endpoint Not Found")
                
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            release_db_connection(conn)

    def do_DELETE(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        conn = get_db_connection()
        cursor = get_db_cursor(conn)
        
        try:
            # ── ELIMINAR USUARIO ──
            if path == '/api/usuarios':
                username = query.get('username', [''])[0]
                if not username:
                    self.send_json({"error": "Missing username parameter"}, status=400)
                    return
                if username == 'admin':
                    self.send_json({"error": "No se puede eliminar al Administrador Principal 'admin'"}, status=400)
                    return
                cursor.execute("DELETE FROM usuarios WHERE username = ?", (username,))
                conn.commit()
                self.send_json({"success": True})
                return

            # ── I. ELIMINAR ESTUDIANTE ──
            elif path == '/api/estudiantes':
                rut = query.get('rut', [''])[0]
                if not rut:
                    self.send_json({"error": "Missing rut parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM estudiantes WHERE rut = ?", (rut,))
                conn.commit()
                self.send_json({"success": True})

            # ── II. ELIMINAR DOCENTE ──
            elif path == '/api/docentes':
                rut = query.get('rut', [''])[0]
                if not rut:
                    self.send_json({"error": "Missing rut parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM docentes WHERE rut = ?", (rut,))
                conn.commit()
                self.send_json({"success": True})

            # ── III. ELIMINAR ASISTENTE ──
            elif path == '/api/asistentes':
                rut = query.get('rut', [''])[0]
                if not rut:
                    self.send_json({"error": "Missing rut parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM asistentes WHERE rut = ?", (rut,))
                conn.commit()
                self.send_json({"success": True})

            # ── IV. ELIMINAR ENTREVISTA ──
            elif path == '/api/entrevistas':
                ent_id = query.get('id', [''])[0]
                if not ent_id:
                    self.send_json({"error": "Missing id parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM entrevistas WHERE id = ?", (ent_id,))
                conn.commit()
                self.send_json({"success": True})

            # ── V. ELIMINAR TRANSACCIÓN CONTABLE ──
            elif path == '/api/contabilidad':
                c_id = query.get('id', [''])[0]
                if not c_id:
                    self.send_json({"error": "Missing id parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM contabilidad WHERE id = ?", (c_id,))
                conn.commit()
                self.send_json({"success": True})

            # ── VI. ELIMINAR DOCUMENTO ADMINISTRATIVO ──
            elif path == '/api/administracion':
                a_id = query.get('id', [''])[0]
                if not a_id:
                    self.send_json({"error": "Missing id parameter"}, status=400)
                    return
                cursor.execute("DELETE FROM administracion WHERE id = ?", (a_id,))
                conn.commit()
                self.send_json({"success": True})

            else:
                self.send_error(404, "Endpoint Not Found")
                
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            release_db_connection(conn)

def run_server():
    # Asegurarse que el directorio public existe
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    # Sincronizar datos de Supabase si estamos en modo SQLite
    if DB_ENGINE == "sqlite":
        try:
            from sync_from_supabase import sync_from_supabase
            sync_from_supabase()
        except Exception as e:
            print(f"Aviso: No se pudo sincronizar automáticamente con Supabase ({e}). Se usarán los datos locales existentes.")

    
    # Asegurarse de que la tabla de usuarios esté creada e inicializada
    try:
        conn = get_db_connection()
        cursor = get_db_cursor(conn)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            username TEXT PRIMARY KEY,
            rut TEXT,
            nombre TEXT,
            password TEXT,
            perfil TEXT
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS participantes_entrevista (
            id TEXT PRIMARY KEY,
            entrevista_id TEXT,
            username TEXT,
            estado TEXT DEFAULT 'PENDIENTE',
            comentario TEXT DEFAULT '',
            fecha_comentario TEXT DEFAULT '',
            visto INTEGER DEFAULT 0
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS anotaciones_estudiante (
            id TEXT PRIMARY KEY,
            rut_estudiante TEXT,
            fecha TEXT,
            tipo TEXT,
            detalle TEXT,
            autor TEXT
        )
        """)
        conn.commit()
        
        # Asegurar columna anotaciones en estudiantes y participantes_relatos en entrevistas
        try:
            cursor.execute("ALTER TABLE estudiantes ADD COLUMN anotaciones TEXT DEFAULT ''")
            conn.commit()
        except Exception:
            pass

        try:
            cursor.execute("ALTER TABLE entrevistas ADD COLUMN participantes_relatos TEXT DEFAULT '[]'")
            conn.commit()
        except Exception:
            pass

        # Asegurar usuarios para todos los funcionarios (docentes y asistentes)
        asegurar_usuarios_funcionarios(conn)

        # ── TABLAS META 2 ADECO 2026 ──
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS meta2_fichas (
            id INTEGER PRIMARY KEY,
            titulo TEXT,
            responsable TEXT,
            objetivo TEXT,
            brecha TEXT,
            accion TEXT,
            descripcion TEXT,
            frecuencia TEXT,
            estamentos TEXT,
            fecha_inicio TEXT,
            fecha_termino TEXT,
            ind_ejecucion TEXT,
            ind_resultado TEXT,
            linea_base TEXT,
            meta TEXT,
            avance INTEGER DEFAULT 0,
            resultado_observado TEXT,
            dificultades TEXT,
            ajuste TEXT,
            responsable_ajuste TEXT,
            proxima_revision TEXT,
            observaciones TEXT,
            fecha_actualizacion TEXT
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS meta2_evidencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recomendacion_id INTEGER,
            tipo TEXT,
            nombre TEXT,
            fecha TEXT,
            url TEXT
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS meta2_acuerdos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recomendacion_id INTEGER,
            acuerdo TEXT,
            responsable TEXT,
            plazo TEXT,
            estado TEXT DEFAULT 'En ejecución',
            observacion TEXT
        )
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS meta2_evaluacion (
            id INTEGER PRIMARY KEY DEFAULT 1,
            logros TEXT,
            colaborativo TEXT,
            bienestar TEXT,
            comunicacion TEXT,
            participacion TEXT,
            practicas TEXT,
            continuidad TEXT,
            meta3 TEXT,
            fecha_actualizacion TEXT
        )
        """)
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM meta2_fichas")
        row_f = cursor.fetchone()
        cnt_f = row_f[0] if row_f else 0
        if cnt_f == 0:
            recs = [
                (1, "Institucionalizar tiempos de trabajo colaborativo", "Equipo Directivo / UTP", "Establecer calendario fijo de CAP y protección de horarios", "Falta de tiempos protegidos para trabajo colaborativo", "Calendarizar sesiones mensuales obligatorias", "Reuniones de 90 min por departamento para comunidades de aprendizaje", "Mensual", "Dirección, UTP, Docentes", "2026-03-01", "2026-11-30", "N° de sesiones ejecutadas", "% de asistencia activa y participación en CAP", "51,5% de funcionarios señala baja frecuencia de trabajo colaborativo", "100% de CAP realizadas según calendario anual", 60),
                (2, "Fortalecer participación de todos los estamentos", "Convivencia Educativa", "Involucrar activamente a Asistentes de la Educación, PIE y Apoyo", "Baja participación de asistentes de la educación en decisiones pedagógicas", "Jornadas de integración por estamento", "Talleres bimestrales de colaboración interdisciplinaria", "Trimestral", "Asistentes, Convivencia, PIE, Orientación", "2026-03-15", "2026-11-15", "N° de talleres realizados por estamento", "% representación e involucramiento por estamento", "Diagnóstico inicial refleja baja representatividad de asistentes", "Alcanzar 80% de asistencia de asistentes de la educación", 40),
                (3, "Incorporar indicadores que permitan observar cambios", "UTP / Orientación", "Medir percepción de bienestar socioemocional y confianza entre pares", "Actualmente solo se mide asistencia y ejecución de actividades", "Diseño de rúbrica de clima y confianza institucional", "Aplicación de encuestas trimestrales y medición de porcentaje de acuerdos cumplidos", "Trimestral", "Orientación, Docentes, UTP", "2026-04-01", "2026-11-30", "Instrumento de percepción validado y aplicado", "Índice de bienestar socioemocional y apoyo entre pares", "Medición cualitativa previa fragmentada", "Incremento de 15 puntos en el indicador de confianza entre pares", 20),
                (4, "Aplicar instrumentos de percepción durante el proceso", "Equipos de Apoyo", "Aplicar diagnóstico 'Tu Función Me Importa' como línea base", "Sin diagnóstico inicial estandarizado sobre carga y función", "Aplicación de encuesta diagnóstica inicial y seguimiento", "Levantamiento digital de datos de percepción de todos los funcionarios", "Única", "Dirección, UTP, Convivencia, Orientación, PIE, Docentes, Asistentes", "2026-03-01", "2026-04-15", "Encuesta aplicada al 100% de la dotación", "Línea base institucional establecida", "Cero instrumentos aplicados previamente", "100% de la dotación encuestada", 75),
                (5, "Socializar periódicamente los avances del proyecto", "Dirección", "Rendir cuenta periódica en Consejo Escolar y de Profesores", "Poca difusión de los avances del proyecto ADECO a la comunidad", "Presentaciones bimestrales de avance e impacto", "Exposición de avances, dificultades, ajustes y decisiones en consejos", "Mensual", "Dirección, Docentes, Asistentes", "2026-04-01", "2026-11-30", "N° de presentaciones de avance realizadas", "% comprensión de avances por parte de la comunidad", "Retroalimentación previa informal", "4 reportes presentados al año", 10)
            ]
            for r in recs:
                cursor.execute("""
                INSERT INTO meta2_fichas (id, titulo, responsable, objetivo, brecha, accion, descripcion, frecuencia, estamentos, fecha_inicio, fecha_termino, ind_ejecucion, ind_resultado, linea_base, meta, avance)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, r)
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM meta2_evaluacion")
        row_e = cursor.fetchone()
        cnt_e = row_e[0] if row_e else 0
        if cnt_e == 0:
            cursor.execute("INSERT INTO meta2_evaluacion (id, logros, colaborativo, bienestar, comunicacion, participacion, practicas, continuidad, meta3) VALUES (1, '', '', '', '', '', '', '', '')")
            conn.commit()
            
        cursor.execute("SELECT COUNT(*) FROM usuarios")
        row = cursor.fetchone()
        count = 0
        if row:
            if isinstance(row, dict):
                count = list(row.values())[0]
            else:
                count = row[0]
                
        if count == 0:
            cursor.execute("""
            INSERT INTO usuarios (username, rut, nombre, password, perfil)
            VALUES (?, ?, ?, ?, ?)
            """, ("admin", "1-9", "Administrador Principal", "admin", "Administrador"))
            conn.commit()
    except Exception as e:
        print(f"Error al inicializar la tabla de usuarios: {e}")
    finally:
        if 'conn' in locals():
            release_db_connection(conn)

    from http.server import ThreadingHTTPServer
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, CampanarioRequestHandler)
    print(f"Servidor Campanario SQLite corriendo en: http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor backend...")
        httpd.server_close()

def sync_from_supabase_on_start():
    print("[SUPABASE] Sincronizando datos en tiempo real desde Supabase (Cloud)...")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        headers = {
            "apikey": "sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m",
            "Authorization": "Bearer sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m"
        }
        tables = ["usuarios", "estudiantes", "docentes", "asistentes", "entrevistas", "contabilidad", "administracion"]
        for t in tables:
            try:
                url = f"https://squfklurqnnoujcmvxjh.supabase.co/rest/v1/{t}?select=*"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    if not data:
                        continue
                    cursor.execute(f"PRAGMA table_info({t})")
                    pragma_cols = [col[1] for col in cursor.fetchall()]
                    if not pragma_cols:
                        continue
                    cols_str = ", ".join(pragma_cols)
                    placeholders = ", ".join(["?"] * len(pragma_cols))
                    query = f"INSERT OR REPLACE INTO {t} ({cols_str}) VALUES ({placeholders})"
                    for row in data:
                        values = [row.get(col) for col in pragma_cols]
                        cursor.execute(query, values)
                    conn.commit()
            except Exception as e:
                pass
        conn.close()
        print("[SUPABASE] Datos cargados correctamente desde Supabase.")
    except Exception as e:
        print(f"[SUPABASE] Error al sincronizar desde Supabase: {e}")

if __name__ == '__main__':
    sync_from_supabase_on_start()
    run_server()
