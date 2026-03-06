// public/js/index.js
// Panel del docente (renderer):
// - CRUD de cuestionarios / preguntas / respuestas
// - Control de conexiones de estudiantes (Socket.IO)
// - Control de proyección (Electron IPC)
// - Control del juego (iniciar / siguiente / terminar) + bloqueo de secciones
// - Historial de lanzamientos (aplicaciones) y detalle de ranking

'use strict';

// ------------------------------------------------------------
// Config / constantes base
// ------------------------------------------------------------

const API_BASE = 'http://localhost:3000';

// Acciones de UI para CRUD (cuestionarios / preguntas)
const ACCIONES_CRUD_CUESTIONARIO = {
  SELECCIONAR: 'SELECCIONAR',
  AGREGAR: 'AGREGAR',
  EDITAR: 'EDITAR',
  ELIMINAR: 'ELIMINAR',
  GUARDAR: 'GUARDAR',
  REFRESCAR: 'REFRESCAR',
  INICIAR: 'INICIAR',
};

const ACCIONES_CRUD_PREGUNTA = {
  SELECCIONAR: 'SELECCIONAR',
  AGREGAR: 'AGREGAR',
  EDITAR: 'EDITAR',
  ELIMINAR: 'ELIMINAR',
  GUARDAR: 'GUARDAR',
  REFRESCAR: 'REFRESCAR',
  INICIAR: 'INICIAR',
};

// ------------------------------------------------------------
// Cache de DOM (evita repetir getElementById)
// ------------------------------------------------------------

const DOM = {
  // conexión / estudiantes
  linkEstudiantes: document.getElementById('linkEstudiantes'),
  btnToggleConexiones: document.getElementById('toggleConexiones'),
  listaEstudiantes: document.getElementById('listaEstudiantes'),

  // proyección (Electron)
  btnAbrirProyeccion: document.getElementById('btnAbrirProyeccion'),
  btnCerrarProyeccion: document.getElementById('btnCerrarProyeccion'),

  // juego
  btnIniciarLanzamiento: document.getElementById('btnIniciarLanzamiento'),
  btnSiguientePregunta: document.getElementById('btnSiguientePregunta'),
  btnTerminarLanzamiento: document.getElementById('btnTerminarLanzamiento'), // puede no existir

  // contenedores para bloqueo visual
  contCuestionarios: document.getElementById('cuestionarios'),
  contPreguntas: document.getElementById('preguntas'),
  contRespuestas: document.getElementById('respuestas'),

  // CRUD cuestionarios
  btnAgregarCuestionario: document.getElementById('agregarCuestionario'),
  btnEditarCuestionario: document.getElementById('editarCuestionario'),
  btnEliminarCuestionario: document.getElementById('eliminarCuestionario'),
  btnGuardarCuestionario: document.getElementById('guardarCuestionario'),
  btnRefrescarCuestionarios: document.getElementById('refrescarCuestionarios'),
  inputTituloCuestionario: document.getElementById('nuevoTitulo'),
  inputTiempoCuestionario: document.getElementById('nuevoTiempo'),
  listaCuestionarios: document.getElementById('listaCuestionarios'),

  // CRUD preguntas
  btnAgregarPregunta: document.getElementById('agregarPregunta'),
  btnEditarPregunta: document.getElementById('editarPregunta'),
  btnEliminarPregunta: document.getElementById('eliminarPregunta'),
  btnGuardarPregunta: document.getElementById('guardarPregunta'),
  btnRefrescarPreguntas: document.getElementById('refrescarPreguntas'),
  inputTextoPregunta: document.getElementById('nuevoTextoPregunta'),
  listaPreguntas: document.getElementById('listaPreguntas'),

  // respuestas
  inputRespA: document.getElementById('respA'),
  inputRespB: document.getElementById('respB'),
  inputRespC: document.getElementById('respC'),
  inputRespD: document.getElementById('respD'),
  radioCorrecta: document.getElementsByName('correcta'),
  btnGuardarRespuestas: document.getElementById('guardarRespuestas'),

  // lanzamientos (si existe UL)
  listaLanzamientos: document.getElementById('listaLanzamientos'),
};

console.log('Renderer funcionando correctamente');

// ------------------------------------------------------------
// Estado global de UI (solo flags)
// ------------------------------------------------------------

const UI = {
  juegoEnCurso: false,
  proyeccionAbierta: false,
};

// Estado de conexiones (docente)
let conexionesHabilitadas = false;

// Bloqueo durante juego
let BLOQUEO_ACTIVO = false;

// ------------------------------------------------------------
// Helpers UI: habilitar/deshabilitar botones “globales”
// ------------------------------------------------------------

