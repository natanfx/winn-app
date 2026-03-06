/**
 * ============================================================
 *  WINN APP – BACKEND (Express + Socket.IO)
 *  Archivo: src/backend/server.js
 *
 *  Responsabilidades:
 *   - Servir archivos estáticos (frontend)
 *   - Proveer API REST (CRUD + control de juego)
 *   - Gestionar sockets (registro, respuestas, estados, ranking)
 *   - Persistir intentos (sesiones) en SQLite al finalizar
 * ============================================================
 */

/* ============================================================
 *  IMPORTS
 * ============================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const bodyParser = require('body-parser');

/**
 * Capa de base de datos (SQLite)
 * Nota: hay funciones callback y funciones async. Se respetan ambas.
 */
const {
  // CRUD cuestionarios
  getCuestionarios,
  addCuestionario,
  updateCuestionario,
  deleteCuestionario,

  // CRUD preguntas
  getPreguntas,
  addPregunta,
  updatePregunta,
  deletePregunta,

  // CRUD respuestas
  getRespuestas,
  saveRespuestas,

  // Juego (preguntas con respuestas)
  getPreguntasConRespuestas,

  // Persistencia de intentos (async)
  dbCrearAplicacionAsync,
  dbUpsertEstudiantesMasivoAsync,
  dbInsertRespuestasMasivoAsync,

  // Lanzamientos / historial
  getAplicacionesConTitulo,
  getDetalleAplicacion
} = require('../db/database');

/* ============================================================
 *  INSTANCIAS PRINCIPALES
 * ============================================================
 */

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ============================================================
 *  CONFIGURACIÓN GENERAL
 * ============================================================
 */

/**
 * Middleware para leer JSON en endpoints REST.
 */
app.use(bodyParser.json());

/**
 * Ruta pública para servir archivos (frontend).
 * __dirname = src/backend
 * subimos 2 niveles para llegar a /public
 */
const publicPath = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicPath));
console.log('[static] sirviendo:', publicPath);

/**
 * Puerto del backend
 */
const PORT = 3000;

/**
 * Manejo claro si el puerto ya está en uso.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[backend] El puerto 3000 está en uso. Libéralo con: npx kill-port 3000');
    process.exit(1);
  }
  throw err;
});

/* ============================================================
 *  ESTADO GLOBAL (EN MEMORIA)
 * ============================================================
 * Nota:
 * Todo esto se reinicia cuando cierras y abres la app.
 */

/**
 * Estudiantes conectados
 * { socketId, nombre, boleta, puntaje }
 */
let estudiantesConectados = [];

/**
 * Control de conexiones entrantes
 */
let permitirConexiones = false; // 🔒 inicialmente deshabilitadas

/**
 * Bloqueo para evitar condiciones de carrera al avanzar pregunta
 */
let avanceEnCurso = false;

/**
 * Estado del juego (lanzamiento)
 */
let juegoEnCurso = false;
let preguntasEnJuego = [];
let indicePreguntaActual = 0;
let cuestionarioSeleccionado = null;

/**
 * Respuestas de la sesión actual (en memoria)
 * { boleta, nombre, pregunta_id, respuesta_id, tiempo_s }
 */
let respuestasSesion = [];

/**
 * Evitar emitir ranking dos veces por la misma pregunta
 */
let rankingEmitido = false;

/**
 * Intento en memoria (bitácora), solo mientras dura el lanzamiento.
 * Nota: se mantiene tu estructura original, por si luego la usas.
 */
let intentoActual = null;
// intentoActual = {
//   cuestionarioId: number,
//   tsInicio: number,
//   respuestasPorEstudiante: Map<boleta, Map<preguntaId, { respuestaId, correcta, ms }>>,
//   puntajes: Map<boleta, number>,
//   alumnos: Map<socketId, { boleta, nombre }>
// };

/* ============================================================
 *  HELPERS
 * ============================================================
 */

/**
 * Obtener IP local (IPv4) para mostrar URL/QR en pantallas.
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Ranking actual (descendente) desde la lista de estudiantes conectados.
 * Nota: se conserva tu lógica de puntaje tal cual.
 */
function rankingActual() {
  return estudiantesConectados
    .map(e => ({ nombre: e.nombre, boleta: e.boleta, puntaje: e.puntaje || 0 }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Persistir intento (sesión) actual en SQLite.
 * Usa:
 *  1) crea aplicación
 *  2) upsert estudiantes
 *  3) inserta respuestas
 */
