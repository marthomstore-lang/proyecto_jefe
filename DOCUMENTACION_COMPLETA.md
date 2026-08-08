# 📘 Documentación Técnica Exhaustiva y Guía de Replicación
## Sistema Integral — Liceo Técnico Profesional Campanario (RBD 3941)

---

## 1. Visión General del Proyecto

El **Sistema Integral del Liceo Técnico Profesional Campanario (RBD 3941)** es una solución tecnológica web orientada a la gestión escolar integral, convivencia escolar, recursos humanos y administración documental institutos técnicos profesionales.

La aplicación permite:
1. **Gestión de Matrícula y Estudiantes**: Control de matriculados (vigentes/retirados), fichas individuales, seguimiento de edad, curso y profesor jefe.
2. **Gestión de Recursos Humanos**: Control de docentes de aula, directivos y asistentes de la educación (psicólogos, fonoaudiólogos, inspectores), idoneidad docente y horas de contrato.
3. **Fichas de Entrevistas y Compromisos**: Registro de actas de entrevistas formativas, conductuales o académicas con estudiantes y apoderados, con fechas de seguimiento y niveles de privacidad (`Pública` vs `Confidencial`).
4. **Colaboración Múltiple y Aportes**: Sistema de invitaciones para que otros funcionarios o especialistas (PIE, Convivencia) agreguen aportes firmados a una misma entrevista.
5. **Registro de Anotaciones de Convivencia**: Hoja de vida y registro de anotaciones clasificadas en `Positiva`, `Negativa`, `Demérito` y `Medida Pedagógica`.
6. **Administración y Protocolos**: Archivo documental de oficios, resoluciones, circulares y reglamentos institucionales.
7. **Multivista en Vivo (Dual Screen)**: Transmisión en tiempo real vía código QR hacia una segunda pantalla o dispositivo móvil para que el entrevistado observe lo que se redacta.
8. **Integración con Google Drive**: Carga directa y vinculación de archivos/carpetas de evidencias mediante Google Apps Script y enlaces compartidos.
10. **Caminatas Pedagógicas (Proyecto ADECO)**: Observación breve de aula (10 a 15 min) articulada con los Sellos del PEI, evaluación cualitativa en 4 dimensiones (Convivencia, Curriculum, Inclusión/PIE, Evaluación), equipo de hasta 3 observadores simultáneos, compromisos y firmas múltiples horizontales.

---

## 2. Arquitectura del Sistema y Flujo de Datos

El sistema está diseñado bajo una arquitectura altamente resiliente y distribuida con **3 capas de datos y fallback automático**:

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      NAVEGADOR WEB / CLIENTE (SPA)                     │
 │  • HTML5 Semántico (index.html)                                        │
 │  • CSS3 / Sistema de Tokens (styles.css)                               │
 │  • JS Nativo + Interceptor Fetch (logic.js)                            │
 │  • Respaldo Local (localStorage)                                       │
 └───────────────────┬────────────────────────────────┬───────────────────┘
                     │                                │ (Fallback Directo si
                     │ HTTP / REST API                │  Servidor cae)
                     ▼                                ▼
 ┌───────────────────────────────────────┐  ┌─────────────────────────────┐
 │       BACKEND PYTHON (server.py)      │  │    SUPABASE REST API (v1)   │
 │ • Puerto: 8080                        │  │ • API REST directa          │
 │ • Connection Pool (psycopg2)          │  │ • Autenticación apikey      │
 └───────────┬───────────────────┬───────┘  └─────────────────────────────┘
             │ (Principal)       │ (Respaldo Local)
             ▼                   ▼