function aplicarEstadoBotones() {
  const enJuego = !!UI.juegoEnCurso;
  const projAbierta = !!UI.proyeccionAbierta;

  if (DOM.btnIniciarLanzamiento) DOM.btnIniciarLanzamiento.disabled = enJuego;
  if (DOM.btnToggleConexiones) DOM.btnToggleConexiones.disabled = enJuego;
  if (DOM.btnSiguientePregunta) DOM.btnSiguientePregunta.disabled = !enJuego;

  if (DOM.btnAbrirProyeccion) DOM.btnAbrirProyeccion.disabled = projAbierta;
  if (DOM.btnCerrarProyeccion) DOM.btnCerrarProyeccion.disabled = !projAbierta;
}

/**
 * Bloquea/desbloquea secciones del CRUD mientras el juego está en curso.
 * Esto evita que el docente edite cuestionarios/preguntas en medio del lanzamiento.
 */
function bloquearSecciones(on) {
  BLOQUEO_ACTIVO = !!on;

  // 1) clase visual
  [DOM.contCuestionarios, DOM.contPreguntas, DOM.contRespuestas].forEach((c) => {
    if (!c) return;
    c.classList.toggle('locked', !!on);
    c.style.opacity = on ? 0.6 : 1;
  });

  // 2) deshabilitar controles internos
  [DOM.contCuestionarios, DOM.contPreguntas, DOM.contRespuestas].forEach((c) => {
    if (!c) return;
    c.querySelectorAll('input, textarea, select, button, [contenteditable="true"]').forEach((el) => {
      // no tocamos botones de proyección
      if (el.id === 'btnAbrirProyeccion' || el.id === 'btnCerrarProyeccion' || el.id === 'btnTerminarLanzamiento') return;

      if ('disabled' in el) el.disabled = !!on;
      if (el.isContentEditable) el.contentEditable = on ? 'false' : 'true';
      if (on && typeof el.blur === 'function') el.blur();
    });
  });

  // 3) controles de juego / conexiones
  if (DOM.btnIniciarLanzamiento) DOM.btnIniciarLanzamiento.disabled = !!on;
  if (DOM.btnSiguientePregunta) DOM.btnSiguientePregunta.disabled = !on;
  if (DOM.btnToggleConexiones) DOM.btnToggleConexiones.disabled = !!on;
}

// ------------------------------------------------------------
// Socket.IO (conexión docente <-> backend)
// ------------------------------------------------------------

// El backend sirve Socket.IO desde el mismo host/puerto.
// Aquí usas localhost porque el docente corre en la misma máquina.
const socket = io(API_BASE);

function inicializarConexionEstudiantes() {
  // Obtener IP local desde backend (para mostrar la URL que usarán los estudiantes)
  fetch(`${API_BASE}/api/ip`)
    .then((res) => res.json())
    .then((data) => {
      if (DOM.linkEstudiantes) DOM.linkEstudiantes.textContent = `http://${data.ip}:3000`;
    })
    .catch((err) => {
      console.error('❌ No se pudo obtener IP local:', err);
      if (DOM.linkEstudiantes) DOM.linkEstudiantes.textContent = '⚠️ Error al obtener IP';
    });

  // Lista en vivo de estudiantes conectados
  socket.on('estudiantes-actualizados', (estudiantes) => {
    if (!DOM.listaEstudiantes) return;

    DOM.listaEstudiantes.innerHTML = '';
    estudiantes.forEach((est) => {
      const li = document.createElement('li');
      li.textContent = `${est.nombre} (${est.boleta}) - ${est.puntaje}`;
      DOM.listaEstudiantes.appendChild(li);
    });
  });

  // Botón permitir/no permitir conexiones
  if (DOM.btnToggleConexiones) {
    DOM.btnToggleConexiones.addEventListener('click', () => {
      conexionesHabilitadas = !conexionesHabilitadas;

      DOM.btnToggleConexiones.textContent = conexionesHabilitadas
        ? '🔒 No permitir Conexiones'
        : '🔌 Permitir Conexiones';

      socket.emit(conexionesHabilitadas ? 'habilitar-conexiones' : 'deshabilitar-conexiones');
    });
  }

  // Al abrir la app, por seguridad dejamos conexiones deshabilitadas
  socket.on('connect', () => {
    socket.emit('deshabilitar-conexiones');
  });
}

// ------------------------------------------------------------
// Cerrar Aplicación
// ------------------------------------------------------------