async function flushIntentoActual() {
  if (!Array.isArray(respuestasSesion) || respuestasSesion.length === 0) return;
  if (!cuestionarioSeleccionado?.id) return;

  // 1) Crear aplicación con el cuestionario en curso
  const appId = await dbCrearAplicacionAsync(cuestionarioSeleccionado.id);

  // 2) Upsert estudiantes por boleta
  const mapIds = await dbUpsertEstudiantesMasivoAsync(
    respuestasSesion.map(r => ({ boleta: r.boleta, nickname: r.nombre }))
  );

  // 3) Insertar respuestas (tiempo_s -> tu schema usa segundos enteros)
  await dbInsertRespuestasMasivoAsync(
    appId,
    respuestasSesion.map(r => ({
      estudiante_id: mapIds[r.boleta],
      pregunta_id: r.pregunta_id,
      respuesta_id: r.respuesta_id,
      tiempo_respuesta: r.tiempo_respuesta,
      puntaje: r.puntaje
    }))
  );

  console.log(`✅ Intento guardado. aplicacion_id=${appId}, respuestas=${respuestasSesion.length}`);
}

/* ============================================================
 *  API REST – SISTEMA / RED
 * ============================================================
 */

/**
 * Devuelve IP local (si el frontend la necesita)
 */
app.get('/api/ip', (req, res) => {
  const ip = getLocalIP();
  res.json({ ip });
});

/* ============================================================
 *  SOCKET.IO – EVENTOS EN TIEMPO REAL
 * ============================================================
 */

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  /**
   * Registro de estudiante (socket)
   */
  socket.on('registro-estudiante', (data) => {
    if (!permitirConexiones) {
      console.log(`🚫 Registro rechazado (conexiones deshabilitadas): ${data.nombre} (${data.boleta})`);
      socket.emit('rechazado', 'El docente no está aceptando conexiones en este momento.');
      return;
    }

    console.log(`✅ Estudiante registrado: ${data.nombre} (${data.boleta})`);
    estudiantesConectados.push({
      socketId: socket.id,
      nombre: data.nombre,
      boleta: data.boleta,
      puntaje: 0
    });

    io.emit('estudiantes-actualizados', estudiantesConectados);

    // Guardar identidad en el intento actual (si existe)
    if (intentoActual) {
      intentoActual.alumnos.set(socket.id, { boleta: data.boleta, nombre: data.nombre });

      if (!intentoActual.respuestasPorEstudiante.has(data.boleta)) {
        intentoActual.respuestasPorEstudiante.set(data.boleta, new Map());
      }
      if (!intentoActual.puntajes.has(data.boleta)) {
        intentoActual.puntajes.set(data.boleta, 0);
      }
    }
  });

  /**
   * Desconexión
   */
  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
    estudiantesConectados = estudiantesConectados.filter(e => e.socketId !== socket.id);
    io.emit('estudiantes-actualizados', estudiantesConectados);
  });

  /**
   * El estudiante solicita el estado actual de conexiones
   */
  socket.on('solicitar-estado-conexiones', () => {
    socket.emit('estado-conexiones', permitirConexiones);
  });

  /**
   * Docente habilita conexiones (socket)
   */
  socket.on('habilitar-conexiones', () => {
    permitirConexiones = true;
    io.emit('estado-conexiones', true);
    console.log('🔓 Conexiones habilitadas por el docente');
  });

  /**
   * Docente deshabilita conexiones (socket)
   */
  socket.on('deshabilitar-conexiones', () => {
    permitirConexiones = false;
    io.emit('estado-conexiones', false);
    console.log('🔒 Conexiones deshabilitadas por el docente');
  });

  /**
   * Fin de pregunta (temporizador) -> ranking.
   * Protegemos para no emitir dos veces.
   */
  socket.on('fin-pregunta', () => {
    if (rankingEmitido) return;
    rankingEmitido = true;
    console.log('⏱️ Tiempo finalizado: mostrando ranking');
    io.emit('mostrar-ranking');
  });

  /**
   * Respuesta del estudiante (socket)
   */
  socket.on('respuesta-estudiante', ({ pregunta_id, respuesta_id, tiempoRestanteMs, tiempoLimiteMs, tiempoTranscurridoMs }) => {
    const estudiante = estudiantesConectados.find(e => e.socketId === socket.id);
    const pregunta = preguntasEnJuego.find(p => p.id === pregunta_id);
    if (!estudiante || !pregunta) return;

    //           tiempoRestanteMs, // milisegundos vivos anes de que temine la pregunta
    //           tiempoLimiteMs, //milisegundos configurados por el docente (pregunta.tiempo_limite * 1000)
    //           tiempoTranscurridoMs //milisegundos muertos, los que el estudiante tardoo en contestar

    // Determinar si es correcta según el banco en RAM
    const respuesta = pregunta.respuestas.find(r => r.id === respuesta_id);
    const esCorrecta = respuesta?.es_correcta === 1;

    // Puntaje: suma de milisegundos restantes (tu regla)
    const puntaje = esCorrecta ? Math.floor(tiempoRestanteMs) : 0;

    // Ranking en vivo
    estudiante.puntaje += puntaje;

    respuestasSesion.push({
      boleta: estudiante.boleta,
      nombre: estudiante.nombre,
      pregunta_id,
      respuesta_id,
      tiempo_respuesta: Math.max(0, Math.floor(tiempoTranscurridoMs || 0)), // ms usados
      puntaje
    });

    // Bitácora en memoria (evitar duplicados por boleta+pregunta)
    if (intentoActual) {
      const alumno = intentoActual.alumnos.get(socket.id);
      if (alumno) {
        const { boleta } = alumno;
        const mapaResp = intentoActual.respuestasPorEstudiante.get(boleta) || new Map();
        if (mapaResp.has(pregunta_id)) return; // ya respondió esta pregunta

        mapaResp.set(pregunta_id, { respuestaId: respuesta_id, correcta: !!esCorrecta, ms: puntaje });
        intentoActual.respuestasPorEstudiante.set(boleta, mapaResp);

        const previo = intentoActual.puntajes.get(boleta) || 0;
        intentoActual.puntajes.set(boleta, previo + puntaje);
      }
    }

    console.log(
      `🎯 ${estudiante.nombre} respondió ${esCorrecta ? '✔️ bien' : '❌ mal'} ` +
      `y ganó ${puntaje} ms (Total: ${estudiante.puntaje})`
    );
  });
});

