// ══ SUPABASE CLIENT-SIDE API INTERCEPTOR ══
const SUPABASE_URL = "https://squfklurqnnoujcmvxjh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i7ruBqqrqr4ro8YywVk0sQ_VhvY_R-m";

// Configuración para la subida directa a Google Drive
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqUwzmnjajLpYq70mzzzznooRu70laLt_N9n-bfN5gMiY0BtjZsxw43qxdse_07AwfLA/exec"; // URL de Google Apps Script para subidas directas

async function subirArchivoADrive(input) {
  const file = input.files[0];
  if (!file) return;
  
  const rut = document.getElementById('e-rut').value.trim();
  if (!rut) {
    toast("⚠️ Ingrese el RUT del entrevistado antes de subir un archivo");
    input.value = '';
    return;
  }
  
  if (!GOOGLE_SCRIPT_URL) {
    alert("⚠️ Para habilitar la subida directa a Google Drive, debes implementar el script de Google y guardar su URL en la variable GOOGLE_SCRIPT_URL al inicio de public/logic.js");
    input.value = '';
    return;
  }
  
  const btn = document.getElementById('btn-upload-file');
  const originalText = btn.innerHTML;
  btn.innerHTML = "⏳ Subiendo...";
  btn.disabled = true;
  
  const reader = new FileReader();
  reader.onload = async function() {
    const base64Data = reader.result.split(',')[1];
    const payload = {
      filename: file.name,
      mimeType: file.type,
      base64Data: base64Data,
      rut: rut
    };
    
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.success) {
        document.getElementById('e-adjunto').value = data.url;
        toast("📁 Archivo subido con éxito a Google Drive");
      } else {
        alert("❌ Error al subir archivo: " + (data.error || "Desconocido"));
      }
    } catch (err) {
      console.error("Error al subir archivo a Drive:", err);
      alert("❌ Error de conexión al script de Google Drive. Asegúrese de que esté desplegado como Web App y permita el acceso a 'Cualquiera' (Anyone).");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      input.value = '';
    }
  };
  
  reader.onerror = function() {
    toast("❌ Error al leer el archivo");
    btn.innerHTML = originalText;
    btn.disabled = false;
    input.value = '';
  };
  
  reader.readAsDataURL(file);
}