if (DOM.btnTerminarLanzamiento) {
  DOM.btnTerminarLanzamiento.addEventListener('click', async () => {
    const r = await Swal.fire({
      title: 'Cerrar WINN',
      html: `
        <div style="text-align:left; line-height:1.4">
          <p>Vas a cerrar la aplicación.</p>
          <p style="margin:0.5rem 0 0 0">
            <strong>Importante:</strong> si existe algún lanzamiento ejecutándose, no se guardará ni un solo dato.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33'
    });

    if (!r.isConfirmed) return;

    try {
      await window.electronAPI.cerrarWinn();
    } catch (e) {
      console.error('No se pudo cerrar WINN:', e);
      // fallback: al menos intenta cerrar la pestaña (no siempre aplica en Electron)
      window.close();
    }
  });
}

// ------------------------------------------------------------
// Proyección (Electron IPC)
// ------------------------------------------------------------

function inicializarProyeccion() {
  if (DOM.btnAbrirProyeccion) {
    DOM.btnAbrirProyeccion.addEventListener('click', async () => {
      try {
        await window.electronAPI.abrirProyeccion();
        UI.proyeccionAbierta = true;
        aplicarEstadoBotones();
      } catch (e) {
        console.error('No se pudo abrir proyección', e);
      }
    });
  }

  if (DOM.btnCerrarProyeccion) {
    DOM.btnCerrarProyeccion.addEventListener('click', async () => {
      try {

        const ok = window.confirm(
          '⚠️ No se puede cerrar la ventana a medio juego.\n\n' +
          'Toda la información de este lanzamiento se perderá y tendrás que iniciar un nuevo juego.\n\n' +
          '¿Deseas cerrar la proyección?'
        );

        if (ok) {
          await window.electronAPI.cerrarProyeccion();

          UI.proyeccionAbierta = false;
          aplicarEstadoBotones();
        }
      } catch (e) {
        console.error('No se pudo cerrar proyección', e);
      }
    });
  }
}

// ------------------------------------------------------------
// Estado y UI: cuestionarios
// ------------------------------------------------------------

let cuestionarios = [];
let cuestionarioSeleccionado = null;

function actualizarEstadoBotonesCuestionario(accion) {
  if (BLOQUEO_ACTIVO) return;
  if (!accion) return;

  const bA = DOM.btnAgregarCuestionario;
  const bE = DOM.btnEditarCuestionario;
  const bD = DOM.btnEliminarCuestionario;
  const bG = DOM.btnGuardarCuestionario;
  const bR = DOM.btnRefrescarCuestionarios;
  const inT = DOM.inputTituloCuestionario;
  const inTi = DOM.inputTiempoCuestionario;

  switch (accion) {
    case ACCIONES_CRUD_CUESTIONARIO.INICIAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inT) inT.disabled = true;
      if (inTi) inTi.disabled = true;
      break;

    case ACCIONES_CRUD_CUESTIONARIO.SELECCIONAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = false;
      if (bD) bD.disabled = false;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inT) inT.disabled = true;
      if (inTi) inTi.disabled = true;
      break;

    case ACCIONES_CRUD_CUESTIONARIO.AGREGAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = false;
      if (bR) bR.disabled = false;
      if (inTi) {
        inTi.value = '';
        inTi.disabled = false;
      }
      if (inT) {
        inT.value = '';
        inT.disabled = false;
        inT.focus();
      }
      break;

    case ACCIONES_CRUD_CUESTIONARIO.EDITAR:
      if (bA) bA.disabled = true;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = false;
      if (bR) bR.disabled = false;
      if (inTi) inTi.disabled = false;
      if (inT) {
        inT.disabled = false;
        inT.focus();
      }
      break;

    case ACCIONES_CRUD_CUESTIONARIO.REFRESCAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inT) inT.disabled = true;
      if (inTi) inTi.disabled = true;
      break;

    default:
      console.log(`Acción no reconocida (cuestionarios): ${accion}`);
  }
}

function cargarCuestionarios() {
  fetch(`${API_BASE}/api/cuestionarios`)
    .then((res) => res.json())
    .then((data) => {
      cuestionarios = data;
      renderCuestionarios();
    })
    .catch((err) => console.error('❌ Error al cargar cuestionarios:', err));
}

function renderCuestionarios() {
  const lista = DOM.listaCuestionarios;
  if (!lista) return;

  lista.innerHTML = '';

  cuestionarios.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.titulo} (${c.tiempo_limite}s)`;
    li.dataset.id = c.id;
    li.style.cursor = 'pointer';

    li.addEventListener('click', () => {
      cuestionarioSeleccionado = c;

      if (DOM.inputTituloCuestionario) DOM.inputTituloCuestionario.value = c.titulo;
      if (DOM.inputTiempoCuestionario) DOM.inputTiempoCuestionario.value = c.tiempo_limite;

      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.SELECCIONAR);

      // Al seleccionar cuestionario, refrescamos preguntas y limpiamos selección
      cargarPreguntas();
      preguntaSeleccionada = null;

      // estilo visual de selección
      document.querySelectorAll('#listaCuestionarios li').forEach((el) => el.classList.remove('selected'));
      li.classList.add('selected');

      console.log(`✅ Cuestionario seleccionado: ${c.titulo} (${c.id})`);
    });

    lista.appendChild(li);
  });
}

function inicializarCuestionarios() {
  cargarCuestionarios();
  actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.INICIAR);

  if (DOM.btnAgregarCuestionario) {
    DOM.btnAgregarCuestionario.addEventListener('click', () => {
      cuestionarioSeleccionado = null;
      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.AGREGAR);
    });
  }

  if (DOM.btnEditarCuestionario) {
    DOM.btnEditarCuestionario.addEventListener('click', async () => {
      if (!cuestionarioSeleccionado) {
        await Swal.fire({
          icon: 'info',
          title: 'Selecciona un cuestionario',
          text: 'Debes elegir un cuestionario para continuar.',
          confirmButtonText: 'Entendido',
        });
        return;
      }

      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.EDITAR);
      if (DOM.inputTituloCuestionario) DOM.inputTituloCuestionario.focus();
    });
  }

  if (DOM.btnEliminarCuestionario) {
    DOM.btnEliminarCuestionario.addEventListener('click', () => {
      if (!cuestionarioSeleccionado) return;

      const confirmacion = confirm(`¿Eliminar el cuestionario "${cuestionarioSeleccionado.titulo}"?`);
      if (!confirmacion) return;

      fetch(`${API_BASE}/api/cuestionarios/${cuestionarioSeleccionado.id}`, { method: 'DELETE' })
        .then((res) => res.json())
        .then(() => {
          console.log(`🗑️ Cuestionario eliminado: ${cuestionarioSeleccionado.titulo}`);

          cargarCuestionarios();

          if (DOM.inputTituloCuestionario) DOM.inputTituloCuestionario.value = '';
          if (DOM.inputTiempoCuestionario) DOM.inputTiempoCuestionario.value = '';

          cuestionarioSeleccionado = null;
          actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.REFRESCAR);
        })
        .catch((err) => console.error('❌ Error al eliminar:', err));
    });
  }

  if (DOM.btnGuardarCuestionario) {
    DOM.btnGuardarCuestionario.addEventListener('click', async () => {
      const titulo = (DOM.inputTituloCuestionario?.value || '').trim();
      const tiempoLimite = parseInt(DOM.inputTiempoCuestionario?.value, 10);

      if (!titulo || Number.isNaN(tiempoLimite) || tiempoLimite <= 0) {
        await Swal.fire({
          icon: 'error',
          title: 'Datos inválidos',
          text: 'El título o el tiempo no son válidos. Verifica los campos antes de continuar.',
          confirmButtonText: 'Ok',
        });
        return;
      }

      // actualizar
      if (cuestionarioSeleccionado) {
        fetch(`${API_BASE}/api/cuestionarios/${cuestionarioSeleccionado.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, tiempo_limite: tiempoLimite }),
        })
          .then((res) => res.json())
          .then(() => {
            console.log(`✏️ Cuestionario actualizado: ${titulo}`);
            cargarCuestionarios();

            if (DOM.inputTituloCuestionario) DOM.inputTituloCuestionario.value = '';
            if (DOM.inputTiempoCuestionario) DOM.inputTiempoCuestionario.value = '';

            cuestionarioSeleccionado = null;
          })
          .catch((err) => console.error('❌ Error al actualizar:', err));
      } else {
        // crear
        fetch(`${API_BASE}/api/cuestionarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, tiempo_limite: tiempoLimite }),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log(`✅ Cuestionario agregado con ID: ${data.id}`);
            cargarCuestionarios();

            if (DOM.inputTituloCuestionario) DOM.inputTituloCuestionario.value = '';
            if (DOM.inputTiempoCuestionario) DOM.inputTiempoCuestionario.value = '';
          })
          .catch((err) => console.error('❌ Error al agregar:', err));
      }

      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.REFRESCAR);
    });
  }

  if (DOM.btnRefrescarCuestionarios) {
    DOM.btnRefrescarCuestionarios.addEventListener('click', () => {
      cargarCuestionarios();
      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.REFRESCAR);
    });
  }
}

