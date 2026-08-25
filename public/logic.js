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

function autoExpandTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight + 6, 120) + 'px';
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
              if (sbTable === 'entrevistas') {
                if (!mappedRow.participantes_relatos || mappedRow.participantes_relatos === '[]') {
                  const metaObs = parseObsMetadata(r.obs || '');
                  if (metaObs && metaObs.relatos) {
                    mappedRow.participantes_relatos = metaObs.relatos;
                  }
                }
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
          
          if (sbTable === 'entrevistas' && dbBody.participantes_relatos) {
            if (!dbBody.obs || !dbBody.obs.includes('[RELATOS:')) {
              dbBody.obs = (dbBody.obs || '') + '\n\n[RELATOS:' + encodeURIComponent(dbBody.participantes_relatos) + ']';
            }
          }

          let res = await originalFetch(`${SUPABASE_URL}/rest/v1/${sbTable}`, {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(dbBody)
          });
          
          if (!res.ok && sbTable === 'entrevistas' && dbBody.participantes_relatos) {
            const dbBodyFallback = { ...dbBody };
            delete dbBodyFallback.participantes_relatos;
            res = await originalFetch(`${SUPABASE_URL}/rest/v1/${sbTable}`, {
              method: 'POST',
              headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(dbBodyFallback)
            });
          }

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
  if (pageName === 'configuracion') { renderConfiguracion(); actualizarVistaLogo(); }
  if (pageName === 'evidencias') { renderEvidenciasPage(); }
  if (pageName === 'anotaciones-global') { filtrarAnotacionesGlobal(); }
  if (pageName === 'meta2-adeco') { cargarMeta2Dashboard(); cargarMeta2Ficha(typeof meta2ActualId !== 'undefined' ? meta2ActualId : 1); cargarMeta2Evaluacion(); }
  if (pageName === 'nueva-entrevista') {
    if (typeof cargarListaUsuariosGlobal === 'function') cargarListaUsuariosGlobal();
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

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}ℹ️⚠️❌✅👤🗑️💾🔑📁✏️📚]/u.test(msg.trim());
  t.innerHTML = startsWithEmoji ? msg : `<span>ℹ️</span> ${msg}`;
  t.classList.add('show');
  if (t._timeout) clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3000);
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
    const cursos = [...new Set(all.map(e => e.Curso).filter(Boolean))].sort();
    popularSelectCursosOptgroups('est-curso', cursos);
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

    if (typeof estModoVista !== 'undefined' && estModoVista === 'agrupado') {
      renderEstudiantesAgrupadosMineduc(rows);
    }

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

let lookupCallback = null;

function abrirLookup(callback) {
  lookupCallback = (typeof callback === 'function') ? callback : null;
  document.getElementById('modal-lookup').classList.add('open');
  const qInput = document.getElementById('l-q');
  if (qInput) qInput.value = '';
  const fSelect = document.getElementById('l-filtro');
  if (fSelect) fSelect.value = '';
  filtrarLookup();
  setTimeout(() => { if (qInput) qInput.focus(); }, 150);
}

function cerrarLookup() {
  document.getElementById('modal-lookup').classList.remove('open');
}

let currentLookupRows = [];

async function filtrarLookup() {
  const qVal = txt(document.getElementById('l-q').value).toLowerCase();
  const f = document.getElementById('l-filtro').value;
  try {
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(qVal)}&filtro=${encodeURIComponent(f)}`);
    const rows = await res.json();
    currentLookupRows = rows || [];
    
    const tbody = document.querySelector('#tbl-lookup tbody');
    if (!currentLookupRows || currentLookupRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 28px; color:var(--text-muted)">No se encontraron coincidencias de personas.</td></tr>';
      return;
    }
    
    tbody.innerHTML = currentLookupRows.map((p, idx) => {
      const rawRut = p.RUT || p.Rut || p.rut || '';
      const formattedRut = formatearRut(rawRut) || rawRut;
      const name = [p.Nombres || p.nombres || '', p['Apellido Paterno'] || p['Apellido paterno'] || p.apellido_paterno || '', p['Apellido Materno'] || p['Apellido materno'] || p.apellido_materno || ''].filter(Boolean).join(' ').trim().replace(/\s+/g,' ');
      const est = p.Cargo || p.cargo || p.Perfil || 'Estudiante';
      const c = p.Curso || p.curso || p['Función/curso'] || p.funcion_curso || '-';
      
      let badgeStyle = 'background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.25);';
      if (est.toLowerCase().includes('estudiante')) {
        badgeStyle = 'background: rgba(59, 130, 246, 0.12); color: #1d4ed8; border: 1px solid rgba(59, 130, 246, 0.25);';
      } else if (est.toLowerCase().includes('asistente')) {
        badgeStyle = 'background: rgba(139, 92, 246, 0.12); color: #6d28d9; border: 1px solid rgba(139, 92, 246, 0.25);';
      }
      
      return `<tr style="border-bottom: 1px solid var(--border); transition: background 0.15s ease;">
        <td style="padding: 10px 14px; white-space: nowrap;">
          <span style="font-family: monospace; font-size: 13px; font-weight: 700; background: rgba(79, 70, 229, 0.08); color: var(--primary); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(79, 70, 229, 0.18); display: inline-block;">
            ${esc(formattedRut)}
          </span>
        </td>
        <td style="padding: 10px 14px;">
          <strong style="color: var(--text-primary); font-size: 13.5px;">${esc(name)}</strong>
        </td>
        <td style="padding: 10px 14px; white-space: nowrap;">
          <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; display: inline-block; ${badgeStyle}">
            ${esc(est)}
          </span>
        </td>
        <td style="padding: 10px 14px; font-size: 12.5px; color: var(--text-secondary); white-space: nowrap;">
          ${esc(c)}
        </td>
        <td style="padding: 10px 14px; text-align: center; white-space: nowrap;">
          <button type="button" class="btn btn-sm btn-primary" onclick="seleccionarPersonaIndex(${idx})" style="padding: 6px 14px; font-size: 12px; font-weight: 600; white-space: nowrap;">
            Seleccionar ➔
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error("Error lookup:", e);
  }
}

function seleccionarPersonaIndex(idx) {
  const p = currentLookupRows[idx];
  if (!p) return;
  
  const rawRut = p.RUT || p.Rut || p.rut || '';
  const formatted = formatearRut(rawRut) || rawRut;
  
  if (typeof lookupCallback === 'function') {
    const cb = lookupCallback;
    lookupCallback = null;
    cerrarLookup();
    cb(p);
    toast(`👤 Persona seleccionada: ${p.Nombres || p.nombres || formatted}`);
    return;
  }

  // Rellenar de inmediato todos los campos del formulario de entrevista
  const nom = [
    p.Nombres || p.nombres || '',
    p['Apellido Paterno'] || p['Apellido paterno'] || p.apellido_paterno || '',
    p['Apellido Materno'] || p['Apellido materno'] || p.apellido_materno || ''
  ].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('e-rut', formatted);
  setVal('e-nombre', nom);
  setVal('e-cargo', txt(p.Cargo || p.cargo || p.Perfil || 'Estudiante'));
  setVal('e-curso', txt(p.Curso || p.curso || p['Función/curso'] || p.funcion_curso || 'No asignado'));
  setVal('e-jefe', txt(p['Profesor Jefe'] || p.profesor_jefe || p['Profesor jefe (curso)'] || 'No asignado'));
  setVal('e-asig', txt(p['Asignatura'] || p.asignatura || p['Profesor de Asignatura'] || p.profesor_asignatura || 'No aplica'));
  setVal('e-pie', txt(p['Profesor PIE'] || p.profesor_pie || 'No aplica'));

  cerrarLookup();
  cargarHistorialCita(rawRut);
  toast(`👤 Persona seleccionada: ${nom}`);
}