const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const parsedUrl = new URL(url, window.location.origin);
    const path = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;
    const method = options.method ? options.method.toUpperCase() : 'GET';
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const mockResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status: status,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    
    try {
      if (path === '/api/multivista/info' && method === 'GET') {
        if (!multiviewSessionId) {
          multiviewSessionId = 'MVT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        return mockResponse({
          url: `${window.location.origin}/multiview.html?session=${multiviewSessionId}`
        });
      }
      
      if (path === '/api/multivista/update' && method === 'POST') {
        const body = JSON.parse(options.body);
        const sessionId = body.sessionId;
        const dbBody = {
          id: sessionId,
          rut: body.rut || '',
          nombre: body.nombre || '',
          cargo: body.cargo || '',
          curso: body.curso || '',
          jefe: body.jefe || '',
          asig: body.asig || '',
          pie: body.pie || '',
          fecha: body.fecha || '',
          hora: body.hora || '',
          resp: body.resp || '',
          estado: 'TRANSMISION',
          seguimiento: body.seguimiento || '',
          objetivo: body.objetivo || '',
          motivo: body.motivo || '',
          acuerdos: body.acuerdos || '',
          obs: body.obs || ''
        };
        const res = await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(dbBody)
        });
        if (res.ok) {
          return mockResponse({ success: true });
        } else {
          const errData = await res.json();
          return mockResponse({ success: false, error: errData.message || 'Error al actualizar transmisión en Supabase' });
        }
      }

      if (path === '/api/login' && method === 'POST') {
        const body = JSON.parse(options.body);
        const u = body.username.trim().toLowerCase();
        const p = body.password;
        
        const res = await originalFetch(`${SUPABASE_URL}/rest/v1/usuarios?username=eq.${encodeURIComponent(u)}`, { headers });
        const users = await res.json();
        
        if (users && users.length > 0) {
          const user = users[0];
          if (user.password === p) {
            return mockResponse({
              success: true,
              username: user.username,
              nombre: user.nombre,
              perfil: user.perfil,
              rut: user.rut
            });
          }
        }
        return mockResponse({ success: false, error: 'Usuario o contraseña incorrectos' });
      }
      
      if (path === '/api/stats' && method === 'GET') {
        const fetchCount = async (table) => {
          let url = `${SUPABASE_URL}/rest/v1/${table}?select=count`;
          if (table === 'entrevistas') {
            url += `&id=not.like.MVT-%25`;
          }
          const res = await originalFetch(url, {
            headers: { ...headers, 'Prefer': 'count=exact' }
          });
          const contentRange = res.headers.get('Content-Range');
          if (contentRange) {
            const count = contentRange.split('/')[1];
            return parseInt(count, 10) || 0;
          }
          const data = await res.json();
          return data.length || 0;
        };
        
        const [totalEst, totalDoc, totalAsis, totalEnt] = await Promise.all([
          fetchCount('estudiantes'),
          fetchCount('docentes'),
          fetchCount('asistentes'),
          fetchCount('entrevistas')
        ]);
        
        const fetchCountFilter = async (table, filter) => {
          const res = await originalFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=count`, {
            headers: { ...headers, 'Prefer': 'count=exact' }
          });
          const contentRange = res.headers.get('Content-Range');
          if (contentRange) {
            const count = contentRange.split('/')[1];
            return parseInt(count, 10) || 0;
          }
          const data = await res.json();
          return data.length || 0;
        };
        
        const [vig, ret] = await Promise.all([
          fetchCountFilter('estudiantes', 'estado=eq.Vigente'),
          fetchCountFilter('estudiantes', 'estado=eq.Retirado')
        ]);
        
        return mockResponse({
          totalEstudiantes: totalEst,
          totalDocentes: totalDoc,
          totalAsistentes: totalAsis,
          totalEntrevistas: totalEnt,
          vigentes: vig,
          retirados: ret
        });
      }
      
      if (path === '/api/personas/buscar' && method === 'GET') {
        const q = (searchParams.get('q') || '').trim().toLowerCase();
        const filtro = (searchParams.get('filtro') || '').trim();
        
        let promises = [];
        if (!filtro || filtro === 'Estudiante') {
          promises.push(originalFetch(`${SUPABASE_URL}/rest/v1/estudiantes`, { headers }).then(r => r.json()).then(data => data.map(x => ({ ...x, cargo: 'Estudiante' }))));
        }
        if (!filtro || filtro === 'Docente') {
          promises.push(originalFetch(`${SUPABASE_URL}/rest/v1/docentes`, { headers }).then(r => r.json()).then(data => data.map(x => ({ ...x, cargo: 'Docente' }))));
        }
        if (!filtro || filtro === 'Asistente de la educación') {
          promises.push(originalFetch(`${SUPABASE_URL}/rest/v1/asistentes`, { headers }).then(r => r.json()).then(data => data.map(x => ({ ...x, cargo: 'Asistente de la educación' }))));
        }
        
        const resultsArray = await Promise.all(promises);
        const merged = resultsArray.flat();
        
        const filtered = merged.filter(x => {
          const nameStr = `${x.nombres || ''} ${x.apellido_paterno || ''} ${x.apellido_materno || ''}`.toLowerCase();
          const rutStr = (x.rut || '').toLowerCase();
          const funcStr = (x.funcion_curso || x.asignatura || '').toLowerCase();
          return !q || rutStr.includes(q) || nameStr.includes(q) || funcStr.includes(q);
        });
        
        const mapped = filtered.map(x => {
          if (x.cargo === 'Estudiante') {
            return {
              RUT: x.rut,
              Nombres: x.nombres,
              'Apellido Paterno': x.apellido_paterno,
              'Apellido Materno': x.apellido_materno,
              Cargo: 'Estudiante',
              Curso: x.curso,
              'Función/curso': x.curso,
              'Profesor Jefe': x.profesor_jefe,
              'Profesor de Asignatura': x.profesor_asignatura,
              'Profesor PIE': x.profesor_pie,
              'Fecha de Nacimiento': x.fecha_nacimiento,
              'Estado Matrícula': x.estado,
              Edad: x.edad
            };
          } else if (x.cargo === 'Docente') {
            return {
              RUT: x.rut,
              Nombres: x.nombres,
              'Apellido Paterno': x.apellido_paterno,
              'Apellido Materno': x.apellido_materno,
              Cargo: 'Docente',
              Curso: x.funcion_curso,
              'Función/curso': x.funcion_curso,
              Asignatura: x.asignatura,
              'Horas Contrato': x.horas_contrato,
              'Estado/Idoneidad': x.idoneidad
            };
          } else {
            return {
              RUT: x.rut,
              Nombres: x.nombres,
              'Apellido Paterno': x.apellido_paterno,
              'Apellido Materno': x.apellido_materno,
              Cargo: 'Asistente de la educación',
              Curso: x.funcion_curso,
              'Función/curso': x.funcion_curso,
              'Horas Contrato': x.horas_contrato,
              'Estado/Idoneidad': x.idoneidad
            };
          }
        });
        
        mapped.sort((a, b) => {
          const nameA = `${a.Nombres || ''} ${a['Apellido Paterno'] || a['Apellido paterno'] || ''} ${a['Apellido Materno'] || a['Apellido materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
          const nameB = `${b.Nombres || ''} ${b['Apellido Paterno'] || b['Apellido paterno'] || ''} ${b['Apellido Materno'] || b['Apellido materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
          return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
        });
        
        return mockResponse(mapped.slice(0, 100));
      }
      
      const tablesMapping = {
        '/api/estudiantes': 'estudiantes',
        '/api/docentes': 'docentes',
        '/api/asistentes': 'asistentes',
        '/api/entrevistas': 'entrevistas',
        '/api/contabilidad': 'contabilidad',
        '/api/administracion': 'administracion',
        '/api/usuarios': 'usuarios'
      };
      
      const sbTable = tablesMapping[path];
      if (sbTable) {
        if (method === 'GET') {
          let sbUrl = `${SUPABASE_URL}/rest/v1/${sbTable}`;
          let params = [];
          
          if (sbTable === 'estudiantes') {
            const curso = searchParams.get('curso');
            const estado = searchParams.get('estado');
            if (curso) params.push(`curso=eq.${encodeURIComponent(curso)}`);
            if (estado) params.push(`estado=eq.${encodeURIComponent(estado)}`);
          } else if (sbTable === 'docentes' || sbTable === 'asistentes') {
            const func = searchParams.get('func');
            if (func) params.push(`funcion_curso=eq.${encodeURIComponent(func)}`);
          } else if (sbTable === 'entrevistas') {
            const estado = searchParams.get('estado');
            if (estado) params.push(`estado=eq.${encodeURIComponent(estado)}`);
          } else if (sbTable === 'usuarios') {
            const username = searchParams.get('username');
            if (username) params.push(`username=eq.${encodeURIComponent(username)}`);
          }
          
          if (params.length > 0) {
            sbUrl += '?' + params.join('&');
          }
          
          const res = await originalFetch(sbUrl, { headers });
          let rows = await res.json();
          if (Array.isArray(rows) && sbTable === 'entrevistas') {
            rows = rows.filter(r => !r.id || !r.id.startsWith('MVT-'));
          }
          
          const frontendRows = rows.map(r => {
            const mappedRow = {};
            if (sbTable === 'estudiantes') {
              mappedRow['RUT'] = r.rut;
              mappedRow['Nombres'] = r.nombres;
              mappedRow['Apellido Paterno'] = r.apellido_paterno;
              mappedRow['Apellido Materno'] = r.apellido_materno;
              mappedRow['Curso'] = r.curso;
              mappedRow['Profesor Jefe'] = r.profesor_jefe;
              mappedRow['Profesor de Asignatura'] = r.profesor_asignatura;
              mappedRow['Profesor PIE'] = r.profesor_pie;
              mappedRow['Fecha de Nacimiento'] = r.fecha_nacimiento;
              mappedRow['Estado Matrícula'] = r.estado;
              mappedRow['Edad'] = r.edad;
            } else if (sbTable === 'docentes') {
              mappedRow['RUT'] = r.rut;
              mappedRow['Nombres'] = r.nombres;
              mappedRow['Apellido paterno'] = r.apellido_paterno;
              mappedRow['Apellido materno'] = r.apellido_materno;
              mappedRow['Profesor de asignatura'] = r.asignatura;
              mappedRow['Función/curso'] = r.funcion_curso;
              mappedRow['Horas contrato'] = r.horas_contrato;
              mappedRow['Estado/Idoneidad'] = r.idoneidad;
            } else if (sbTable === 'asistentes') {
              mappedRow['RUT'] = r.rut;
              mappedRow['Nombres'] = r.nombres;
              mappedRow['Apellido paterno'] = r.apellido_paterno;
              mappedRow['Apellido materno'] = r.apellido_materno;
              mappedRow['Función/curso'] = r.funcion_curso;
              mappedRow['Horas contrato'] = r.horas_contrato;
              mappedRow['Estado/Idoneidad'] = r.idoneidad;
            } else {
              for (const k in r) {
                mappedRow[k] = r[k];
              }
            }
            return mappedRow;
          });
          
          const q = (searchParams.get('q') || '').trim().toLowerCase();
          if (q) {
            return mockResponse(frontendRows.filter(x => {
              const nameStr = `${x.Nombres || x.nombre || ''} ${x['Apellido Paterno'] || ''} ${x['Apellido Materno'] || ''} ${x.resp || ''}`.toLowerCase();
              const rutStr = (x.RUT || x.rut || x.id || '').toLowerCase();
              return nameStr.includes(q) || rutStr.includes(q);
            }));
          }
          
          return mockResponse(frontendRows);
        }
        
        if (method === 'POST') {
          const body = JSON.parse(options.body);
          const dbBody = {};
          const mapping = {
            'RUT': 'rut',
            'Nombres': 'nombres',
            'Apellido Paterno': 'apellido_paterno',
            'Apellido Materno': 'apellido_materno',
            'Curso': 'curso',
            'Profesor Jefe': 'profesor_jefe',
            'Profesor de Asignatura': 'profesor_asignatura',
            'Profesor PIE': 'profesor_pie',
            'Fecha de Nacimiento': 'fecha_nacimiento',
            'Estado Matrícula': 'estado',
            'Edad': 'edad',
            'Apellido paterno': 'apellido_paterno',
            'Apellido materno': 'apellido_materno',
            'Función/curso': 'funcion_curso',
            'Horas contrato': 'horas_contrato',
            'Estado/Idoneidad': 'idoneidad',
            'Profesor de asignatura': 'asignatura'
          };
          
          for (const k in body) {
            if (mapping[k]) {
              dbBody[mapping[k]] = body[k];
            } else {
              dbBody[k.toLowerCase()] = body[k];
            }
          }
          
          if (sbTable === 'estudiantes' && dbBody.curso) {
            if (dbBody.profesor_jefe) {
              originalFetch(`${SUPABASE_URL}/rest/v1/estudiantes?curso=eq.${encodeURIComponent(dbBody.curso)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ profesor_jefe: dbBody.profesor_jefe })
              });
            } else {
              const resJefe = await originalFetch(`${SUPABASE_URL}/rest/v1/estudiantes?curso=eq.${encodeURIComponent(dbBody.curso)}&profesor_jefe=not.is.null&profesor_jefe=not.eq.`, { headers });
              const ests = await resJefe.json();
              if (ests && ests.length > 0) {
                dbBody.profesor_jefe = ests[0].profesor_jefe;
              }
            }
          }
          
          if ((sbTable === 'contabilidad' || sbTable === 'administracion') && !dbBody.id) {
            delete dbBody.id;
          }
          
          let responseId = body.id;
          if (sbTable === 'entrevistas' && (!body.id || body.id === '(vista previa)')) {
            const resEnts = await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?select=id`, { headers });
            const entsData = await resEnts.json();
            const existingIds = new Set(entsData.map(e => e.id));
            let suffix = 1;
            while (existingIds.has(`ENT-${String(suffix).padStart(4, '0')}`)) {
              suffix++;
            }
            responseId = `ENT-${String(suffix).padStart(4, '0')}`;
            dbBody.id = responseId;
          }
          
          const res = await originalFetch(`${SUPABASE_URL}/rest/v1/${sbTable}`, {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(dbBody)
          });
          
          if (res.ok) {
            return mockResponse({ success: true, id: responseId });
          } else {
            const errData = await res.json();
            return mockResponse({ success: false, error: errData.message || 'Error al guardar en Supabase' });
          }
        }
        
        if (method === 'DELETE') {
          let sbUrl = `${SUPABASE_URL}/rest/v1/${sbTable}`;
          if (sbTable === 'estudiantes' || sbTable === 'docentes' || sbTable === 'asistentes') {
            const rut = searchParams.get('rut');
            sbUrl += `?rut=eq.${encodeURIComponent(rut)}`;
          } else if (sbTable === 'usuarios') {
            const username = searchParams.get('username');
            if (username === 'admin') {
              return mockResponse({ success: false, error: 'No se puede eliminar al admin principal' }, 400);
            }
            sbUrl += `?username=eq.${encodeURIComponent(username)}`;
          } else {
            const id = searchParams.get('id');
            sbUrl += `?id=eq.${encodeURIComponent(id)}`;
          }
          
          const res = await originalFetch(sbUrl, { method: 'DELETE', headers });
          if (res.ok) {
            return mockResponse({ success: true });
          } else {
            const errData = await res.json();
            return mockResponse({ success: false, error: errData.message || 'Error al eliminar en Supabase' });
          }
        }
      }
      
    } catch(e) {
      console.error("Interceptor error:", e);
      return mockResponse({ success: false, error: e.message || 'Error de conexión con Supabase' }, 500);
    }
  }
  return originalFetch.apply(this, arguments);
};

// ══ STATE & STORAGE (API DRIVEN) ══
let entrevistas = [];
let localCont = [];
let localAdmin = [];
let editandoEntrevistaId = null;
let multiviewSessionId = null;
let multiviewInterval = null;

// Mask RUT helper in real-time
function formatRut(rutStr) {
  let value = rutStr.replace(/[^0-9kK]/g, '');
  if (value.length <= 1) return value;
  
  let body = value.slice(0, -1);
  let dv = value.slice(-1).toUpperCase();
  
  let formatted = '';
  while (body.length > 3) {
    formatted = '.' + body.slice(-3) + formatted;
    body = body.slice(0, -3);
  }
  formatted = body + formatted;
  return formatted + '-' + dv;
}

function handleRutInput(e) {
  let cursor = e.target.selectionStart;
  let originalLen = e.target.value.length;
  let formatted = formatRut(e.target.value);
  e.target.value = formatted;
  
  let newLen = formatted.length;
  e.target.setSelectionRange(cursor + (newLen - originalLen), cursor + (newLen - originalLen));
}

function bindRutMasks() {
  ['e-rut', 'n-rut', 'p-rut', 'edit-rut'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', handleRutInput);
    }
  });
}

function txt(v) { return (v == null ? '' : '' + v).trim(); }
defEscape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
function esc(s) { return txt(s).replace(/[&<>"']/g, m => defEscape[m]); }

// ══ SIDEBAR & NAVIGATION ══
let sidebarOpen = true;
function toggleSidebar() {
  const nav = document.getElementById('sidebar');
  const main = document.getElementById('main-content');
  sidebarOpen = !sidebarOpen;
  nav.classList.toggle('collapsed', !sidebarOpen);
  main.classList.toggle('expanded', !sidebarOpen);
  
  if (window.innerWidth <= 1024) {
    nav.classList.toggle('open', sidebarOpen);
  }
}

function goTo(page) {
  const [pageName, queryString] = page.split('?');
  
  // Guardar la página previa en sessionStorage (si no es reporte)
  if (pageName !== 'reporte') {
    sessionStorage.setItem('campanario_prev_page', pageName);
    if (window.reportLiveInterval) {
      clearInterval(window.reportLiveInterval);
      window.reportLiveInterval = null;
    }
  }
  
  // Sincronizar hash en la barra de direcciones
  if (window.location.hash !== '#' + page) {
    window.location.hash = page;
  }
  
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pg = document.getElementById('pg-' + pageName);
  if (pg) pg.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + pageName + "'")) {
      n.classList.add('active');
    }
  });
  
  if (window.innerWidth <= 1024) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    sidebarOpen = false;
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if (pageName === 'inicio') { buscarGlobal(); loadAllData(); }
  if (pageName === 'estudiantes') { initEstFiltros(); filtrarEst(); populateProfesorJefeDropdowns(); }
  if (pageName === 'docentes') { initDocFiltros(); filtrarDoc(); }
  if (pageName === 'asistentes') { initAsiFiltros(); filtrarAsi(); }
  if (pageName === 'historial') { filtrarHistorial(); }
  if (pageName === 'administracion') { renderAdmin(); }
  if (pageName === 'configuracion') { renderConfiguracion(); }
  if (pageName === 'anotaciones-global') { filtrarAnotacionesGlobal(); }
  if (pageName === 'nueva-entrevista') {
    const params = new URLSearchParams(queryString || '');
    const editId = params.get('edit');
    if (editId) {
      cargarEntrevistaParaEditarDirecto(editId);
    }
  }
  
  if (pageName === 'reporte') {
    const params = new URLSearchParams(queryString || '');
    const id = params.get('id');
    const ids = params.get('ids');
    const print = params.get('print') === '1';
    if (id) {
      cargarReporteDesdeHash(id, print);
    } else if (ids) {
      cargarMultiplesReportesDesdeHash(ids.split(','), print);
    }
  }
}

// ══ TOAST ══
function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>ℹ️</span> ${msg}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ══ STATS & SVG GAUGES (SERVER BACKEND) ══
async function loadAllData() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    
    document.getElementById('s-est').textContent = stats.totalEstudiantes;
    document.getElementById('s-doc').textContent = stats.totalDocentes;
    document.getElementById('s-asi').textContent = stats.totalAsistentes;
    document.getElementById('s-ent').textContent = stats.totalEntrevistas;
    document.getElementById('s-vig').textContent = stats.vigentes;
    document.getElementById('s-ret').textContent = stats.retirados;
    
    document.getElementById('cnt-est').textContent = stats.totalEstudiantes;
    document.getElementById('cnt-doc').textContent = stats.totalDocentes;
    document.getElementById('cnt-asi').textContent = stats.totalAsistentes;
    document.getElementById('cnt-ent').textContent = stats.totalEntrevistas;

    // Gauge 1: Matrícula Vigente
    const pctVig = stats.totalEstudiantes > 0 ? Math.round((stats.vigentes / stats.totalEstudiantes) * 100) : 0;
    document.getElementById('g-mat-val').textContent = `${pctVig}%`;
    const offsetVig = 170 - (170 * (pctVig / 100));
    document.getElementById('g-mat-bar').style.strokeDashoffset = offsetVig;


    // Gauge 3: Entrevistas
    document.getElementById('g-ent-val').textContent = stats.totalEntrevistas;
    const maxMeta = 100;
    const pctEnt = Math.min(Math.round((stats.totalEntrevistas / maxMeta) * 100), 100);
    const offsetEnt = 170 - (170 * (pctEnt / 100));
    document.getElementById('g-ent-bar').style.strokeDashoffset = offsetEnt;
    
    // Rellenar selectores de profesor jefe
    await populateProfesorJefeDropdowns();
  } catch (e) {
    console.error("Error loading server statistics:", e);
  }
}

async function populateProfesorJefeDropdowns() {
  try {
    console.log("populateProfesorJefeDropdowns: Fetching docentes list...");
    const res = await fetch('/api/docentes?_=' + Date.now());
    const docentes = await res.json();
    docentes.sort((a, b) => {
      const nameA = `${a.Nombres || ''} ${a['Apellido paterno'] || a['Apellido Paterno'] || ''} ${a['Apellido materno'] || a['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
      const nameB = `${b.Nombres || ''} ${b['Apellido paterno'] || b['Apellido Paterno'] || ''} ${b['Apellido materno'] || b['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
    console.log("populateProfesorJefeDropdowns: Docentes loaded:", docentes.length);
    
    const nJefe = document.getElementById('n-jefe');
    const editJefe = document.getElementById('edit-jefe');
    
    const prevNJefe = nJefe ? nJefe.value : '';
    const prevEditJefe = editJefe ? editJefe.value : '';
    
    let optionsHtml = '<option value="">-- Seleccione Profesor Jefe --</option>';
    docentes.forEach(d => {
      const nom = d.Nombres || '';
      const pat = d['Apellido paterno'] || d['Apellido Paterno'] || '';
      const mat = d['Apellido materno'] || d['Apellido Materno'] || '';
      const fullName = `${nom} ${pat} ${mat}`.trim().replace(/\s+/g, ' ');
      optionsHtml += `<option value="${fullName}">${fullName}</option>`;
    });
    
    if (nJefe) {
      nJefe.innerHTML = optionsHtml;
      nJefe.value = prevNJefe;
      console.log("populateProfesorJefeDropdowns: Populated n-jefe select, value = ", prevNJefe);
    }
    if (editJefe) {
      editJefe.innerHTML = optionsHtml;
      editJefe.value = prevEditJefe;
      console.log("populateProfesorJefeDropdowns: Populated edit-jefe select, value = ", prevEditJefe);
    }
  } catch (e) {
    console.error("Error populating Profesor Jefe dropdowns:", e);
  }
}

async function updateJefeForCurso(cursoInputId, jefeSelectId) {
  const curso = document.getElementById(cursoInputId).value.trim();
  if (!curso) return;
  try {
    const res = await fetch(`/api/estudiantes?curso=${encodeURIComponent(curso)}`);
    const ests = await res.json();
    const withJefe = ests.find(e => e['Profesor Jefe']);
    if (withJefe) {
      const selectEl = document.getElementById(jefeSelectId);
      if (selectEl) {
        selectEl.value = withJefe['Profesor Jefe'];
      }
    }
  } catch (e) {
    console.error("Error auto-detecting Profesor Jefe for curso:", e);
  }
}

// ══ GLOBAL SEARCH ══
async function buscarGlobal() {
  const q = txt(document.getElementById('g-q').value);
  const f = document.getElementById('g-filtro').value;
  try {
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(q)}&filtro=${encodeURIComponent(f)}`);
    const rows = await res.json();
    
    const tbody = document.querySelector('#tbl-global tbody');
    tbody.innerHTML = rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No se encontraron registros.</td></tr>' :
    rows.map(p => {
      const r = p.RUT;
      const name = [p.Nombres, p['Apellido Paterno'] || p['Apellido paterno'] || '', p['Apellido Materno'] || p['Apellido materno'] || ''].join(' ').trim().replace(/\s+/g,' ');
      const est = p.Cargo;
      const desc = p.Curso || p['Función/curso'] || '';
      return `<tr>
        <td><span class="rut">${esc(r)}</span></td>
        <td><strong>${esc(p.Nombres)}</strong></td>
        <td>${esc(txt(p['Apellido Paterno'] || p['Apellido paterno']) + ' ' + txt(p['Apellido Materno'] || p['Apellido materno']))}</td>
        <td><span class="badge ${est === 'Estudiante' ? 'badge-azul' : (est === 'Docente' ? 'badge-verde' : 'badge-naranja')}">${esc(est)}</span></td>
        <td>${esc(desc)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-primary" onclick="entrevistar('${esc(r)}')">📋 Ficha / Entrevistar</button>
            <button class="btn btn-sm btn-secondary" onclick="abrirEditar('${esc(r)}')">✏️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error("Error global search:", e);
  }
}

// ══ ESTUDIANTES ══
let estCursosInit = false;
async function initEstFiltros() {
  if (estCursosInit) return;
  try {
    const res = await fetch('/api/estudiantes');
    const all = await res.json();
    estCursosInit = true;
    const sel = document.getElementById('est-curso');
    const cursos = [...new Set(all.map(e => e.Curso).filter(Boolean))].sort();
    cursos.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  } catch (e) {
    console.error("Error loading student course filters:", e);
  }
}

function formatEdadExacta(fechaNacimientoStr, edadOriginal) {
  if (!fechaNacimientoStr) return edadOriginal != null && edadOriginal !== '' && edadOriginal !== 0 ? `${edadOriginal} años` : '';
  
  // Parse YYYY-MM-DD as local to avoid timezone shifts
  const parts = fechaNacimientoStr.split('-');
  let fNac;
  if (parts.length === 3) {
    fNac = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    fNac = new Date(fechaNacimientoStr);
  }
  
  if (isNaN(fNac.getTime())) return edadOriginal != null && edadOriginal !== '' && edadOriginal !== 0 ? `${edadOriginal} años` : '';
  
  const hoy = new Date();
  let years = hoy.getFullYear() - fNac.getFullYear();
  let months = hoy.getMonth() - fNac.getMonth();
  let days = hoy.getDate() - fNac.getDate();
  
  if (days < 0) {
    months--;
    const prevMonth = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  
  if (years < 0) return '';
  
  let outParts = [];
  if (years > 0) outParts.push(`${years} año${years !== 1 ? 's' : ''}`);
  if (months > 0) outParts.push(`${months} mes${months !== 1 ? 'es' : ''}`);
  if (days > 0) outParts.push(`${days} día${days !== 1 ? 's' : ''}`);
  
  return outParts.length > 0 ? outParts.join(', ') : '0 días';
}

let estSortCol = '';
let estSortAsc = true;

function sortEstTable(col) {
  if (estSortCol === col) {
    estSortAsc = !estSortAsc;
  } else {
    estSortCol = col;
    estSortAsc = true;
  }
  filtrarEst();
}

function updateEstSortHeaders() {
  const map = {
    'RUT': 'th-est-rut',
    'Nombres': 'th-est-nom',
    'Apellidos': 'th-est-ape',
    'Curso': 'th-est-cur',
    'Edad': 'th-est-edad',
    'Estado Matrícula': 'th-est-est'
  };
  for (const col in map) {
    const el = document.getElementById(map[col]);
    if (el) {
      let text = el.textContent.replace(' ▲', '').replace(' ▼', '');
      if (col === estSortCol) {
        text += estSortAsc ? ' ▲' : ' ▼';
      }
      el.textContent = text;
    }
  }
}

async function filtrarEst() {
  const q = txt(document.getElementById('est-q').value).toLowerCase();
  const cur = document.getElementById('est-curso').value;
  const est = document.getElementById('est-estado').value;
  
  try {
    const res = await fetch(`/api/estudiantes?q=${encodeURIComponent(q)}&curso=${encodeURIComponent(cur)}&estado=${encodeURIComponent(est)}`);
    let rows = await res.json();
    
    if (estSortCol) {
      rows.sort((a, b) => {
        let valA = a[estSortCol] || '';
        let valB = b[estSortCol] || '';
        
        if (estSortCol === 'Apellidos') {
          valA = (a['Apellido Paterno'] || '') + ' ' + (a['Apellido Materno'] || '');
          valB = (b['Apellido Paterno'] || '') + ' ' + (b['Apellido Materno'] || '');
        } else if (estSortCol === 'Edad') {
          valA = a['Fecha de Nacimiento'] || '9999-12-31';
          valB = b['Fecha de Nacimiento'] || '9999-12-31';
          if (!a['Fecha de Nacimiento'] && a.Edad) valA = String(1000 - a.Edad);
          if (!b['Fecha de Nacimiento'] && b.Edad) valB = String(1000 - b.Edad);
        }
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (typeof valA === 'string' && typeof valB === 'string') {
           const cmp = valA.localeCompare(valB, 'es', { numeric: true });
           return estSortAsc ? cmp : -cmp;
        }
        
        if (valA < valB) return estSortAsc ? -1 : 1;
        if (valA > valB) return estSortAsc ? 1 : -1;
        return 0;
      });
    }

    updateEstSortHeaders();
    
    document.getElementById('est-count').textContent = `Mostrando ${rows.length} registros`;
    const tbody = document.querySelector('#tbl-est tbody');
    tbody.innerHTML = rows.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No hay registros.</td></tr>' :
    rows.map(e => `<tr>
      <td><span class="rut">${esc(e.RUT)}</span></td>
      <td><strong>${esc(e.Nombres)}</strong></td>
      <td>${esc(txt(e['Apellido Paterno']) + ' ' + txt(e['Apellido Materno']))}</td>
      <td>${esc(e.Curso)}</td>
      <td>${esc(formatEdadExacta(e['Fecha de Nacimiento'], e.Edad))}</td>
      <td><span class="badge ${e['Estado Matrícula'] === 'Vigente' ? 'badge-verde' : 'badge-rojo'}">${esc(e['Estado Matrícula'])}</span></td>
      <td><span style="font-size:12.5px; font-weight:600; color:var(--text-primary);">${esc(e.Anotaciones || '0')}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" onclick="entrevistar('${esc(e.RUT)}')">📋 Ficha / Entrevistar</button>
          <button class="btn btn-sm btn-secondary" onclick="abrirEditar('${esc(e.RUT)}')">✏️ Editar</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarPersona('${esc(e.RUT)}', 'Estudiante')">✖</button>
        </div>
      </td>
    </tr>`).join('');
  } catch (e) {
    console.error("Error loading students list:", e);
  }
}

// ══ DOCENTES ══
let docFuncInit = false;
async function initDocFiltros() {
  if (docFuncInit) return;
  try {
    const res = await fetch('/api/docentes');
    const all = await res.json();
    docFuncInit = true;
    const sel = document.getElementById('doc-func');
    const funcs = [...new Set(all.map(d => txt(d['Función/curso'])).filter(Boolean))].sort();
    funcs.forEach(f => {
      const o = document.createElement('option');
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    });
  } catch (e) {
    console.error("Error loading teacher function filters:", e);
  }
}

async function filtrarDoc() {
  const q = txt(document.getElementById('doc-q').value).toLowerCase();
  const func = document.getElementById('doc-func').value;
  try {
    const res = await fetch(`/api/docentes?q=${encodeURIComponent(q)}&func=${encodeURIComponent(func)}`);
    const rows = await res.json();
    rows.sort((a, b) => {
      const nameA = `${a.Nombres || ''} ${a['Apellido paterno'] || a['Apellido Paterno'] || ''} ${a['Apellido materno'] || a['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
      const nameB = `${b.Nombres || ''} ${b['Apellido paterno'] || b['Apellido Paterno'] || ''} ${b['Apellido materno'] || b['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
    
    document.getElementById('doc-count').textContent = `Mostrando ${rows.length} registros`;
    const tbody = document.querySelector('#tbl-doc tbody');
    tbody.innerHTML = rows.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No hay registros.</td></tr>' :
    rows.map(d => `<tr>
      <td><span class="rut">${esc(d.RUT)}</span></td>
      <td><strong>${esc(d.Nombres)}</strong></td>
      <td>${esc(txt(d['Apellido paterno']) + ' ' + txt(d['Apellido materno']))}</td>
      <td>${esc(d['Profesor de asignatura'] || 'General')}</td>
      <td>${esc(d['Función/curso'] || 'Docente')}</td>
      <td>${esc(d['Horas contrato'] || 0)} hrs</td>
      <td><span class="badge ${d['Estado/Idoneidad'] === 'OK' ? 'badge-ok' : 'badge-nook'}">${esc(d['Estado/Idoneidad'] || 'OK')}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" onclick="entrevistar('${esc(d.RUT)}')">📋 Ficha / Entrevistar</button>
          <button class="btn btn-sm btn-secondary" onclick="abrirEditar('${esc(d.RUT)}')">✏️ Editar</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarPersona('${esc(d.RUT)}', 'Docente')">✖</button>
        </div>
      </td>
    </tr>`).join('');
  } catch (e) {
    console.error("Error loading teachers list:", e);
  }
}

// ══ ASISTENTES ══
let asiFuncInit = false;
async function initAsiFiltros() {
  if (asiFuncInit) return;
  try {
    const res = await fetch('/api/asistentes');
    const all = await res.json();
    asiFuncInit = true;
    const sel = document.getElementById('asi-func');
    const funcs = [...new Set(all.map(d => txt(d['Función/curso'])).filter(Boolean))].sort();
    funcs.forEach(f => {
      const o = document.createElement('option');
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    });
  } catch(e) {
    console.error("Error loading assistant function filters:", e);
  }
}

async function filtrarAsi() {
  const q = txt(document.getElementById('asi-q').value).toLowerCase();
  const func = document.getElementById('asi-func').value;
  try {
    const res = await fetch(`/api/asistentes?q=${encodeURIComponent(q)}&func=${encodeURIComponent(func)}`);
    const rows = await res.json();
    
    document.getElementById('asi-count').textContent = `Mostrando ${rows.length} registros`;
    const tbody = document.querySelector('#tbl-asi tbody');
    tbody.innerHTML = rows.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No hay registros.</td></tr>' :
    rows.map(d => `<tr>
      <td><span class="rut">${esc(d.RUT)}</span></td>
      <td><strong>${esc(d.Nombres)}</strong></td>
      <td>${esc(txt(d['Apellido paterno']) + ' ' + txt(d['Apellido materno']))}</td>
      <td>${esc(d['Función/curso'] || 'Asistente')}</td>
      <td>${esc(d['Horas contrato'] || 0)} hrs</td>
      <td><span class="badge badge-ok">${esc(d['Estado/Idoneidad'] || 'HABILITADO')}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" onclick="entrevistar('${esc(d.RUT)}')">📋 Ficha / Entrevistar</button>
          <button class="btn btn-sm btn-secondary" onclick="abrirEditar('${esc(d.RUT)}')">✏️ Editar</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarPersona('${esc(d.RUT)}', 'Asistente')">✖</button>
        </div>
      </td>
    </tr>`).join('');
  } catch (e) {
    console.error("Error loading assistants list:", e);
  }
}

// ══ SELECTOR LOOKUP MODAL ══
function abrirLookup() {
  document.getElementById('modal-lookup').classList.add('open');
  filtrarLookup();
}

function cerrarLookup() {
  document.getElementById('modal-lookup').classList.remove('open');
}

async function filtrarLookup() {
  const q = txt(document.getElementById('l-q').value).toLowerCase();
  const f = document.getElementById('l-filtro').value;
  try {
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(q)}&filtro=${encodeURIComponent(f)}`);
    const rows = await res.json();
    
    const tbody = document.querySelector('#tbl-lookup tbody');
    tbody.innerHTML = rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No hay coincidencias.</td></tr>' :
    rows.map(p => {
      const rut = p.RUT;
      const name = [p.Nombres, p['Apellido Paterno'] || p['Apellido paterno'] || '', p['Apellido Materno'] || p['Apellido materno'] || ''].join(' ').trim().replace(/\s+/g,' ');
      const est = p.Cargo;
      const c = p.Curso || p['Función/curso'] || '';
      return `<tr>
        <td><span class="rut">${esc(rut)}</span></td>
        <td><strong>${esc(name)}</strong></td>
        <td><span class="badge ${est === 'Estudiante' ? 'badge-azul' : 'badge-verde'}">${esc(est)}</span></td>
        <td>${esc(c)}</td>
        <td><button class="btn btn-sm btn-primary" onclick="seleccionarPersona('${esc(rut)}')">Seleccionar</button></td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error("Error lookup:", e);
  }
}

function seleccionarPersona(rut) {
  document.getElementById('e-rut').value = rut;
  autocompletarEnt();
  cerrarLookup();
  toast('👤 Persona seleccionada');
}

// ══ EDIT PERSON MODAL ══
async function abrirEditar(rut) {
  try {
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(rut)}`);
    const results = await res.json();
    const p = results.find(x => txt(x.RUT).toUpperCase() === txt(rut).toUpperCase());
    if (!p) return;
    
    document.getElementById('edit-orig-rut').value = p.RUT;
    if (document.getElementById('edit-orig-edad')) {
      document.getElementById('edit-orig-edad').value = p.Edad || 0;
    }
    document.getElementById('edit-rut').value = p.RUT;
    document.getElementById('edit-nombres').value = p.Nombres;
    document.getElementById('edit-pat').value = p['Apellido paterno'] || p['Apellido Paterno'] || '';
    document.getElementById('edit-mat').value = p['Apellido materno'] || p['Apellido Materno'] || '';
    document.getElementById('edit-fnac').value = p['Fecha de nacimiento'] || p['Fecha de Nacimiento'] || '';
    document.getElementById('edit-cargo').value = p.Cargo;
    
    const estDivs = document.querySelectorAll('.div-edit-est');
    const perDivs = document.querySelectorAll('.div-edit-per');
    
    if (p.Cargo === 'Estudiante') {
      estDivs.forEach(d => d.style.display = 'flex');
      perDivs.forEach(d => d.style.display = 'none');
      document.getElementById('edit-curso').value = p.Curso || '';
      document.getElementById('edit-jefe').value = p['Profesor Jefe'] || '';
      document.getElementById('edit-estado-mat').value = p['Estado Matrícula'] || 'Vigente';
      await cargarAnotacionesEnModal(rut);
    } else {
      estDivs.forEach(d => d.style.display = 'none');
      perDivs.forEach(d => d.style.display = 'flex');
      document.getElementById('edit-func').value = p['Función/curso'] || '';
      document.getElementById('edit-horas').value = p['Horas Contrato'] || p['Horas contrato'] || 0;
      document.getElementById('edit-idoneidad').value = p['Estado/Idoneidad'] || 'OK';
    }
    
    await cargarEntrevistasEnModal(rut);
    document.getElementById('modal-editar').classList.add('open');
  } catch (e) {
    console.error("Error opening edit modal:", e);
  }
}

function cerrarEditar() {
  document.getElementById('modal-editar').classList.remove('open');
}

async function cargarEntrevistasEnModal(rut) {
  const tbody = document.querySelector('#tbl-edit-interviews tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--text-muted)">Cargando historial de entrevistas...</td></tr>';
  
  try {
    const res = await fetch('/api/entrevistas');
    const allEnts = await res.json();
    const userEnts = allEnts.filter(x => txt(x.rut).toUpperCase() === txt(rut).toUpperCase());
    
    if (userEnts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--text-muted)">No hay entrevistas registradas para esta persona.</td></tr>';
    } else {
      tbody.innerHTML = userEnts.map(e => `
        <tr>
          <td><span class="rut">${esc(e.id)}</span></td>
          <td>${esc(e.fecha)}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.objetivo)}">${esc(e.objetivo)}</td>
          <td>${esc(e.resp)}</td>
          <td><span class="badge ${estadoBadge(e.estado)}">${esc(e.estado)}</span></td>
          <td>
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-sm btn-secondary" onclick="cerrarEditar(); verReporte('${esc(e.id)}')">📄 Ver</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error("Error loading interviews in modal:", err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--danger)">Error al cargar historial.</td></tr>';
  }
}

function crearEntrevistaDesdeModal() {
  const rut = document.getElementById('edit-rut').value;
  cerrarEditar();
  entrevistar(rut);
}

async function guardarCambiosPersona() {
  const origRut = document.getElementById('edit-orig-rut').value;
  const cargo = document.getElementById('edit-cargo').value;
  const nom = document.getElementById('edit-nombres').value.trim();
  const pat = document.getElementById('edit-pat').value.trim();
  const mat = document.getElementById('edit-mat').value.trim();
  const fnac = document.getElementById('edit-fnac').value;
  
  if (!nom || !pat) {
    toast('⚠️ Nombre y Apellido Paterno son obligatorios');
    return;
  }
  
  let url = '';
  let payload = {};
  
  if (cargo === 'Estudiante') {
    let calculatedEdad = 0;
    if (fnac) {
      const fnDate = new Date(fnac);
      if (!isNaN(fnDate.getTime())) {
        const hoy = new Date();
        calculatedEdad = hoy.getFullYear() - fnDate.getFullYear();
        const m = hoy.getMonth() - fnDate.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fnDate.getDate())) calculatedEdad--;
      }
    } else if (document.getElementById('edit-orig-edad')) {
      calculatedEdad = Number(document.getElementById('edit-orig-edad').value) || 0;
    }
    
    url = '/api/estudiantes';
    payload = {
      RUT: origRut,
      Nombres: nom,
      "Apellido Paterno": pat,
      "Apellido Materno": mat,
      Curso: document.getElementById('edit-curso').value,
      "Profesor Jefe": document.getElementById('edit-jefe').value,
      "Fecha de Nacimiento": fnac,
      "Estado Matrícula": document.getElementById('edit-estado-mat').value,
      Edad: calculatedEdad
    };
  } else if (cargo === 'Docente') {
    url = '/api/docentes';
    payload = {
      RUT: origRut,
      Nombres: nom,
      "Apellido paterno": pat,
      "Apellido materno": mat,
      "Función/curso": document.getElementById('edit-func').value,
      "Horas contrato": Number(document.getElementById('edit-horas').value),
      "Estado/Idoneidad": document.getElementById('edit-idoneidad').value,
      "Profesor de asignatura": ""
    };
  } else {
    url = '/api/asistentes';
    payload = {
      RUT: origRut,
      Nombres: nom,
      "Apellido paterno": pat,
      "Apellido materno": mat,
      "Función/curso": document.getElementById('edit-func').value,
      "Horas contrato": Number(document.getElementById('edit-horas').value),
      "Estado/Idoneidad": document.getElementById('edit-idoneidad').value
    };
  }
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Registro actualizado');
      cerrarEditar();
      loadAllData();
      buscarGlobal();
      if (document.getElementById('pg-estudiantes').classList.contains('active')) filtrarEst();
      if (document.getElementById('pg-docentes').classList.contains('active')) filtrarDoc();
      if (document.getElementById('pg-asistentes').classList.contains('active')) filtrarAsi();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error saving person changes:", e);
    toast('❌ Error de conexión al servidor');
  }
}

async function eliminarPersona(rut, cargo) {
  if (!confirm(`¿Está seguro de eliminar este registro del sistema?`)) return;
  let url = '';
  if (cargo === 'Estudiante') url = `/api/estudiantes?rut=${encodeURIComponent(rut)}`;
  else if (cargo === 'Docente') url = `/api/docentes?rut=${encodeURIComponent(rut)}`;
  else url = `/api/asistentes?rut=${encodeURIComponent(rut)}`;
  
  try {
    const res = await fetch(url, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      toast('🗑️ Registro eliminado');
      loadAllData();
      buscarGlobal();
      if (cargo === 'Estudiante') filtrarEst();
      else if (cargo === 'Docente') filtrarDoc();
      else filtrarAsi();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error deleting person:", e);
    toast('❌ Error de conexión al servidor');
  }
}



// ══ ADMINISTRACIÓN ══
async function renderAdmin() {
  try {
    const res = await fetch('/api/administracion');
    localAdmin = await res.json();
    
    const tbody = document.querySelector('#tbl-admin tbody');
    tbody.innerHTML = localAdmin.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No hay documentos registrados localmente.</td></tr>' :
    localAdmin.map((a, i) => `<tr>
      <td>${esc(a.fecha)}</td>
      <td><span class="badge badge-azul">${esc(a.tipo)}</span></td>
      <td><strong>${esc(a.titulo)}</strong></td>
      <td>${esc(a.resp)}</td>
      <td><span class="badge ${a.estado === 'Finalizado' ? 'badge-verde' : (a.estado === 'En proceso' ? 'badge-naranja' : 'badge-rojo')}">${esc(a.estado)}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.descripcion)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="eliminarAdmin(${a.id})">🗑️</button></td>
    </tr>`).join('');
  } catch(e) {
    console.error("Error loading administration docs:", e);
  }
}

async function guardarAdmin() {
  const fecha = document.getElementById('a-fecha').value;
  const tipo = document.getElementById('a-tipo').value;
  const titulo = document.getElementById('a-titulo').value.trim();
  const resp = document.getElementById('a-resp').value.trim();
  const estado = document.getElementById('a-estado').value;
  const desc = document.getElementById('a-desc').value.trim();
  
  if (!fecha || !titulo || !resp) {
    toast('⚠️ Fecha, título y responsable son obligatorios');
    return;
  }
  
  const payload = { fecha, tipo, titulo, resp, estado, desc };
  try {
    const res = await fetch('/api/administracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Documento guardado');
      limpiarAdmin();
      renderAdmin();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error saving admin doc:", e);
    toast('❌ Error de conexión al servidor');
  }
}

async function eliminarAdmin(id) {
  if (!confirm('¿Eliminar este documento administrativo?')) return;
  try {
    const res = await fetch(`/api/administracion?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      toast('🗑️ Documento eliminado');
      renderAdmin();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error deleting admin doc:", e);
  }
}

function limpiarAdmin() {
  document.getElementById('a-titulo').value = '';
  document.getElementById('a-resp').value = '';
  document.getElementById('a-desc').value = '';
  document.getElementById('a-fecha').value = new Date().toISOString().slice(0, 10);
}

// ══ ENTREVISTAS ══
async function entrevistar(rut) {
  limpiarForm();
  document.getElementById('e-rut').value = rut;
  await autocompletarEnt();
  goTo('nueva-entrevista');
}

async function autocompletarEnt() {
  const rut = document.getElementById('e-rut').value.trim();
  if (!rut) return;
  try {
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(rut)}`);
    const results = await res.json();
    const p = results.find(x => txt(x.RUT).toUpperCase() === txt(rut).toUpperCase());
    if (!p) return;
    
    document.getElementById('e-nombre').value = [p.Nombres, p['Apellido Paterno'] || p['Apellido paterno'] || '', p['Apellido Materno'] || p['Apellido materno'] || ''].join(' ').trim().replace(/\s+/g, ' ');
    document.getElementById('e-cargo').value = txt(p.Cargo);
    document.getElementById('e-curso').value = txt(p.Curso || p['Función/curso'] || '');
    document.getElementById('e-jefe').value = txt(p['Profesor Jefe'] || p['Profesor jefe (curso)'] || 'No aplica');
    document.getElementById('e-asig').value = txt(p['Asignatura'] || p['Profesor de Asignatura'] || 'No aplica');
    document.getElementById('e-pie').value = txt(p['Profesor PIE'] || 'No aplica');
    await cargarHistorialCita(rut);
  } catch(e) {
    console.error("Error autocompleting:", e);
  }
}

async function guardarEntrevista() {
  const rut = document.getElementById('e-rut').value.trim();
  if (!rut) {
    toast('⚠️ Ingrese el RUT del entrevistado');
    return;
  }
  
  const privacidad = document.getElementById('e-privacidad').value;
  const adjunto = document.getElementById('e-adjunto').value.trim();
  let obsVal = document.getElementById('e-obs').value;
  
  obsVal = obsVal.replace(/\n\n\[CONFIDENCIAL:[^\]]+\]$/, '');
  obsVal = obsVal.replace(/\n\n\[ADJUNTO:[^\]]+\]$/, '');
  
  if (adjunto) {
    obsVal += `\n\n[ADJUNTO:${adjunto}]`;
  }
  
  if (privacidad === 'Confidencial') {
    let creador = sessionStorage.getItem('campanario_user') || 'admin';
    if (editandoEntrevistaId) {
      const originalEnt = entrevistas.find(x => x.id === editandoEntrevistaId);
      if (originalEnt) {
        const match = (originalEnt.obs || '').match(/\[CONFIDENCIAL:([^\]]+)\]$/);
        if (match) {
          creador = match[1];
        }
      }
    }
    obsVal += `\n\n[CONFIDENCIAL:${creador}]`;
  }

  const payload = {
    id: editandoEntrevistaId,
    rut,
    nombre: document.getElementById('e-nombre').value,
    cargo: document.getElementById('e-cargo').value,
    curso: document.getElementById('e-curso').value,
    jefe: document.getElementById('e-jefe').value,
    asig: document.getElementById('e-asig').value,
    pie: document.getElementById('e-pie').value,
    fecha: document.getElementById('e-fecha').value,
    hora: document.getElementById('e-hora').value,
    resp: document.getElementById('e-resp').value,
    estado: document.getElementById('e-estado').value,
    seguimiento: document.getElementById('e-seguimiento').value,
    objetivo: document.getElementById('e-objetivo').value,
    motivo: document.getElementById('e-motivo').value,
    acuerdos: document.getElementById('e-acuerdos').value,
    obs: obsVal
  };
  
  try {
    const res = await fetch('/api/entrevistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      if (editandoEntrevistaId) {
        toast('✅ Entrevista actualizada: ' + editandoEntrevistaId);
        editandoEntrevistaId = null;
        const btnSave = document.querySelector('#ent-btn-row button:first-child');
        if (btnSave) btnSave.innerHTML = '💾 Guardar entrevista';
      } else {
        toast('✅ Entrevista guardada: ' + result.id);
      }
      loadAllData();
      limpiarForm();
      goTo('historial');
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error saving interview:", e);
    toast('❌ Error de conexión al servidor');
  }
}

function previsualizar() {
  const ent = {
    id: editandoEntrevistaId || '(vista previa)',
    rut: document.getElementById('e-rut').value,
    nombre: document.getElementById('e-nombre').value,
    cargo: document.getElementById('e-cargo').value,
    curso: document.getElementById('e-curso').value,
    jefe: document.getElementById('e-jefe').value,
    asig: document.getElementById('e-asig').value,
    pie: document.getElementById('e-pie').value,
    fecha: document.getElementById('e-fecha').value,
    hora: document.getElementById('e-hora').value,
    resp: document.getElementById('e-resp').value,
    estado: document.getElementById('e-estado').value,
    seguimiento: document.getElementById('e-seguimiento').value,
    objetivo: document.getElementById('e-objetivo').value,
    motivo: document.getElementById('e-motivo').value,
    acuerdos: document.getElementById('e-acuerdos').value,
    obs: document.getElementById('e-obs').value,
    adjunto: document.getElementById('e-adjunto').value.trim()
  };
  document.getElementById('reporte').innerHTML = generarHtmlReporte(ent, true);
  
  const rptTitle = document.querySelector('#pg-reporte .card-title');
  if (rptTitle) {
    rptTitle.textContent = '📄 Vista de Ficha Oficial de Entrevista';
  }
  
  const backBtn = document.querySelector('#pg-reporte .btn-secondary');
  if (backBtn) {
    backBtn.textContent = '⬅ Volver a Formulario';
    backBtn.onclick = () => goTo('nueva-entrevista');
  }
  
  goTo('reporte');
}

function limpiarForm() {
  ['e-rut', 'e-nombre', 'e-cargo', 'e-curso', 'e-jefe', 'e-asig', 'e-pie', 'e-resp', 'e-objetivo', 'e-motivo', 'e-acuerdos', 'e-obs', 'e-adjunto'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('e-estado').value = 'Abierta';
  const priv = document.getElementById('e-privacidad');
  if (priv) priv.value = 'Publica';
  document.getElementById('e-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('e-hora').value = new Date().toTimeString().slice(0, 5);
  document.getElementById('e-seguimiento').value = '';
  
  const prevSessionId = multiviewSessionId;
  
  editandoEntrevistaId = null;
  const btnSave = document.querySelector('#ent-btn-row button:first-child');
  if (btnSave) btnSave.innerHTML = '💾 Guardar entrevista';
  
  const card = document.getElementById('e-historial-card');
  if (card) card.style.display = 'none';
  
  if (multiviewInterval) {
    clearInterval(multiviewInterval);
    multiviewInterval = null;
  }
  multiviewSessionId = null;
  
  // Limpiar el hash de edición si está presente
  if (window.location.hash.startsWith('#nueva-entrevista?')) {
    window.location.hash = 'nueva-entrevista';
  }
  
  if (prevSessionId) {
    terminarTransmisionMultivista(prevSessionId);
  }
}

function parseObsMetadata(obsText) {
  let cleanObs = obsText || '';
  let creador = null;
  let adjunto = null;
  
  // Buscar y extraer [CONFIDENCIAL:username]
  const confMatch = cleanObs.match(/\[CONFIDENCIAL:([^\]]+)\]/);
  if (confMatch) {
    creador = confMatch[1];
    cleanObs = cleanObs.replace(/\n\n\[CONFIDENCIAL:[^\]]+\]/, '').replace(/\[CONFIDENCIAL:[^\]]+\]/, '');
  }
  
  // Buscar y extraer [ADJUNTO:url]
  const adjMatch = cleanObs.match(/\[ADJUNTO:([^\]]+)\]/);
  if (adjMatch) {
    adjunto = adjMatch[1];
    cleanObs = cleanObs.replace(/\n\n\[ADJUNTO:[^\]]+\]/, '').replace(/\[ADJUNTO:[^\]]+\]/, '');
  }
  
  return { obs: cleanObs.trim(), creador, adjunto };
}

function llenarReporte(e) {
  document.getElementById('r-id').textContent = e.id || '';
  document.getElementById('r-fecha').textContent = txt(e.fecha) + ' ' + txt(e.hora);
  document.getElementById('r-rut').textContent = e.rut || '';
  document.getElementById('r-cargo').textContent = e.cargo || '';
  document.getElementById('r-nombre').textContent = e.nombre || '';
  document.getElementById('r-curso').textContent = e.curso || '';
  document.getElementById('r-jefe').textContent = e.jefe || '';
  document.getElementById('r-asig').textContent = e.asig || '';
  document.getElementById('r-pie').textContent = e.pie || '';
  document.getElementById('r-resp').textContent = e.resp || '';
  document.getElementById('r-obj').textContent = e.objetivo || '';
  document.getElementById('r-mot').textContent = e.motivo || '';
  document.getElementById('r-acu').textContent = e.acuerdos || '';
  document.getElementById('r-seg').textContent = e.seguimiento || 'No fijado';
  document.getElementById('r-estado').textContent = e.estado || '';
  
  const meta = parseObsMetadata(e.obs);
  document.getElementById('r-obs').textContent = meta.obs;
  
  // Handle documentation / attachment link
  const adjunto = e.adjunto || meta.adjunto;
  const adjRow = document.getElementById('r-adjunto-row');
  const adjLink = document.getElementById('r-adjunto-link');
  if (adjRow && adjLink) {
    if (adjunto) {
      adjLink.href = adjunto;
      adjRow.style.display = 'grid';
    } else {
      adjRow.style.display = 'none';
    }
  }
}

// ══ HISTORIAL ══
function toggleGroupRow(groupId) {
  const rows = document.querySelectorAll('.' + groupId);
  const arrow = document.getElementById('arrow-' + groupId);
  
  rows.forEach(row => {
    if (row.style.display === 'none') {
      row.style.display = 'table-row';
    } else {
      row.style.display = 'none';
    }
  });
  
  if (arrow) {
    if (arrow.style.transform === 'rotate(90deg)') {
      arrow.style.transform = 'rotate(0deg)';
    } else {
      arrow.style.transform = 'rotate(90deg)';
    }
  }
}

async function filtrarHistorial() {
  const q = txt(document.getElementById('hist-q').value).toLowerCase();
  const est = document.getElementById('hist-estado').value;
  try {
    const res = await fetch(`/api/entrevistas?q=${encodeURIComponent(q)}&estado=${encodeURIComponent(est)}`);
    entrevistas = await res.json();
    
    const tbody = document.querySelector('#tbl-hist tbody');
    if (entrevistas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">No hay entrevistas guardadas.</td></tr>';
      return;
    }
    
    // Group interviews by RUT
    const grouped = {};
    entrevistas.forEach(e => {
      const key = txt(e.rut).toUpperCase();
      if (!grouped[key]) {
        grouped[key] = {
          rut: e.rut,
          nombre: e.nombre,
          cargo: e.cargo,
          curso: e.curso,
          items: []
        };
      }
      grouped[key].items.push(e);
    });
    
    const isSearchActive = !!q;
    let html = '';
    
    Object.values(grouped).forEach((group, index) => {
      const total = group.items.length;
      const cleanRut = group.rut.replace(/[^a-zA-Z0-9]/g, '');
      const uniqueId = `group-${cleanRut}-${index}`;
      
      // Order items by date/id descending (latest first)
      group.items.sort((a, b) => b.id.localeCompare(a.id));
      
      // Child Rows (visible if search is active)
      const displayStyle = isSearchActive ? 'table-row' : 'none';
      const arrowTransform = isSearchActive ? 'rotate(90deg)' : 'rotate(0deg)';
      
      // Parent Row
      html += `
        <tr class="group-header" onclick="toggleGroupRow('${uniqueId}')" style="background-color: var(--bg-hover, #f8fafc); cursor: pointer; font-weight: 600;">
          <td style="width: 65px; text-align: center;" onclick="event.stopPropagation();">
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span class="toggle-arrow" id="arrow-${uniqueId}" style="transition: transform 0.2s; display: inline-block; transform: ${arrowTransform}; font-size: 11px; color: var(--text-muted); cursor: pointer;" onclick="toggleGroupRow('${uniqueId}')">▶</span>
              <input type="checkbox" class="group-chk" data-group="${uniqueId}" onchange="seleccionarGrupo('${uniqueId}', this.checked)" style="cursor: pointer; width: 14px; height: 14px;">
            </div>
          </td>
          <td><span class="rut">${esc(group.rut)}</span></td>
          <td><strong>${esc(group.nombre)}</strong></td>
          <td colspan="3" style="color: var(--text-muted); font-size: 13px;">
            ${esc(group.cargo || 'Estudiante')} ${group.curso ? `(${esc(group.curso)})` : ''}
          </td>
          <td>
            <span class="badge badge-azul" style="background-color: rgba(99, 102, 241, 0.1); color: var(--primary); font-weight:600;">
              ${total} ${total === 1 ? 'entrevista' : 'entrevistas'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); entrevistar('${esc(group.rut)}')">📋 Ficha / Entrevistar</button>
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); imprimirTodasDePersona('${esc(group.rut)}')">🖨️ Imprimir todas</button>
            </div>
          </td>
        </tr>
      `;
      
      // Child Rows
      group.items.forEach(e => {
        html += `
          <tr class="${uniqueId}" style="display: ${displayStyle}; background-color: #ffffff;">
            <td style="text-align: center;" onclick="event.stopPropagation();">
              <input type="checkbox" class="print-chk" data-id="${esc(e.id)}" onchange="actualizarBotonImprimirSeleccionadas()" style="cursor: pointer; width: 14px; height: 14px;">
            </td>
            <td><span class="rut" style="font-size: 12px; color: var(--text-secondary);">${esc(e.id)}</span></td>
            <td style="font-size: 12px; color: var(--text-secondary);">📅 ${esc(e.fecha)}</td>
            <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(e.objetivo)}">
              ${esc(e.objetivo)}
            </td>
            <td style="font-size: 12px; color: var(--text-secondary);">${esc(e.resp)}</td>
            <td><span class="badge ${estadoBadge(e.estado)}">${esc(e.estado)}</span></td>
            <td colspan="2">
              <div style="display:flex; gap:4px; justify-content: flex-end;">
                <button class="btn btn-sm btn-secondary" onclick="verReporte('${esc(e.id)}')">📄 Ver</button>
                <button class="btn btn-sm btn-secondary" onclick="cargarEntrevistaParaEditar('${esc(e.id)}')">✏️ Editar</button>
                <button class="btn btn-sm btn-danger" onclick="eliminarEnt('${esc(e.id)}')">✖</button>
              </div>
            </td>
          </tr>
        `;
      });
    });
    
    tbody.innerHTML = html;
    actualizarBotonImprimirSeleccionadas();
  } catch(e) {
    console.error("Error loading interview history:", e);
  }
}

function estadoBadge(e) {
  if (e === 'Abierta') return 'badge-azul';
  if (e === 'En seguimiento') return 'badge-naranja';
  if (e === 'Cerrada') return 'badge-verde';
  if (e === 'Derivada') return 'badge-rojo';
  return 'badge-gris';
}

let confidencialResolve = null;

function cerrarModalConfidencial() {
  document.getElementById('modal-confidencial').classList.remove('open');
  if (confidencialResolve) {
    confidencialResolve(false);
    confidencialResolve = null;
  }
}

function handleConfidencialKeydown(e) {
  if (e.key === 'Enter') {
    confirmarClaveConfidencial();
  }
}

async function confirmarClaveConfidencial() {
  const clave = document.getElementById('confidencial-input').value;
  if (!clave) {
    toast("⚠️ Ingrese la contraseña");
    return;
  }
  
  const modal = document.getElementById('modal-confidencial');
  const creador = modal.getAttribute('data-creador');
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creador, password: clave })
    });
    const data = await res.json();
    if (data && data.success) {
      toast("🔑 Contraseña correcta. Acceso concedido.");
      document.getElementById('modal-confidencial').classList.remove('open');
      if (confidencialResolve) {
        confidencialResolve(true);
        confidencialResolve = null;
      }
    } else {
      toast("❌ Contraseña incorrecta");
      const inp = document.getElementById('confidencial-input');
      inp.value = '';
      inp.focus();
    }
  } catch (err) {
    console.error("Error al verificar contraseña de confidencialidad:", err);
    toast("❌ Error de red");
  }
}

function mostrarPromptConfidencial(creador) {
  return new Promise((resolve) => {
    confidencialResolve = resolve;
    
    const modal = document.getElementById('modal-confidencial');
    modal.setAttribute('data-creador', creador);
    document.getElementById('confidencial-msg').innerHTML = `Esta entrevista es confidencial. Solo la puede ver el usuario <strong>'${creador}'</strong> (o ingresando su contraseña).<br><br>Por favor, ingrese la contraseña de <strong>'${creador}'</strong> para continuar:`;
    document.getElementById('confidencial-label').textContent = `Contraseña de ${creador}`;
    
    const inp = document.getElementById('confidencial-input');
    inp.value = '';
    
    modal.classList.add('open');
    setTimeout(() => inp.focus(), 100);
  });
}

async function verificarAccesoEntrevista(e) {
  const meta = parseObsMetadata(e.obs);
  if (!meta.creador) {
    return true;
  }
  
  const currentUser = sessionStorage.getItem('campanario_user');
  if (currentUser === meta.creador) {
    return true;
  }
  
  return await mostrarPromptConfidencial(meta.creador);
}

function verReporte(id) {
  window.location.hash = 'reporte?id=' + id;
}

function cargarEntrevistaParaEditar(id) {
  window.location.hash = 'nueva-entrevista?edit=' + id;
}

async function cargarEntrevistaParaEditarDirecto(id) {
  let e = entrevistas.find(x => x.id === id);
  if (!e) {
    try {
      const res = await fetch(`/api/entrevistas`);
      const list = await res.json();
      e = list.find(x => x.id === id);
    } catch(err) {
      console.error("Error loading interview for edit:", err);
    }
  }
  if (!e) return;
  
  const tieneAcceso = await verificarAccesoEntrevista(e);
  if (!tieneAcceso) {
    goTo('historial');
    return;
  }
  
  editandoEntrevistaId = id;
  
  document.getElementById('e-rut').value = e.rut;
  document.getElementById('e-nombre').value = e.nombre;
  document.getElementById('e-cargo').value = e.cargo;
  document.getElementById('e-curso').value = e.curso;
  document.getElementById('e-jefe').value = e.jefe;
  document.getElementById('e-asig').value = e.asig;
  document.getElementById('e-pie').value = e.pie;
  document.getElementById('e-fecha').value = e.fecha;
  document.getElementById('e-hora').value = e.hora;
  document.getElementById('e-resp').value = e.resp;
  document.getElementById('e-estado').value = e.estado;
  document.getElementById('e-seguimiento').value = e.seguimiento || '';
  document.getElementById('e-objetivo').value = e.objetivo;
  document.getElementById('e-motivo').value = e.motivo;
  document.getElementById('e-acuerdos').value = e.acuerdos;
  
  const meta = parseObsMetadata(e.obs);
  document.getElementById('e-obs').value = meta.obs;
  document.getElementById('e-adjunto').value = meta.adjunto || '';
  
  if (meta.creador) {
    document.getElementById('e-privacidad').value = 'Confidencial';
  } else {
    document.getElementById('e-privacidad').value = 'Publica';
  }
  
  const btnSave = document.querySelector('#ent-btn-row button:first-child');
  if (btnSave) btnSave.innerHTML = '💾 Actualizar entrevista';
  
  cargarHistorialCita(e.rut);
  
  // Mostrar la tarjeta de participantes e inicializar sus datos
  const partCard = document.getElementById('e-participantes-card');
  if (partCard) partCard.style.display = 'block';
  cargarUsuariosInviteSelect();
  cargarParticipantesEdit(id);
  
  toast(`✏️ Cargada entrevista ${id} para edición`);
}

async function eliminarEnt(id) {
  const e = entrevistas.find(x => x.id === id);
  if (!e) return;
  
  const tieneAcceso = await verificarAccesoEntrevista(e);
  if (!tieneAcceso) return;

  if (!confirm('¿Eliminar entrevista ' + id + '?')) return;
  try {
    const res = await fetch(`/api/entrevistas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      toast('🗑️ Entrevista eliminada');
      loadAllData();
      filtrarHistorial();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error deleting interview:", e);
    toast('❌ Error al eliminar entrevista');
  }
}

// ══ AGREGAR PERSONA ══
function switchTab(id, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-est').style.display = id === 'tab-est' ? 'block' : 'none';
  document.getElementById('tab-per').style.display = id === 'tab-per' ? 'block' : 'none';
}

async function agregarEstudiante() {
  const rut = document.getElementById('n-rut').value.trim();
  const nom = document.getElementById('n-nombres').value.trim();
  const pat = document.getElementById('n-pat').value.trim();
  const mat = document.getElementById('n-mat').value.trim();
  const curso = document.getElementById('n-curso').value.trim();
  
  if (!rut || !nom || !pat || !curso) {
    toast('⚠️ RUT, Nombres, Apellido Paterno y Curso son obligatorios');
    return;
  }
  
  const fnacVal = document.getElementById('n-fnac').value;
  let calculatedEdad = 0;
  if (fnacVal) {
    const fnDate = new Date(fnacVal);
    if (!isNaN(fnDate.getTime())) {
      const hoy = new Date();
      calculatedEdad = hoy.getFullYear() - fnDate.getFullYear();
      const m = hoy.getMonth() - fnDate.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < fnDate.getDate())) calculatedEdad--;
    }
  }

  const payload = {
    RUT: rut, Nombres: nom, 'Apellido Paterno': pat, 'Apellido Materno': mat,
    Cargo: 'Estudiante', Curso: curso, 'Profesor Jefe': document.getElementById('n-jefe').value.trim(),
    'Fecha de Nacimiento': fnacVal,
    'Estado Matrícula': document.getElementById('n-estado').value, Edad: calculatedEdad,
    Anotaciones: document.getElementById('n-anotaciones').value.trim()
  };
  
  try {
    const res = await fetch('/api/estudiantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Estudiante agregado');
      ['n-rut', 'n-nombres', 'n-pat', 'n-mat', 'n-curso', 'n-jefe', 'n-fnac', 'n-anotaciones'].forEach(id => {
        document.getElementById(id).value = '';
      });
      loadAllData();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error adding student:", e);
    toast('❌ Error de conexión al de servidor');
  }
}