// ------------------------------------------------------------
// Estado y UI: preguntas
// ------------------------------------------------------------

let preguntas = [];
let preguntaSeleccionada = null;

function actualizarEstadoBotonesPregunta(accion) {
  if (BLOQUEO_ACTIVO) return;
  if (!accion) return;

  const bA = DOM.btnAgregarPregunta;
  const bE = DOM.btnEditarPregunta;
  const bD = DOM.btnEliminarPregunta;
  const bG = DOM.btnGuardarPregunta;
  const bR = DOM.btnRefrescarPreguntas;
  const inP = DOM.inputTextoPregunta;

  switch (accion) {
    case ACCIONES_CRUD_PREGUNTA.INICIAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inP) {
        inP.disabled = true;
        inP.value = '';
      }
      break;

    case ACCIONES_CRUD_PREGUNTA.SELECCIONAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = false;
      if (bD) bD.disabled = false;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inP) inP.disabled = true;
      break;

    case ACCIONES_CRUD_PREGUNTA.AGREGAR:
      if (bA) bA.disabled = true;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = false;
      if (bR) bR.disabled = false;
      if (inP) {
        inP.disabled = false;
        inP.value = '';
        inP.focus();
      }
      break;

    case ACCIONES_CRUD_PREGUNTA.EDITAR:
      if (bA) bA.disabled = true;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = false;
      if (bR) bR.disabled = false;
      if (inP) {
        inP.disabled = false;
        inP.focus();
      }
      break;

    case ACCIONES_CRUD_PREGUNTA.REFRESCAR:
      if (bA) bA.disabled = false;
      if (bE) bE.disabled = true;
      if (bD) bD.disabled = true;
      if (bG) bG.disabled = true;
      if (bR) bR.disabled = false;
      if (inP) inP.disabled = true;
      break;

    default:
      console.log(`Acción no reconocida (preguntas): ${accion}`);
  }
}