function seleccionarPersona(rut) {
  const cleanTarget = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const idx = currentLookupRows.findIndex(x => (x.RUT || x.Rut || x.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanTarget);
  if (idx !== -1) {
    seleccionarPersonaIndex(idx);
    return;
  }
  
  // Fallback si no estaba en la lista visible
  const formatted = formatearRut(rut) || rut;
  document.getElementById('e-rut').value = formatted;
  autocompletarEnt();
  cerrarLookup();
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

function formatearRut(rut) {
  if (!rut) return '';
  let clean = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  
  let body = clean.slice(0, -1);
  let dv = clean.slice(-1);
  
  let formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

function formatearRutInput(input) {
  if (!input) return;
  const raw = input.value;
  if (!raw) return;
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length >= 7) {
    const formatted = formatearRut(clean);
    if (formatted && input.value !== formatted) {
      input.value = formatted;
    }
  }
}

async function autocompletarEnt() {
  const rutInput = document.getElementById('e-rut');
  if (!rutInput) return;
  let rut = rutInput.value.trim();
  if (!rut) return;

  const formatted = formatearRut(rut);
  if (formatted) {
    rutInput.value = formatted;
    rut = formatted;
  }

  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 7) return;

  try {
    let p = null;

    // 1. Consultar endpoint individual /api/persona?rut=...
    const resSingle = await fetch(`/api/persona?rut=${encodeURIComponent(cleanRut)}`);
    if (resSingle.ok) {
      const single = await resSingle.json();
      if (single && (single.RUT || single.Rut || single.Nombres)) {
        p = single;
      }
    }

    // 2. Respaldo: consultar buscador global /api/personas/buscar?q=...
    if (!p) {
      const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(cleanRut)}`);
      if (res.ok) {
        const results = await res.json();
        p = results.find(x => {
          const xClean = (x.RUT || x.Rut || x.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
          return xClean === cleanRut;
        });
      }
    }

    if (p) {
      const nom = [
        p.Nombres || p.nombres || '',
        p['Apellido Paterno'] || p['Apellido paterno'] || p.apellido_paterno || '',
        p['Apellido Materno'] || p['Apellido materno'] || p.apellido_materno || ''
      ].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');

      document.getElementById('e-nombre').value = nom;
      document.getElementById('e-cargo').value = txt(p.Cargo || p.cargo || p.Perfil || 'Estudiante');
      document.getElementById('e-curso').value = txt(p.Curso || p.curso || p['Función/curso'] || p.funcion_curso || 'No asignado');
      document.getElementById('e-jefe').value = txt(p['Profesor Jefe'] || p.profesor_jefe || p['Profesor jefe (curso)'] || 'No asignado');
      document.getElementById('e-asig').value = txt(p['Asignatura'] || p.asignatura || p['Profesor de Asignatura'] || p.profesor_asignatura || 'No aplica');
      document.getElementById('e-pie').value = txt(p['Profesor PIE'] || p.profesor_pie || 'No aplica');
      
      await cargarHistorialCita(rut);
      toast(`✅ Datos autocompletados: ${nom}`);
    } else {
      toast('ℹ️ RUT no registrado en la nómina. Puede ingresar los datos manualmente.');
    }
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
  
  obsVal = obsVal.replace(/\n\n\[CONFIDENCIAL:[^\]\n]+\]/g, '').replace(/\[CONFIDENCIAL:[^\]\n]+\]/g, '');
  obsVal = obsVal.replace(/\n\n\[ADJUNTO:[\s\S]+?\]/g, '').replace(/\[ADJUNTO:[\s\S]+?\]/g, '');
  
  if (adjunto) {
    const encoded = encodeURIComponent(adjunto);
    obsVal += `\n\n[ADJUNTO:${encoded}]`;
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
    obs: obsVal,
    participantes_relatos: JSON.stringify(typeof participantesRelatosForm !== 'undefined' ? participantesRelatosForm : [])
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
  ['e-rut', 'e-nombre', 'e-cargo', 'e-curso', 'e-jefe', 'e-asig', 'e-pie', 'e-resp', 'e-objetivo', 'e-motivo', 'e-acuerdos', 'e-obs', 'e-adjunto', 'e-adjunto-url', 'e-adjunto-nombre'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  currentAdjuntosList = [];
  renderAdjuntosForm();
  participantesRelatosForm = [];
  if (typeof renderParticipantesRelatosForm === 'function') renderParticipantesRelatosForm();
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
  let relatos = null;
  
  // Buscar y extraer [CONFIDENCIAL:username]
  const confMatch = cleanObs.match(/\[CONFIDENCIAL:([^\]]+)\]/);
  if (confMatch) {
    creador = confMatch[1];
    cleanObs = cleanObs.replace(/\n\n\[CONFIDENCIAL:[^\]]+\]/g, '').replace(/\[CONFIDENCIAL:[^\]]+\]/g, '');
  }
  
  // Buscar y extraer [RELATOS:data]
  const relMatch = cleanObs.match(/\[RELATOS:([\s\S]+?)\](?=\s*$|\s*\[CONFIDENCIAL:|\s*\[ADJUNTO:)/) || cleanObs.match(/\[RELATOS:([^\]]+)\]/);
  if (relMatch) {
    let rawRel = relMatch[1];
    try {
      if (rawRel.includes('%')) {
        relatos = decodeURIComponent(rawRel);
      } else {
        relatos = rawRel;
      }
    } catch(e) {
      relatos = rawRel;
    }
    cleanObs = cleanObs.replace(/\n\n\[RELATOS:[\s\S]+?\]/g, '').replace(/\[RELATOS:[\s\S]+?\]/g, '');
  }

  // Buscar y extraer [ADJUNTO:data] (admite JSON codificado o URLs directas)
  const adjMatch = cleanObs.match(/\[ADJUNTO:([\s\S]+?)\](?=\s*$|\s*\[CONFIDENCIAL:)/) || cleanObs.match(/\[ADJUNTO:([^\]]+)\]/);
  if (adjMatch) {
    let raw = adjMatch[1];
    try {
      if (raw.includes('%')) {
        adjunto = decodeURIComponent(raw);
      } else {
        adjunto = raw;
      }
    } catch(e) {
      adjunto = raw;
    }
    cleanObs = cleanObs.replace(/\n\n\[ADJUNTO:[\s\S]+?\]/g, '').replace(/\[ADJUNTO:[\s\S]+?\]/g, '');
  }
  
  return { obs: cleanObs.trim(), creador, adjunto, relatos };
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

  // Handle adicionales participantes / relatos
  let partsList = [];
  try {
    partsList = JSON.parse(e.participantes_relatos || '[]');
  } catch (err) {
    partsList = [];
  }

  const pRow = document.getElementById('r-participantes-row');
  const pList = document.getElementById('r-participantes-list');
  const firmasCont = document.getElementById('r-firmas-container');

  if (pRow && pList) {
    if (partsList.length > 0) {
      pRow.style.display = 'grid';
      pList.innerHTML = partsList.map(p => `
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #cbd5e1;">
          <strong style="color: var(--text-primary);">${esc(p.nombre)}</strong> 
          <span style="font-size: 11px; color: var(--text-secondary); background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${esc(p.rol)}</span>
          <div style="font-size: 12px; color: #334155; margin-top: 4px; font-style: italic; white-space: pre-wrap;">"${esc(p.relato || 'Sin declaración registrada')}"</div>
        </div>
      `).join('');
    } else {
      pRow.style.display = 'none';
      pList.innerHTML = '';
    }
  }

  if (firmasCont) {
    let baseFirmas = `
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
    `;
    if (partsList.length > 0) {
      partsList.forEach(p => {
        if (p.nombre) {
          baseFirmas += `
            <div>
              <br><br>
              ________________________________________<br>
              <span style="font-size:11px; font-weight:600">Firma: ${esc(p.nombre)} (${esc(p.rol)})</span>
            </div>
          `;
        }
      });
    }
    firmasCont.innerHTML = baseFirmas;
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

function esEntrevistaVisibleParaUsuario(e, currentUser, currentNombre, userRole) {
  if (userRole === 'Administrador' || userRole === 'ADMINISTRADOR' || currentUser === 'admin') {
    return true;
  }
  
  if (!currentUser) return true;
  
  const uLower = (currentUser || '').trim().toLowerCase();
  const nLower = (currentNombre || '').trim().toLowerCase();
  
  // 1. Es el entrevistador responsable
  const respLower = (e.resp || '').trim().toLowerCase();
  if (respLower && (respLower === uLower || respLower === nLower || (nLower && respLower.includes(nLower)) || (nLower && nLower.includes(respLower)))) {
    return true;
  }
  
  // 2. Es el creador/autor de la entrevista
  const meta = parseObsMetadata(e.obs || '');
  if (meta.creador && (meta.creador.trim().toLowerCase() === uLower || meta.creador.trim().toLowerCase() === nLower)) {
    return true;
  }
  
  // 3. Es el Profesor Jefe asignado
  const jefeLower = (e.jefe || '').trim().toLowerCase();
  if (jefeLower && (jefeLower === uLower || jefeLower === nLower || (nLower && jefeLower.includes(nLower)) || (nLower && nLower.includes(jefeLower)))) {
    return true;
  }
  
  // 4. Está en la lista de participantes / relatos de la entrevista
  let relatos = [];
  try {
    const rawParts = e.participantes_relatos || meta.relatos || '[]';
    relatos = typeof rawParts === 'string' ? JSON.parse(rawParts) : rawParts;
  } catch(err) {
    relatos = [];
  }
  
  if (Array.isArray(relatos)) {
    const esRelator = relatos.some(p => {
      const pName = (p.nombre || '').trim().toLowerCase();
      return pName && (pName === uLower || pName === nLower || (nLower && pName.includes(nLower)) || (nLower && nLower.includes(pName)));
    });
    if (esRelator) return true;
  }
  
  return false;
}

async function filtrarHistorial() {
  const q = txt(document.getElementById('hist-q').value).toLowerCase();
  const est = document.getElementById('hist-estado').value;
  const modoAgrupar = document.getElementById('hist-agrupar')?.value || 'ninguno';
  const divTabla = document.getElementById('hist-contenedor-tabla');
  const divAgrupado = document.getElementById('hist-contenedor-agrupado');

  try {
    const res = await fetch(`/api/entrevistas?q=${encodeURIComponent(q)}&estado=${encodeURIComponent(est)}`);
    const allEntrevistas = await res.json();
    
    const currentUser = sessionStorage.getItem('campanario_user');
    const userRole = sessionStorage.getItem('campanario_perfil');
    const currentNombre = sessionStorage.getItem('campanario_nombre');
    
    entrevistas = allEntrevistas.filter(e => esEntrevistaVisibleParaUsuario(e, currentUser, currentNombre, userRole));
    
    if (modoAgrupar !== 'ninguno') {
      if (divTabla) divTabla.style.display = 'none';
      if (divAgrupado) divAgrupado.style.display = 'flex';
      renderHistorialAgrupado(entrevistas, modoAgrupar);
      return;
    } else {
      if (divTabla) divTabla.style.display = 'block';
      if (divAgrupado) divAgrupado.style.display = 'none';
    }

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
  const adjuntoVal = e.adjunto || meta.adjunto || '';
  currentAdjuntosList = parseAdjuntos(adjuntoVal);
  renderAdjuntosForm();

  try {
    participantesRelatosForm = JSON.parse(e.participantes_relatos || '[]');
  } catch (err) {
    participantesRelatosForm = [];
  }
  if (typeof renderParticipantesRelatosForm === 'function') renderParticipantesRelatosForm();
  
  setTimeout(() => {
    ['e-objetivo', 'e-motivo', 'e-acuerdos', 'e-obs'].forEach(fieldId => {
      const fieldEl = document.getElementById(fieldId);
      if (fieldEl) autoExpandTextarea(fieldEl);
    });
  }, 50);
  
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
      window.location.hash = 'inicio';
      goTo('inicio');
      
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
  
  // Navegar a la página inicial ('inicio' por defecto al ingresar por primera vez)
  if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
    window.location.hash = 'inicio';
  }
  const initialPage = window.location.hash.slice(1).split('?')[0] || 'inicio';
  goTo(initialPage);
}, 250);

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1).split('?')[0] || 'inicio';
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
    
    const currentUser = sessionStorage.getItem('campanario_user');
    const userRole = sessionStorage.getItem('campanario_perfil');
    const currentNombre = sessionStorage.getItem('campanario_nombre');
    
    // Filtrar por RUT y por permisos de visualización del usuario
    const userEnts = allEnts.filter(x => txt(x.rut).toUpperCase() === txt(rut).toUpperCase() && esEntrevistaVisibleParaUsuario(x, currentUser, currentNombre, userRole));
    
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

async function detenerMultivistaManual() {
  if (multiviewInterval) {
    clearInterval(multiviewInterval);
    multiviewInterval = null;
  }
  const prevId = multiviewSessionId;
  multiviewSessionId = null;
  
  if (prevId) {
    await terminarTransmisionMultivista(prevId);
  }
  
  cerrarMultivistaModal();
  toast('🔴 Transmisión finalizada y cerrada');
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
  const isCaminata = (e.cargo && e.cargo.includes('Caminata')) || (e.obs && e.obs.includes('[CAMINATA:')) || (e.objetivo && e.objetivo.includes('Caminata Pedagógica'));
  if (isCaminata) {
    return generarHtmlReporteCaminata(e, tieneAcceso);
  }

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
  const adjuntosList = parseAdjuntos(adjunto);
  let adjuntoHtml = '';
  if (adjuntosList.length > 0 && tieneAcceso) {
    adjuntoHtml = `
      <div class="rpt-row full no-print" style="border-bottom: 1px solid #94a3b8;">
        <div class="rpt-cell rpt-label">Documentación y Evidencias (${adjuntosList.length})</div>
        <div class="rpt-cell" style="min-height:36px; padding: 10px 14px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${adjuntosList.map(item => {
              const isFolder = item.type === 'folder' || (item.url && item.url.includes('drive.google.com/drive/folders'));
              const icon = isFolder ? '📁' : '📄';
              const labelName = item.name || (isFolder ? 'Carpeta Evidencias Google Drive' : 'Ver documento / Evidencia');
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">${icon}</span>
                    <strong style="font-size: 13px; color: #1e293b;">${esc(labelName)}</strong>
                  </div>
                  <a href="${esc(item.url)}" target="_blank" style="color: var(--primary, #4f46e5); font-weight: 600; text-decoration: none; font-size: 12px;">🔗 Abrir Enlace</a>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  const logoUrl = getLogoUrl();
  let logoHeaderHtml = '';
  if (logoUrl) {
    logoHeaderHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--primary, #4f46e5); padding-bottom: 12px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <img src="${esc(logoUrl)}" alt="Logo Institucional" style="max-height: 60px; max-width: 150px; object-fit: contain;">
          <div>
            <h2 style="font-size:18px; margin:0; font-family:var(--font-title); font-weight:800; color:#0f172a;">Ficha de Entrevista Institucional</h2>
            <span style="font-size:12px; font-weight:600; color:var(--text-secondary,#64748b);">Liceo Técnico Profesional Campanario — RBD 3941</span>
          </div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b; border-left: 1px solid #cbd5e1; padding-left: 12px;">
          <strong style="color: #1e293b;">DOCUMENTO OFICIAL</strong><br>
          <span>Sistema Integral 2026</span>
        </div>
      </div>
    `;
  } else {
    logoHeaderHtml = `
      <div class="rpt-title">
        <h2 style="font-size:18px; margin-bottom:6px; font-family:var(--font-title); font-weight:800">Ficha de Entrevista Institucional</h2>
        <strong style="font-size:12px; color:var(--text-secondary)">Liceo Técnico Profesional Campanario — RBD 3941</strong>
      </div>
    `;
  }
  
  return `
    <div class="report-block">
      ${logoHeaderHtml}
      
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
  
  // 2. Terminar en Supabase (marcando como CLOSED primero para notificar inmediatamente a multiview.html)
  try {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    };
    
    // Patch a CLOSED primero para que la segunda pantalla detecte el cierre al instante
    await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { ...headers },
      body: JSON.stringify({ estado: 'CLOSED' })
    });

    // Eliminar la sesión temporal en Supabase poco después
    setTimeout(async () => {
      try {
        await originalFetch(`${SUPABASE_URL}/rest/v1/entrevistas?id=eq.${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
          headers: { ...headers }
        });
      } catch(e) {}
    }, 2000);
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
    
    for (const item of list) {
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
        item.estudiante_nombre = ent.nombre || item.estudiante_nombre || 'Estudiante no registrado';
        item.objetivo = ent.objetivo || item.objetivo || 'Sin objetivo';
        item.fecha = ent.fecha || item.fecha || '---';
        item.entrevistador = ent.resp || item.entrevistador || 'Docente Responsable';
      } else if (!item.estudiante_nombre) {
        item.estudiante_nombre = "Entrevista " + item.entrevista_id;
        item.objetivo = "Aporte a entrevista pendiente";
        item.fecha = "---";
        item.entrevistador = "Docente responsable";
      }
    }
    
    container.innerHTML = list.map(item => `
      <div class="card nav-notif-item" style="border: 1px solid #7dd3fc; background: #fff; padding: 16px; margin: 0; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 10px; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onclick="irAEntrevistaNotif('${esc(item.entrevista_id)}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;">
              🎓 Estudiante Entrevistado:
            </div>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 700; display: block;">${esc(item.estudiante_nombre)}</strong>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>📋 <strong>ID:</strong> <code style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:bold;">${esc(item.entrevista_id)}</code></span>
              <span>👤 <strong>Invitado por:</strong> ${esc(item.entrevistador)}</span>
              <span>📅 ${esc(item.fecha)}</span>
            </div>
          </div>
          <span class="badge badge-amarillo" style="font-size: 11.5px; background: #fef3c7; color: #d97706; padding: 4px 10px; border-radius: 999px; font-weight: 700;">Pendiente</span>
        </div>
        <div style="background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #0284c7; margin-top: 2px;">
          <strong style="font-size:11px; text-transform:uppercase; color:#0369a1; display:block; margin-bottom: 2px;">🎯 Objetivo de la Entrevista:</strong>
          <span style="font-size: 13px; color: #334155; line-height: 1.4;">${esc(item.objetivo)}</span>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
          <button type="button" class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size:12px;" onclick="event.stopPropagation(); descartarNotificacion('${esc(item.entrevista_id)}')">Descartar</button>
          <button type="button" class="btn btn-sm btn-primary" style="padding: 6px 16px; font-size:12px; font-weight: 700; background: #0284c7; border-color: #0284c7;">📄 Abrir Ficha de Entrevista (${esc(item.entrevista_id)})</button>
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


// ══════════════════════════════════════════════════════════════════════
// 🖼️ GESTIÓN DE LOGO INSTITUCIONAL Y 📂 DOCUMENTOS / EVIDENCIAS
// ══════════════════════════════════════════════════════════════════════

let currentLogoUrl = null;
let currentAdjuntosList = [];

function getLogoUrl() {
  return currentLogoUrl || localStorage.getItem('campanario_logo') || null;
}

async function cargarLogoInstitucional() {
  try {
    const res = await fetch('/api/config/logo');
    const data = await res.json();
    if (data && data.success && data.logo_url) {
      currentLogoUrl = data.logo_url;
      localStorage.setItem('campanario_logo', data.logo_url);
    } else {
      currentLogoUrl = localStorage.getItem('campanario_logo') || null;
    }
  } catch (err) {
    currentLogoUrl = localStorage.getItem('campanario_logo') || null;
  }
  actualizarVistaLogo();
}

function actualizarVistaLogo() {
  const url = getLogoUrl();
  const headerImg = document.getElementById('header-logo-img');
  
  if (url && headerImg) {
    headerImg.src = url;
    headerImg.style.display = 'inline-block';
  } else if (headerImg) {
    headerImg.style.display = 'none';
  }
  
  const configPreview = document.getElementById('config-logo-preview');
  const configPlaceholder = document.getElementById('config-logo-placeholder');
  if (configPreview && configPlaceholder) {
    if (url) {
      configPreview.src = url;
      configPreview.style.display = 'block';
      configPlaceholder.style.display = 'none';
    } else {
      configPreview.style.display = 'none';
      configPlaceholder.style.display = 'block';
    }
  }
  
  const modalPreview = document.getElementById('modal-logo-preview');
  const modalPlaceholder = document.getElementById('modal-logo-placeholder');
  if (modalPreview && modalPlaceholder) {
    if (url) {
      modalPreview.src = url;
      modalPreview.style.display = 'block';
      modalPlaceholder.style.display = 'none';
    } else {
      modalPreview.style.display = 'none';
      modalPlaceholder.style.display = 'block';
    }
  }
}

async function subirLogoProceso(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function() {
    const base64Data = reader.result;
    try {
      const res = await fetch('/api/config/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: base64Data })
      });
      const data = await res.json();
      if (data && data.success) {
        currentLogoUrl = data.logo_url || base64Data;
        localStorage.setItem('campanario_logo', currentLogoUrl);
        actualizarVistaLogo();
        toast('🖼️ Logo institucional cargado y guardado correctamente');
      } else {
        toast('❌ Error al subir logo: ' + (data.error || 'Desconocido'));
      }
    } catch (err) {
      console.error('Error al guardar logo:', err);
      currentLogoUrl = base64Data;
      localStorage.setItem('campanario_logo', base64Data);
      actualizarVistaLogo();
      toast('🖼️ Logo institucional actualizado localmente');
    }
  };
  reader.readAsDataURL(file);
}

function subirLogoDesdeConfig(input) {
  if (input.files && input.files[0]) {
    subirLogoProceso(input.files[0]);
    input.value = '';
  }
}

function subirLogoDesdeModal(input) {
  if (input.files && input.files[0]) {
    subirLogoProceso(input.files[0]);
    input.value = '';
    cerrarModalLogo();
  }
}

async function resetearLogo() {
  try {
    await fetch('/api/config/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoUrl: 'RESET' })
    });
  } catch (err) {}
  
  currentLogoUrl = null;
  localStorage.removeItem('campanario_logo');
  actualizarVistaLogo();
  toast('↺ Logo restablecido al valor por defecto');
}

function abrirModalLogo() {
  actualizarVistaLogo();
  const m = document.getElementById('modal-logo');
  if (m) m.classList.add('open');
}

function cerrarModalLogo() {
  const m = document.getElementById('modal-logo');
  if (m) m.classList.remove('open');
}

// ── MANEJO DE ADJUNTOS / DOCUMENTOS Y DRIVE ──
function formatAdjuntoItem(item) {
  if (!item) return null;
  let url = typeof item === 'string' ? item : item.url;
  if (!url || typeof url !== 'string') return null;
  
  url = url.trim();
  if (!url) return null;
  
  let type = (item && item.type) || 'link';
  let name = (item && item.name) || '';
  
  const isFolder = type === 'folder' || url.includes('drive.google.com/drive/folders');
  const isDriveFile = url.includes('drive.google.com');
  const isLocalUpload = url.startsWith('/uploads/');
  
  if (!name || name.startsWith('{') || name.startsWith('[')) {
    if (isFolder) name = '📁 Carpeta de Evidencias Google Drive';
    else if (isDriveFile) name = '📄 Archivo Google Drive';
    else if (isLocalUpload) name = '📄 Archivo ' + url.split('/').pop().replace(/^\d+_/, '');
    else name = '🔗 Enlace / Documento';
  }
  
  if (isFolder) type = 'folder';
  else type = 'file';
  
  return {
    name: name,
    url: url,
    type: type,
    date: (item && item.date) || new Date().toISOString().split('T')[0]
  };
}

function parseAdjuntos(adjuntoVal) {
  if (!adjuntoVal) return [];
  if (typeof adjuntoVal === 'object') {
    if (Array.isArray(adjuntoVal)) return adjuntoVal.map(formatAdjuntoItem).filter(Boolean);
    return [formatAdjuntoItem(adjuntoVal)].filter(Boolean);
  }
  
  adjuntoVal = String(adjuntoVal).trim();
  if (!adjuntoVal) return [];
  
  if (adjuntoVal.includes('%')) {
    try {
      adjuntoVal = decodeURIComponent(adjuntoVal);
    } catch(e) {}
  }
  
  // Intento 1: Parsear JSON si empieza y termina con llaves/corchetes
  if ((adjuntoVal.startsWith('[') && adjuntoVal.endsWith(']')) || (adjuntoVal.startsWith('{') && adjuntoVal.endsWith('}'))) {
    try {
      const parsed = JSON.parse(adjuntoVal);
      if (Array.isArray(parsed)) {
        return parsed.map(formatAdjuntoItem).filter(Boolean);
      } else if (parsed && typeof parsed === 'object') {
        return [formatAdjuntoItem(parsed)].filter(Boolean);
      }
    } catch (err) {}
  }
  
  // Intento 2: Extracción con Regex para recuperar URLs incluso de strings corruptos o cortados
  const urlMatches = adjuntoVal.match(/(https?:\/\/[^\s,\]"'}]+|\/uploads\/[^\s,\]"'}]+)/g);
  if (urlMatches && urlMatches.length > 0) {
    return urlMatches.map(url => formatAdjuntoItem({ url }));
  }
  
  return [];
}

function renderAdjuntosForm() {
  const container = document.getElementById('e-adjuntos-list');
  const hiddenInput = document.getElementById('e-adjunto');
  if (!container || !hiddenInput) return;
  
  hiddenInput.value = currentAdjuntosList.length > 0 ? JSON.stringify(currentAdjuntosList) : '';
  
  if (currentAdjuntosList.length === 0) {
    container.innerHTML = `<span style="font-size: 12px; color: var(--text-secondary); font-style: italic;">No hay documentos ni carpetas adjuntas en esta entrevista.</span>`;
    return;
  }
  
  container.innerHTML = currentAdjuntosList.map((rawItem, idx) => {
    const item = formatAdjuntoItem(rawItem);
    if (!item) return '';
    const isFolder = item.type === 'folder' || (item.url && item.url.includes('drive.google.com/drive/folders'));
    const icon = isFolder ? '📁' : '📄';
    const itemTitle = esc(item.name || (isFolder ? 'Carpeta Google Drive' : 'Documento Evidencia'));
    const itemUrl = esc(item.url);
    
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
          <span style="font-size: 16px;">${icon}</span>
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <strong style="font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${itemTitle}</strong>
            <a href="${itemUrl}" target="_blank" style="font-size: 11.5px; color: var(--primary, #4f46e5); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">🔗 ${itemUrl}</a>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <a href="${itemUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">🔗 Abrir</a>
          <button type="button" class="btn btn-secondary btn-sm" onclick="eliminarAdjuntoForm(${idx})" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function agregarEnlaceAdjuntoForm() {
  const urlEl = document.getElementById('e-adjunto-url');
  const nameEl = document.getElementById('e-adjunto-nombre');
  const url = (urlEl ? urlEl.value : '').trim();
  let name = (nameEl ? nameEl.value : '').trim();
  
  if (!url) {
    toast('⚠️ Ingrese un enlace de Google Drive o documento');
    return;
  }
  
  const isFolder = url.includes('drive.google.com/drive/folders');
  if (!name) {
    name = isFolder ? '📁 Carpeta de Evidencias Google Drive' : '🔗 Documento / Evidencia Drive';
  }
  
  currentAdjuntosList.push({
    name: name,
    url: url,
    type: isFolder ? 'folder' : 'link',
    date: new Date().toISOString().split('T')[0]
  });
  
  if (urlEl) urlEl.value = '';
  if (nameEl) nameEl.value = '';
  renderAdjuntosForm();
  toast('✅ Documento/Enlace agregado correctamente');
}

async function subirArchivoLocalForm(input) {
  const file = input.files[0];
  if (!file) return;
  
  const btn = document.getElementById('btn-upload-file-local');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Subiendo...'; btn.disabled = true; }
  
  const reader = new FileReader();
  reader.onload = async function() {
    const base64Data = reader.result;
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64Data: base64Data })
      });
      const data = await res.json();
      if (data && data.success) {
        currentAdjuntosList.push({
          name: file.name,
          url: data.url,
          type: 'file',
          date: new Date().toISOString().split('T')[0]
        });
        renderAdjuntosForm();
        toast('📁 Archivo subido con éxito al servidor');
      } else {
        toast('❌ Error al subir archivo: ' + (data.error || 'Desconocido'));
      }
    } catch (err) {
      console.error('Error al subir archivo:', err);
      toast('❌ Error de conexión al subir archivo');
    } finally {
      if (btn) { btn.innerHTML = origText; btn.disabled = false; }
      input.value = '';
    }
  };
  reader.readAsDataURL(file);
}

function eliminarAdjuntoForm(idx) {
  currentAdjuntosList.splice(idx, 1);
  renderAdjuntosForm();
}

// ── CARPETAS PRINCIPALES DE GOOGLE DRIVE ──
function getCarpetasPrincipalesDrive() {
  const data = localStorage.getItem('campanario_master_drive_folders');
  if (data) {
    try { return JSON.parse(data); } catch (e) {}
  }
  // Carpetas por defecto si no existen
  return [
    {
      id: 'default-1',
      title: '📁 Unidad Compartida Evidencias 2026',
      url: 'https://drive.google.com',
      date: '2026-07-30'
    },
    {
      id: 'default-2',
      title: '📁 Carpetas de Expedientes y Fichas de Estudiantes',
      url: 'https://drive.google.com',
      date: '2026-07-30'
    }
  ];
}

function renderCarpetasPrincipalesDrive() {
  const container = document.getElementById('grid-carpetas-principales');
  if (!container) return;
  
  const folders = getCarpetasPrincipalesDrive();
  if (folders.length === 0) {
    container.innerHTML = `<span style="font-size: 13px; color: var(--text-secondary); font-style: italic; grid-column: 1/-1;">No hay carpetas principales vinculadas aún. Haga clic en "Agregar Carpeta de Drive" para agregar una.</span>`;
    return;
  }
  
  container.innerHTML = folders.map(f => `
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; transition: transform 0.2s, box-shadow 0.2s; box-shadow: var(--shadow-sm);">
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <span style="font-size: 26px;">📁</span>
        <div style="min-width: 0; flex: 1;">
          <strong style="font-size: 14px; font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 2px;">${esc(f.title)}</strong>
          <a href="${esc(f.url)}" target="_blank" style="font-size: 11.5px; color: var(--primary, #4f46e5); text-decoration: none; word-break: break-all;">🔗 ${esc(f.url)}</a>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px;">
        <a href="${esc(f.url)}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none; font-size: 12px; padding: 5px 12px;">🔗 Abrir en Google Drive</a>
        <button type="button" class="btn btn-secondary btn-sm" onclick="eliminarCarpetaDrivePrincipal('${esc(f.id)}')" style="padding: 5px 8px; font-size: 11px; color: #ef4444;" title="Eliminar carpeta del listado">🗑️</button>
      </div>
    </div>
  `).join('');
}

function toggleFormNuevaCarpetaDrive() {
  const form = document.getElementById('form-nueva-carpeta-drive');
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
}

function guardarCarpetaDrivePrincipal() {
  const titleEl = document.getElementById('drive-folder-title');
  const urlEl = document.getElementById('drive-folder-url');
  
  const title = (titleEl ? titleEl.value : '').trim();
  const url = (urlEl ? urlEl.value : '').trim();
  
  if (!url) {
    toast('⚠️ Ingrese el enlace de Google Drive');
    return;
  }
  
  const folders = getCarpetasPrincipalesDrive();
  folders.push({
    id: 'folder-' + Date.now(),
    title: title || '📁 Carpeta Google Drive',
    url: url,
    date: new Date().toISOString().split('T')[0]
  });
  
  localStorage.setItem('campanario_master_drive_folders', JSON.stringify(folders));
  
  if (titleEl) titleEl.value = '';
  if (urlEl) urlEl.value = '';
  toggleFormNuevaCarpetaDrive();
  renderCarpetasPrincipalesDrive();
  toast('📁 Carpeta principal vinculada correctamente');
}

function eliminarCarpetaDrivePrincipal(id) {
  let folders = getCarpetasPrincipalesDrive();
  folders = folders.filter(f => f.id !== id);
  localStorage.setItem('campanario_master_drive_folders', JSON.stringify(folders));
  renderCarpetasPrincipalesDrive();
  toast('🗑️ Carpeta eliminada del panel principal');
}

async function renderEvidenciasPage() {
  renderCarpetasPrincipalesDrive();
  
  const tbody = document.getElementById('tbl-evidencias-body');
  if (tbody && (!Array.isArray(entrevistas) || entrevistas.length === 0)) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-secondary);">
          <span style="font-size: 15px;">⏳ Cargando documentos y entrevistas desde la base de datos...</span>
        </td>
      </tr>
    `;
  }
  
  try {
    const res = await fetch('/api/entrevistas');
    const data = await res.json();
    if (Array.isArray(data)) {
      entrevistas = data;
    } else if (data && Array.isArray(data.data)) {
      entrevistas = data.data;
    }
  } catch (err) {
    console.error("Error al cargar entrevistas para evidencias:", err);
  }
  
  if (!Array.isArray(entrevistas)) {
    entrevistas = [];
  }
  
  filtrarEvidencias();
}

function filtrarEvidencias() {
  const qEl = document.getElementById('search-evidencias');
  const modoEl = document.getElementById('filter-evidencias-modo');
  const q = (qEl ? qEl.value : '').trim().toLowerCase();
  const modo = modoEl ? modoEl.value : 'con_evidencia';
  const tbody = document.getElementById('tbl-evidencias-body');
  if (!tbody) return;
  
  let rowsHtml = '';
  let count = 0;
  
  const list = Array.isArray(entrevistas) ? entrevistas : [];
  
  list.forEach(e => {
    if (!e || typeof e !== 'object') return;
    
    const adjuntoVal = e.adjunto || parseObsMetadata(e.obs || '').adjunto;
    const items = parseAdjuntos(adjuntoVal);
    
    if (modo === 'con_evidencia' && (!adjuntoVal || items.length === 0)) {
      return;
    }
    
    if (items.length > 0) {
      items.forEach(item => {
        const isFolder = item.type === 'folder' || (item.url && item.url.includes('drive.google.com/drive/folders'));
        const tipoBadge = isFolder 
          ? `<span class="badge" style="background: #e0e7ff; color: #3730a3; font-weight: 700;">📁 Carpeta Drive</span>`
          : `<span class="badge" style="background: #f1f5f9; color: #334155; font-weight: 700;">📄 Documento</span>`;
          
        const docName = item.name || (isFolder ? 'Carpeta Google Drive' : 'Documento Evidencia');
        const textToSearch = `${docName} ${e.rut || ''} ${e.nombre || ''} ${e.curso || ''} ${e.id || ''} ${e.cargo || ''}`.toLowerCase();
        
        if (q && !textToSearch.includes(q)) return;
        
        count++;
        rowsHtml += `
          <tr>
            <td>${tipoBadge}</td>
            <td>
              <strong style="font-size:13.5px; color:var(--text-primary); display:block;">${esc(docName)}</strong>
              <a href="${esc(item.url)}" target="_blank" style="font-size:11.5px; color:var(--primary, #4f46e5); text-decoration:none;">🔗 ${esc(item.url)}</a>
            </td>
            <td><span style="font-weight:700;">${esc(e.id || '')}</span><br><span style="font-size:12px; color:var(--text-secondary);">${esc(e.fecha || '')}</span></td>
            <td><strong>${esc(e.nombre || 'Sin nombre')}</strong><br><span style="font-family:monospace; font-size:11.5px; color:var(--text-secondary);">${esc(e.rut || '')}</span></td>
            <td>${esc(e.cargo || '')} ${e.curso ? '— ' + esc(e.curso) : ''}</td>
            <td>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <a href="${esc(item.url)}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none; font-size:12px; padding: 4px 10px;">🔗 Abrir Enlace</a>
                <button type="button" class="btn btn-secondary btn-sm" onclick="cargarReporteDesdeHash('${esc(e.id)}')" style="font-size:12px; padding: 4px 10px;">📝 Ver Ficha</button>
              </div>
            </td>
          </tr>
        `;
      });
    } else {
      // Entrevista sin evidencias todavía (modo 'todas')
      const textToSearch = `${e.rut || ''} ${e.nombre || ''} ${e.curso || ''} ${e.id || ''} ${e.cargo || ''}`.toLowerCase();
      if (q && !textToSearch.includes(q)) return;
      
      count++;
      rowsHtml += `
        <tr style="opacity: 0.85;">
          <td><span class="badge" style="background: #fef3c7; color: #92400e; font-weight: 700;">⚠️ Sin Adjunto</span></td>
          <td>
            <span style="font-size:13px; color:var(--text-secondary); font-style:italic;">No hay archivo ni carpeta Drive vinculada</span>
          </td>
          <td><span style="font-weight:700;">${esc(e.id || '')}</span><br><span style="font-size:12px; color:var(--text-secondary);">${esc(e.fecha || '')}</span></td>
          <td><strong>${esc(e.nombre || 'Sin nombre')}</strong><br><span style="font-family:monospace; font-size:11.5px; color:var(--text-secondary);">${esc(e.rut || '')}</span></td>
          <td>${esc(e.cargo || '')} ${e.curso ? '— ' + esc(e.curso) : ''}</td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" onclick="cargarEntrevistaParaEditarDirecto('${esc(e.id)}')" style="font-size:12px; padding: 4px 10px;">➕ Vincular Drive</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="cargarReporteDesdeHash('${esc(e.id)}')" style="font-size:12px; padding: 4px 10px;">📝 Ver Ficha</button>
            </div>
          </td>
        </tr>
      `;
    }
  });
  
  if (count === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-secondary);">
          ${q ? 'No se encontraron documentos ni entrevistas que coincidan con la búsqueda.' : 'No hay documentos ni carpetas Drive adjuntas en esta categoría.'}
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = rowsHtml;
  }
}

// Inicializar logo al cargar
cargarLogoInstitucional();

// ═════════════════════════════════════════════════════════════════════
// 🚶‍♂️ MÓDULO CAMINATA PEDAGÓGICA (PROYECTO ADECO & SELLOS PEI)
// ═════════════════════════════════════════════════════════════════════
let editandoCaminataId = null;

async function cargarObservadoresSelect() {
  const sel1 = document.getElementById('cp-obs1');
  const sel2 = document.getElementById('cp-obs2');
  const sel3 = document.getElementById('cp-obs3');
  if (!sel1 || !sel2 || !sel3) return;

  try {
    const [resDoc, resAsi] = await Promise.all([
      fetch('/api/docentes?_=' + Date.now()).then(r => r.json()).catch(() => []),
      fetch('/api/asistentes?_=' + Date.now()).then(r => r.json()).catch(() => [])
    ]);

    const personal = [];
    (resDoc || []).forEach(d => {
      const nom = [d.Nombres, d['Apellido Paterno'], d['Apellido Materno']].filter(Boolean).join(' ').trim();
      if (nom) personal.push({ nombre: nom, cargo: d.Cargo || d['Función/curso'] || 'Docente' });
    });
    (resAsi || []).forEach(a => {
      const nom = [a.Nombres, a['Apellido Paterno'], a['Apellido Materno']].filter(Boolean).join(' ').trim();
      if (nom) personal.push({ nombre: nom, cargo: a.Cargo || a.Función || 'Asistente de la Educación' });
    });

    personal.sort((a, b) => a.nombre.localeCompare(b.nombre));

    let optionsHtml1 = '<option value="">-- Seleccionar Observador Principal --</option>';
    let optionsHtml2 = '<option value="">-- Sin segundo observador --</option>';
    let optionsHtml3 = '<option value="">-- Sin tercer observador --</option>';

    personal.forEach(p => {
      const label = `${p.nombre} (${p.cargo})`;
      optionsHtml1 += `<option value="${esc(p.nombre)}">${esc(label)}</option>`;
      optionsHtml2 += `<option value="${esc(p.nombre)}">${esc(label)}</option>`;
      optionsHtml3 += `<option value="${esc(p.nombre)}">${esc(label)}</option>`;
    });

    sel1.innerHTML = optionsHtml1;
    sel2.innerHTML = optionsHtml2;
    sel3.innerHTML = optionsHtml3;

    const curUser = sessionStorage.getItem('campanario_user');
    if (curUser) {
      const match = personal.find(p => p.nombre.toLowerCase().includes(curUser.toLowerCase()));
      if (match) sel1.value = match.nombre;
    }
  } catch (e) {
    console.error("Error al cargar observadores:", e);
  }
}

function abrirLookupCaminata() {
  abrirLookup(function(persona) {
    if (persona) {
      document.getElementById('cp-rut').value = persona.RUT || persona.Rut || '';
      document.getElementById('cp-docente').value = [persona.Nombres, persona['Apellido Paterno'], persona['Apellido Materno']].filter(Boolean).join(' ').trim();
      document.getElementById('cp-asig').value = persona.Asignatura || persona['Profesor de Asignatura'] || persona.Cargo || 'Docente de Aula';
      document.getElementById('cp-curso').value = persona.Curso || persona['Función/curso'] || 'Varios Cursos';
    }
  });
}

async function autocompletarCaminata() {
  const rutInput = document.getElementById('cp-rut');
  if (!rutInput) return;
  let rut = rutInput.value.trim();
  if (!rut) return;

  const formatted = formatearRut(rut);
  if (formatted) {
    rutInput.value = formatted;
    rut = formatted;
  }

  const cleanRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleanRut.length < 7) return;

  try {
    let p = null;
    const res = await fetch(`/api/personas/buscar?q=${encodeURIComponent(cleanRut)}`);
    if (res.ok) {
      const results = await res.json();
      p = results.find(x => {
        const xClean = (x.RUT || x.Rut || x.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
        return xClean === cleanRut;
      });
    }

    if (!p) {
      const resSingle = await fetch(`/api/persona?rut=${encodeURIComponent(cleanRut)}`);
      if (resSingle.ok) {
        const single = await resSingle.json();
        if (single && (single.RUT || single.Rut || single.Nombres)) p = single;
      }
    }

    if (p) {
      const nom = [p.Nombres, p['Apellido Paterno'] || p['Apellido paterno'] || '', p['Apellido Materno'] || p['Apellido materno'] || ''].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
      document.getElementById('cp-docente').value = nom;
      document.getElementById('cp-asig').value = p.Asignatura || p['Profesor de Asignatura'] || p.Cargo || 'Docente de Aula';
      document.getElementById('cp-curso').value = p.Curso || p['Función/curso'] || 'Varios Cursos';
      toast(`✅ Docente encontrado: ${nom}`);
    }
  } catch(e) {
    console.error("Error al autocompletar caminata:", e);
  }
}

function agregarFilaCompromisoCaminata(compData = {}) {
  const tbody = document.getElementById('cp-compromisos-body');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.style.borderBottom = '1px solid var(--border)';
  tr.innerHTML = `
    <td style="padding:6px;"><textarea class="cp-comp-desc" rows="2" placeholder="Ej: Diversificar guías de trabajo..." oninput="this.style.height = ''; this.style.height = Math.max(38, this.scrollHeight) + 'px'">${esc(compData.comp || '')}</textarea></td>
    <td style="padding:6px;"><input class="cp-comp-resp" value="${esc(compData.resp || '')}" placeholder="Ej: Docente y UTP" style="width:100%; font-size:12px;"></td>
    <td style="padding:6px;"><input type="date" class="cp-comp-plazo" value="${esc(compData.plazo || '')}" style="width:100%; font-size:12px;"></td>
    <td style="padding:6px;"><textarea class="cp-comp-evid" rows="2" placeholder="Ej: Planificación de aula" oninput="this.style.height = ''; this.style.height = Math.max(38, this.scrollHeight) + 'px'">${esc(compData.evidencia || '')}</textarea></td>
    <td style="padding:6px; text-align:center;"><button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('tr').remove()" style="padding:4px 8px; color:var(--danger)">🗑️</button></td>
  `;
  tbody.appendChild(tr);
}

function limpiarFormCaminata() {
  editandoCaminataId = null;
  const fields = ['cp-rut', 'cp-docente', 'cp-asig', 'cp-curso', 'cp-lugar', 'cp-fortalezas', 'cp-mejoras'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const now = new Date();
  const fechaEl = document.getElementById('cp-fecha');
  const horaEl = document.getElementById('cp-hora');
  if (fechaEl) fechaEl.value = now.toISOString().split('T')[0];
  if (horaEl) horaEl.value = now.toTimeString().split(' ')[0].substring(0, 5);

  document.querySelectorAll('.cp-eval-val').forEach(sel => sel.value = 'Observable');
  document.querySelectorAll('.cp-eval-obs').forEach(inp => inp.value = '');

  const tbody = document.getElementById('cp-compromisos-body');
  if (tbody) {
    tbody.innerHTML = '';
    agregarFilaCompromisoCaminata();
  }

  cargarObservadoresSelect();
}

async function guardarCaminataPedagogica() {
  const rut = document.getElementById('cp-rut').value.trim();
  const docente = document.getElementById('cp-docente').value.trim();
  const asig = document.getElementById('cp-asig').value.trim();
  const curso = document.getElementById('cp-curso').value.trim();
  const fecha = document.getElementById('cp-fecha').value;
  const hora = document.getElementById('cp-hora').value;
  const tiempo = document.getElementById('cp-tiempo').value || '10 a 15 minutos';
  const lugar = document.getElementById('cp-lugar').value.trim() || 'Sala de Clases';
  const obs1 = document.getElementById('cp-obs1').value;
  const obs2 = document.getElementById('cp-obs2').value;
  const obs3 = document.getElementById('cp-obs3').value;
  const sello = document.getElementById('cp-sello').value;
  const proyecto = document.getElementById('cp-proyecto').value;

  if (!rut || !docente) {
    toast('⚠️ Ingrese el RUT y Nombre del docente visitado');
    return;
  }
  if (!fecha || !hora) {
    toast('⚠️ Ingrese la Fecha y Hora de la visita');
    return;
  }
  if (!obs1) {
    toast('⚠️ Seleccione al menos el Observador Principal 1');
    return;
  }

  const evals = {};
  document.querySelectorAll('.cp-eval-val').forEach(sel => {
    const key = sel.getAttribute('data-ind');
    const val = sel.value;
    const obsInput = document.querySelector(`.cp-eval-obs[data-ind="${key}"]`);
    const obsText = obsInput ? obsInput.value.trim() : '';
    evals[key] = { val, obs: obsText };
  });

  const fortalezas = document.getElementById('cp-fortalezas').value.trim();
  const mejoras = document.getElementById('cp-mejoras').value.trim();

  const compromisos = [];
  document.querySelectorAll('#cp-compromisos-body tr').forEach(tr => {
    const compDesc = tr.querySelector('.cp-comp-desc');
    const compResp = tr.querySelector('.cp-comp-resp');
    const compPlazo = tr.querySelector('.cp-comp-plazo');
    const compEvid = tr.querySelector('.cp-comp-evid');

    if (compDesc && compResp) {
      const comp = compDesc.value.trim();
      const resp = compResp.value.trim();
      const plazo = compPlazo ? compPlazo.value : '';
      const evidencia = compEvid ? compEvid.value.trim() : '';
      if (comp || resp) {
        compromisos.push({ comp, resp, plazo, evidencia });
      }
    }
  });

  const dataCaminata = {
    docente, rut, asig, curso, fecha, hora, tiempo, lugar, obs1, obs2, obs3, sello, proyecto,
    evals, fortalezas, mejoras, compromisos
  };

  const payloadObs = `[CAMINATA:${encodeURIComponent(JSON.stringify(dataCaminata))}]`;

  const payload = {
    id: editandoCaminataId || null,
    rut: rut,
    nombre: docente,
    cargo: "Docente — Caminata Pedagógica ADECO",
    curso: curso,
    jefe: obs1,
    asig: asig,
    pie: obs2 ? (obs3 ? `${obs2} / ${obs3}` : obs2) : 'No aplica',
    fecha: fecha,
    hora: hora,
    resp: obs1,
    estado: "REALIZADA",
    seguimiento: compromisos.length > 0 && compromisos[0].plazo ? compromisos[0].plazo : fecha,
    objetivo: `Visita de Aula ADECO — Caminata Pedagógica (${sello})`,
    motivo: `Observación Breve (10-15 min) en ${lugar}. Sello PEI: ${sello}.`,
    acuerdos: compromisos.map(c => `• ${c.comp} (Resp: ${c.resp}, Plazo: ${c.plazo || 'Sin fecha'})`).join('\n') || 'Sin compromisos específicos.',
    obs: payloadObs
  };

  try {
    const res = await fetch('/api/entrevistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      toast('✅ Caminata Pedagógica guardada con éxito: ' + result.id);
      loadAllData();
      limpiarFormCaminata();
      goTo('historial');
    } else {
      toast('❌ Error: ' + result.error);
    }
  } catch (err) {
    console.error("Error al guardar caminata:", err);
    toast('❌ Error de conexión al servidor');
  }
}

function previsualizarCaminata() {
  const rut = document.getElementById('cp-rut').value.trim();
  const docente = document.getElementById('cp-docente').value.trim();
  const asig = document.getElementById('cp-asig').value.trim();
  const curso = document.getElementById('cp-curso').value.trim();
  const fecha = document.getElementById('cp-fecha').value;
  const hora = document.getElementById('cp-hora').value;
  const tiempo = document.getElementById('cp-tiempo').value || '10 a 15 minutos';
  const lugar = document.getElementById('cp-lugar').value.trim() || 'Sala de Clases';
  const obs1 = document.getElementById('cp-obs1').value;
  const obs2 = document.getElementById('cp-obs2').value;
  const obs3 = document.getElementById('cp-obs3').value;
  const sello = document.getElementById('cp-sello').value;
  const proyecto = document.getElementById('cp-proyecto').value;

  const evals = {};
  document.querySelectorAll('.cp-eval-val').forEach(sel => {
    const key = sel.getAttribute('data-ind');
    const val = sel.value;
    const obsInput = document.querySelector(`.cp-eval-obs[data-ind="${key}"]`);
    const obsText = obsInput ? obsInput.value.trim() : '';
    evals[key] = { val, obs: obsText };
  });

  const fortalezas = document.getElementById('cp-fortalezas').value.trim();
  const mejoras = document.getElementById('cp-mejoras').value.trim();

  const compromisos = [];
  document.querySelectorAll('#cp-compromisos-body tr').forEach(tr => {
    const compDesc = tr.querySelector('.cp-comp-desc');
    const compResp = tr.querySelector('.cp-comp-resp');
    const compPlazo = tr.querySelector('.cp-comp-plazo');
    const compEvid = tr.querySelector('.cp-comp-evid');

    if (compDesc && compResp) {
      const comp = compDesc.value.trim();
      const resp = compResp.value.trim();
      const plazo = compPlazo ? compPlazo.value : '';
      const evidencia = compEvid ? compEvid.value.trim() : '';
      if (comp || resp) {
        compromisos.push({ comp, resp, plazo, evidencia });
      }
    }
  });

  const dataCaminata = {
    docente, rut, asig, curso, fecha, hora, tiempo, lugar, obs1, obs2, obs3, sello, proyecto,
    evals, fortalezas, mejoras, compromisos
  };

  const entMock = {
    id: editandoCaminataId || '(vista previa)',
    rut: rut,
    nombre: docente,
    cargo: "Docente — Caminata Pedagógica ADECO",
    curso: curso,
    jefe: obs1,
    asig: asig,
    fecha: fecha,
    hora: hora,
    resp: obs1,
    obs: `[CAMINATA:${encodeURIComponent(JSON.stringify(dataCaminata))}]`
  };

  document.getElementById('reporte').innerHTML = generarHtmlReporteCaminata(entMock, true);
  goTo('reporte');
}

function generarHtmlReporteCaminata(e, esVistaPrevia = false) {
  let data = {};
  if (e.obs && e.obs.includes('[CAMINATA:')) {
    const match = e.obs.match(/\[CAMINATA:([^\]]+)\]/);
    if (match) {
      try {
        data = JSON.parse(decodeURIComponent(match[1]));
      } catch (err) {
        console.error("Error al decodificar caminata json:", err);
      }
    }
  }

  const docente = esc(data.docente || e.nombre || '');
  const rut = esc(data.rut || e.rut || '');
  const asig = esc(data.asig || e.asig || '');
  const curso = esc(data.curso || e.curso || '');
  const fecha = esc(data.fecha || e.fecha || '');
  const hora = esc(data.hora || e.hora || '');
  const tiempo = esc(data.tiempo || '10 a 15 minutos');
  const lugar = esc(data.lugar || 'Sala de Clases');
  const sello = esc(data.sello || 'Innovación Pedagógica e Inclusión');
  const obs1 = esc(data.obs1 || e.resp || 'Observador Principal');
  const obs2 = esc(data.obs2 || '');
  const obs3 = esc(data.obs3 || '');

  const evals = data.evals || {};
  const fortalezas = esc(data.fortalezas || '');
  const mejoras = esc(data.mejoras || '');
  const compromisos = data.compromisos || [];

  const indNames = {
    c1: '1.1. Clima de respeto entre docente y estudiantes',
    c2: '1.2. Estudiantes involucrados en la actividad',
    c3: '1.3. Organización del aula favorece aprendizaje',
    cu1: '2.1. Instrucciones claras y comprensibles',
    cu2: '2.2. Estrategias metodológicas activas',
    cu3: '2.3. Monitoreo constante del trabajo de estudiantes',
    i1: '3.1. Promoción de participación de todos',
    i2: '3.2. Estrategias diversificadas presentes',
    i3: '3.3. Entrega de apoyos oportunos',
    e1: '4.1. Verificación de comprensión durante clase',
    e2: '4.2. Entrega de retroalimentación formativa',
    e3: '4.3. Ajustes realizados según respuesta del grupo'
  };

  const getBadgeClass = (val) => {
    if (val === 'Observable') return 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;';
    if (val === 'En proceso') return 'background:#fef9c3; color:#a16207; border:1px solid #fef08a;';
    return 'background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;';
  };

  const observadoresList = [obs1, obs2, obs3].filter(Boolean).map((o, idx) => `<div><strong>Observador ${idx + 1}:</strong> ${o}</div>`).join('');

  return `
    <div class="rpt-caminata-box" style="padding:20px; font-family:system-ui, sans-serif; background:#fff; color:#0f172a;">
      <!-- CABECERA DE REPORTE -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f766e; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <div style="font-size:16px; font-weight:800; color:#0f766e;">LICEO TÉCNICO PROFESIONAL CAMPANARIO</div>
          <div style="font-size:14px; font-weight:700; color:#334155;">PAUTA DE CAMINATA PEDAGÓGICA (PROYECTO ADECO)</div>
          <div style="font-size:11px; color:#64748b;">Observación Breve de Aula (10 a 15 minutos) · Innovación Pedagógica</div>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block; padding:4px 10px; border-radius:9999px; font-size:11px; font-weight:700; background:#ccfbf1; color:#0f766e; border:1px solid #99f6e4;">
            ADECO · PEI
          </span>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">ID: ${esc(e.id || 'N/A')}</div>
        </div>
      </div>

      <!-- GRID IDENTIFICACIÓN -->
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px; border:1px solid #cbd5e1;">
        <tr style="background:#f8fafc;">
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1; width:15%;">Docente:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1; width:35%;">${docente} (${rut})</td>
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1; width:15%;">Fecha / Hora:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1; width:35%;">${fecha} a las ${hora} hrs</td>
        </tr>
        <tr>
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1;">Asignatura / Curso:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1;">${asig} — ${curso}</td>
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1;">Espacio / Tiempo:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1;">${lugar} (${tiempo})</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1;">Sello PEI:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1;" colspan="3">💡 ${sello}</td>
        </tr>
        <tr>
          <td style="padding:6px 10px; font-weight:700; border:1px solid #cbd5e1;">Equipo Observador:</td>
          <td style="padding:6px 10px; border:1px solid #cbd5e1;" colspan="3">
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
              ${observadoresList}
            </div>
          </td>
        </tr>
      </table>

      <!-- MATRIZ DE DIMENSIONES -->
      <div style="font-size:13px; font-weight:700; color:#0f766e; margin-bottom:8px;">📊 Matriz de Indicadores Observados</div>
      <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#0f766e; color:#fff; text-align:left;">
            <th style="padding:6px 8px; width:20%;">Dimensión</th>
            <th style="width:40%; padding:6px 8px;">Indicador Observable</th>
            <th style="width:20%; text-align:center; padding:6px 8px;">Valoración</th>
            <th style="width:20%; padding:6px 8px;">Observaciones Técnicas</th>
          </tr>
        </thead>
        <tbody>
          <!-- CONVIVENCIA -->
          <tr>
            <td rowspan="3" style="padding:6px; font-weight:700; background:#f0fdf4; border:1px solid #cbd5e1; vertical-align:top; color:#166534">🤝 Convivencia</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.c1}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.c1?.val)}">${evals.c1?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.c1?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.c2}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.c2?.val)}">${evals.c2?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.c2?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.c3}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.c3?.val)}">${evals.c3?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.c3?.obs || '-')}</td>
          </tr>

          <!-- CURRICULUM -->
          <tr>
            <td rowspan="3" style="padding:6px; font-weight:700; background:#f0fdfa; border:1px solid #cbd5e1; vertical-align:top; color:#0f766e">📚 Curriculum</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.cu1}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.cu1?.val)}">${evals.cu1?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.cu1?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.cu2}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.cu2?.val)}">${evals.cu2?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.cu2?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.cu3}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.cu3?.val)}">${evals.cu3?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.cu3?.obs || '-')}</td>
          </tr>

          <!-- INCLUSIÓN / PIE -->
          <tr>
            <td rowspan="3" style="padding:6px; font-weight:700; background:#fffbeb; border:1px solid #cbd5e1; vertical-align:top; color:#b45309">🧩 Inclusión / PIE</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.i1}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.i1?.val)}">${evals.i1?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.i1?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.i2}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.i2?.val)}">${evals.i2?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.i2?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.i3}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.i3?.val)}">${evals.i3?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.i3?.obs || '-')}</td>
          </tr>

          <!-- EVALUACIÓN -->
          <tr>
            <td rowspan="3" style="padding:6px; font-weight:700; background:#eff6ff; border:1px solid #cbd5e1; vertical-align:top; color:#1d4ed8">📝 Evaluación</td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.e1}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.e1?.val)}">${evals.e1?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.e1?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.e2}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.e2?.val)}">${evals.e2?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.e2?.obs || '-')}</td>
          </tr>
          <tr>
            <td style="padding:6px; border:1px solid #cbd5e1;">${indNames.e3}</td>
            <td style="padding:6px; text-align:center; border:1px solid #cbd5e1;"><span style="padding:2px 8px; border-radius:4px; font-weight:600; ${getBadgeClass(evals.e3?.val)}">${evals.e3?.val || 'Observable'}</span></td>
            <td style="padding:6px; border:1px solid #cbd5e1;">${esc(evals.e3?.obs || '-')}</td>
          </tr>
        </tbody>
      </table>

      <!-- SÍNTESIS FORMATIVA -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
        <div style="border:1px solid #cbd5e1; border-radius:6px; padding:10px; background:#fafafa;">
          <div style="font-size:12px; font-weight:700; color:#15803d; margin-bottom:4px;">🟢 Fortalezas Observadas (Máx 3)</div>
          <div style="font-size:11px; white-space:pre-line; line-height:1.4;">${fortalezas || 'Sin fortalezas especificadas.'}</div>
        </div>
        <div style="border:1px solid #cbd5e1; border-radius:6px; padding:10px; background:#fafafa;">
          <div style="font-size:12px; font-weight:700; color:#b45309; margin-bottom:4px;">🟡 Oportunidades de Mejora (Máx 2)</div>
          <div style="font-size:11px; white-space:pre-line; line-height:1.4;">${mejoras || 'Sin oportunidades especificadas.'}</div>
        </div>
      </div>

      <!-- MATRIZ DE COMPROMISOS -->
      <div style="font-size:12px; font-weight:700; color:#0f766e; margin-bottom:6px;">🤝 Acuerdos de Mejora y Compromisos (Plan ADECO)</div>
      <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#f1f5f9; text-align:left;">
            <th style="padding:6px; border:1px solid #cbd5e1; width:35%;">Compromiso</th>
            <th style="padding:6px; border:1px solid #cbd5e1; width:25%;">Responsable</th>
            <th style="padding:6px; border:1px solid #cbd5e1; width:15%;">Plazo</th>
            <th style="padding:6px; border:1px solid #cbd5e1; width:25%;">Evidencia</th>
          </tr>
        </thead>
        <tbody>
          ${compromisos.length > 0 ? compromisos.map(c => `
            <tr>
              <td style="padding:6px; border:1px solid #cbd5e1;">${esc(c.comp || '-')}</td>
              <td style="padding:6px; border:1px solid #cbd5e1;">${esc(c.resp || '-')}</td>
              <td style="padding:6px; border:1px solid #cbd5e1;">${esc(c.plazo || '-')}</td>
              <td style="padding:6px; border:1px solid #cbd5e1;">${esc(c.evidencia || '-')}</td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="4" style="padding:8px; text-align:center; color:#64748b; font-style:italic; border:1px solid #cbd5e1;">No se registraron compromisos formales en esta visita.</td>
            </tr>
          `}
        </tbody>
      </table>

      <!-- NOTA TÉCNICA -->
      <div style="border:1px solid #fef08a; background:#fefce8; padding:8px 12px; border-radius:4px; font-size:10px; color:#854d0e; margin-bottom:24px;">
        <strong>Nota técnica:</strong> Esta pauta no evalúa la clase completa ni el desempeño integral del docente. Su finalidad es recoger evidencias objetivas observables durante una visita breve (10 a 15 min), por lo que los indicadores seleccionados corresponden exclusivamente a prácticas que pueden verificarse en cualquier momento de la sesión.
      </div>

      <!-- RECUADRO DE FIRMAS MÚLTIPLES HORIZONTALES (LADO A LADO) -->
      <div class="firma-caminata-row" style="display: flex !important; flex-direction: row !important; justify-content: space-around !important; align-items: flex-end !important; gap: 16px !important; margin-top: 40px !important; width: 100% !important; text-align: center !important; page-break-inside: avoid !important;">
        <div style="flex: 1; text-align: center;">
          <br><br>
          ________________________________________<br>
          <span style="font-size:10px; font-weight:700; color:#334155;">Firma Observador 1</span><br>
          <span style="font-size:9px; color:#64748b;">${obs1}</span>
        </div>
        ${obs2 ? `
          <div style="flex: 1; text-align: center;">
            <br><br>
            ________________________________________<br>
            <span style="font-size:10px; font-weight:700; color:#334155;">Firma Observador 2</span><br>
            <span style="font-size:9px; color:#64748b;">${obs2}</span>
          </div>
        ` : ''}
        ${obs3 ? `
          <div style="flex: 1; text-align: center;">
            <br><br>
            ________________________________________<br>
            <span style="font-size:10px; font-weight:700; color:#334155;">Firma Observador 3</span><br>
            <span style="font-size:9px; color:#64748b;">${obs3}</span>
          </div>
        ` : ''}
        <div style="flex: 1; text-align: center;">
          <br><br>
          ________________________________________<br>
          <span style="font-size:10px; font-weight:700; color:#334155;">Firma Docente Visitado</span><br>
          <span style="font-size:9px; color:#64748b;">${docente}</span>
        </div>
      </div>
    </div>
  `;
}

// ══════════════ META 2 ADECO 2026 ══════════════
const SUGERENCIAS_META2 = {
  1: [
    "Definir calendario anual o mensual con días, horarios, responsables y productos esperados.",
    "Proteger tiempos para Comunidades de Aprendizaje Profesionales (CAP) y otras instancias de colaboración.",
    "Registrar acuerdos, responsables, plazos y productos de cada sesión.",
    "Vincular el trabajo colaborativo con PME, Plan Local de Formación y otras acciones institucionales."
  ],
  2: [
    "Incorporar activamente a docentes, asistentes de la educación, PIE, Orientación y Convivencia Educativa.",
    "Distribuir responsabilidades y roles para favorecer corresponsabilidad.",
    "Aplicar mecanismos breves de consulta y levantamiento de opiniones.",
    "Revisar periódicamente los niveles de participación por estamento y definir acciones frente a baja participación."
  ],
  3: [
    "Complementar indicadores de asistencia y ejecución con indicadores de resultado.",
    "Medir colaboración, confianza, comunicación, apoyo entre pares y bienestar socioemocional.",
    "Registrar el porcentaje de acuerdos de mejora cumplidos.",
    "Analizar periódicamente los indicadores y adoptar decisiones de ajuste basadas en evidencia."
  ],
  4: [
    "Utilizar el diagnóstico 'Tu Función Me Importa' como línea base.",
    "Aplicar instrumentos breves al inicio, durante y al cierre del proceso.",
    "Mantener preguntas comparables para observar evolución.",
    "Analizar los resultados con los equipos y registrar las decisiones derivadas de la información."
  ],
  5: [
    "Informar avances en Consejo Escolar, Consejo de Profesores y otras instancias institucionales.",
    "Comunicar resultados, dificultades y ajustes, no solo actividades ejecutadas.",
    "Mostrar cómo las opiniones de los funcionarios se traducen en decisiones.",
    "Registrar retroalimentación de la comunidad y acuerdos posteriores."
  ]
};

var meta2ActualId = 1;
var meta2FichasData = [];

function obtenerEstadoBadgeMeta2(porcentaje) {
  if (porcentaje === 0) return { code: 'NI', text: 'No iniciado', style: 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;' };
  if (porcentaje < 30) return { code: 'D', text: 'En Diseño', style: 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;' };
  if (porcentaje < 70) return { code: 'E', text: 'En Ejecución', style: 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;' };
  if (porcentaje < 100) return { code: 'S', text: 'En Seguimiento', style: 'background: #e0e7ff; color: #3730a3; border: 1px solid #a5b4fc;' };
  return { code: 'C', text: 'Cumplido', style: 'background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;' };
}

function cambiarTabMeta2(tab) {
  document.querySelectorAll('.tab-btn-m2').forEach(b => {
    b.classList.remove('active');
    b.style.color = 'var(--text-secondary)';
    b.style.borderBottom = 'none';
    b.style.fontWeight = '600';
  });

  const activeBtn = document.getElementById(`tab-m2-${tab}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.color = '#4f46e5';
    activeBtn.style.borderBottom = '3px solid #4f46e5';
    activeBtn.style.fontWeight = '700';
  }

  document.getElementById('m2-vista-panel').style.display = 'none';
  document.getElementById('m2-vista-fichas').style.display = 'none';
  document.getElementById('m2-vista-evaluacion').style.display = 'none';

  document.getElementById(`m2-vista-${tab}`).style.display = 'block';
}