async function agregarPersonal() {
  const rut = document.getElementById('p-rut').value.trim();
  const nom = document.getElementById('p-nombres').value.trim();
  const pat = document.getElementById('p-pat').value.trim();
  const mat = document.getElementById('p-mat').value.trim();
  const cargo = document.getElementById('p-cargo').value;
  
  if (!rut || !nom || !pat) {
    toast('⚠️ RUT, Nombres y Apellido Paterno son obligatorios');
    return;
  }
  
  const payload = {
    RUT: rut, Nombres: nom, 'Apellido paterno': pat, 'Apellido materno': mat,
    Cargo: cargo, 'Función/curso': document.getElementById('p-func').value.trim(),
    'Horas contrato': Number(document.getElementById('p-horas').value || 0),
    'Fecha de nacimiento': document.getElementById('p-fnac').value,
    'Estado/Idoneidad': 'OK'
  };
  
  const url = cargo === 'Docente' ? '/api/docentes' : '/api/asistentes';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Funcionario agregado');
      ['p-rut', 'p-nombres', 'p-pat', 'p-mat', 'p-func', 'p-horas', 'p-fnac'].forEach(id => {
        document.getElementById(id).value = '';
      });
      loadAllData();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch(e) {
    console.error("Error adding personnel:", e);
    toast('❌ Error de conexión al servidor');
  }
}