function cargarPreguntas() {
  if (!cuestionarioSeleccionado) return;

  fetch(`${API_BASE}/api/preguntas/${cuestionarioSeleccionado.id}`)
    .then((res) => res.json())
    .then((data) => {
      preguntas = data;
      renderPreguntas();
      actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.INICIAR);
    })
    .catch((err) => console.error('❌ Error al cargar preguntas:', err));
}

function limpiarRespuestasUI() {
  const inputs = [DOM.inputRespA, DOM.inputRespB, DOM.inputRespC, DOM.inputRespD].filter(Boolean);
  inputs.forEach((i) => (i.value = ''));

  const radios = DOM.radioCorrecta || [];
  [...radios].forEach((r) => (r.checked = false));
}

function renderPreguntas() {
  const lista = DOM.listaPreguntas;
  if (!lista) return;

  lista.innerHTML = '';

  preguntas.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.enunciado;
    li.dataset.id = p.id;
    li.classList.add('pregunta');
    li.style.cursor = 'pointer';

    li.addEventListener('click', () => {
      preguntaSeleccionada = p;

      if (DOM.inputTextoPregunta) DOM.inputTextoPregunta.value = p.enunciado;

      actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.SELECCIONAR);

      // cargar respuestas de la pregunta seleccionada
      cargarRespuestas();

      // estilo visual
      document.querySelectorAll('#listaPreguntas li').forEach((el) => el.classList.remove('selected'));
      li.classList.add('selected');

      console.log(`✅ Pregunta seleccionada: ${p.enunciado}`);
    });

    lista.appendChild(li);
  });

  // al renderizar preguntas, limpiamos la UI de respuestas (evita confusiones)
  limpiarRespuestasUI();
}

