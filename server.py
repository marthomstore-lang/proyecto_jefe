import os
import json
import sqlite3
import mimetypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8080
DB_PATH = os.path.join(os.path.dirname(__file__), 'campanario.db')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

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
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            # ── LISTADO DE USUARIOS ──
            if path == '/api/usuarios':
                cursor.execute("SELECT * FROM usuarios")
                self.send_json([dict(row) for row in cursor.fetchall()])
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
            conn.close()

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

        conn = get_db_connection()
        cursor = conn.cursor()
        
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
                    # Generar ID
                    cursor.execute("SELECT COUNT(*) FROM entrevistas")
                    count = cursor.fetchone()[0]
                    ent_id = f"ENT-{str(count + 1).zfill(4)}"
                
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
            conn.close()

    def do_DELETE(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)

        conn = get_db_connection()
        cursor = conn.cursor()
        
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
            conn.close()

def run_server():
    # Asegurarse que el directorio public existe
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    # Asegurarse de que la tabla de usuarios esté creada e inicializada
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            username TEXT PRIMARY KEY,
            rut TEXT,
            nombre TEXT,
            password TEXT,
            perfil TEXT
        )
        """)
        cursor.execute("SELECT COUNT(*) FROM usuarios")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
            INSERT INTO usuarios (username, rut, nombre, password, perfil)
            VALUES (?, ?, ?, ?, ?)
            """, ("admin", "1-9", "Administrador Principal", "admin", "Administrador"))
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error al inicializar la tabla de usuarios: {e}")

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, CampanarioRequestHandler)
    print(f"Servidor Campanario SQLite corriendo en: http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor backend...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