// ══ EXPORT / BACKUP ══
async function exportarDatos() {
  try {
    const entsRes = await fetch('/api/entrevistas');
    const estsRes = await fetch('/api/estudiantes');
    const docsRes = await fetch('/api/docentes');
    const asisRes = await fetch('/api/asistentes');
    const admRes = await fetch('/api/administracion');
    
    const data = {
      entrevistas: await entsRes.json(),
      estudiantes: await estsRes.json(),
      docentes: await docsRes.json(),
      asistentes: await asisRes.json(),
      administracion: await admRes.json(),
      exportado: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'respaldo_sqlite_campanario_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    toast('💾 Datos exportados correctamente');
  } catch(e) {
    console.error("Error exporting data:", e);
    toast('❌ Error al exportar base de datos');
  }
}

// ══ LOGIN / LOGOUT ══
async function login() {
  const u = (document.getElementById('login-user') || {}).value || '';
  const p = (document.getElementById('login-pass') || {}).value || '';
  
  if (!u.trim() || !p) {
    toast('⚠️ Ingrese usuario y contraseña');
    return;
  }
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u.trim().toLowerCase(), password: p })
    });
    const data = await res.json();
    if (data.success) {
      document.body.classList.remove('login-active');
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app-shell');
      if (loginScreen) {
        loginScreen.style.display = 'none';
        loginScreen.style.visibility = 'hidden';
        loginScreen.style.pointerEvents = 'none';
      }
      if (appShell) {
        appShell.style.display = 'block';
      }
      try {
        sessionStorage.setItem('campanario_login', '1');
        sessionStorage.setItem('campanario_user', data.username);
        sessionStorage.setItem('campanario_perfil', data.perfil);
        sessionStorage.setItem('campanario_nombre', data.nombre);
      } catch (e) {}
      
      aplicarPermisos(data.perfil);
      
      setTimeout(() => {
        loadAllData();
        buscarGlobal();
        bindRutMasks();
        verificarNotificaciones();
      }, 100);
    } else {
      const err = document.getElementById('login-error');
      if (err) {
        err.textContent = data.error || 'Usuario o contraseña incorrectos.';
        err.style.display = 'block';
      }
    }
  } catch (e) {
    console.error("Error login:", e);
    toast('❌ Error de conexión al servidor');
  }
}