function inicializarPreguntas() {
  actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.INICIAR);

  if (DOM.btnAgregarPregunta) {
    DOM.btnAgregarPregunta.addEventListener('click', () => {
      preguntaSeleccionada = null;
      actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.AGREGAR);
    });
  }

  if (DOM.btnEditarPregunta) {
    DOM.btnEditarPregunta.addEventListener('click', () => {
      if (!preguntaSeleccionada) return;
      actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.EDITAR);
    });
  }

  if (DOM.btnEliminarPregunta) {
    DOM.btnEliminarPregunta.addEventListener('click', () => {
      if (!preguntaSeleccionada) return;

      const confirmacion = confirm(`¿Eliminar la pregunta "${preguntaSeleccionada.enunciado}"?`);
      if (!confirmacion) return;

      fetch(`${API_BASE}/api/preguntas/${preguntaSeleccionada.id}`, { method: 'DELETE' })
        .then((res) => res.json())
        .then(() => {
          console.log('🗑️ Pregunta eliminada.');
          cargarPreguntas();
          preguntaSeleccionada = null;
        })
        .catch((err) => console.error('❌ Error al eliminar pregunta:', err));
    });
  }

  if (DOM.btnGuardarPregunta) {
    DOM.btnGuardarPregunta.addEventListener('click', async () => {
      const textoPregunta = (DOM.inputTextoPregunta?.value || '').trim();

      if (!textoPregunta) {
        await Swal.fire({
          icon: 'error',
          title: 'Pregunta no válida',
          text: 'Debes escribir una pregunta antes de continuar.',
          confirmButtonText: 'Ok',
        });
        return;
      }

      // actualizar
      if (preguntaSeleccionada) {
        fetch(`${API_BASE}/api/preguntas/${preguntaSeleccionada.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: textoPregunta }),
        })
          .then((res) => res.json())
          .then(() => {
            console.log(`✏️ Pregunta actualizada: ${textoPregunta}`);
            cargarPreguntas();
            preguntaSeleccionada = null;
          })
          .catch((err) => console.error('❌ Error al actualizar pregunta:', err));
      } else {
        // crear
        fetch(`${API_BASE}/api/preguntas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texto: textoPregunta,
            cuestionario_id: cuestionarioSeleccionado?.id,
          }),
        })
          .then((res) => res.json())
          .then(() => {
            console.log(`✅ Pregunta agregada: ${textoPregunta}`);
            cargarPreguntas();
          })
          .catch((err) => console.error('❌ Error al agregar pregunta:', err));
      }

      actualizarEstadoBotonesCuestionario(ACCIONES_CRUD_CUESTIONARIO.REFRESCAR);
    });
  }

  if (DOM.btnRefrescarPreguntas) {
    DOM.btnRefrescarPreguntas.addEventListener('click', () => {
      cargarPreguntas();
      preguntaSeleccionada = null;
      actualizarEstadoBotonesPregunta(ACCIONES_CRUD_PREGUNTA.REFRESCAR);
    });
  }
}

// ------------------------------------------------------------
// Respuestas (cargar / guardar)
// ------------------------------------------------------------

function cargarRespuestas() {
  limpiarRespuestasUI();
  if (!preguntaSeleccionada) return;

  fetch(`${API_BASE}/api/respuestas/${preguntaSeleccionada.id}`)
    .then((res) => res.json())
    .then((data) => {
      const inputs = [DOM.inputRespA, DOM.inputRespB, DOM.inputRespC, DOM.inputRespD];
      const radios = DOM.radioCorrecta || [];

      data.forEach((r, i) => {
        if (inputs[i]) inputs[i].value = r.respuesta;
        if (radios[i]) radios[i].checked = r.es_correcta === 1;
      });
    })
    .catch((err) => {
      console.error('❌ Error al cargar respuestas:', err);
      limpiarRespuestasUI();
    });
}

function inicializarRespuestas() {
  if (!DOM.btnGuardarRespuestas) return;

  DOM.btnGuardarRespuestas.addEventListener('click', async () => {
    if (!preguntaSeleccionada) return;

    const inputs = [DOM.inputRespA, DOM.inputRespB, DOM.inputRespC, DOM.inputRespD];
    const radios = DOM.radioCorrecta || [];

    const respuestas = inputs.map((input, i) => ({
      respuesta: (input?.value || '').trim(),
      es_correcta: !!radios[i]?.checked,
    }));

    if (respuestas.some((r) => !r.respuesta)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Respuestas incompletas',
        text: 'Todas las respuestas deben contener texto antes de guardar.',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    if (!respuestas.some((r) => r.es_correcta)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Respuesta correcta no seleccionada',
        text: 'Debes marcar cuál es la opción correcta antes de guardar.',
        confirmButtonText: 'Ok',
      });

      // vibración visual (si existe clase/estructura)
      [...radios].forEach((radio) => {
        const label = radio.closest('.respuesta-linea') || radio;
        label.classList.add('vibrar');
        setTimeout(() => label.classList.remove('vibrar'), 400);
      });

      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/respuestas/${preguntaSeleccionada.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(respuestas),
      });

      const data = await res.json();

      if (data.success) {
        await Swal.fire({
          icon: 'success',
          title: 'Respuestas guardadas',
          text: 'Se han guardado correctamente.',
          confirmButtonText: 'Perfecto',
        });
      } else {
        await Swal.fire({
          icon: 'error',
          title: 'Error al guardar',
          text: 'No se pudieron guardar las respuestas. Intenta de nuevo.',
          confirmButtonText: 'Ok',
        });
      }
    } catch (err) {
      console.error('❌ Error al guardar respuestas:', err);
      await Swal.fire({
        icon: 'error',
        title: 'Error de red',
        text: 'No se pudo contactar al servidor.',
        confirmButtonText: 'Ok',
      });
    }
  });
}