/* ============================================================
 *  API REST – CRUD: CUESTIONARIOS
 * ============================================================
 */

/**
 * Obtener cuestionarios
 */
app.get('/api/cuestionarios', (req, res) => {
  getCuestionarios((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * Crear cuestionario
 */
app.post('/api/cuestionarios', (req, res) => {
  const { titulo, tiempo_limite } = req.body;
  addCuestionario(titulo, tiempo_limite, (err, id) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id });
  });
});

/**
 * Editar cuestionario
 */
app.put('/api/cuestionarios/:id', (req, res) => {
  const id = req.params.id;
  const { titulo, tiempo_limite } = req.body;

  updateCuestionario(id, titulo, tiempo_limite, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/**
 * Eliminar cuestionario
 */
app.delete('/api/cuestionarios/:id', (req, res) => {
  const id = req.params.id;

  deleteCuestionario(id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* ============================================================
 *  API REST – CRUD: PREGUNTAS
 * ============================================================
 */

/**
 * Obtener preguntas de un cuestionario
 */
app.get('/api/preguntas/:cuestionario_id', (req, res) => {
  const id = req.params.cuestionario_id;
  getPreguntas(id, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * Crear nueva pregunta
 */
app.post('/api/preguntas', (req, res) => {
  const { texto, cuestionario_id } = req.body;

  addPregunta(texto, cuestionario_id, (err, id) => {
    if (err) {
      console.error('❌ Error al insertar pregunta:', err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log('✅ Pregunta insertada con ID:', id);
    res.json({ id });
  });
});

/**
 * Editar pregunta
 */
app.put('/api/preguntas/:id', (req, res) => {
  const id = req.params.id;
  const { texto } = req.body;

  updatePregunta(id, texto, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/**
 * Eliminar pregunta
 */
app.delete('/api/preguntas/:id', (req, res) => {
  const id = req.params.id;

  deletePregunta(id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* ============================================================
 *  API REST – CRUD: RESPUESTAS
 * ============================================================
 */

/**
 * Obtener respuestas de una pregunta
 */
app.get('/api/respuestas/:pregunta_id', (req, res) => {
  const pregunta_id = req.params.pregunta_id;

  getRespuestas(pregunta_id, (err, rows) => {
    if (err) {
      console.error('❌ Error al obtener respuestas:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

/**
 * Guardar (sobrescribir) respuestas de una pregunta
 */
app.post('/api/respuestas/:pregunta_id', (req, res) => {
  const pregunta_id = req.params.pregunta_id;
  const respuestas = req.body; // array de objetos { texto, correcta }

  if (!Array.isArray(respuestas) || respuestas.length !== 4) {
    return res.status(400).json({ error: 'Se requieren exactamente 4 respuestas' });
  }

  saveRespuestas(pregunta_id, respuestas, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

/* ============================================================
 *  API REST – JUEGO (LANZAMIENTO)
 * ============================================================
 */

/**
 * Obtener la pregunta actual del juego
 */
app.get('/api/pregunta-actual', (req, res) => {
  if (!juegoEnCurso || !preguntasEnJuego.length) {
    return res.status(400).json({ error: 'No hay juego en curso o preguntas cargadas' });
  }

  const preguntaActual = preguntasEnJuego[indicePreguntaActual];

  console.log('server15 cuestionarioSeleccionado.tiempo_limite', cuestionarioSeleccionado?.tiempo_limite);

  res.json({
    pregunta: {
      ...preguntaActual,
      tiempo_limite: cuestionarioSeleccionado?.tiempo_limite || 15
    }
  });
});

/**
 * Avanzar a la siguiente pregunta
 */
app.post('/api/siguiente-pregunta', async (req, res) => {
  if (avanceEnCurso) return res.status(409).json({ error: 'Avance en curso' });
  avanceEnCurso = true;

  try {
    indicePreguntaActual++;

    // fin del juego
    if (indicePreguntaActual >= preguntasEnJuego.length) {
      const ranking = rankingActual();

      io.emit('juegoFinalizado', { ranking });

      try {
        await flushIntentoActual(); // volcamos a SQLite
      } catch (e) {
        console.error('❌ Error guardando intento:', e);
      }

      juegoEnCurso = false;
      io.emit('estadoJuego', { juegoEnCurso: false });

      // reset de estado del lanzamiento
      preguntasEnJuego = [];
      indicePreguntaActual = 0;
      respuestasSesion = [];
      rankingEmitido = false;

      io.emit('lanzamientosActualizados'); // para que el docente refresque lista

      return res.json({ fin: true });
    }

    // siguiente pregunta
    const siguientePregunta = {
      ...preguntasEnJuego[indicePreguntaActual],
      tiempo_limite: (cuestionarioSeleccionado && cuestionarioSeleccionado.tiempo_limite) || 15
    };

    io.emit('nuevaPregunta', siguientePregunta);
    rankingEmitido = false;

    return res.json({ pregunta: siguientePregunta });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al avanzar de pregunta' });
  } finally {
    avanceEnCurso = false;
  }
});

/**
 * Ranking actual (para proyección / panel)
 */
app.get('/api/ranking', (req, res) => {
  const ranking = estudiantesConectados
    .sort((a, b) => (b.puntaje || 0) - (a.puntaje || 0))
    .map(e => ({
      nombre: e.nombre,
      puntaje: e.puntaje
    }));

  res.json(ranking);
});

/**
 * Lista de aplicaciones (lanzamientos) con título del cuestionario
 */
app.get('/api/aplicaciones', (req, res) => {
  getAplicacionesConTitulo((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * Detalle + ranking recalculado de una aplicación
 */
app.get('/api/aplicaciones/:id/detalle', (req, res) => {
  const aplicacion_id = parseInt(req.params.id, 10);
  if (Number.isNaN(aplicacion_id)) return res.status(400).json({ error: 'id inválido' });

  getDetalleAplicacion(aplicacion_id, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows); // [{ nombre, boleta, puntaje }, ...]
  });
});

/**
 * Estado del juego para el panel del docente
 */
app.get('/api/estado', (req, res) => {
  res.json({ juegoEnCurso });
});

/**
 * Iniciar juego con cuestionario seleccionado
 */
app.post('/api/iniciar-juego', (req, res) => {
  const { id_cuestionario } = req.body;

  if (!id_cuestionario) {
    return res.status(400).json({ error: 'Falta el ID del cuestionario' });
  }

  // Crear bitácora en memoria (se mantiene tu implementación)
  intentoActual = {
    cuestionarioId: id_cuestionario,
    tsInicio: Date.now(),
    respuestasPorEstudiante: new Map(),
    puntajes: new Map(),
    alumnos: new Map()
  };

  getCuestionarios((err, cuestionarios) => {
    console.log('err:', err);
    console.log('cuestionarios:', cuestionarios);

    if (err) return res.status(500).json({ error: 'Error al cargar cuestionarios' });

    const encontrado = cuestionarios.find(c => c.id == id_cuestionario);
    if (!encontrado) return res.status(404).json({ error: 'Cuestionario no encontrado' });

    console.log('encontrado:', encontrado);

    // Guardar cuestionario completo (para tiempo_limite)
    cuestionarioSeleccionado = encontrado;

    getPreguntasConRespuestas(id_cuestionario, (err2, preguntas) => {
      if (err2 || !preguntas.length) {
        return res.status(500).json({ error: 'Error al obtener preguntas' });
      }

      preguntasEnJuego = preguntas;
      indicePreguntaActual = 0;
      juegoEnCurso = true;

      io.emit('estadoJuego', { juegoEnCurso: true });

      respuestasSesion = [];
      rankingEmitido = false;

      console.log('🧠 Juego cargado con preguntas:', preguntas.length);
      console.log('⏱️ Tiempo por pregunta: tiempo_limite:', cuestionarioSeleccionado.tiempo_limite);

      io.emit('juegoIniciado', { totalPreguntas: preguntas.length });
      return res.json({ ok: true });
    });
  });
});

/* ============================================================
 *  ARRANQUE DEL SERVIDOR
 * ============================================================
 */

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`✅ Servidor Express activo: http://${localIP}:${PORT}`);
});