function logout() {
  try {
    sessionStorage.removeItem('campanario_login');
    sessionStorage.removeItem('campanario_user');
    sessionStorage.removeItem('campanario_perfil');
    sessionStorage.removeItem('campanario_nombre');
  } catch (e) {}
  document.body.classList.add('login-active');
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  if (loginScreen) {
    loginScreen.style.display = 'flex';
    loginScreen.style.visibility = 'visible';
    loginScreen.style.pointerEvents = 'auto';
  }
  if (appShell) {
    appShell.style.display = 'none';
  }
}

function togglePass() {
  const p = document.getElementById('login-pass');
  if (p) {
    p.type = p.type === 'password' ? 'text' : 'password';
  }
}

function aplicarPermisos(perfil) {
  const navConfig = document.getElementById('nav-config');
  if (navConfig) {
    if (perfil === 'Administrador') {
      navConfig.style.display = 'flex';
    } else {
      navConfig.style.display = 'none';
    }
  }
  
  const userBadgeSpan = document.querySelector('.user-info .user-badge span');
  if (userBadgeSpan) {
    userBadgeSpan.textContent = perfil || 'Entrevistador';
  }
  const userAvatar = document.querySelector('.user-info .user-avatar');
  if (userAvatar && sessionStorage.getItem('campanario_nombre')) {
    const nom = sessionStorage.getItem('campanario_nombre');
    userAvatar.textContent = nom.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.body.classList.contains('login-active')) {
    login();
  }
});

// ══ GESTIÓN DE CONFIGURACIÓN (USUARIOS CRUD) ══
let listaPersonalGlobal = [];
async function renderConfiguracion() {
  try {
    const resUsers = await fetch('/api/usuarios');
    const usuarios = await resUsers.json();
    
    const tbody = document.querySelector('#tbl-usuarios tbody');
    tbody.innerHTML = usuarios.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No hay credenciales activas creadas.</td></tr>' :
    usuarios.map(u => `<tr>
      <td><strong style="color:var(--primary)">${esc(u.username)}</strong></td>
      <td>${esc(u.nombre)}</td>
      <td><span class="rut">${esc(u.rut || 'No aplica')}</span></td>
      <td><span class="badge ${u.perfil === 'Administrador' ? 'badge-azul' : 'badge-verde'}">${esc(u.perfil)}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:8px">
          <input type="password" value="${esc(u.password)}" readonly class="pwd-field" id="pwd-${esc(u.username)}" style="background:transparent; border:0; color:var(--text-primary); font-family:monospace; font-size:13px; width:70px">
          <button class="btn btn-sm" onclick="togglePwdVisibility('${esc(u.username)}')" type="button" style="padding:2px 6px">👁️</button>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:4px">
          <button class="btn btn-sm btn-primary" onclick="cargarUsuarioParaEditar('${esc(u.username)}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarUsuario('${esc(u.username)}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
    
    const resDocs = await fetch('/api/docentes');
    const docs = await resDocs.json();
    const resAsis = await fetch('/api/asistentes');
    const asis = await resAsis.json();
    
    listaPersonalGlobal = [];
    docs.forEach(d => {
      listaPersonalGlobal.push({
        rut: d.RUT,
        nombre: `${d.Nombres} ${d['Apellido paterno'] || d['Apellido Paterno'] || ''} ${d['Apellido materno'] || d['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' '),
        cargo: 'Docente'
      });
    });
    asis.forEach(a => {
      listaPersonalGlobal.push({
        rut: a.RUT,
        nombre: `${a.Nombres} ${a['Apellido paterno'] || a['Apellido Paterno'] || ''} ${a['Apellido materno'] || a['Apellido Materno'] || ''}`.trim().replace(/\s+/g, ' '),
        cargo: 'Asistente'
      });
    });
    
    listaPersonalGlobal.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    
    const select = document.getElementById('u-personal');
    const valAnterior = select.value;
    select.innerHTML = '<option value="">-- Ingresar datos personalizados (Sin vincular) --</option>' +
      listaPersonalGlobal.map(p => `<option value="${esc(p.rut)}">${esc(p.nombre)} (${esc(p.cargo)})</option>`).join('');
    select.value = valAnterior;
  } catch (e) {
    console.error("Error renderConfiguracion:", e);
  }
}

function togglePwdVisibility(username) {
  const input = document.getElementById('pwd-' + username);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

function seleccionarFuncionarioUsuario() {
  const rutSelected = document.getElementById('u-personal').value;
  if (!rutSelected) {
    document.getElementById('u-nombre').value = '';
    document.getElementById('u-rut').value = '';
    document.getElementById('u-nombre').readOnly = false;
    document.getElementById('u-rut').readOnly = false;
    return;
  }
  const p = listaPersonalGlobal.find(x => x.rut === rutSelected);
  if (p) {
    document.getElementById('u-nombre').value = p.nombre;
    document.getElementById('u-rut').value = p.rut;
    document.getElementById('u-nombre').readOnly = true;
    document.getElementById('u-rut').readOnly = true;
  }
}

function generarClaveUsuario() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('u-password').value = password;
  toast('⚡ Contraseña aleatoria generada');
}