// ------------------------------------------------------------
// Juego / lanzamiento (iniciar / siguiente / estados por socket)
// ------------------------------------------------------------

function inicializarJuego() {
  if (DOM.btnIniciarLanzamiento) {
    DOM.btnIniciarLanzamiento.addEventListener('click', async () => {
      if (!cuestionarioSeleccionado) {
        await Swal.fire({
          icon: 'info',
          title: 'Cuestionario no seleccionado',
          text: 'Por favor, selecciona un cuestionario antes de iniciar.',
          confirmButtonText: 'Ok',
        });
        return;
      }

      const totalEstudiantes = DOM.listaEstudiantes ? DOM.listaEstudiantes.children.length : 0;
      if (totalEstudiantes === 0) {
        await Swal.fire({
          icon: 'warning',
          title: 'Sin estudiantes conectados',
          text: 'Por favor, espera a que se conecten al menos uno antes de iniciar.',
          confirmButtonText: 'Entendido',
        });
        return;
      }

      const resultado = await Swal.fire({
        title: '¿Iniciar cuestionario?',
        html: `
          ¿Deseas lanzar el cuestionario<br>
          <span style="white-space: nowrap; font-weight: bold;">"${cuestionarioSeleccionado.titulo}"</span><br>
          con <strong>${totalEstudiantes}</strong> estudiante(s)?
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Sí, lanzar',
        cancelButtonText: '❌ Cancelar',
      });

      if (!resultado.isConfirmed) return;

      try {
        const res = await fetch(`${API_BASE}/api/iniciar-juego`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_cuestionario: cuestionarioSeleccionado.id }),
        });

        const data = await res.json();

        if (data.ok) {
          UI.juegoEnCurso = true;
          aplicarEstadoBotones();
          bloquearSecciones(true);

          await Swal.fire({
            icon: 'success',
            title: 'Juego listo',
            text: 'El juego ha sido iniciado correctamente.',
            confirmButtonText: 'Comenzar',
          });
        } else {
          await Swal.fire({
            icon: 'error',
            title: 'Error inesperado',
            text: 'Algo falló al iniciar el juego. Intenta de nuevo.',
            confirmButtonText: 'Ok',
          });
        }
      } catch (err) {
        console.error('❌ Error al iniciar juego:', err);
        await Swal.fire({
          icon: 'error',
          title: 'Error de conexión',
          text: 'No se pudo contactar con el servidor.',
          confirmButtonText: 'Ok',
        });
      }
    });
  }

  if (DOM.btnSiguientePregunta) {
    DOM.btnSiguientePregunta.addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE}/api/siguiente-pregunta`, { method: 'POST' });
        const data = await res.json();

        if (data.fin) {
          await Swal.fire({
            icon: 'info',
            title: 'Juego finalizado',
            text: 'Se han mostrado todas las preguntas.',
            confirmButtonText: 'Aceptar',
          });
        } else {
          await Swal.fire({
            icon: 'info',
            title: '✅ Siguiente pregunta lanzada',
            text: 'Todos los dispositivos han recibido la nueva pregunta.',
            timer: 1500,
            showConfirmButton: false,
          });
        }
      } catch (err) {
        console.error('❌ Error al avanzar pregunta:', err);
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo avanzar a la siguiente pregunta. Revisa la conexión.',
        });
      }
    });
  }

  // Ranking (se dispara cuando backend emite mostrar-ranking)
  socket.on('mostrar-ranking', async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ranking`);
      const ranking = await res.json();

      if (!ranking || ranking.length === 0) {
        await Swal.fire({
          icon: 'info',
          title: '🏆 Ranking actual',
          html: 'Aún no hay respuestas registradas.',
          confirmButtonText: 'Continuar',
        });
        return;
      }

      const contenidoHTML = ranking
        .map((e, i) => `<p><strong>${i + 1}.</strong> ${e.nombre} - ${e.puntaje}</p>`)
        .join('');

      await Swal.fire({
        icon: 'success',
        title: '🏆 Ranking actual',
        html: contenidoHTML,
        confirmButtonText: 'Siguiente pregunta',
      });
    } catch (err) {
      console.error('❌ Error al mostrar ranking en docente:', err);
    }
  });

  // Estado de juego al cargar UI
  fetch(`${API_BASE}/api/estado`)
    .then((r) => r.json())
    .then(({ juegoEnCurso }) => {
      UI.juegoEnCurso = !!juegoEnCurso;
      aplicarEstadoBotones();
      bloquearSecciones(UI.juegoEnCurso);
    })
    .catch(() => {
      UI.juegoEnCurso = false;
      aplicarEstadoBotones();
      bloquearSecciones(false);
    });

  // Sincronización por socket del estado de juego
  socket.on('estadoJuego', ({ juegoEnCurso }) => {
    UI.juegoEnCurso = !!juegoEnCurso;
    aplicarEstadoBotones();
    bloquearSecciones(UI.juegoEnCurso);
  });

  socket.on('juegoIniciado', () => {
    UI.juegoEnCurso = true;
    aplicarEstadoBotones();
    bloquearSecciones(true);
  });

  socket.on('juegoFinalizado', () => {
    UI.juegoEnCurso = false;
    aplicarEstadoBotones();
    bloquearSecciones(false);
  });
}

// ------------------------------------------------------------
// Lanzamientos anteriores (aplicaciones) + detalle
// ------------------------------------------------------------

async function cargarLanzamientos() {
  try {
    const resp = await fetch(`${API_BASE}/api/aplicaciones`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const lista = await resp.json();
    renderLanzamientos(lista);
  } catch (e) {
    console.error('Error cargando lanzamientos:', e);
    renderLanzamientos([]);
  }
}

function renderLanzamientos(items) {
  const ul = DOM.listaLanzamientos;

  // Si no hay UL en DOM, cae a modal (SweetAlert)
  if (!ul) return mostrarLanzamientosEnModal(items);

  ul.innerHTML = '';

  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.style.opacity = '.7';
    li.textContent = 'Aún no hay lanzamientos guardados.';
    ul.appendChild(li);
    return;
  }

  items.forEach((it) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div style="font-weight:600;">
        #${it.aplicacion_id} — ${it.titulo || '(sin título)'}
      </div>
      <div style="font-size:.8rem; color:#888; margin-top:2px;">
        ${formatearFecha(it.fecha)}
      </div>
    `;

    li.addEventListener('click', () => verDetalleLanzamiento(it));
    ul.appendChild(li);
  });
}