┌──────────────────────┐ ┌──────────────────────┐
│  SUPABASE POSTGRESQL │ │  SQLITE LOCAL DB     │
│  (squfklurqnnoujcm)  │ │  (campanario.db)     │
└──────────────────────┘ └──────────────────────┘
```

### Modos de Operación de Datos:
1. **Modo Híbrido Servidor Python + Supabase PostgreSQL (Principal)**:
   El backend Python en `server.py` mantiene un pool de conexiones (`psycopg2.pool.SimpleConnectionPool`) contra Supabase PostgreSQL.
2. **Modo Respaldo Servidor Python + SQLite (Offline Local)**:
   Si no hay conexión a Supabase o no hay URL configurada en `.env`, el servidor conmuta a la base de datos local SQLite `campanario.db`.
3. **Modo Interceptor Cliente Supabase REST API**:
   Si el servidor local Python no está corriendo, `logic.js` intercepta las peticiones `fetch('/api/...')` y las redirige automáticamente a los endpoints REST de Supabase en la nube (`https://squfklurqnnoujcmvxjh.supabase.co/rest/v1/...`).
4. **Modo Cliente LocalStorage**:
   Si no hay ninguna red disponible, todos los datos se guardan y consultan directamente en `localStorage` del navegador.

---

## 3. Esquema Detallado de la Base de Datos

### 3.1. Tabla `usuarios`
Almacena las credenciales y perfiles de acceso al sistema.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS usuarios (
    username TEXT PRIMARY KEY,
    rut TEXT,
    nombre TEXT NOT NULL,
    password TEXT NOT NULL,
    perfil TEXT NOT NULL -- 'Administrador' o 'Entrevistador'
);
```

#### Campo a Campo:
* `username` (`TEXT`, PK): Identificador único de inicio de sesión (ej: `admin`, `jperez`).
* `rut` (`TEXT`): RUT del funcionario asociado a la cuenta.
* `nombre` (`TEXT`): Nombre completo del usuario.
* `password` (`TEXT`): Contraseña de acceso en texto plano.
* `perfil` (`TEXT`): Rol de permisos (`Administrador` o `Entrevistador`).

---

### 3.2. Tabla `estudiantes`
Contiene la base de datos de matrícula del establecimiento.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS estudiantes (
    rut TEXT PRIMARY KEY,
    nombres TEXT NOT NULL,
    apellido_paterno TEXT NOT NULL,
    apellido_materno TEXT,
    curso TEXT NOT NULL,
    profesor_jefe TEXT,
    profesor_asignatura TEXT,
    profesor_pie TEXT,
    fecha_nacimiento TEXT,
    estado TEXT DEFAULT 'Vigente', -- 'Vigente' o 'Retirado'
    edad INTEGER,
    anotaciones TEXT DEFAULT ''
);
```

#### Campo a Campo:
* `rut` (`TEXT`, PK): RUT único del estudiante (ej: `21.345.678-9`).
* `nombres` (`TEXT`): Nombres del alumno.
* `apellido_paterno` (`TEXT`): Apellido paterno.
* `apellido_materno` (`TEXT`): Apellido materno.
* `curso` (`TEXT`): Curso matriculado (ej: `1° Medio A`, `3° Medio Mecánica`).
* `profesor_jefe` (`TEXT`): Nombre del Profesor Jefe (se propaga automáticamente a todo el curso).
* `profesor_asignatura` (`TEXT`): Nombre del Profesor de Asignatura principal.
* `profesor_pie` (`TEXT`): Nombre del Especialista PIE a cargo.
* `fecha_nacimiento` (`TEXT`): Fecha formato `YYYY-MM-DD`.
* `estado` (`TEXT`): Estado de la matrícula (`Vigente` / `Retirado`).
* `edad` (`INTEGER`): Edad del estudiante.
* `anotaciones` (`TEXT`): Resumen/conteo de anotaciones registradas.

---