async function cargarMeta2Dashboard() {
  try {
    const res = await fetch('/api/meta2/fichas');
    const fichas = await res.json();
    meta2FichasData = fichas || [];

    const tbody = document.getElementById('m2-tbody-dashboard');
    if (!tbody) return;
    tbody.innerHTML = '';

    let sumaAvance = 0;
    let totalAcuerdos = 0;
    let totalEvidencias = 0;

    meta2FichasData.forEach(rec => {
      sumaAvance += (rec.avance || 0);
      totalAcuerdos += (rec.acuerdos_count || 0);
      totalEvidencias += (rec.evidencias_count || 0);

      const st = obtenerEstadoBadgeMeta2(rec.avance || 0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; font-weight: 700; color: var(--text-secondary);">${rec.id}</td>
        <td style="font-weight: 700; color: var(--text-primary);">${esc(rec.titulo)}</td>
        <td style="color: var(--text-secondary);">${esc(rec.responsable || 'Sin asignar')}</td>
        <td style="text-align: center;">
          <span style="display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 800; border-radius: 6px; ${st.style}">
            ${st.code} - ${st.text}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
              <div style="width: ${rec.avance || 0}%; height: 100%; background: #4f46e5; border-radius: 9999px;"></div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: #312e81; width: 36px; text-align: right;">${rec.avance || 0}%</span>
          </div>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-sm btn-primary" onclick="seleccionarYVerFichaMeta2(${rec.id})" style="padding: 4px 12px; font-size: 11.5px;">
            ✏️ Ver Ficha
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const promedioAvance = meta2FichasData.length > 0 ? Math.round(sumaAvance / meta2FichasData.length) : 0;
    document.getElementById('m2-kpi-avance').innerText = `${promedioAvance}%`;
    document.getElementById('m2-kpi-acuerdos').innerText = totalAcuerdos;
    document.getElementById('m2-kpi-evidencias').innerText = totalEvidencias;
  } catch (e) {
    console.error("Error al cargar dashboard Meta2:", e);
  }
}

function seleccionarYVerFichaMeta2(id) {
  document.getElementById('m2-select-rec').value = id;
  cargarMeta2Ficha(id);
  cambiarTabMeta2('fichas');
}

async function cargarMeta2Ficha(id) {
  meta2ActualId = parseInt(id);

  // Cargar Orientaciones Sostenedor
  const sugerenciasUl = document.getElementById('m2-orientaciones-list');
  const sugs = SUGERENCIAS_META2[meta2ActualId] || [];
  if (sugerenciasUl) {
    sugerenciasUl.innerHTML = sugs.map(s => `<li>${esc(s)}</li>`).join('');
  }

  try {
    const res = await fetch(`/api/meta2/ficha?id=${meta2ActualId}`);
    const f = await res.json();

    if (!f) return;

    document.getElementById('m2-ficha-titulo').innerText = `Ficha 3.${meta2ActualId}: ${f.titulo || ''}`;
    document.getElementById('m2_objetivo').value = f.objetivo || '';
    document.getElementById('m2_brecha').value = f.brecha || '';
    document.getElementById('m2_accion').value = f.accion || '';
    document.getElementById('m2_descripcion').value = f.descripcion || '';
    document.getElementById('m2_responsable').value = f.responsable || '';
    document.getElementById('m2_frecuencia').value = f.frecuencia || 'Única';
    document.getElementById('m2_fecha_inicio').value = f.fecha_inicio || '';
    document.getElementById('m2_fecha_termino').value = f.fecha_termino || '';
    document.getElementById('m2_ind_ejecucion').value = f.ind_ejecucion || '';
    document.getElementById('m2_ind_resultado').value = f.ind_resultado || '';
    document.getElementById('m2_linea_base').value = f.linea_base || '';
    document.getElementById('m2_meta').value = f.meta || '';
    document.getElementById('m2_avance').value = f.avance || 0;
    document.getElementById('m2-val-avance').innerText = `${f.avance || 0}%`;
    document.getElementById('m2_resultado_observado').value = f.resultado_observado || '';
    document.getElementById('m2_dificultades').value = f.dificultades || '';
    document.getElementById('m2_ajuste').value = f.ajuste || '';
    document.getElementById('m2_responsable_ajuste').value = f.responsable_ajuste || '';
    document.getElementById('m2_proxima_revision').value = f.proxima_revision || '';
    document.getElementById('m2_observaciones').value = f.observaciones || '';

    const estamentosArr = f.estamentos ? f.estamentos.split(',').map(s => s.trim()) : [];
    document.querySelectorAll('.m2-chk-estamento').forEach(chk => {
      chk.checked = estamentosArr.includes(chk.value);
    });

    renderEvidenciasFormMeta2(f.evidencias || []);
    renderAcuerdosFormMeta2(f.acuerdos || []);
    calcularAvanceAutomaticoMeta2(true);
  } catch (e) {
    console.error("Error al cargar ficha Meta2:", e);
  }
}

function renderEvidenciasFormMeta2(evidencias) {
  const cont = document.getElementById('m2-contenedor-evidencias');
  if (!cont) return;
  cont.innerHTML = '';
  if (!evidencias || evidencias.length === 0) {
    cont.innerHTML = '<p style="font-size: 12px; color: var(--text-muted); font-style: italic; margin: 8px 0; text-align: center;">No hay evidencias adjuntas</p>';
    return;
  }

  evidencias.forEach(ev => {
    const item = document.createElement('div');
    item.style.cssText = "background: #fff; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;";
    item.innerHTML = `
      <div>
        <strong style="color: var(--text-primary); font-size: 13px;">${esc(ev.nombre)}</strong>
        <div style="color: var(--text-secondary); font-size: 11px; margin-top: 2px;">
          <span>${esc(ev.tipo || 'Documento')}</span> ${ev.fecha ? `• ${esc(ev.fecha)}` : ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${ev.url && ev.url !== '#' ? `<a href="${esc(ev.url)}" target="_blank" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 3px 8px;">🔗 Ver Link</a>` : ''}
        <button type="button" class="btn btn-sm btn-danger" onclick="eliminarEvidenciaMeta2(${ev.id})" style="font-size: 11px; padding: 3px 8px;">🗑️</button>
      </div>
    `;
    cont.appendChild(item);
  });
}

function renderAcuerdosFormMeta2(acuerdos) {
  const cont = document.getElementById('m2-contenedor-acuerdos');
  if (!cont) return;
  cont.innerHTML = '';
  if (!acuerdos || acuerdos.length === 0) {
    cont.innerHTML = '<p style="font-size: 12px; color: var(--text-muted); font-style: italic; margin: 8px 0; text-align: center;">No hay acuerdos registrados</p>';
    return;
  }

  acuerdos.forEach(ac => {
    const item = document.createElement('div');
    item.style.cssText = "background: #fff; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;";
    let estadoColor = '#d97706';
    if (ac.estado === 'Cumplido') estadoColor = '#059669';
    if (ac.estado === 'Pendiente') estadoColor = '#dc2626';

    item.innerHTML = `
      <div>
        <strong style="color: var(--text-primary); font-size: 13px;">${esc(ac.acuerdo)}</strong>
        <div style="color: var(--text-secondary); font-size: 11px; margin-top: 2px;">
          <span>Resp: ${esc(ac.responsable || 'Por definir')}</span> ${ac.plazo ? `• Plazo: ${esc(ac.plazo)}` : ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: rgba(0,0,0,0.05); color: ${estadoColor}; border: 1px solid ${estadoColor};">
          ${esc(ac.estado || 'En ejecución')}
        </span>
        <button type="button" class="btn btn-sm btn-danger" onclick="eliminarAcuerdoMeta2(${ac.id})" style="font-size: 11px; padding: 3px 8px;">🗑️</button>
      </div>
    `;
    cont.appendChild(item);
  });
}

async function guardarMeta2Ficha(e) {
  if (e) e.preventDefault();

  const estamentosSel = Array.from(document.querySelectorAll('.m2-chk-estamento:checked')).map(c => c.value).join(', ');

  const payload = {
    id: meta2ActualId,
    objetivo: document.getElementById('m2_objetivo').value.trim(),
    brecha: document.getElementById('m2_brecha').value.trim(),
    accion: document.getElementById('m2_accion').value.trim(),
    descripcion: document.getElementById('m2_descripcion').value.trim(),
    responsable: document.getElementById('m2_responsable').value.trim(),
    frecuencia: document.getElementById('m2_frecuencia').value,
    fecha_inicio: document.getElementById('m2_fecha_inicio').value,
    fecha_termino: document.getElementById('m2_fecha_termino').value,
    estamentos: estamentosSel,
    ind_ejecucion: document.getElementById('m2_ind_ejecucion').value.trim(),
    ind_resultado: document.getElementById('m2_ind_resultado').value.trim(),
    linea_base: document.getElementById('m2_linea_base').value.trim(),
    meta: document.getElementById('m2_meta').value.trim(),
    avance: parseInt(document.getElementById('m2_avance').value || 0),
    resultado_observado: document.getElementById('m2_resultado_observado').value.trim(),
    dificultades: document.getElementById('m2_dificultades').value.trim(),
    ajuste: document.getElementById('m2_ajuste').value.trim(),
    responsable_ajuste: document.getElementById('m2_responsable_ajuste').value.trim(),
    proxima_revision: document.getElementById('m2_proxima_revision').value,
    observaciones: document.getElementById('m2_observaciones').value.trim()
  };

  try {
    const res = await fetch('/api/meta2/ficha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      await cargarMeta2Dashboard();
      toast(`✅ Ficha ${meta2ActualId} guardada correctamente`);
    } else {
      toast(`❌ Error al guardar ficha: ${data.error}`);
    }
  } catch (err) {
    console.error("Error al guardar ficha:", err);
    toast("❌ Error de red al guardar la ficha");
  }
}

async function agregarEvidenciaMeta2() {
  const nombre = prompt("Nombre o descripción de la evidencia (Ej: Acta N°2 CAP, Lista de Asistencia):");
  if (!nombre) return;
  const tipo = prompt("Tipo de evidencia (ej. Documento, Acta, Foto, Google Drive):", "Documento");
  const url = prompt("Enlace o URL de la evidencia (opcional):", "#");

  try {
    const res = await fetch('/api/meta2/evidencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recomendacion_id: meta2ActualId,
        nombre: nombre,
        tipo: tipo || "Documento",
        fecha: new Date().toISOString().slice(0, 10),
        url: url || "#"
      })
    });
    if (res.ok) {
      await cargarMeta2Ficha(meta2ActualId);
      await cargarMeta2Dashboard();
      toast("📎 Evidencia agregada correctamente");
    }
  } catch (e) {
    console.error("Error al agregar evidencia:", e);
  }
}

async function eliminarEvidenciaMeta2(id) {
  if (!confirm("¿Desea eliminar esta evidencia?")) return;
  try {
    const res = await fetch('/api/meta2/evidencia/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    if (res.ok) {
      await cargarMeta2Ficha(meta2ActualId);
      await cargarMeta2Dashboard();
      toast("🗑️ Evidencia eliminada");
    }
  } catch (e) {
    console.error("Error al eliminar evidencia:", e);
  }
}

async function agregarAcuerdoMeta2() {
  const desc = prompt("Descripción del acuerdo alcanzado:");
  if (!desc) return;
  const resp = prompt("Responsable del acuerdo:", "UTP");
  const plazo = prompt("Fecha / Plazo del acuerdo (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));

  try {
    const res = await fetch('/api/meta2/acuerdo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recomendacion_id: meta2ActualId,
        acuerdo: desc,
        responsable: resp || "Por definir",
        plazo: plazo || "",
        estado: "En ejecución",
        observacion: ""
      })
    });
    if (res.ok) {
      await cargarMeta2Ficha(meta2ActualId);
      await cargarMeta2Dashboard();
      toast("✅ Acuerdo registrado correctamente");
    }
  } catch (e) {
    console.error("Error al agregar acuerdo:", e);
  }
}

async function eliminarAcuerdoMeta2(id) {
  if (!confirm("¿Desea eliminar este acuerdo?")) return;
  try {
    const res = await fetch('/api/meta2/acuerdo/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    if (res.ok) {
      await cargarMeta2Ficha(meta2ActualId);
      await cargarMeta2Dashboard();
      toast("🗑️ Acuerdo eliminado");
    }
  } catch (e) {
    console.error("Error al eliminar acuerdo:", e);
  }
}

async function cargarMeta2Evaluacion() {
  try {
    const res = await fetch('/api/meta2/evaluacion');
    const ev = await res.json();
    if (ev) {
      document.getElementById('m2_eval_logros').value = ev.logros || '';
      document.getElementById('m2_eval_colaborativo').value = ev.colaborativo || '';
      document.getElementById('m2_eval_bienestar').value = ev.bienestar || '';
      document.getElementById('m2_eval_comunicacion').value = ev.comunicacion || '';
      document.getElementById('m2_eval_participacion').value = ev.participacion || '';
      document.getElementById('m2_eval_practicas').value = ev.practicas || '';
      document.getElementById('m2_eval_continuidad').value = ev.continuidad || '';
      document.getElementById('m2_eval_meta3').value = ev.meta3 || '';
    }
  } catch (e) {
    console.error("Error al cargar evaluación Meta2:", e);
  }
}

async function guardarMeta2Evaluacion(e) {
  if (e) e.preventDefault();

  const payload = {
    logros: document.getElementById('m2_eval_logros').value.trim(),
    colaborativo: document.getElementById('m2_eval_colaborativo').value.trim(),
    bienestar: document.getElementById('m2_eval_bienestar').value.trim(),
    comunicacion: document.getElementById('m2_eval_comunicacion').value.trim(),
    participacion: document.getElementById('m2_eval_participacion').value.trim(),
    practicas: document.getElementById('m2_eval_practicas').value.trim(),
    continuidad: document.getElementById('m2_eval_continuidad').value.trim(),
    meta3: document.getElementById('m2_eval_meta3').value.trim()
  };

  try {
    const res = await fetch('/api/meta2/evaluacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      toast("🏆 Evaluación Consolidada guardada exitosamente");
    } else {
      toast(`❌ Error al guardar evaluación: ${data.error}`);
    }
  } catch (err) {
    console.error("Error al guardar evaluación:", err);
    toast("❌ Error de red al guardar la evaluación");
  }
}

function calcularAvanceAutomaticoMeta2(silent = false) {
  // 1. Campos Estratégicos (Max 20%)
  const obj = (document.getElementById('m2_objetivo')?.value || '').trim();
  const bre = (document.getElementById('m2_brecha')?.value || '').trim();
  const acc = (document.getElementById('m2_accion')?.value || '').trim();
  const res = (document.getElementById('m2_responsable')?.value || '').trim();
  const fini = document.getElementById('m2_fecha_inicio')?.value;
  const fter = document.getElementById('m2_fecha_termino')?.value;
  const ests = document.querySelectorAll('.m2-chk-estamento:checked').length;
  
  let pEstrategia = 0;
  if (obj) pEstrategia += 4;
  if (bre) pEstrategia += 3;
  if (acc) pEstrategia += 4;
  if (res) pEstrategia += 3;
  if (fini && fter) pEstrategia += 3;
  if (ests > 0) pEstrategia += 3;
  if (pEstrategia > 20) pEstrategia = 20;

  // 2. Indicadores (Max 20%)
  const iej = (document.getElementById('m2_ind_ejecucion')?.value || '').trim();
  const ires = (document.getElementById('m2_ind_resultado')?.value || '').trim();
  const lbase = (document.getElementById('m2_linea_base')?.value || '').trim();
  const meta = (document.getElementById('m2_meta')?.value || '').trim();
  
  let pIndicadores = 0;
  if (iej) pIndicadores += 5;
  if (ires) pIndicadores += 5;
  if (lbase) pIndicadores += 5;
  if (meta) pIndicadores += 5;

  // 3. Evidencias Cargadas (Max 20%)
  const evidenciasDivs = document.querySelectorAll('#m2-contenedor-evidencias > div');
  let pEvidencias = 0;
  const countEvidencias = Array.from(evidenciasDivs).filter(d => !d.innerText.includes('No hay evidencias')).length;
  if (countEvidencias > 0) {
    pEvidencias = Math.min(20, countEvidencias * 10);
  }

  // 4. Acuerdos Cumplidos (Max 30%)
  const acuerdosDivs = document.querySelectorAll('#m2-contenedor-acuerdos > div');
  let pAcuerdos = 0;
  const validAcuerdos = Array.from(acuerdosDivs).filter(d => !d.innerText.includes('No hay acuerdos'));
  if (validAcuerdos.length > 0) {
    let cumplidos = 0;
    validAcuerdos.forEach(el => {
      if (el.innerText.includes('Cumplido')) cumplidos++;
    });
    pAcuerdos = Math.round((cumplidos / validAcuerdos.length) * 30);
  }

  // 5. Resultado y Ajustes (Max 10%)
  const resObs = (document.getElementById('m2_resultado_observado')?.value || '').trim();
  const ajus = (document.getElementById('m2_ajuste')?.value || '').trim();
  let pResultado = 0;
  if (resObs) pResultado += 5;
  if (ajus) pResultado += 5;

  const totalAvance = Math.min(100, pEstrategia + pIndicadores + pEvidencias + pAcuerdos + pResultado);

  // Actualizar slider y texto
  const rangeInput = document.getElementById('m2_avance');
  const valStrong = document.getElementById('m2-val-avance');
  if (rangeInput) rangeInput.value = totalAvance;
  if (valStrong) valStrong.innerText = `${totalAvance}%`;

  // Actualizar desglose visual
  const desgloseEl = document.getElementById('m2-desglose-avance');
  if (desgloseEl) {
    desgloseEl.innerHTML = `
      <span>🎯 Planificación: <strong>${pEstrategia}/20%</strong></span>
      <span>📊 Indicadores: <strong>${pIndicadores}/20%</strong></span>
      <span>📎 Evidencias: <strong>${pEvidencias}/20%</strong></span>
      <span>✅ Acuerdos: <strong>${pAcuerdos}/30%</strong></span>
      <span>📝 Resultado: <strong>${pResultado}/10%</strong></span>
    `;
  }

  if (!silent) {
    toast(`⚡ Avance calculated automatically: ${totalAvance}%`);
  }
}

// ══════════════ CLASIFICADOR Y AGRUPACIÓN POR NIVEL MINEDUC ══════════════
function obtenerNivelMineduc(cursoStr) {
  if (!cursoStr) return { code: '999', name: 'Sin Clasificar', label: 'Sin Clasificar' };
  const c = cursoStr.toLowerCase().trim();
  
  if (c.includes('pre-kinder') || c.includes('prekinder') || c.includes('transición') || c.includes('transicion 1') || c.includes('nt1')) {
    return { code: '10', name: 'Educación Parvularia', label: '10 Educación Parvularia' };
  }
  if (c.includes('kinder') || c.includes('nt2')) {
    return { code: '10', name: 'Educación Parvularia', label: '10 Educación Parvularia' };
  }
  if (c.includes('básico') || c.includes('basico') || c.includes('básica') || c.includes('basica') || /^[1-8][°|o]?\s*b/i.test(c)) {
    return { code: '110', name: 'Enseñanza Básica', label: '110 Enseñanza Básica' };
  }
  if (c.includes('laboral') || c.includes('opción 4') || c.includes('opcion 4')) {
    return { code: '299', name: 'Programa Integración Escolar (PIE) Opción 4', label: '299 Programa Integración Escolar (PIE) Opción 4' };
  }
  if (c.includes('industrial') || c.includes('mecanica') || c.includes('mecánica') || c.includes('electricidad')) {
    return { code: '510', name: 'Enseñanza Media Técnico-Profesional Industrial', label: '510 Enseñanza Media Técnico-Profesional Industrial' };
  }
  if (c.includes('técnica') || c.includes('tecnica') || c.includes('servicios') || c.includes('pulo')) {
    return { code: '610', name: 'Enseñanza Media Técnico-Profesional Técnica', label: '610 Enseñanza Media Técnico-Profesional Técnica' };
  }
  if (c.includes('medio') || c.includes('media') || /^[1-4][°|o]?\s*m/i.test(c)) {
    return { code: '310', name: 'Enseñanza Media Humanista-Científica', label: '310 Enseñanza Media Humanista-Científica' };
  }
  
  return { code: '999', name: 'Otros / General', label: 'Otros / General' };
}

function popularSelectCursosOptgroups(selectId, cursosList) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Todos los cursos</option>';
  
  const grupos = {};
  cursosList.forEach(c => {
    const info = obtenerNivelMineduc(c);
    if (!grupos[info.label]) grupos[info.label] = [];
    grupos[info.label].push(c);
  });

  const ordenCodigos = [
    '10 Educación Parvularia',
    '110 Enseñanza Básica',
    '299 Programa Integración Escolar (PIE) Opción 4',
    '310 Enseñanza Media Humanista-Científica',
    '510 Enseñanza Media Técnico-Profesional Industrial',
    '610 Enseñanza Media Técnico-Profesional Técnica',
    'Otros / General'
  ];

  ordenCodigos.forEach(label => {
    if (grupos[label] && grupos[label].length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      grupos[label].sort().forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        optgroup.appendChild(o);
      });
      sel.appendChild(optgroup);
    }
  });

  for (const label in grupos) {
    if (!ordenCodigos.includes(label) && grupos[label].length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      grupos[label].sort().forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        optgroup.appendChild(o);
      });
      sel.appendChild(optgroup);
    }
  }

  sel.value = currentVal;
}

let estModoVista = 'tabla';

function cambiarModoVistaEstudiantes(modo) {
  estModoVista = modo;
  const btnTabla = document.getElementById('btn-est-mode-tabla');
  const btnAgrupado = document.getElementById('btn-est-mode-agrupado');
  const divTabla = document.getElementById('est-contenedor-tabla');
  const divAgrupado = document.getElementById('est-contenedor-agrupado');

  if (modo === 'agrupado') {
    if (btnTabla) { btnTabla.className = 'btn btn-sm btn-secondary'; }
    if (btnAgrupado) { btnAgrupado.className = 'btn btn-sm btn-primary'; }
    if (divTabla) divTabla.style.display = 'none';
    if (divAgrupado) divAgrupado.style.display = 'flex';
  } else {
    if (btnTabla) { btnTabla.className = 'btn btn-sm btn-primary'; }
    if (btnAgrupado) { btnAgrupado.className = 'btn btn-sm btn-secondary'; }
    if (divTabla) divTabla.style.display = 'block';
    if (divAgrupado) divAgrupado.style.display = 'none';
  }
  filtrarEst();
}

function renderEstudiantesAgrupadosMineduc(estudiantesRows) {
  const cont = document.getElementById('est-contenedor-agrupado');
  if (!cont) return;
  cont.innerHTML = '';

  if (!estudiantesRows || estudiantesRows.length === 0) {
    cont.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No se encontraron estudiantes para los filtros aplicados.</div>';
    return;
  }

  const nivelesMap = {};
  const ordenCodigos = [
    '10 Educación Parvularia',
    '110 Enseñanza Básica',
    '299 Programa Integración Escolar (PIE) Opción 4',
    '310 Enseñanza Media Humanista-Científica',
    '510 Enseñanza Media Técnico-Profesional Industrial',
    '610 Enseñanza Media Técnico-Profesional Técnica',
    'Otros / General'
  ];

  estudiantesRows.forEach(e => {
    const info = obtenerNivelMineduc(e.Curso);
    const lvlKey = info.label;
    if (!nivelesMap[lvlKey]) nivelesMap[lvlKey] = { label: lvlKey, cursosMap: {}, total: 0 };
    
    const curKey = txt(e.Curso) || 'Sin Curso';
    if (!nivelesMap[lvlKey].cursosMap[curKey]) nivelesMap[lvlKey].cursosMap[curKey] = [];
    nivelesMap[lvlKey].cursosMap[curKey].push(e);
    nivelesMap[lvlKey].total++;
  });

  ordenCodigos.forEach(lvlKey => {
    if (nivelesMap[lvlKey]) {
      const lvlData = nivelesMap[lvlKey];
      const card = document.createElement('div');
      card.style.cssText = "background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; box-shadow: var(--shadow-sm);";

      let cursosHtml = '';
      Object.keys(lvlData.cursosMap).sort().forEach(cName => {
        const estList = lvlData.cursosMap[cName];
        cursosHtml += `
          <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 10px 14px; font-weight: 600; font-size: 13px; color: #3730a3; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="filtrarEstPorCursoClick('${esc(cName)}')">
            <span>🏫 ${esc(cName)}</span>
            <span style="background: #3730a3; color: #fff; padding: 2px 8px; border-radius: 9999px; font-size: 11px;">${estList.length} est.</span>
          </div>
        `;
      });

      card.innerHTML = `
        <div style="background: linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%); color: #fff; padding: 12px 18px; font-weight: 700; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
          <span>📁 ${esc(lvlData.label)}</span>
          <span style="background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 6px; font-size: 12px;">${lvlData.total} estudiantes</span>
        </div>
        <div style="padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; background: #f8fafc;">
          ${cursosHtml}
        </div>
      `;
      cont.appendChild(card);
    }
  });
}

function filtrarEstPorCursoClick(cursoName) {
  document.getElementById('est-curso').value = cursoName;
  cambiarModoVistaEstudiantes('tabla');
}

// ══════════════ PARTICIPANTES ADICIONALES Y RELATOS ══════════════
let participantesRelatosForm = [];
let listaUsuariosGlobal = [];

async function cargarListaUsuariosGlobal() {
  try {
    const res = await fetch('/api/usuarios');
    listaUsuariosGlobal = await res.json();
    
    let dl = document.getElementById('dl-usuarios-global');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'dl-usuarios-global';
      document.body.appendChild(dl);
    }
    dl.innerHTML = listaUsuariosGlobal.map(u => `<option value="${esc(u.nombre)}">${esc(u.nombre)} (${esc(u.username)} - ${esc(u.perfil)})</option>`).join('');
    
    const eResp = document.getElementById('e-resp');
    if (eResp) eResp.setAttribute('list', 'dl-usuarios-global');
  } catch (err) {
    console.error("Error al cargar lista de usuarios global:", err);
  }
}

function agregarParticipanteRelatoForm() {
  participantesRelatosForm.push({
    nombre: '',
    rol: 'Apoderado/a',
    relato: ''
  });
  renderParticipantesRelatosForm();
}

function eliminarParticipanteRelatoForm(idx) {
  participantesRelatosForm.splice(idx, 1);
  renderParticipantesRelatosForm();
}

function seleccionarFuncionarioRelato(idx, val) {
  if (val === 'CUSTOM') {
    renderParticipantesRelatosForm();
    return;
  }
  const found = listaUsuariosGlobal.find(u => u.nombre === val || u.username === val);
  if (found) {
    participantesRelatosForm[idx].nombre = found.nombre;
    if (found.perfil && found.perfil.includes('Docente')) participantesRelatosForm[idx].rol = 'Profesor/a Asignatura';
  } else if (val) {
    participantesRelatosForm[idx].nombre = val;
  }
  renderParticipantesRelatosForm();
}

function renderParticipantesRelatosForm() {
  const cont = document.getElementById('e-participantes-relatos-list');
  if (!cont) return;
  cont.innerHTML = '';
  
  if (participantesRelatosForm.length === 0) {
    cont.innerHTML = '<p style="font-size: 12px; color: #0284c7; font-style: italic; margin: 4px 0;">No se han agregado participantes adicionales aún. Haga clic en "+ Agregar Participante / Relato" si desea registrar el testimonio de otra persona.</p>';
    return;
  }

  participantesRelatosForm.forEach((p, idx) => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #fff; padding: 14px; border-radius: 8px; border: 1px solid #7dd3fc; display: flex; flex-direction: column; gap: 10px;';
    
    const esFuncionarioConocido = listaUsuariosGlobal.some(u => u.nombre === p.nombre);

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
          <div style="flex: 2; min-width: 220px;">
            <label style="font-size: 11.5px; font-weight: 700; color: #0369a1; margin-bottom: 4px; display: block;">
              👤 Seleccionar Funcionario / Usuario del Liceo (Relator):
            </label>
            <select onchange="seleccionarFuncionarioRelato(${idx}, this.value)" style="width: 100%; padding: 8px 12px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px; background: #f8fafc; font-weight: 600; color: #1e1b4b;">
              <option value="">-- Seleccionar Funcionario Registrado --</option>
              ${listaUsuariosGlobal.map(u => `<option value="${esc(u.nombre)}" ${p.nombre === u.nombre ? 'selected' : ''}>${esc(u.nombre)} (${esc(u.username)})</option>`).join('')}
              <option value="CUSTOM" ${!esFuncionarioConocido && p.nombre ? 'selected' : ''}>-- Escribir Nombre Personalizado (Ej: Apoderado / Externo) --</option>
            </select>
          </div>

          <div style="flex: 1; min-width: 150px;">
            <label style="font-size: 11.5px; font-weight: 700; color: #0369a1; margin-bottom: 4px; display: block;">
              🏷️ Rol / Vínculo:
            </label>
            <select onchange="participantesRelatosForm[${idx}].rol = this.value" style="width: 100%; padding: 8px 12px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px; outline: none;">
              <option value="Profesor/a Jefe" ${p.rol === 'Profesor/a Jefe' ? 'selected' : ''}>Profesor/a Jefe</option>
              <option value="Profesor/a Asignatura" ${p.rol === 'Profesor/a Asignatura' ? 'selected' : ''}>Profesor/a Asignatura</option>
              <option value="Convivencia Escolar" ${p.rol === 'Convivencia Escolar' ? 'selected' : ''}>Convivencia Escolar</option>
              <option value="Psicólogo/a PIE" ${p.rol === 'Psicólogo/a PIE' ? 'selected' : ''}>Psicólogo/a PIE</option>
              <option value="Inspector/a" ${p.rol === 'Inspector/a' ? 'selected' : ''}>Inspector/a</option>
              <option value="Apoderado/a" ${p.rol === 'Apoderado/a' ? 'selected' : ''}>Apoderado/a</option>
              <option value="Testigo / Compañero" ${p.rol === 'Testigo / Compañero' ? 'selected' : ''}>Testigo / Compañero/a</option>
              <option value="Otro" ${p.rol === 'Otro' ? 'selected' : ''}>Otro</option>
            </select>
          </div>

          <button type="button" class="btn btn-sm btn-danger" onclick="eliminarParticipanteRelatoForm(${idx})" style="padding: 6px 12px; font-size: 12px; margin-bottom: 1px;">🗑️ Quitar</button>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 3px; display: block;">Nombre Completo del Relator / Participante:</label>
          <input type="text" value="${esc(p.nombre)}" onchange="participantesRelatosForm[${idx}].nombre = this.value" placeholder="Escriba o confirme el nombre completo..." style="width: 100%; padding: 8px 12px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px; outline: none;">
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 3px; display: block;">Declaración, Aporte o Relato de la Persona:</label>
          <textarea class="textarea-md" rows="5" oninput="participantesRelatosForm[${idx}].relato = this.value; autoExpandTextarea(this);" onchange="participantesRelatosForm[${idx}].relato = this.value" placeholder="Escriba la declaración, testimonio o relato expresado por esta persona durante la entrevista..." style="width: 100%; padding: 10px 14px; font-size: 14px; border: 1px solid var(--border); border-radius: 6px; outline: none; resize: vertical;">${esc(p.relato)}</textarea>
        </div>
      </div>
    `;
    cont.appendChild(card);
  });

  const bottomBar = document.createElement('div');
  bottomBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 8px; flex-wrap: wrap; gap: 8px;';
  bottomBar.innerHTML = `
    <button type="button" class="btn btn-sm btn-secondary" onclick="agregarParticipanteRelatoForm()" style="font-size: 12px; font-weight: 700;">
      + Agregar Otro Participante / Relato
    </button>
    <button type="button" class="btn btn-sm btn-success" onclick="guardarParticipantesRelatosSolo()" style="font-size: 12px; font-weight: 700; background: #059669; border-color: #059669;">
      💾 Guardar Todos los Participantes y Relatos
    </button>
  `;
  cont.appendChild(bottomBar);
}

async function guardarParticipantesRelatosSolo() {
  if (!editandoEntrevistaId) {
    const rut = document.getElementById('e-rut').value.trim();
    if (!rut) {
      toast("⚠️ Ingrese el RUT del entrevistado antes de guardar los participantes");
      return;
    }
    toast("💾 Guardando entrevista con los participantes y relatos...");
    await guardarEntrevista();
    return;
  }

  try {
    const originalEnt = entrevistas.find(x => x.id === editandoEntrevistaId);
    const jsonParts = JSON.stringify(typeof participantesRelatosForm !== 'undefined' ? participantesRelatosForm : []);
    
    const payload = {
      ...(originalEnt || {}),
      id: editandoEntrevistaId,
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
      participantes_relatos: jsonParts
    };

    const res = await fetch('/api/entrevistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      if (originalEnt) originalEnt.participantes_relatos = jsonParts;
      toast(`💾 ${participantesRelatosForm.length} participante(s) y relato(s) guardado(s) exitosamente`);
    } else {
      toast(`❌ Error al guardar participantes: ${result.error}`);
    }
  } catch (err) {
    console.error("Error al guardar participantes:", err);
    toast("❌ Error de red al guardar participantes");
  }
}

// ══════════════ RENDERING HISTORIAL AGRUPADO (CURSO / ESTAMENTO) ══════════════
function renderHistorialAgrupado(entrevistasRows, modoAgrupar) {
  const cont = document.getElementById('hist-contenedor-agrupado');
  if (!cont) return;
  cont.innerHTML = '';

  if (!entrevistasRows || entrevistasRows.length === 0) {
    cont.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay entrevistas registradas para los filtros seleccionados.</div>';
    return;
  }

  const gruposMap = {};

  entrevistasRows.forEach(e => {
    let key = 'Sin Clasificar';
    if (modoAgrupar === 'curso') {
      key = txt(e.curso) || 'Sin Curso / Función';
    } else if (modoAgrupar === 'estamento') {
      key = txt(e.cargo) || 'Estudiante';
    }
    if (!gruposMap[key]) gruposMap[key] = [];
    gruposMap[key].push(e);
  });

  const sortedKeys = Object.keys(gruposMap).sort();

  sortedKeys.forEach((groupKey, gIdx) => {
    const items = gruposMap[groupKey];
    const groupCard = document.createElement('div');
    groupCard.style.cssText = "background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; box-shadow: var(--shadow-sm);";

    const uniqueGId = `hist-group-${gIdx}`;

    let rowsHtml = '';
    
    // Group items by RUT inside this course/estamento
    const estudiantesMap = {};
    items.forEach(e => {
      const rKey = (txt(e.rut) || 'SIN_RUT').toUpperCase();
      if (!estudiantesMap[rKey]) {
        estudiantesMap[rKey] = {
          rut: e.rut,
          nombre: e.nombre,
          interviews: []
        };
      }
      estudiantesMap[rKey].interviews.push(e);
    });

    Object.values(estudiantesMap).forEach((estObj, estIdx) => {
      const subGId = `${uniqueGId}-sub-${estIdx}`;
      const totalEnts = estObj.interviews.length;
      estObj.interviews.sort((a, b) => b.id.localeCompare(a.id));

      if (totalEnts === 1) {
        const e = estObj.interviews[0];
        let badgeColor = 'var(--primary)';
        if (e.estado === 'Cerrada') badgeColor = '#059669';
        if (e.estado === 'En seguimiento') badgeColor = '#d97706';

        rowsHtml += `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="font-family: monospace; font-weight: 700; font-size: 12px; color: var(--text-secondary); padding: 8px 12px;">${esc(e.id)}</td>
            <td style="font-size: 12px; padding: 8px 12px;">${esc(e.fecha)}</td>
            <td style="font-family: monospace; font-size: 12px; padding: 8px 12px;">${esc(e.rut)}</td>
            <td style="font-weight: 700; padding: 8px 12px;">${esc(e.nombre)}</td>
            <td style="font-size: 12px; color: var(--text-secondary); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 8px 12px;">${esc(e.objetivo || 'Sin objetivo')}</td>
            <td style="font-size: 12px; color: var(--text-secondary); padding: 8px 12px;">${esc(e.resp || '')}</td>
            <td style="padding: 8px 12px;"><span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; padding: 2px 8px; border-radius: 9999px; background: rgba(0,0,0,0.04);">${esc(e.estado || '')}</span></td>
            <td style="text-align: right; padding: 8px 12px;">
              <button class="btn btn-sm btn-primary" onclick="cargarEntrevistaParaEditarDirecto('${esc(e.id)}')" style="padding: 3px 8px; font-size: 11px;">✏️ Editar</button>
              <button class="btn btn-sm btn-secondary" onclick="imprimirDirectoEntrevista('${esc(e.id)}')" style="padding: 3px 8px; font-size: 11px;">🖨️ Ver Ficha</button>
            </td>
          </tr>
        `;
      } else {
        rowsHtml += `
          <tr class="subgroup-header" onclick="toggleHistorialSubGroup('${subGId}')" style="background-color: #eef2ff; cursor: pointer; font-weight: 600; border-bottom: 1px solid #c7d2fe;">
            <td colspan="3" style="padding: 8px 12px; font-family: monospace; font-size: 12px; font-weight: 700; color: #3730a3;">
              <span id="subarrow-${subGId}" style="transition: transform 0.2s; display: inline-block; transform: rotate(90deg); margin-right: 6px; font-size: 11px;">▶</span>
              RUT: ${esc(estObj.rut)}
            </td>
            <td colspan="2" style="padding: 8px 12px; font-weight: 700; color: #1e1b4b;">
              👤 ${esc(estObj.nombre)}
            </td>
            <td colspan="2" style="padding: 8px 12px;">
              <span style="background: #3730a3; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">${totalEnts} ENTREVISTAS</span>
            </td>
            <td style="text-align: right; padding: 8px 12px;">
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); imprimirEntrevistasPersona('${esc(estObj.rut)}')" style="padding: 3px 8px; font-size: 11px; font-weight: 700;">🖨️ Imprimir Persona (${totalEnts})</button>
            </td>
          </tr>
        `;

        estObj.interviews.forEach(e => {
          let badgeColor = 'var(--primary)';
          if (e.estado === 'Cerrada') badgeColor = '#059669';
          if (e.estado === 'En seguimiento') badgeColor = '#d97706';

          rowsHtml += `
            <tr class="subrow-${subGId}" style="border-bottom: 1px solid var(--border); background-color: #ffffff;">
              <td style="font-family: monospace; font-weight: 700; font-size: 12px; color: var(--text-secondary); padding: 8px 12px 8px 24px;">${esc(e.id)}</td>
              <td style="font-size: 12px; padding: 8px 12px;">${esc(e.fecha)}</td>
              <td style="font-family: monospace; font-size: 12px; padding: 8px 12px;">${esc(e.rut)}</td>
              <td style="font-weight: 600; padding: 8px 12px; color: #475569;">${esc(e.nombre)}</td>
              <td style="font-size: 12px; color: var(--text-secondary); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 8px 12px;">${esc(e.objetivo || 'Sin objetivo')}</td>
              <td style="font-size: 12px; color: var(--text-secondary); padding: 8px 12px;">${esc(e.resp || '')}</td>
              <td style="padding: 8px 12px;"><span style="font-size: 11px; font-weight: 700; color: ${badgeColor}; padding: 2px 8px; border-radius: 9999px; background: rgba(0,0,0,0.04);">${esc(e.estado || '')}</span></td>
              <td style="text-align: right; padding: 8px 12px;">
                <button class="btn btn-sm btn-primary" onclick="cargarEntrevistaParaEditarDirecto('${esc(e.id)}')" style="padding: 3px 8px; font-size: 11px;">✏️ Editar</button>
                <button class="btn btn-sm btn-secondary" onclick="imprimirDirectoEntrevista('${esc(e.id)}')" style="padding: 3px 8px; font-size: 11px;">🖨️ Ver Ficha</button>
              </td>
            </tr>
          `;
        });
      }
    });

    groupCard.innerHTML = `
      <div style="background: var(--bg-body, #f8fafc); padding: 12px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleHistorialAcordeon('${uniqueGId}')">
        <div style="display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14px; color: var(--text-primary);">
          <span id="arrow-${uniqueGId}" style="transition: transform 0.2s; display: inline-block;">▼</span>
          <span>${modoAgrupar === 'curso' ? '🏫 Curso / Función' : '👥 Estamento'}: <strong style="color: #4f46e5;">${esc(groupKey)}</strong></span>
          <span style="background: #4f46e5; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 9999px; margin-left: 4px;">${items.length} entrevistas</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); imprimirGrupoEntrevistas('${esc(groupKey)}', '${modoAgrupar}')" style="font-size: 11.5px; font-weight: 700;">
          🖨️ Imprimir Grupo
        </button>
      </div>
      <div id="content-${uniqueGId}" class="tbl-wrap" style="display: block; padding: 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f5f9; font-size: 12px; text-align: left; border-bottom: 1px solid var(--border);">
              <th style="padding: 8px 12px;">ID</th>
              <th style="padding: 8px 12px;">Fecha</th>
              <th style="padding: 8px 12px;">RUT</th>
              <th style="padding: 8px 12px;">Nombre</th>
              <th style="padding: 8px 12px;">Objetivo</th>
              <th style="padding: 8px 12px;">Responsable</th>
              <th style="padding: 8px 12px;">Estado</th>
              <th style="padding: 8px 12px; text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
    cont.appendChild(groupCard);
  });
}

function toggleHistorialAcordeon(gId) {
  const content = document.getElementById(`content-${gId}`);
  const arrow = document.getElementById(`arrow-${gId}`);
  if (content) {
    if (content.style.display === 'none') {
      content.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
      content.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(-90deg)';
    }
  }
}

function imprimirGrupoEntrevistas(groupKey, modoAgrupar) {
  const filtradas = entrevistas.filter(e => {
    if (modoAgrupar === 'curso') return (txt(e.curso) || 'Sin Curso / Función') === groupKey;
    if (modoAgrupar === 'estamento') return (txt(e.cargo) || 'Estudiante') === groupKey;
    return false;
  });
  if (filtradas.length === 0) return;
  const ids = filtradas.map(e => e.id).join(',');
  goTo(`reporte?ids=${ids}`);
}

function toggleHistorialSubGroup(subGId) {
  const rows = document.querySelectorAll('.subrow-' + subGId);
  const arrow = document.getElementById('subarrow-' + subGId);
  rows.forEach(r => {
    if (r.style.display === 'none') {
      r.style.display = 'table-row';
    } else {
      r.style.display = 'none';
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

function imprimirEntrevistasPersona(rutPersona) {
  const cleanRut = (txt(rutPersona) || '').toUpperCase();
  const filtradas = entrevistas.filter(e => (txt(e.rut) || '').toUpperCase() === cleanRut);
  if (filtradas.length === 0) return;
  const ids = filtradas.map(e => e.id).join(',');
  goTo(`reporte?ids=${ids}`);
}