function formatearFecha(fechaDB) {
  const fecha = new Date(fechaDB);

  const dia = fecha.getDate();
  const anio = fecha.getFullYear();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');

  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const mes = meses[fecha.getMonth()];

  return `${dia} de ${mes} ${anio}, ${horas}:${minutos} horas`;
}

async function mostrarLanzamientosEnModal(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return Swal.fire({ icon: 'info', title: 'Lanzamientos', text: 'Aún no hay registros.' });
  }

  const inputOptions = {};
  items.forEach((it) => {
    inputOptions[it.aplicacion_id] = `#${it.aplicacion_id} — ${it.titulo || '(sin título)'}`;
  });

  const { value } = await Swal.fire({
    title: 'Lanzamientos',
    input: 'select',
    inputOptions,
    inputPlaceholder: 'Selecciona un lanzamiento',
    showCancelButton: true,
    confirmButtonText: 'Ver detalle',
  });

  if (value) verDetalleLanzamiento(value);
}

async function verDetalleLanzamiento(aplicacion) {
  try {
    const resp = await fetch(`${API_BASE}/api/aplicaciones/${aplicacion.aplicacion_id}/detalle`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ranking = await resp.json();

    const listaHTML = (ranking || [])
      .map(
        (r, i) =>
          `<li>${r.nombre || '(sin nombre)'} [${r.boleta}] — ${r.puntaje}</li>`
      )
      .join('');

    await Swal.fire({
      title: `Lanzamiento Anterior`,
      html: `
        <div style="text-align:left">
          <p><strong>${aplicacion.titulo}  (${formatearFecha(aplicacion.fecha)})</strong></p>
          <ol style="margin-left:1rem">${listaHTML || '<li>Sin respuestas</li>'}</ol>
        </div>
      `,
      confirmButtonText: 'Cerrar',
      width: 600,
    });
  } catch (e) {
    console.error('Error detalle lanzamiento:', e);
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el detalle.' });
  }
}

function inicializarLanzamientos() {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof Swal !== 'undefined') {
      cargarLanzamientos();
    }
  });

  // Cuando backend termine de guardar, refrescamos la lista
  socket.on('lanzamientosActualizados', () => {
    cargarLanzamientos();
  });
}

// ------------------------------------------------------------
// Bootstrap (orden de arranque)
// ------------------------------------------------------------

(function init() {
  inicializarProyeccion();
  inicializarConexionEstudiantes();

  inicializarCuestionarios();
  inicializarPreguntas();
  inicializarRespuestas();

  inicializarJuego();
  inicializarLanzamientos();

  // estado inicial de botones
  aplicarEstadoBotones();
})();