### 3.3. Tabla `docentes`
Almacena al personal docente de aula, jefaturas y equipo directivo.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS docentes (
    rut TEXT PRIMARY KEY,
    nombres TEXT NOT NULL,
    apellido_paterno TEXT NOT NULL,
    apellido_materno TEXT,
    asignatura TEXT,
    funcion_curso TEXT,
    horas_contrato INTEGER,
    idoneidad TEXT DEFAULT 'OK'
);
```

#### Campo a Campo:
* `rut` (`TEXT`, PK): RUT del docente.
* `nombres` (`TEXT`): Nombres.
* `apellido_paterno` (`TEXT`): Apellido paterno.
* `apellido_materno` (`TEXT`): Apellido materno.
* `asignatura` (`TEXT`): Asignatura principal impartida.
* `funcion_curso` (`TEXT`): Función o curso asignado.
* `horas_contrato` (`INTEGER`): Horas cronológicas semanales de contrato.
* `idoneidad` (`TEXT`): Estado de idoneidad docente (`OK`, `Habilitado`, etc.).

---

### 3.4. Tabla `asistentes`
Almacena al personal asistente de la educación, profesionales dupla y apoyo.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS asistentes (
    rut TEXT PRIMARY KEY,
    nombres TEXT NOT NULL,
    apellido_paterno TEXT NOT NULL,
    apellido_materno TEXT,
    funcion_curso TEXT,
    horas_contrato INTEGER,
    idoneidad TEXT DEFAULT 'HABILITADO'
);
```

#### Campo a Campo:
* `rut` (`TEXT`, PK): RUT del asistente.
* `nombres` (`TEXT`): Nombres.
* `apellido_paterno` (`TEXT`): Apellido paterno.
* `apellido_materno` (`TEXT`): Apellido materno.
* `funcion_curso` (`TEXT`): Cargo (ej: `Psicólogo/a`, `Fonoaudiólogo/a`, `Inspector/a`, `Asistente Diferencial`, `Auxiliar Aseo`).
* `horas_contrato` (`INTEGER`): Horas semanales de contrato.
* `idoneidad` (`TEXT`): Estado de habilitación.

---

### 3.5. Tabla `anotaciones_estudiante`
Hoja de vida conductual y pedagógica del estudiante.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS anotaciones_estudiante (
    id TEXT PRIMARY KEY,
    rut_estudiante TEXT NOT NULL REFERENCES estudiantes(rut) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'Positiva', 'Negativa', 'Demérito', 'Medida Pedagógica'
    detalle TEXT NOT NULL,
    autor TEXT NOT NULL
);
```

#### Campo a Campo:
* `id` (`TEXT`, PK): UUID único generado (32 caracteres hexadecimales).
* `rut_estudiante` (`TEXT`, FK): RUT del estudiante asociado.
* `fecha` (`TEXT`): Fecha de la observación (`YYYY-MM-DD`).
* `tipo` (`TEXT`): Clasificación (`Positiva`, `Negativa`, `Demérito`, `Medida Pedagógica`).
* `detalle` (`TEXT`): Descripción detallada del suceso u observación.
* `autor` (`TEXT`): Usuario o nombre de la persona que registró la anotación.

---

### 3.6. Tabla `entrevistas`
Registro central de actas de entrevistas, acuerdos y seguimiento de casos.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS entrevistas (
    id TEXT PRIMARY KEY, -- Formato ENT-0001
    rut TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cargo TEXT,
    curso TEXT,
    jefe TEXT,
    asig TEXT,
    pie TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    resp TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Abierta', -- 'Abierta', 'En seguimiento', 'Cerrada', 'Derivada'
    seguimiento TEXT,
    objetivo TEXT,
    motivo TEXT,
    acuerdos TEXT,
    obs TEXT
);
```

#### Campo a Campo:
* `id` (`TEXT`, PK): Código correlativo autogenerado sin colisión (ej: `ENT-0001`).
* `rut` (`TEXT`): RUT del entrevistado (estudiante, docente o apoderado).
* `nombre` (`TEXT`): Nombre completo del entrevistado.
* `cargo` (`TEXT`): Estamento (`Estudiante`, `Docente`, `Asistente de la educación`).
* `curso` (`TEXT`): Curso o área funcional.
* `jefe` (`TEXT`): Profesor Jefe.
* `asig` (`TEXT`): Profesor de Asignatura.
* `pie` (`TEXT`): Especialista PIE.
* `fecha` (`TEXT`): Fecha de la reunión (`YYYY-MM-DD`).
* `hora` (`TEXT`): Hora de la reunión (`HH:MM`).
* `resp` (`TEXT`): Nombre y cargo del entrevistador responsable.
* `estado` (`TEXT`): Estado de la ficha (`Abierta`, `En seguimiento`, `Cerrada`, `Derivada`).
* `seguimiento` (`TEXT`): Fecha proyectada para la próxima revisión.
* `objetivo` (`TEXT`): Propósito principal del encuentro.
* `motivo` (`TEXT`): Antecedentes previos y causas desencadenantes.
* `acuerdos` (`TEXT`): Compromisos y acuerdos tomados por las partes.
* `obs` (`TEXT`): Observaciones generales, derivaciones y anexos de comentarios firmados.

