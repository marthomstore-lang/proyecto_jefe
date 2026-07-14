import os
import json
import sqlite3
import mimetypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Cargar variables de entorno del archivo .env si existe
load_dotenv()

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
                        profesor_jefe, profesor_asignatura, profesor_pie, fecha_nacimiento, estado, edad
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                  edad = EXCLUDED.edad
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
        # Cabeceras estándar de CORS y seguridad
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
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
        if path == '/api/multivista/live':
            session = query.get('session', [''])[0].strip()
            self.send_json(active_sessions.get(session, {}))
            return
        elif path == '/api/multivista/info':
            self.send_json({"ip": get_local_ip(), "port": PORT})
            return

        conn = get_db_connection()
        cursor = get_db_cursor(conn)
        
        try:
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

            # ── 2. BUSCADOR GLOBAL ──
            elif path == '/api/personas/buscar':
                q = query.get('q', [''])[0].strip().lower()
                filtro = query.get('filtro', [''])[0].strip()
                
                results = []
                
                # Estudiantes
                if not filtro or filtro == 'Estudiante':
                    cursor.execute("SELECT * FROM estudiantes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                        if not q or q in (r['rut'] or '').lower() or q in name_str:
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Estudiante",
                                "Curso": r['curso'],
                                "Función/curso": r['curso'],
                                "Profesor Jefe": r['profesor_jefe'],
                                "Profesor de Asignatura": r['profesor_asignatura'],
                                "Profesor PIE": r['profesor_pie'],
                                "Fecha de Nacimiento": r['fecha_nacimiento'],
                                "Estado Matrícula": r['estado']
                            })
                            
                # Docentes
                if not filtro or filtro == 'Docente':
                    cursor.execute("SELECT * FROM docentes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                        if not q or q in (r['rut'] or '').lower() or q in name_str or q in (r['asignatura'] or '').lower():
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Docente",
                                "Curso": r['funcion_curso'],
                                "Función/curso": r['funcion_curso'],
                                "Asignatura": r['asignatura'],
                                "Horas Contrato": r['horas_contrato'],
                                "Estado/Idoneidad": r['idoneidad']
                            })
                            
                # Asistentes
                if not filtro or filtro == 'Asistente de la educación':
                    cursor.execute("SELECT * FROM asistentes")
                    for row in cursor.fetchall():
                        r = dict(row)
                        name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                        if not q or q in (r['rut'] or '').lower() or q in name_str or q in (r['funcion_curso'] or '').lower():
                            results.append({
                                "RUT": r['rut'],
                                "Nombres": r['nombres'],
                                "Apellido Paterno": r['apellido_paterno'],
                                "Apellido Materno": r['apellido_materno'],
                                "Cargo": "Asistente de la educación",
                                "Curso": r['funcion_curso'],
                                "Función/curso": r['funcion_curso'],
                                "Horas Contrato": r['horas_contrato'],
                                "Estado/Idoneidad": r['idoneidad']
                            })

                self.send_json(results[:100]) # Limitar a 100 resultados

            # ── 3. LISTADO DE ESTUDIANTES ──
            elif path == '/api/estudiantes':
                q = query.get('q', [''])[0].strip().lower()
                curso = query.get('curso', [''])[0].strip()
                estado = query.get('estado', [''])[0].strip()
                
                sql = "SELECT * FROM estudiantes WHERE 1=1"
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
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                    if not q or q in (r['rut'] or '').lower() or q in name_str:
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
                            "Edad": r['edad']
                        })
                self.send_json(results)

            # ── 4. LISTADO DE DOCENTES ──
            elif path == '/api/docentes':
                q = query.get('q', [''])[0].strip().lower()
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
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                    if not q or q in (r['rut'] or '').lower() or q in name_str or q in (r['asignatura'] or '').lower():
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
                    name_str = f"{r['nombres'] or ''} {r['apellido_paterno'] or ''} {r['apellido_materno'] or ''}".lower()
                    if not q or q in (r['rut'] or '').lower() or q in name_str or q in (r['funcion_curso'] or '').lower():
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
                    name_str = f"{r['rut'] or ''} {r['nombre'] or ''} {r['resp'] or ''} {r['id'] or ''}".lower()
                    if not q or q in name_str:
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

            else:
                self.send_error(404, "Endpoint Not Found")
                
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
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

        if path == '/api/multivista/update':
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
                    profesor_jefe, profesor_asignatura, profesor_pie, fecha_nacimiento, estado, edad
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    edad
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
                    hora, resp, estado, seguimiento, objetivo, motivo, acuerdos, obs
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    body.get("obs")
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

if __name__ == '__main__':
    run_server()