async function guardarUsuario() {
  const username = document.getElementById('u-username').value.trim().toLowerCase();
  const nombre = document.getElementById('u-nombre').value.trim();
  const rut = document.getElementById('u-rut').value.trim();
  const password = document.getElementById('u-password').value;
  const perfil = document.getElementById('u-perfil').value;
  
  if (!username || !nombre || !password) {
    toast('⚠️ Complete usuario, nombre y contraseña');
    return;
  }
  
  const payload = { username, nombre, rut, password, perfil };
  try {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Credencial guardada correctamente');
      limpiarFormUsuario();
      renderConfiguracion();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch (e) {
    console.error("Error guardarUsuario:", e);
    toast('❌ Error de conexión al servidor');
  }
}

async function eliminarUsuario(username) {
  if (username === 'admin') {
    toast('⚠️ No se puede eliminar al Administrador Principal');
    return;
  }
  if (sessionStorage.getItem('campanario_user') === username) {
    toast('⚠️ No puedes eliminar tu propio usuario actual');
    return;
  }
  if (!confirm(`¿Está seguro de eliminar el acceso para el usuario "${username}"?`)) return;
  
  try {
    const res = await fetch(`/api/usuarios?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      toast('🗑️ Usuario eliminado');
      renderConfiguracion();
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch (e) {
    console.error("Error eliminarUsuario:", e);
  }
}

async function cargarUsuarioParaEditar(username) {
  try {
    const res = await fetch('/api/usuarios');
    const list = await res.json();
    const u = list.find(x => x.username === username);
    if (u) {
      document.getElementById('u-username').value = u.username;
      document.getElementById('u-username').readOnly = true;
      document.getElementById('u-nombre').value = u.nombre;
      document.getElementById('u-rut').value = u.rut || '';
      document.getElementById('u-password').value = u.password;
      document.getElementById('u-perfil').value = u.perfil;
      document.getElementById('u-personal').value = u.rut || '';
      
      if (u.rut) {
        document.getElementById('u-nombre').readOnly = true;
        document.getElementById('u-rut').readOnly = true;
      } else {
        document.getElementById('u-nombre').readOnly = false;
        document.getElementById('u-rut').readOnly = false;
      }
      
      toast(`✏️ Cargado usuario "${username}" para edición`);
    }
  } catch (e) {
    console.error("Error cargarUsuarioParaEditar:", e);
  }
}

function limpiarFormUsuario() {
  document.getElementById('u-username').value = '';
  document.getElementById('u-username').readOnly = false;
  document.getElementById('u-nombre').value = '';
  document.getElementById('u-nombre').readOnly = false;
  document.getElementById('u-rut').value = '';
  document.getElementById('u-rut').readOnly = false;
  document.getElementById('u-password').value = '';
  document.getElementById('u-perfil').value = 'Entrevistador';
  document.getElementById('u-personal').value = '';
}

// Auto-login restoration
try {
  if (sessionStorage.getItem('campanario_login') === '1') {
    document.body.classList.remove('login-active');
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app-shell');
    if (loginScreen) {
      loginScreen.style.display = 'none';
      loginScreen.style.visibility = 'hidden';
      loginScreen.style.pointerEvents = 'none';
    }
    if (appShell) {
      appShell.style.display = 'block';
    }
    aplicarPermisos(sessionStorage.getItem('campanario_perfil'));
  }
} catch (e) {}

// Initializations
document.getElementById('e-fecha').value = new Date().toISOString().slice(0, 10);
document.getElementById('e-hora').value = new Date().toTimeString().slice(0, 5);
document.getElementById('a-fecha').value = new Date().toISOString().slice(0, 10);

// Bind blur events for course homeroom teacher auto-detection
const nCursoEl = document.getElementById('n-curso');
if (nCursoEl) {
  nCursoEl.addEventListener('blur', () => updateJefeForCurso('n-curso', 'n-jefe'));
}
const editCursoEl = document.getElementById('edit-curso');
if (editCursoEl) {
  editCursoEl.addEventListener('blur', () => updateJefeForCurso('edit-curso', 'edit-jefe'));
}

setTimeout(() => {
  loadAllData();
  buscarGlobal();
  bindRutMasks();
  verificarNotificaciones();
  
  // Navegar a la página inicial cargada en el hash
  const initialPage = window.location.hash.slice(1) || 'inicio';
  goTo(initialPage);
}, 250);

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1) || 'inicio';
  goTo(hash);
});

async function cargarHistorialCita(rut) {
  const card = document.getElementById('e-historial-card');
  const tbody = document.querySelector('#tbl-e-historial tbody');
  if (!card || !tbody) return;
  
  if (!rut) {
    card.style.display = 'none';
    return;
  }
  
  try {
    const res = await fetch('/api/entrevistas');
    const allEnts = await res.json();
    
    // Filtrar por RUT (todas las entrevistas de este estudiante/funcionario)
    const userEnts = allEnts.filter(x => txt(x.rut).toUpperCase() === txt(rut).toUpperCase());
    
    if (userEnts.length === 0) {
      card.style.display = 'none';
    } else {
      card.style.display = 'block';
      tbody.innerHTML = userEnts.map(e => {
        const esActual = e.id === editandoEntrevistaId;
        return `
          <tr style="${esActual ? 'background-color: rgba(99, 102, 241, 0.08); font-weight: 500;' : ''}">
            <td><span class="rut">${esc(e.id)} ${esActual ? '📝 <span style="font-size:11px;color:var(--primary);font-weight:600;">(actual)</span>' : ''}</span></td>
            <td>${esc(e.fecha)}</td>
            <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.objetivo)}">${esc(e.objetivo)}</td>
            <td>${esc(e.resp)}</td>
            <td><span class="badge ${estadoBadge(e.estado)}">${esc(e.estado)}</span></td>
            <td>
              <div style="display:flex;gap:4px">
                <button type="button" class="btn btn-sm btn-secondary" onclick="verReporte('${esc(e.id)}')">📄 Ver</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="imprimirReporteIndividual('${esc(e.id)}')">🖨️ Imprimir</button>
                ${esActual ? '<span style="color:var(--text-muted);font-size:12px;padding:4px 8px;font-style:italic;">Editando</span>' : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Error loading interview history on citation form:", err);
  }
}

function crearOtraEntrevistaDesdeForm() {
  const rut = document.getElementById('e-rut').value.trim();
  if (!rut) return;
  limpiarForm();
  document.getElementById('e-rut').value = rut;
  autocompletarEnt();
  toast('📝 Iniciando nueva entrevista para el mismo RUT');
}

async function abrirMultivistaModal() {
  if (!multiviewSessionId) {
    multiviewSessionId = 'MVT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  
  try {
    const res = await fetch('/api/multivista/info');
    const info = await res.json();
    
    let url;
    if (info.url) {
      url = info.url;
    } else {
      const localIp = info.ip || 'localhost';
      const port = info.port || 8080;
      url = `http://${localIp}:${port}/multiview.html?session=${multiviewSessionId}`;
    }
    
    document.getElementById('multivista-link').value = url;
    document.getElementById('multivista-qr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" alt="Código QR" style="max-width:100%; height:auto; display:block;">`;
    
    document.getElementById('modal-multivista').classList.add('open');
    
    // Iniciar transmisión en vivo
    iniciarTransmisionMultivista();
  } catch (err) {
    console.error("Error al inicializar multivista:", err);
    toast("❌ Error al inicializar multivista");
  }
}

function cerrarMultivistaModal() {
  document.getElementById('modal-multivista').classList.remove('open');
}

function copiarMultivistaLink() {
  const input = document.getElementById('multivista-link');
  input.select();
  document.execCommand('copy');
  toast('📋 Enlace copiado al portapapeles');
}

function iniciarTransmisionMultivista() {
  if (multiviewInterval) clearInterval(multiviewInterval);
  
  transmitirEstadoMultivista();
  multiviewInterval = setInterval(transmitirEstadoMultivista, 1500);
}

async function transmitirEstadoMultivista() {
  if (!multiviewSessionId) return;
  
  const payload = {
    sessionId: multiviewSessionId,
    rut: document.getElementById('e-rut').value,
    nombre: document.getElementById('e-nombre').value,
    cargo: document.getElementById('e-cargo').value,
    curso: document.getElementById('e-curso').value,
    jefe: document.getElementById('e-jefe').value,
    asig: document.getElementById('e-asig').value,
    pie: document.getElementById('e-pie').value,
    fecha: document.getElementById('e-fecha').value,
    hora: document.getElementById('e-hora').value,
    resp: document.getElementById('e-resp').value,
    estado: document.getElementById('e-estado').value,
    seguimiento: document.getElementById('e-seguimiento').value,
    objetivo: document.getElementById('e-objetivo').value,
    motivo: document.getElementById('e-motivo').value,
    acuerdos: document.getElementById('e-acuerdos').value,
    obs: document.getElementById('e-obs').value
  };
  
  try {
    await fetch('/api/multivista/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Error transmitting multiview:", err);
  }
}

// ── IMPRESIÓN Y REPORTES DE ENTREVISTAS ──
function tieneAccesoSilencioso(e) {
  const meta = parseObsMetadata(e.obs);
  if (!meta.creador) {
    return true;
  }
  const currentUser = sessionStorage.getItem('campanario_user');
  return currentUser === meta.creador;
}

function generarHtmlReporte(e, tieneAcceso, participantes = []) {
  const meta = parseObsMetadata(e.obs);
  const id = esc(e.id || '');
  const fecha = esc(e.fecha || '') + ' ' + esc(e.hora || '');
  const rut = esc(e.rut || '');
  const cargo = esc(e.cargo || '');
  const nombre = esc(e.nombre || '');
  const curso = esc(e.curso || '');
  const jefe = esc(e.jefe || '');
  const asig = esc(e.asig || '');
  const pie = esc(e.pie || '');
  const resp = esc(e.resp || '');
  const estado = esc(e.estado || '');
  const seguimiento = esc(e.seguimiento || 'No fijado');
  
  // Si no tiene acceso, enmascaramos los contenidos sensibles
  const objetivo = tieneAcceso ? esc(e.objetivo || '') : `<span style="color: var(--text-secondary); font-style: italic; display: flex; align-items: center; gap: 6px;">🔒 Contenido privado y confidencial</span>`;
  const motivo = tieneAcceso ? esc(e.motivo || '') : `<span style="color: var(--text-secondary); font-style: italic; display: flex; align-items: center; gap: 6px;">🔒 Contenido privado y confidencial</span>`;
  const acuerdos = tieneAcceso ? esc(e.acuerdos || '') : `<span style="color: var(--text-secondary); font-style: italic; display: flex; align-items: center; gap: 6px;">🔒 Contenido privado y confidencial</span>`;
  const obs = tieneAcceso ? esc(meta.obs || '') : `<span style="color: var(--text-secondary); font-style: italic; display: flex; align-items: center; gap: 6px;">🔒 Contenido privado y confidencial</span>`;
  
  let bannerPrivado = '';
  if (!tieneAcceso) {
    bannerPrivado = `
      <div style="padding: 24px; text-align: center; border: 2px dashed #cbd5e1; border-radius: 8px; margin: 15px 0 25px 0; background: #f8fafc;">
        <div style="font-size: 36px; margin-bottom: 10px;">🔒</div>
        <h3 style="font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">La entrevista N° ${id} es de carácter privado</h3>
        <p style="font-size: 12px; color: #64748b; margin: 0;">Esta entrevista es confidencial y no se muestran sus detalles en este reporte impreso.</p>
      </div>
    `;
  }

  const adjunto = e.adjunto || meta.adjunto;
  let adjuntoHtml = '';
  if (adjunto && tieneAcceso) {
    adjuntoHtml = `
      <div class="rpt-row full no-print" style="border-bottom: 1px solid #94a3b8;">
        <div class="rpt-cell rpt-label">Documentación Adjunta</div>
        <div class="rpt-cell" style="min-height:36px; display: flex; align-items: center; padding: 10px 14px;">
          <a href="${esc(adjunto)}" target="_blank" style="color: var(--primary, #4f46e5); font-weight: 600; text-decoration: none;">🔗 Ver documento en Google Drive / Evidencia</a>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="report-block">
      <div class="rpt-title">
        <h2 style="font-size:18px; margin-bottom:6px; font-family:var(--font-title); font-weight:800">Ficha de Entrevista Institucional</h2>
        <strong style="font-size:12px; color:var(--text-secondary)">Liceo Técnico Profesional Campanario — RBD 3941</strong>
      </div>
      
      ${bannerPrivado}
      
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">ID Entrevista</div>
        <div class="rpt-cell" style="font-weight:700">${id}</div>
        <div class="rpt-cell rpt-label">Fecha / Hora</div>
        <div class="rpt-cell">${fecha}</div>
      </div>
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">RUT Entrevistado</div>
        <div class="rpt-cell" style="font-family:monospace">${rut}</div>
        <div class="rpt-cell rpt-label">Cargo / Estamento</div>
        <div class="rpt-cell">${cargo}</div>
      </div>
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">Nombre Completo</div>
        <div class="rpt-cell">${nombre}</div>
        <div class="rpt-cell rpt-label">Curso / Función</div>
        <div class="rpt-cell">${curso}</div>
      </div>
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">Profesor Jefe</div>
        <div class="rpt-cell">${jefe}</div>
        <div class="rpt-cell rpt-label">Profesor Asignatura</div>
        <div class="rpt-cell">${asig}</div>
      </div>
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">Profesor / Especialista PIE</div>
        <div class="rpt-cell">${pie}</div>
        <div class="rpt-cell rpt-label">Entrevistador Responsable</div>
        <div class="rpt-cell">${resp}</div>
      </div>
      <div class="rpt-row full">
        <div class="rpt-cell rpt-label">Objetivo de la entrevista</div>
        <div class="rpt-cell" id="rpt-val-objetivo" style="min-height:60px; line-height: 1.4">${objetivo}</div>
      </div>
      <div class="rpt-row full">
        <div class="rpt-cell rpt-label">Motivo / Antecedentes</div>
        <div class="rpt-cell" id="rpt-val-motivo" style="min-height:60px; line-height: 1.4">${motivo}</div>
      </div>
      <div class="rpt-row full">
        <div class="rpt-cell rpt-label">Acuerdos y Compromisos</div>
        <div class="rpt-cell" id="rpt-val-acuerdos" style="min-height:60px; line-height: 1.4">${acuerdos}</div>
      </div>
      <div class="rpt-row">
        <div class="rpt-cell rpt-label">Fecha Seguimiento</div>
        <div class="rpt-cell">${seguimiento}</div>
        <div class="rpt-cell rpt-label">Estado Ficha</div>
        <div class="rpt-cell">${estado}</div>
      </div>
      ${adjuntoHtml}
      <div class="rpt-row full">
        <div class="rpt-cell rpt-label last-row">Observaciones Generales</div>
        <div class="rpt-cell last-row" id="rpt-val-obs" style="min-height:48px; line-height: 1.4">${obs}</div>
      </div>
      
      ${(() => {
        const commentedParts = (participantes || []).filter(p => p.estado === 'COMENTADO');
        if (commentedParts.length === 0) return '';
        return `
          <div style="margin-top: 20px; border: 1px solid var(--border, #e2e8f0); border-radius: var(--radius-sm, 8px); background: #fafafc; padding: 16px;">
            <h4 style="font-size: 13px; font-weight: 700; color: var(--text-primary, #0f172a); margin: 0 0 12px 0; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">👥 Aportes y Comentarios de Participantes</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${commentedParts.map(p => `
                <div style="background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 12.5px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <strong style="color: var(--primary, #4f46e5);">${esc(p.nombre_completo || p.username)} (${esc(p.perfil || 'Docente')})</strong>
                    <span style="color: var(--text-muted, #64748b); font-size: 11px;">📅 ${esc(p.fecha_comentario)}</span>
                  </div>
                  <p style="margin: 0; color: var(--text-secondary, #334155); font-style: italic;">
                    "${esc(p.comentario)}"
                  </p>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      })()}
      
      ${(() => {
        const currentUser = sessionStorage.getItem('campanario_user');
        const myPendingInvitation = (participantes || []).find(p => p.username === currentUser && p.estado === 'PENDIENTE');
        if (!myPendingInvitation) return '';
        return `
          <div class="card no-print" style="margin-top: 20px; border: 2px solid var(--primary, #4f46e5); border-radius: var(--radius-sm, 8px); background: rgba(99, 102, 241, 0.02); padding: 16px; box-shadow: none; display: flex; flex-direction: column; gap: 10px;">
            <h4 style="font-size: 13px; font-weight: 700; color: var(--primary, #4f46e5); margin: 0; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">
              📝 Tu Aporte / Comentario Pendiente
            </h4>
            <p style="font-size: 12.5px; color: var(--text-secondary); margin: 0;">
              Has sido invitado/a a participar de esta entrevista. Deja tus acuerdos, compromisos o comentarios para que se unan a la ficha oficial:
            </p>
            <div class="form-group" style="margin: 4px 0 0 0;">
              <textarea id="reporte-comentario-input" placeholder="Escribe tu comentario o compromiso aquí..." style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; height: 80px; resize: vertical; font-family: inherit;"></textarea>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size:12px;" onclick="descartarNotificacion('${esc(e.id)}').then(() => { cargarReporteDesdeHash('${esc(e.id)}'); })">Descartar</button>
              <button class="btn btn-sm btn-primary" style="padding: 6px 16px; font-size:12px;" onclick="guardarAporteDesdeReporte('${esc(e.id)}')">💾 Guardar Aporte</button>
            </div>
          </div>
        `;
      })()}
      
      <div class="firma-row">
        <div>
          <br><br>
          ________________________________________<br>
          <span style="font-size:11px; font-weight:600">Firma Entrevistador/a Responsable</span>
        </div>
        <div>
          <br><br>
          ________________________________________<br>
          <span style="font-size:11px; font-weight:600">Firma Entrevistado/a / Apoderado/a</span>
        </div>
      </div>
    </div>
  `;
}

function seleccionarGrupo(groupId, checked) {
  const checkboxes = document.querySelectorAll(`.${groupId} .print-chk`);
  checkboxes.forEach(chk => {
    chk.checked = checked;
  });
  actualizarBotonImprimirSeleccionadas();
}

function actualizarBotonImprimirSeleccionadas() {
  const groups = {};
  document.querySelectorAll('#tbl-hist tbody .print-chk').forEach(chk => {
    const row = chk.closest('tr');
    const groupClass = Array.from(row.classList).find(c => c.startsWith('group-'));
    if (groupClass) {
      if (!groups[groupClass]) {
        groups[groupClass] = { total: 0, checked: 0 };
      }
      groups[groupClass].total++;
      if (chk.checked) {
        groups[groupClass].checked++;
      }
    }
  });
  
  Object.keys(groups).forEach(groupClass => {
    const groupChk = document.querySelector(`.group-header input[data-group="${groupClass}"]`);
    if (groupChk) {
      groupChk.checked = (groups[groupClass].total === groups[groupClass].checked);
    }
  });

  const checkedChks = document.querySelectorAll('#tbl-hist tbody .print-chk:checked');
  const count = checkedChks.length;
  const btn = document.getElementById('btn-imprimir-sel');
  const lbl = document.getElementById('lbl-cnt-sel');
  
  if (btn && lbl) {
    lbl.textContent = count;
    if (count > 0) {
      btn.style.display = 'inline-flex';
    } else {
      btn.style.display = 'none';
    }
  }
}

function imprimirTodasDePersona(rut) {
  const list = entrevistas.filter(e => e.rut.toUpperCase() === rut.toUpperCase());
  if (list.length === 0) {
    toast("⚠️ No hay entrevistas para este RUT");
    return;
  }
  imprimirListaDeEntrevistas(list);
}

function imprimirSeleccionadas() {
  const checkedChks = document.querySelectorAll('#tbl-hist tbody .print-chk:checked');
  const ids = Array.from(checkedChks).map(chk => chk.getAttribute('data-id'));
  
  const list = entrevistas.filter(e => ids.includes(e.id));
  if (list.length === 0) {
    toast("⚠️ Seleccione al menos una entrevista para imprimir");
    return;
  }
  imprimirListaDeEntrevistas(list);
}

function imprimirListaDeEntrevistas(list) {
  const ids = list.map(e => e.id).join(',');
  window.location.hash = 'reporte?ids=' + ids + '&print=1';
}

function imprimirReporteIndividual(id) {
  window.location.hash = 'reporte?id=' + id + '&print=1';
}

async function cargarReporteDesdeHash(id, print) {
  let e = entrevistas.find(x => x.id === id);
  if (!e) {
    try {
      const res = await fetch(`/api/entrevistas`);
      const list = await res.json();
      e = list.find(x => x.id === id);
    } catch(err) {
      console.error("Error loading single interview details:", err);
    }
  }
  if (!e) {
    toast("❌ No se encontró la entrevista " + id);
    return;
  }
  
  const tieneAcceso = await verificarAccesoEntrevista(e);
  if (!tieneAcceso) return;
  
  let participantes = [];
  try {
    const res = await fetch(`/api/entrevistas/participantes?entrevista_id=${encodeURIComponent(id)}`);
    participantes = await res.json();
  } catch(err) {
    console.error("Error loading participants:", err);
  }
  
  document.getElementById('reporte').innerHTML = generarHtmlReporte(e, true, participantes);
  
  iniciarLiveReportPolling(id);
  
  const rptTitle = document.querySelector('#pg-reporte .card-title');
  if (rptTitle) {
    rptTitle.textContent = '📄 Vista de Ficha Oficial de Entrevista';
  }
  
  const backBtn = document.querySelector('#pg-reporte .btn-secondary');
  if (backBtn) {
    const backTo = sessionStorage.getItem('campanario_prev_page') || 'historial';
    backBtn.textContent = backTo === 'nueva-entrevista' ? '⬅ Volver a Formulario' : '⬅ Volver a Historial';
    backBtn.onclick = () => goTo(backTo);
  }
  
  if (print) {
    setTimeout(() => {
      window.print();
    }, 300);
  }
}

async function cargarMultiplesReportesDesdeHash(idsList, print) {
  let list = [];
  try {
    const res = await fetch(`/api/entrevistas`);
    const all = await res.json();
    list = all.filter(x => idsList.includes(x.id));
  } catch(err) {
    console.error("Error loading multiple interviews:", err);
  }
  
  if (list.length === 0) {
    toast("❌ No se encontraron las entrevistas seleccionadas");
    return;
  }
  
  list.sort((a, b) => b.id.localeCompare(a.id));
  
  let html = '';
  for (let idx = 0; idx < list.length; idx++) {
    const e = list[idx];
    const tieneAcceso = tieneAccesoSilencioso(e);
    
    let participantes = [];
    try {
      const res = await fetch(`/api/entrevistas/participantes?entrevista_id=${encodeURIComponent(e.id)}`);
      participantes = await res.json();
    } catch(err) {
      console.error("Error loading participants for multiple report:", err);
    }
    
    html += generarHtmlReporte(e, tieneAcceso, participantes);
    if (idx < list.length - 1) {
      html += '<div class="report-block-separator no-print" style="margin: 40px 0; border-top: 2px dashed #cbd5e1; height: 1px;"></div>';
    }
  }
  
  document.getElementById('reporte').innerHTML = html;
  
  const rptTitle = document.querySelector('#pg-reporte .card-title');
  if (rptTitle) {
    rptTitle.textContent = `📄 Impresión de Entrevistas (${list.length})`;
  }
  
  const backBtn = document.querySelector('#pg-reporte .btn-secondary');
  if (backBtn) {
    const backTo = sessionStorage.getItem('campanario_prev_page') || 'historial';
    backBtn.textContent = backTo === 'nueva-entrevista' ? '⬅ Volver a Formulario' : '⬅ Volver a Historial';
    backBtn.onclick = () => goTo(backTo);
  }
  
  if (print) {
    setTimeout(() => {
      window.print();
    }, 300);
  }
}

async function terminarTransmisionMultivista(sessionId) {
  if (!sessionId) return;
  
  // 1. Terminar en el servidor local (Python)
  try {
    await originalFetch('/api/multivista/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch(err) {
    console.error("Error ending local multivista session:", err);
  }
  
  // 2. Terminar en Supabase (si está configurado)
  try {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    };
    await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: { ...headers }
    });
  } catch(err) {
    console.error("Error deleting Supabase multivista session:", err);
  }
}

async function cargarUsuariosInviteSelect() {
  const select = document.getElementById('e-invite-select');
  if (!select) return;
  
  try {
    const res = await fetch('/api/usuarios');
    const users = await res.json();
    const currentUser = sessionStorage.getItem('campanario_user');
    
    // Filtrar al usuario actual para que no se invite a sí mismo
    const otherUsers = users.filter(u => u.username !== currentUser);
    
    select.innerHTML = '<option value="">-- Seleccione un colega --</option>' + 
      otherUsers.map(u => `<option value="${esc(u.username)}">${esc(u.nombre)} (${esc(u.perfil)})</option>`).join('');
  } catch(err) {
    console.error("Error loading users for invite select:", err);
  }
}

async function cargarParticipantesEdit(entrevistaId) {
  const tbody = document.querySelector('#tbl-e-participantes tbody');
  if (!tbody) return;
  
  try {
    const res = await fetch(`/api/entrevistas/participantes?entrevista_id=${encodeURIComponent(entrevistaId)}`);
    const list = await res.json();
    
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">No hay participantes invitados aún.</td></tr>';
      return;
    }
    
    tbody.innerHTML = list.map(p => {
      const badgeClass = p.estado === 'COMENTADO' ? 'badge-verde' : 'badge-amarillo';
      const badgeStyle = p.estado === 'COMENTADO' ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : 'background: rgba(245, 158, 11, 0.1); color: #f59e0b;';
      const commentText = p.comentario ? `"${esc(p.comentario)}" <span style="font-size:11px; color:var(--text-muted); display: block; margin-top: 4px;">📅 ${esc(p.fecha_comentario)}</span>` : '<span style="font-style:italic; color:var(--text-muted);">Sin aportes aún</span>';
      
      let actionBtn = '';
      if (p.estado === 'PENDIENTE') {
        actionBtn = `<button type="button" class="btn btn-sm btn-secondary" style="margin-right: 4px;" onclick="recordarParticipante('${esc(p.username)}')">🔔 Recordar</button>`;
      }
      actionBtn += `<button type="button" class="btn btn-sm btn-danger" onclick="eliminarParticipanteInvitacion('${esc(p.username)}')">✖ Eliminar</button>`;
      
      return `
        <tr>
          <td><strong>${esc(p.nombre_completo || p.username)}</strong><br><span style="font-size:11px; color:var(--text-muted)">@${esc(p.username)}</span></td>
          <td style="font-size:13px; color:var(--text-secondary)">${esc(p.perfil || 'Docente')}</td>
          <td><span class="badge ${badgeClass}" style="${badgeStyle}">${esc(p.estado)}</span></td>
          <td style="font-size:13px; max-width:300px; line-height: 1.4">${commentText}</td>
          <td style="text-align: right;">${actionBtn}</td>
        </tr>
      `;
    }).join('');
  } catch(err) {
    console.error("Error loading participants table:", err);
  }
}

async function invitarParticipante() {
  const select = document.getElementById('e-invite-select');
  if (!select) return;
  const username = select.value;
  if (!username) {
    toast("⚠️ Seleccione un usuario para invitar");
    return;
  }
  
  if (!editandoEntrevistaId) {
    toast("⚠️ Guarde la entrevista primero antes de poder invitar participantes");
    return;
  }
  
  try {
    const res = await fetch('/api/entrevistas/participantes/invitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId: editandoEntrevistaId, username })
    });
    const data = await res.json();
    if (data.success) {
      toast("✅ Participante invitado con éxito");
      select.value = '';
      cargarParticipantesEdit(editandoEntrevistaId);
    } else {
      toast("❌ Error: " + data.error);
    }
  } catch(err) {
    console.error("Error inviting participant:", err);
    toast("❌ Error de conexión");
  }
}

async function recordarParticipante(username) {
  if (!editandoEntrevistaId) return;
  
  try {
    const res = await fetch('/api/entrevistas/participantes/recordar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId: editandoEntrevistaId, username })
    });
    const data = await res.json();
    if (data.success) {
      toast(`🔔 Recordatorio enviado a @${username}`);
      cargarParticipantesEdit(editandoEntrevistaId);
    } else {
      toast("❌ Error: " + data.error);
    }
  } catch(err) {
    console.error("Error sending reminder:", err);
    toast("❌ Error de conexión");
  }
}

async function verificarNotificaciones() {
  const activeUser = sessionStorage.getItem('campanario_user');
  const banner = document.getElementById('notif-banner');
  const bannerText = document.getElementById('notif-banner-text');
  const badge = document.getElementById('header-notif-badge');
  if (!activeUser) return;
  
  try {
    const res = await fetch(`/api/usuarios/notificaciones?username=${encodeURIComponent(activeUser)}`);
    const list = await res.json();
    
    if (list.length === 0) {
      if (banner) banner.style.display = 'none';
      if (badge) badge.style.display = 'none';
    } else {
      if (banner) {
        banner.style.display = 'block';
        bannerText.textContent = `Tienes ${list.length} ${list.length === 1 ? 'invitación pendiente' : 'invitaciones pendientes'} para aportar en entrevistas de estudiantes.`;
      }
      if (badge) badge.style.display = 'block';
    }
  } catch(err) {
    console.error("Error checking notifications:", err);
  }
}

async function abrirModalNotificaciones() {
  const activeUser = sessionStorage.getItem('campanario_user');
  const container = document.getElementById('notif-list-container');
  const modal = document.getElementById('modal-notificaciones');
  if (!activeUser || !container || !modal) return;
  
  try {
    const res = await fetch(`/api/usuarios/notificaciones?username=${encodeURIComponent(activeUser)}`);
    const list = await res.json();
    
    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:16px;">No tienes invitaciones pendientes.</div>';
      setTimeout(() => cerrarModalNotificaciones(), 1500);
      return;
    }
    
    // Resolver metadatos si no vienen del servidor (ej: en modo SQLite sin sincronización)
    for (const item of list) {
      if (!item.estudiante_nombre) {
        let ent = entrevistas.find(x => x.id === item.entrevista_id);
        if (!ent) {
          try {
            const headers = {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            };
            const res = await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(item.entrevista_id)}`, { headers });
            const data = await res.json();
            if (data && data.length > 0) {
              ent = data[0];
            }
          } catch(err) {
            console.error("Error resolving metadata from Supabase:", err);
          }
        }
        if (ent) {
          item.estudiante_nombre = ent.nombre;
          item.objetivo = ent.objetivo;
          item.fecha = ent.fecha;
          item.entrevistador = ent.resp;
        } else {
          item.estudiante_nombre = "Cita " + item.entrevista_id;
          item.objetivo = "Aporte a entrevista pendiente";
          item.fecha = "---";
          item.entrevistador = "Docente responsable";
        }
      }
    }
    
    container.innerHTML = list.map(item => `
      <div class="card nav-notif-item" style="border: 1px solid var(--border, #e2e8f0); padding: 16px; margin: 0; box-shadow: none; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.2s;" onclick="irAEntrevistaNotif('${esc(item.entrevista_id)}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">
          <div>
            <strong style="font-size: 14px; color: var(--text-primary);">${esc(item.estudiante_nombre)}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">Invitación de: ${esc(item.entrevistador)} el ${esc(item.fecha)}</div>
          </div>
          <span class="badge badge-amarillo" style="font-size: 11px; background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 2px 8px; border-radius: 999px;">Pendiente</span>
        </div>
        <p style="font-size: 13px; margin: 0; color: var(--text-secondary); line-height: 1.4;">
          <strong style="font-size:11px; text-transform:uppercase; color:var(--text-muted)">Objetivo:</strong> ${esc(item.objetivo)}
        </p>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
          <button class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size:12px;" onclick="event.stopPropagation(); descartarNotificacion('${esc(item.entrevista_id)}')">Descartar</button>
          <button class="btn btn-sm btn-primary" style="padding: 6px 16px; font-size:12px;">📄 Ir a la Entrevista</button>
        </div>
      </div>
    `).join('');
    
    modal.classList.add('open');
  } catch(err) {
    console.error("Error opening notifications modal:", err);
  }
}

function cerrarModalNotificaciones() {
  const modal = document.getElementById('modal-notificaciones');
  if (modal) modal.classList.remove('open');
  verificarNotificaciones();
}

async function guardarAporteNotificacion(entrevistaId) {
  const activeUser = sessionStorage.getItem('campanario_user');
  const txtarea = document.getElementById(`notif-comentario-${entrevistaId}`);
  if (!activeUser || !txtarea) return;
  
  const comentario = txtarea.value.trim();
  if (!comentario) {
    toast("⚠️ Escribe un aporte o comentario antes de enviar");
    return;
  }
  
  try {
    const resCom = await fetch('/api/entrevistas/participantes/comentar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId, username: activeUser, comentario })
    });
    const dataCom = await resCom.json();
    
    if (dataCom.success) {
      toast("✅ Aporte enviado con éxito");
      abrirModalNotificaciones();
      verificarNotificaciones();
    } else {
      toast("❌ Error: " + dataCom.error);
    }
  } catch(err) {
    console.error("Error saving contribution:", err);
    toast("❌ Error de conexión");
  }
}

async function descartarNotificacion(entrevistaId) {
  const activeUser = sessionStorage.getItem('campanario_user');
  if (!activeUser) return;
  
  try {
    const res = await fetch('/api/usuarios/notificaciones/leer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId, username: activeUser })
    });
    const data = await res.json();
    
    if (data.success) {
      toast("✅ Invitación descartada");
      abrirModalNotificaciones();
      verificarNotificaciones();
    } else {
      toast("❌ Error: " + data.error);
    }
  } catch(err) {
    console.error("Error discarding notification:", err);
    toast("❌ Error de conexión");
  }
}

function irAEntrevistaNotif(id) {
  cerrarModalNotificaciones();
  window.location.hash = 'reporte?id=' + id;
}

async function guardarAporteDesdeReporte(entrevistaId) {
  const activeUser = sessionStorage.getItem('campanario_user');
  const txtarea = document.getElementById('reporte-comentario-input');
  if (!activeUser || !txtarea) return;
  
  const comentario = txtarea.value.trim();
  if (!comentario) {
    toast("⚠️ Escribe un aporte o comentario antes de enviar");
    return;
  }
  
  try {
    // 1. Intentar actualizar directamente en Supabase si está disponible
    try {
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      };
      const resEnt = await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(entrevistaId)}`, { headers });
      if (resEnt.ok) {
        const dataEnt = await resEnt.json();
        if (dataEnt && dataEnt.length > 0) {
          const ent = dataEnt[0];
          const currentObs = ent.obs || '';
          const userFullName = sessionStorage.getItem('campanario_nombre') || activeUser;
          const userProfile = sessionStorage.getItem('campanario_perfil') || 'Docente';
          const newContribution = `\n\n[Aporte de ${userFullName} (${userProfile})]: ${comentario}`;
          const updatedObs = currentObs + newContribution;
          
          await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(entrevistaId)}`, {
            method: 'PATCH',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({ obs: updatedObs })
          });
        }
      }
    } catch(sbErr) {
      console.warn("Could not patch Supabase directly (probably offline/local fallback):", sbErr);
    }

    // 2. Enviar al backend para que actualice la base de datos local y remueva la invitación
    const resCom = await fetch('/api/entrevistas/participantes/comentar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId, username: activeUser, comentario })
    });
    const dataCom = await resCom.json();
    
    if (dataCom.success) {
      toast("✅ Aporte guardado con éxito en el reporte");
      
      // Detener polling de vivo si existía
      if (window.reportLiveInterval) {
        clearInterval(window.reportLiveInterval);
        window.reportLiveInterval = null;
      }
      
      cargarReporteDesdeHash(entrevistaId);
      verificarNotificaciones();
    } else {
      toast("❌ Error: " + dataCom.error);
    }
  } catch(err) {
    console.error("Error saving contribution from report:", err);
    toast("❌ Error de conexión");
  }
}

async function eliminarParticipanteInvitacion(username) {
  if (!editandoEntrevistaId) return;
  
  if (!confirm(`¿Está seguro de que desea eliminar a @${username} de esta entrevista?`)) {
    return;
  }
  
  try {
    const res = await fetch('/api/entrevistas/participantes/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrevistaId: editandoEntrevistaId, username })
    });
    const data = await res.json();
    if (data.success) {
      toast("✅ Participante eliminado con éxito");
      cargarParticipantesEdit(editandoEntrevistaId);
    } else {
      toast("❌ Error: " + data.error);
    }
  } catch(err) {
    console.error("Error deleting participant invitation:", err);
    toast("❌ Error de conexión");
  }
}

function iniciarLiveReportPolling(id) {
  if (window.reportLiveInterval) clearInterval(window.reportLiveInterval);
  
  async function fetchReportLive() {
    try {
      let res = await fetch(`/api/multivista/live?session=${encodeURIComponent(id)}`);
      let data = {};
      if (res.ok && (res.headers.get('Content-Type') || '').includes('application/json')) {
        data = await res.json();
      }
      
      const liveIndicator = document.getElementById('reporte-live-indicator');
      if (data && data.sessionId) {
        if (!liveIndicator) {
          const titleDiv = document.querySelector('.rpt-title');
          if (titleDiv) {
            const ind = document.createElement('div');
            ind.id = 'reporte-live-indicator';
            ind.className = 'no-print';
            ind.style = 'display: inline-flex; align-items: center; gap: 6px; background-color: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 6px; border: 1px solid rgba(239, 68, 68, 0.2);';
            ind.innerHTML = '<span style="width: 6px; height: 6px; background-color: #ef4444; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px #ef4444; animation: pulse 1.5s infinite;"></span> EN VIVO';
            titleDiv.appendChild(ind);
          }
        }
        
        const elObj = document.getElementById('rpt-val-objetivo');
        const elMot = document.getElementById('rpt-val-motivo');
        const elAcu = document.getElementById('rpt-val-acuerdos');
        const elObs = document.getElementById('rpt-val-obs');
        
        if (elObj && elObj.textContent !== (data.objetivo || '')) {
          elObj.textContent = data.objetivo || '';
          elObj.classList.add('updated');
          setTimeout(() => elObj.classList.remove('updated'), 600);
        }
        if (elMot && elMot.textContent !== (data.motivo || '')) {
          elMot.textContent = data.motivo || '';
          elMot.classList.add('updated');
          setTimeout(() => elMot.classList.remove('updated'), 600);
        }
        if (elAcu && elAcu.textContent !== (data.acuerdos || '')) {
          elAcu.textContent = data.acuerdos || '';
          elAcu.classList.add('updated');
          setTimeout(() => elAcu.classList.remove('updated'), 600);
        }
        if (elObs) {
          const meta = parseObsMetadata(data.obs);
          if (elObs.textContent !== (meta.obs || '')) {
            elObs.textContent = meta.obs || '';
            elObs.classList.add('updated');
            setTimeout(() => elObs.classList.remove('updated'), 600);
          }
        }
      } else {
        if (liveIndicator) liveIndicator.remove();
      }
    } catch(err) {
      console.error("Error polling report live:", err);
    }
  }
  
  window.reportLiveInterval = setInterval(fetchReportLive, 1500);
}

async function cargarAnotacionesEnModal(rut) {
  const tbody = document.querySelector('#tbl-edit-anotaciones tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--text-muted)">Cargando anotaciones...</td></tr>';
  
  try {
    const res = await fetch(`/api/anotaciones?rut=${encodeURIComponent(rut)}`);
    const list = await res.json();
    
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--text-muted)">No hay anotaciones registradas para este estudiante.</td></tr>';
    } else {
      tbody.innerHTML = list.map(a => `
        <tr>
          <td>${esc(a.fecha)}</td>
          <td><span class="badge ${a.tipo === 'Positiva' ? 'badge-verde' : a.tipo === 'Negativa' ? 'badge-rojo' : a.tipo === 'Demérito' ? 'badge-naranja' : 'badge-azul'}">${esc(a.tipo)}</span></td>
          <td style="max-width:300px; word-break:break-word;" title="${esc(a.detalle)}">${esc(a.detalle)}</td>
          <td>${esc(a.autor || 'N/A')}</td>
          <td>
            <button type="button" class="btn btn-sm btn-danger" onclick="eliminarAnotacion('${esc(a.id)}')">✖</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error("Error loading annotations in modal:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--danger)">Error al cargar anotaciones.</td></tr>';
  }
}

function abrirCrearAnotacion() {
  const rut = document.getElementById('edit-rut').value;
  if (!rut) return;
  
  // Ocultar selector de estudiantes y curso en modal
  document.getElementById('anot-curso-group').style.display = 'none';
  document.getElementById('anot-estudiante-group').style.display = 'none';
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('anot-fecha').value = today;
  document.getElementById('anot-tipo').value = 'Negativa';
  document.getElementById('anot-detalle').value = '';
  
  window.anotacionModalSource = 'student';
  
  document.getElementById('modal-anotacion').classList.add('open');
}

function cerrarModalAnotacion() {
  document.getElementById('modal-anotacion').classList.remove('open');
}

async function guardarAnotacion() {
  let rut = '';
  if (window.anotacionModalSource === 'student') {
    rut = document.getElementById('edit-rut').value;
  } else {
    rut = document.getElementById('anot-estudiante-select').value;
  }
  
  const fecha = document.getElementById('anot-fecha').value;
  const tipo = document.getElementById('anot-tipo').value;
  const detalle = document.getElementById('anot-detalle').value.trim();
  const activeUser = sessionStorage.getItem('campanario_user') || 'admin';
  
  if (!rut || !fecha || !tipo || !detalle) {
    toast('⚠️ Rellene todos los campos requeridos');
    return;
  }
  
  try {
    const res = await fetch('/api/anotaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rut, fecha, tipo, detalle, autor: activeUser })
    });
    const data = await res.json();
    if (data.success) {
      toast('✅ Anotación registrada con éxito');
      cerrarModalAnotacion();
      
      if (window.anotacionModalSource === 'student') {
        cargarAnotacionesEnModal(rut);
      } else {
        filtrarAnotacionesGlobal();
      }
      loadAllData();
      if (document.getElementById('pg-estudiantes').classList.contains('active')) filtrarEst();
    } else {
      toast('❌ Error: ' + data.error);
    }
  } catch (err) {
    console.error("Error saving annotation:", err);
    toast('❌ Error de conexión al servidor');
  }
}

async function eliminarAnotacion(id) {
  if (!confirm('¿Está seguro de que desea eliminar esta anotación?')) return;
  
  const rut = document.getElementById('edit-rut').value;
  try {
    const res = await fetch('/api/anotaciones/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      toast('✅ Anotación eliminada');
      cargarAnotacionesEnModal(rut);
      loadAllData();
      if (document.getElementById('pg-estudiantes').classList.contains('active')) filtrarEst();
    } else {
      toast('❌ Error: ' + data.error);
    }
  } catch (err) {
    console.error("Error deleting annotation:", err);
    toast('❌ Error de conexión al servidor');
  }
}

// ══ ANOTACIONES GLOBAL ══

async function filtrarAnotacionesGlobal() {
  const q = txt(document.getElementById('anot-g-q').value).toLowerCase();
  const tipo = document.getElementById('anot-g-tipo').value;
  const fecha = document.getElementById('anot-g-fecha').value;
  const tbody = document.querySelector('#tbl-anotaciones-global tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--text-muted)">Cargando anotaciones...</td></tr>';
  
  try {
    const res = await fetch('/api/anotaciones/todas');
    const list = await res.json();
    
    const filtered = list.filter(a => {
      const name_str = `${a.estudiante_nombre || ''} ${a.estudiante_paterno || ''} ${a.estudiante_materno || ''}`.toLowerCase();
      const matchQ = !q || name_str.includes(q) || (a.rut_estudiante || '').toLowerCase().includes(q) || (a.detalle || '').toLowerCase().includes(q);
      const matchTipo = !tipo || a.tipo === tipo;
      const matchFecha = !fecha || a.fecha === fecha;
      return matchQ && matchTipo && matchFecha;
    });
    
    document.getElementById('anot-g-count').textContent = `Mostrando ${filtered.length} anotaciones`;
    
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--text-muted)">No se encontraron anotaciones.</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(a => `
        <tr>
          <td>
            <strong>${esc(a.estudiante_nombre || '')} ${esc(a.estudiante_paterno || '')}</strong> 
            <br><small style="color:var(--text-muted)">${esc(a.rut_estudiante)}</small>
          </td>
          <td>${esc(a.estudiante_curso || 'N/A')}</td>
          <td>${esc(a.fecha)}</td>
          <td><span class="badge ${a.tipo === 'Positiva' ? 'badge-verde' : a.tipo === 'Negativa' ? 'badge-rojo' : a.tipo === 'Demérito' ? 'badge-naranja' : 'badge-azul'}">${esc(a.tipo)}</span></td>
          <td style="max-width:320px; word-break:break-word;" title="${esc(a.detalle)}">${esc(a.detalle)}</td>
          <td>${esc(a.autor || 'N/A')}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-sm btn-primary" onclick="irAFichaDesdeAnotacion('${esc(a.rut_estudiante)}')">📋 Ficha</button>
              <button type="button" class="btn btn-sm btn-danger" onclick="eliminarAnotacionGlobal('${esc(a.id)}')">✖</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error("Error loading global annotations:", err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--danger)">Error al cargar anotaciones.</td></tr>';
  }
}

function irAFichaDesdeAnotacion(rut) {
  abrirEditar(rut);
}

async function eliminarAnotacionGlobal(id) {
  if (!confirm('¿Está seguro de que desea eliminar esta anotación?')) return;
  
  try {
    const res = await fetch('/api/anotaciones/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      toast('✅ Anotación eliminada');
      filtrarAnotacionesGlobal();
      loadAllData();
    } else {
      toast('❌ Error: ' + data.error);
    }
  } catch (err) {
    console.error("Error deleting annotation:", err);
    toast('❌ Error de conexión al servidor');
  }
}

async function abrirCrearAnotacionGlobal() {
  document.getElementById('anot-curso-group').style.display = 'block';
  document.getElementById('anot-estudiante-group').style.display = 'block';
  
  const cursoSelect = document.getElementById('anot-curso-select');
  const select = document.getElementById('anot-estudiante-select');
  
  cursoSelect.innerHTML = '<option value="">Cargando cursos...</option>';
  select.innerHTML = '<option value="">Cargando estudiantes...</option>';
  
  try {
    const res = await fetch('/api/estudiantes');
    const students = await res.json();
    window.allStudentsCache = students;
    
    // Obtener cursos únicos
    const courses = [...new Set(students.map(s => s.Curso).filter(Boolean))].sort();
    cursoSelect.innerHTML = '<option value="">Todos los cursos</option>' + 
      courses.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      
    cursoSelect.value = '';
    cargarEstudiantesPorCursoAnotacion();
  } catch (err) {
    console.error("Error loading students for global annotations:", err);
    cursoSelect.innerHTML = '<option value="">Error al cargar cursos</option>';
    select.innerHTML = '<option value="">Error al cargar estudiantes</option>';
  }
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('anot-fecha').value = today;
  document.getElementById('anot-tipo').value = 'Negativa';
  document.getElementById('anot-detalle').value = '';
  
  window.anotacionModalSource = 'global';
  
  document.getElementById('modal-anotacion').classList.add('open');
}

function cargarEstudiantesPorCursoAnotacion() {
  const selectedCurso = document.getElementById('anot-curso-select').value;
  const select = document.getElementById('anot-estudiante-select');
  
  if (!window.allStudentsCache) {
    select.innerHTML = '<option value="">Seleccione un estudiante...</option>';
    return;
  }
  
  // Filtrar estudiantes por curso si se seleccionó uno
  let filtered = window.allStudentsCache;
  if (selectedCurso) {
    filtered = window.allStudentsCache.filter(s => s.Curso === selectedCurso);
  }
  
  // Ordenar alfabéticamente
  filtered.sort((a,b) => `${a.Nombres} ${a['Apellido Paterno']}`.localeCompare(`${b.Nombres} ${b['Apellido Paterno']}`));
  
  if (filtered.length === 0) {
    select.innerHTML = '<option value="">No hay estudiantes en este curso</option>';
  } else {
    select.innerHTML = '<option value="">Seleccione un estudiante...</option>' + 
      filtered.map(s => `<option value="${esc(s.RUT)}">${esc(s.Nombres)} ${esc(s['Apellido Paterno'])} (${esc(s.Curso)}) - ${esc(s.RUT)}</option>`).join('');
  }
}