---

### 3.7. Tabla `participantes_entrevista`
Control de colaboración y notificaciones de aportes entre funcionarios.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS participantes_entrevista (
    id TEXT PRIMARY KEY,
    entrevista_id TEXT NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES usuarios(username) ON DELETE CASCADE,
    estado TEXT DEFAULT 'PENDIENTE', -- 'PENDIENTE' o 'COMPLETADO'
    comentario TEXT DEFAULT '',
    fecha_comentario TEXT DEFAULT '',
    visto INTEGER DEFAULT 0 -- 0 = Pendiente de ver, 1 = Leído
);
```

#### Campo a Campo:
* `id` (`TEXT`, PK): UUID de la invitación.
* `entrevista_id` (`TEXT`, FK): ID de la entrevista vinculada.
* `username` (`TEXT`, FK): Nombre de usuario del funcionario invitado.
* `estado` (`TEXT`): Estado del aporte (`PENDIENTE` / `COMPLETADO`).
* `comentario` (`TEXT`): Comentario u observación ingresada por el invitado.
* `fecha_comentario` (`TEXT`): Fecha en que se realizó el aporte.
* `visto` (`INTEGER`): Indicador de lectura (0 = genera insignia roja de alerta, 1 = leído).

---

### 3.8. Tabla `administracion`
Control de documentos institucionales, oficios y protocolos.

#### Sentencia DDL (PostgreSQL / Supabase):
```sql
CREATE TABLE IF NOT EXISTS administracion (
    id SERIAL PRIMARY KEY,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'Oficio', 'Resolución', 'Protocolo', 'Reglamento', 'Acta de Consejo', 'Otro'
    titulo TEXT NOT NULL,
    resp TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Pendiente', -- 'Pendiente', 'En proceso', 'Finalizado', 'Archivado'
    descripcion TEXT
);
```

#### Campo a Campo:
* `id` (`SERIAL`, PK): Identificador entero autoincremental.
* `fecha` (`TEXT`): Fecha de emisión del documento.
* `tipo` (`TEXT`): Categoría del documento (`Oficio`, `Resolución`, `Protocolo`, `Reglamento`, `Acta de Consejo`, `Otro`).
* `titulo` (`TEXT`): Título o referencia (ej: `Oficio N°24 Ord. SEP`).
* `resp` (`TEXT`): Nombre del emisor o responsable.
* `estado` (`TEXT`): Estado de tramitación (`Pendiente`, `En proceso`, `Finalizado`, `Archivado`).
* `descripcion` (`TEXT`): Extracto o resumen del contenido.

---

## 4. Especificación Técnica de la API REST (`server.py`)

El servidor HTTP en `server.py` implementa los siguientes endpoints:

### 4.1. Endpoints de Consulta (`GET`)

| Endpoint | Parámetros Query | Descripción | Respuesta de Ejemplo |
| :--- | :--- | :--- | :--- |
| `GET /api/stats` | Ninguno | Retorna los totales consolidados y matrículas vigentes/retiradas | `{"totalEstudiantes": 120, "vigentes": 115, "retirados": 5, ...}` |
| `GET /api/personas/buscar` | `q`, `filtro` | Búsqueda global de estudiantes, docentes y asistentes | `[{"RUT": "21...", "Nombres": "Juan", "Cargo": "Estudiante"}]` |
| `GET /api/estudiantes` | `q`, `curso`, `estado` | Listado filtrado de estudiantes con conteo de anotaciones | `[{"RUT": "21...", "Nombres": "...", "Anotaciones": 3}]` |
| `GET /api/docentes` | `q`, `func` | Listado filtrado de personal docente | `[{"RUT": "15...", "Asignatura": "Matemática"}]` |
| `GET /api/asistentes` | `q`, `func` | Listado filtrado de asistentes de la educación | `[{"RUT": "16...", "Función/curso": "Psicólogo"}]` |
| `GET /api/entrevistas` | `q`, `estado` | Listado de entrevistas registradas | `[{"id": "ENT-0001", "nombre": "...", "estado": "Abierta"}]` |
| `GET /api/anotaciones` | `rut` | Anotaciones asociadas a un RUT específico | `[{"id": "...", "tipo": "Positiva", "detalle": "..."}]` |
| `GET /api/anotaciones/todas` | Ninguno | Todas las anotaciones con datos del estudiante | `[{"id": "...", "estudiante_nombre": "...", "tipo": "..."}]` |
| `GET /api/usuarios` | Ninguno | Cuentas de usuario registradas | `[{"username": "admin", "perfil": "Administrador"}]` |
| `GET /api/usuarios/notificaciones`| `username` | Notificaciones e invitaciones pendientes del usuario | `[{"entrevista_id": "ENT-0001", "visto": 0}]` |
| `GET /api/entrevistas/participantes`| `entrevista_id` | Participantes invitados a una entrevista | `[{"username": "jperez", "estado": "PENDIENTE"}]` |
| `GET /api/administracion` | Ninguno | Listado de documentos administrativos | `[{"id": 1, "titulo": "Oficio N°1", "estado": "Pendiente"}]` |
| `GET /api/config/logo` | Ninguno | Retorna la URL del logo cargado | `{"success": true, "logo_url": "/uploads/logo.png"}` |
| `GET /api/multivista/live` | `session` | Retorna los datos de la sesión multivista en tiempo real | `{"sessionId": "ENT-0001", "objetivo": "..."}` |
| `GET /api/multivista/info` | Ninguno | Retorna la IP local y puerto del servidor backend | `{"ip": "192.168.1.50", "port": 8080}` |

---

### 4.2. Endpoints de Creación y Edición (`POST`)

| Endpoint | Cuerpo JSON | Descripción | Respuesta |
| :--- | :--- | :--- | :--- |
| `POST /api/login` | `{"username": "...", "password": "..."}` | Valida credenciales de acceso | `{"success": true, "perfil": "Administrador"}` |
| `POST /api/estudiantes` | Objeto Estudiante completo | Guarda/actualiza estudiante y propaga Profesor Jefe | `{"success": true}` |
| `POST /api/docentes` | Objeto Docente completo | Guarda/actualiza docente | `{"success": true}` |
| `POST /api/asistentes` | Objeto Asistente completo | Guarda/actualiza asistente | `{"success": true}` |
| `POST /api/entrevistas` | Objeto Entrevista completo | Guarda/actualiza entrevista (genera ID `ENT-XXXX`) | `{"success": true, "id": "ENT-0001"}` |
| `POST /api/anotaciones` | `{"rut": "...", "fecha": "...", "tipo": "...", "detalle": "..."}` | Registra nueva anotación | `{"success": true}` |
| `POST /api/anotaciones/eliminar`| `{"id": "..."}` | Elimina una anotación por su ID | `{"success": true}` |
| `POST /api/usuarios` | Objeto Usuario | Registra o actualiza usuario | `{"success": true}` |
| `POST /api/administracion` | Objeto Documento | Registra un documento administrativo | `{"success": true}` |
| `POST /api/entrevistas/participantes/invitar` | `{"entrevistaId": "...", "username": "..."}` | Invita a un usuario a colaborar | `{"success": true}` |
| `POST /api/entrevistas/participantes/comentar` | `{"entrevistaId": "...", "username": "...", "comentario": "..."}` | Agrega aporte firmado a la entrevista | `{"success": true}` |
| `POST /api/usuarios/notificaciones/leer` | `{"entrevistaId": "...", "username": "..."}` | Marca una notificación como leída | `{"success": true}` |
| `POST /api/upload` | `{"filename": "...", "base64Data": "..."}` | Guarda archivos en `/public/uploads/` | `{"success": true, "url": "/uploads/..."}` |
| `POST /api/config/logo` | `{"base64Data": "..."}` o `{"logoUrl": "RESET"}` | Actualiza o restablece el logo oficial | `{"success": true, "logo_url": "..."}` |
| `POST /api/multivista/update` | Objeto Estado Multivista | Sincroniza datos de la pantalla multivista | `{"success": true}` |

---

### 4.3. Endpoints de Eliminación (`DELETE`)

| Endpoint | Parámetro Query | Descripción |
| :--- | :--- | :--- |
| `DELETE /api/estudiantes` | `rut` | Elimina un estudiante |
| `DELETE /api/docentes` | `rut` | Elimina un docente |
| `DELETE /api/asistentes` | `rut` | Elimina un asistente |
| `DELETE /api/entrevistas` | `id` | Elimina una entrevista |
| `DELETE /api/usuarios` | `username` | Elimina un usuario (impide eliminar `admin`) |
| `DELETE /api/administracion` | `id` | Elimina un documento administrativo |

---

## 5. Lógica de Negocio y Algoritmos Principales

### 5.1. Propagación Automática de Profesor Jefe por Curso
Cuando un estudiante es guardado o actualizado y se especifica un `profesor_jefe` para un `curso`:
```python
if curso:
    curso = curso.strip()
    if profesor_jefe and profesor_jefe.strip():
        profesor_jefe = profesor_jefe.strip()
        cursor.execute("UPDATE estudiantes SET profesor_jefe = ? WHERE curso = ?", (profesor_jefe, curso))
```
**Efecto**: Todos los demás estudiantes pertenecientes al mismo curso adoptan automáticamente al mismo Profesor Jefe en la base de datos.

### 5.2. Generación Correlativa de ID de Entrevista Sin Colisión
Para evitar ID duplicados o errores de secuencia:
```python
cursor.execute("SELECT id FROM entrevistas WHERE id LIKE 'ENT-%'")
existing_ids = {row[0] for row in cursor.fetchall()}
suffix = 1
while f"ENT-{str(suffix).zfill(4)}" in existing_ids:
    suffix += 1
ent_id = f"ENT-{str(suffix).zfill(4)}"
```

### 5.3. Sistema de Multivista en Tiempo Real (Dual Screen)
1. Al pulsar **"Compartir Pantalla (QR)"**, se genera un código de sesión (`MVT-XXXXXX`).
2. El entrevistador emite actualizaciones mediante `POST /api/multivista/update` en cada pulsación de tecla (`input`).
3. El dispositivo receptor escanear el QR o abre `multiview.html?session=MVT-XXXXXX`, realizando peticiones `GET` cada 1000ms.
4. Si la conexión al servidor local Python falla, `multiview.html` conmuta automáticamente a la API REST de Supabase como fallback.

### 5.4. Firmas de Aportes Colaborativos
Cuando un docente invitado guarda un comentario a través de la notificación:
```python
user_fullname = user_row["nombre"]
user_profile = user_row["perfil"]
new_contribution = f"\n\n[Aporte de {user_fullname} ({user_profile})]: {comentario}"
updated_obs = current_obs + new_contribution
cursor.execute("UPDATE entrevistas SET obs = ? WHERE id = ?", (updated_obs, entrevista_id))
cursor.execute("DELETE FROM participantes_entrevista WHERE entrevista_id = ? AND username = ?", (entrevista_id, username))
```
El comentario queda anexado a la sección de **Observaciones Generales** de la entrevista firmado con su nombre y perfil.

---

## 6. Sistema de Diseño y Tokens CSS (`styles.css`)

El archivo `styles.css` define las siguientes variables CSS y reglas globales:

```css
:root {
  /* Paleta de Colores Principal */
  --primary: #4f46e5;         /* Indigo Principal */
  --primary-hover: #4338ca;   /* Hover Estado */
  --bg-app: #f1f5f9;          /* Fondo App */
  --bg-card: #ffffff;         /* Fondo Tarjetas */
  --bg-body: #f8fafc;         /* Fondo Contenedores */
  --text-primary: #0f172a;    /* Texto Oscuro */
  --text-secondary: #475569;  /* Texto Secundario */
  --text-muted: #94a3b8;      /* Texto Deshabilitado */
  --border: #e2e8f0;          /* Bordes Divisores */
  
  /* Estados */
  --success: #10b981;         /* Verde Matrícula Vigente / Éxito */
  --danger: #ef4444;          /* Rojo Retirado / Alerta */
  --warning: #f59e0b;         /* Amarillo Advertencia */
  
  /* Radios y Sombras */
  --radius-sm: 8px;
  --radius-md: 12px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  
  /* Tipografía */
  --font-main: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-title: 'Outfit', system-ui, sans-serif;
}
```

### Reglas de Impresión Oficial (`@media print`):
* Oculta navegación (`header`, `#sidebar`, `.no-print`, botones).
* Ajusta los márgenes a cero y fuerza fondos blancos.
* Asegura el quiebre de página limpio (`page-break-inside: avoid;`).

---

## 7. Guía Paso a Paso para Replicar la Aplicación

### Requisitos Previos:
* **Python 3.8+** instalado.
* **Node.js 16+** (opcional, solo usado por `db_initializer.py` si se desea extraer desde `index.html` original).
* Cuenta en **Supabase** (o cualquier servidor PostgreSQL).

---

### Paso 1: Clonar o Crear la Estructura de Directorios
Crea la siguiente estructura de carpetas:

```
proyecto_jefe/
├── .env
├── campanario.db
├── db_initializer.py
├── migrate_to_supabase.py
├── sync_from_supabase.py
├── server.py
└── public/
    ├── index.html
    ├── logic.js
    ├── styles.css
    └── multiview.html
```

---

### Paso 2: Crear el Archivo de Configuración `.env`
Crea un archivo llamado `.env` en la raíz del proyecto:

```env
SUPABASE_DB_URL=postgresql://postgres:[TU_CONTRASEÑA]@db.[TU_PROYECTO].supabase.co:5432/postgres
```

---

### Paso 3: Inicializar la Base de Datos Local SQLite
Ejecuta el script de inicialización para crear la base de datos local SQLite `campanario.db` y crear la cuenta `admin` por defecto:

```bash
python db_initializer.py
```

---

### Paso 4: Migrar la Estructura y Datos a Supabase PostgreSQL
Si has configurado tu URL de Supabase en el archivo `.env`, ejecuta la migración:

```bash
python migrate_to_supabase.py
```

---

### Paso 5: Iniciar el Servidor Backend
Inicia el servidor Python:

```bash
python server.py
```

El servidor imprimirá en consola:
```text
Conectado a Base de Datos Supabase (PostgreSQL)
Servidor Campanario SQLite corriendo en: http://localhost:8080
```

---

### Paso 6: Acceso e Inicio de Sesión
1. Abre tu navegador web en: `http://localhost:8080`
2. Ingresa con las credenciales por defecto:
   * **Usuario**: `admin`
   * **Contraseña**: `admin`
3. ¡La aplicación está totalmente lista para ser utilizada o desplegada en producción!

---

## 8. Verificación y Auditoría de Funcionalidades

| Característica | Estado | Verificación |
| :--- | :--- | :--- |
| **Autenticación y Roles** | ✅ Funcional | Roles Administrador y Entrevistador validados en Backend y Frontend. |
| **Propagación Profesor Jefe** | ✅ Funcional | Asignar docente en un estudiante actualiza a todos sus compañeros de curso. |
| **Multivista QR** | ✅ Funcional | Sincronización en vivo probada con fallback a Supabase REST. |
| **Firmas e Invitaciones** | ✅ Funcional | Notificaciones activas en header con badge e incorporación de aportes firmados. |
| **Impresión Ficha Oficial** | ✅ Funcional | Reglas `@media print` validadas para formato A4/Carta con membrete y firmas. |
| **Carga de Evidencias Drive** | ✅ Funcional | Integración con Google Apps Script y almacenamiento de URLs directas. |
| **Impresión Masiva Historial** | ✅ Funcional | Selección por casillas para generación de actas múltiples. |
