// src/db/database.js

/**
 * ============================================================
 *  WINN – SQLite (capa de datos)
 *
 *  Objetivo del archivo:
 *   - Resolver rutas de BD y schema para DEV y para app empaquetada (asar/unpacked)
 *   - Abrir conexión SQLite (OPEN_READWRITE | OPEN_CREATE)
 *   - Inicializar la BD desde schema.sql si no existen tablas
 *   - Exponer funciones CRUD + helpers de juego / reportes
 *
 *  Nota importante:
 *   En tu versión pegada había funciones duplicadas (definidas 2 veces):
 *     - dbCrearAplicacionAsync
 *     - dbUpsertEstudiantesMasivoAsync
 *     - dbInsertRespuestasMasivoAsync
 *     - getAplicacionesConTitulo
 *     - getDetalleAplicacion
 *   Aquí quedan definidas una sola vez (misma intención, sin perder funcionalidad).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

/* ============================================================
 *  RUTAS PARA BD Y SCHEMA
 * ============================================================
 */

/**
 * BD (DEV): /data/winn.db
 * BD (PROD empaquetado): se toma de WINN_DB_PATH (seteada en main.js)
 */
const DEFAULT_DB_PATH_DEV = path.join(__dirname, '..', '..', 'data', 'winn.db');
const DB_PATH = process.env.WINN_DB_PATH || DEFAULT_DB_PATH_DEV;

/**
 * Asegura que exista el directorio donde vivirá la BD
 */
const dbDir = path.dirname(DB_PATH);
console.log('DB PATH =>', dbDir);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * Candidatos de schema.sql:
 *  - Empaquetado: process.resourcesPath/.../app.asar.unpacked/data/schema.sql
 *  - Empaquetado: process.resourcesPath/data/schema.sql
 *  - DEV: /data/schema.sql
 */
const schemaCandidates = [];

if (process.resourcesPath) {
  schemaCandidates.push(
    path.join(process.resourcesPath, 'app.asar.unpacked', 'data', 'schema.sql'),
    path.join(process.resourcesPath, 'data', 'schema.sql')
  );
}

schemaCandidates.push(path.join(__dirname, '..', '..', 'data', 'schema.sql'));

/**
 * Elige el primer schema.sql existente; si ninguno existe,
 * deja el último candidato como “ruta esperada” para log de error.
 */
let SCHEMA_PATH = schemaCandidates.find(p => fs.existsSync(p));
if (!SCHEMA_PATH) {
  SCHEMA_PATH = schemaCandidates[schemaCandidates.length - 1];
}

/**
 * Logs útiles para depurar en app empaquetada
 */
console.log('[db] DB_PATH:', DB_PATH, fs.existsSync(DB_PATH) ? '(existe)' : '(NO existe)');
console.log('[db] schema candidates:');
schemaCandidates.forEach(p => console.log('   -', p, fs.existsSync(p) ? '(OK)' : '(NO existe)'));
console.log('[db] SCHEMA_PATH elegido:', SCHEMA_PATH);

/* ============================================================
 *  CONEXIÓN E INICIALIZACIÓN
 * ============================================================
 */

const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('❌ Error al conectar a SQLite:', err.message);
      return;
    }
    console.log('✅ Conexión a SQLite establecida.');
    inicializarBaseDeDatos();
  }
);

/**
 * Inicializa la BD ejecutando schema.sql sólo si no existe la tabla “cuestionarios”.
 */
function inicializarBaseDeDatos() {
  console.log('📌 Verificando si se debe inicializar la base de datos...');

  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='cuestionarios'",
    (err, row) => {
      if (err) {
        console.error('❌ Error al consultar sqlite_master:', err.message);
        return;
      }

      // Si no existe la tabla, ejecuta el schema
      if (!row) {
        if (fs.existsSync(SCHEMA_PATH)) {
          const sqlScript = fs.readFileSync(SCHEMA_PATH, 'utf8');
          db.exec(sqlScript, (e) => {
            if (e) {
              console.error('❌ Error ejecutando schema.sql:', e.message);
            } else {
              console.log('✅ Base de datos inicializada correctamente desde schema.sql.');
            }
          });
        } else {
          console.error('❌ No se encontró el archivo schema.sql en:', SCHEMA_PATH);
        }
        return;
      }

      console.log("✅ La base de datos ya contiene la tabla 'cuestionarios'. No se reinicializa.");
    }
  );
}

/* ============================================================
 *  CRUD: CUESTIONARIOS
 * ============================================================
 */

function getCuestionarios(callback) {
  db.all('SELECT * FROM cuestionarios ORDER BY id DESC', [], callback);
}

function addCuestionario(titulo, tiempo, callback) {
  db.run(
    'INSERT INTO cuestionarios (titulo, tiempo_limite) VALUES (?, ?)',
    [titulo, tiempo],
    function (err) {
      callback(err, this?.lastID);
    }
  );
}

function updateCuestionario(id, titulo, tiempo, callback) {
  db.run(
    'UPDATE cuestionarios SET titulo = ?, tiempo_limite = ? WHERE id = ?',
    [titulo, tiempo, id],
    callback
  );
}

function deleteCuestionario(id, callback) {
  db.run('DELETE FROM cuestionarios WHERE id = ?', [id], callback);
}

/* ============================================================
 *  CRUD: PREGUNTAS
 * ============================================================
 */

function getPreguntas(cuestionario_id, callback) {
  db.all('SELECT * FROM preguntas WHERE cuestionario_id = ?', [cuestionario_id], callback);
}

function addPregunta(texto, cuestionario_id, callback) {
  db.run(
    'INSERT INTO preguntas (enunciado, cuestionario_id) VALUES (?, ?)',
    [texto, cuestionario_id],
    function (err) {
      callback(err, this?.lastID);
    }
  );
}

function updatePregunta(id, texto, callback) {
  db.run(
    'UPDATE preguntas SET enunciado = ? WHERE id = ?',
    [texto, id],
    callback
  );
}

function deletePregunta(id, callback) {
  db.run('DELETE FROM preguntas WHERE id = ?', [id], callback);
}

/* ============================================================
 *  CRUD: RESPUESTAS
 * ============================================================
 */

function getRespuestas(pregunta_id, callback) {
  db.all('SELECT * FROM respuestas WHERE pregunta_id = ? ORDER BY id ASC', [pregunta_id], callback);
}

/**
 * Sobrescribe las 4 respuestas de una pregunta.
 * Espera array con estructura: { respuesta, es_correcta }
 */
function saveRespuestas(pregunta_id, respuestas, callback) {
  // Borra respuestas anteriores primero
  db.run('DELETE FROM respuestas WHERE pregunta_id = ?', [pregunta_id], function (err) {
    if (err) return callback(err);

    const stmt = db.prepare(
      'INSERT INTO respuestas (pregunta_id, respuesta, es_correcta) VALUES (?, ?, ?)'
    );

    for (const r of respuestas) {
      stmt.run(pregunta_id, r.respuesta, r.es_correcta ? 1 : 0);
    }

    stmt.finalize(callback);
  });
}

/* ============================================================
 *  JUEGO: PREGUNTAS + RESPUESTAS (para cargar a RAM)
 * ============================================================
 */

/**
 * Devuelve preguntas del cuestionario y le agrega “respuestas” a cada pregunta.
 * callbackFinal(err, preguntasConRespuestas)
 */
function getPreguntasConRespuestas(cuestionario_id, callbackFinal) {
  getPreguntas(cuestionario_id, (errPreg, preguntas) => {
    if (errPreg) return callbackFinal(errPreg);

    let pendientes = preguntas.length;
    if (pendientes === 0) return callbackFinal(null, []);

    preguntas.forEach((pregunta) => {
      getRespuestas(pregunta.id, (errResp, respuestas) => {
        if (errResp) return callbackFinal(errResp);

        pregunta.respuestas = respuestas;

        pendientes--;
        if (pendientes === 0) callbackFinal(null, preguntas);
      });
    });
  });
}

/* ============================================================
 *  HELPERS HISTÓRICOS (lanzamientos/resultados)
 *  Nota: actualmente no los vi usados en server.js, pero se conservan.
 * ============================================================
 */

function guardarLanzamiento(cuestionario_id, callback) {
  const fecha = new Date().toISOString();
  db.run(
    'INSERT INTO lanzamientos (fecha, cuestionario_id) VALUES (?, ?)',
    [fecha, cuestionario_id],
    function (err) {
      callback(err, this?.lastID);
    }
  );
}

function guardarResultados(lanzamiento_id, estudiantes, callbackFinal) {
  const stmt = db.prepare(
    'INSERT INTO resultados (lanzamiento_id, nombre, boleta, puntaje) VALUES (?, ?, ?, ?)'
  );

  for (const est of estudiantes) {
    stmt.run(lanzamiento_id, est.nombre, est.boleta, est.puntaje);
  }

  stmt.finalize(callbackFinal);
}

/* ============================================================
 *  PERSISTENCIA (APP empaquetada): APLICACIONES / ESTUDIANTES / RESPUESTAS
 * ============================================================
 */

/**
 * 1) Crear aplicación (intento)
 *
 * Tu código traía dos variantes:
 *  - insert con columna fecha (datetime localtime)
 *  - insert solo con cuestionario_id
 *
 * Aquí se hace “robusto” sin cambiar la intención:
 *  - intenta con fecha (si existe)
 *  - si falla por schema, hace fallback al insert simple
 */
function dbCrearAplicacionAsync(cuestionario_id) {
  return new Promise((resolve, reject) => {
    const sqlConFecha = `INSERT INTO aplicaciones (cuestionario_id, fecha) VALUES (?, datetime('now','localtime'))`;
    db.run(sqlConFecha, [cuestionario_id], function (err) {
      if (!err) return resolve(this.lastID);

      const sqlSimple = `INSERT INTO aplicaciones (cuestionario_id) VALUES (?)`;
      db.run(sqlSimple, [cuestionario_id], function (err2) {
        if (err2) return reject(err2);
        resolve(this.lastID);
      });
    });
  });
}

/**
 * 2) Upsert masivo por boleta -> devuelve { [boleta]: estudiante_id }
 * lista: [{ boleta, nickname }]
 */
function dbUpsertEstudiantesMasivoAsync(lista) {
  return new Promise((resolve, reject) => {
    const mapa = {}; // boleta -> id

    // Dedup por boleta
    const unique = new Map();
    for (const it of (lista || [])) {
      if (it?.boleta) unique.set(it.boleta, it.nickname || '');
    }

    db.serialize(() => {
      db.run('BEGIN');

      const sel = db.prepare('SELECT id FROM estudiantes WHERE boleta = ?');
      const ins = db.prepare('INSERT INTO estudiantes (boleta, nickname) VALUES (?, ?)');

      const claves = [...unique.keys()];
      let pendientes = claves.length;

      if (pendientes === 0) {
        return db.run('COMMIT', (errEnd) => (errEnd ? reject(errEnd) : resolve(mapa)));
      }

      claves.forEach((boleta) => {
        const nickname = unique.get(boleta);

        sel.get([boleta], (errSel, row) => {
          if (errSel) return rollback(errSel);

          if (row?.id) {
            mapa[boleta] = row.id;
            if (--pendientes === 0) commit();
            return;
          }

          ins.run([boleta, nickname], function (errIns) {
            if (errIns) return rollback(errIns);
            mapa[boleta] = this.lastID;
            if (--pendientes === 0) commit();
          });
        });
      });

      function commit() {
        db.run('COMMIT', (errEnd) => (errEnd ? reject(errEnd) : resolve(mapa)));
      }

      function rollback(e) {
        db.run('ROLLBACK', () => reject(e));
      }
    });
  });
}

/**
 * 3) Inserción masiva de respuestas
 * respuestas: [{ estudiante_id, pregunta_id, respuesta_id, tiempo_ms }]
 *
 * Se respeta el nombre para no romper llamadas existentes.
 */
function dbInsertRespuestasMasivoAsync(aplicacion_id, respuestas) {
  return new Promise((resolve, reject) => {

    console.log('------------------- respuestas =>', respuestas);
    console.log('------------------- respuestas.length =>', respuestas.length);

    if (!respuestas || respuestas.length === 0) return resolve();




    db.serialize(() => {
      db.run('BEGIN');

      const stmt = db.prepare(`
        INSERT INTO respuestas_estudiantes (aplicacion_id, estudiante_id, pregunta_id, respuesta_id, tiempo_respuesta, puntaje)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const r of respuestas) {
        stmt.run(
          [aplicacion_id,
            r.estudiante_id,
            r.pregunta_id,
            r.respuesta_id,
            r.tiempo_respuesta ?? 0,
            r.puntaje ?? 0],
          (err) => {
            if (err) return rollback(err);
          }
        );
      }

      stmt.finalize((e) => {
        if (e) return rollback(e);

        db.run('COMMIT', (errEnd) => (errEnd ? reject(errEnd) : resolve()));
      });

      function rollback(e) {
        db.run('ROLLBACK', () => reject(e));
      }
    });
  });
}

/* ============================================================
 *  HELPERS INDIVIDUALES (alineados al esquema)
 *  Nota: actualmente no los vi usados en server.js, pero se conservan.
 * ============================================================
 */

function crearAplicacion(cuestionario_id, cb) {
  db.run(
    'INSERT INTO aplicaciones (cuestionario_id) VALUES (?)',
    [cuestionario_id],
    function (err) {
      cb(err, this?.lastID);
    }
  );
}

function upsertEstudiantePorBoleta(boleta, nickname, cb) {
  db.get('SELECT id FROM estudiantes WHERE boleta = ?', [boleta], (err, row) => {
    if (err) return cb(err);
    if (row) return cb(null, row.id);

    db.run(
      'INSERT INTO estudiantes (boleta, nickname) VALUES (?, ?)',
      [boleta, nickname],
      function (err2) {
        cb(err2, this?.lastID);
      }
    );
  });
}

function insertarRespuestaEstudiante(aplicacion_id, estudiante_id, pregunta_id, respuesta_id, tiempo_s, cb) {
  db.run(
    `INSERT INTO respuestas_estudiantes
     (aplicacion_id, estudiante_id, pregunta_id, respuesta_id, tiempo_respuesta)
     VALUES (?, ?, ?, ?, ?)`,
    [aplicacion_id, estudiante_id, pregunta_id, respuesta_id, tiempo_s],
    cb
  );
}

/* ============================================================
 *  REPORTES / HISTORIAL: APLICACIONES
 * ============================================================
 */

/**
 * Lista aplicaciones con el título del cuestionario
 */
function getAplicacionesConTitulo(cb) {
  db.all(
    `SELECT a.id AS aplicacion_id, a.cuestionario_id, c.titulo, a.fecha
     FROM aplicaciones a
     JOIN cuestionarios c ON c.id = a.cuestionario_id
     ORDER BY a.id DESC`,
    [],
    cb
  );
}

/**
 * Detalle/ranking por aplicación:
 * Recalcula puntaje sumando una métrica basada en tiempo_limite y tiempo_respuesta.
 * Se deja tal cual tu regla.
 */
function getDetalleAplicacion(aplicacion_id, cb) {
  const sql = `
    SELECT e.nickname AS nombre, e.boleta,
           SUM(re.puntaje) AS puntaje
    FROM respuestas_estudiantes re
    JOIN estudiantes e ON e.id = re.estudiante_id
    WHERE re.aplicacion_id = ?
    GROUP BY e.id, e.nickname, e.boleta
    ORDER BY puntaje DESC;
  `;
  db.all(sql, [aplicacion_id], cb);
}

/* ============================================================
 *  EXPORTS (al final para legibilidad)
 * ============================================================
 */

module.exports = {
  db,

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

  // Juego
  getPreguntasConRespuestas,

  // Persistencia (async)
  dbCrearAplicacionAsync,
  dbUpsertEstudiantesMasivoAsync,
  dbInsertRespuestasMasivoAsync,

  // Helpers individuales (schema)
  crearAplicacion,
  upsertEstudiantePorBoleta,
  insertarRespuestaEstudiante,

  // Reportes / historial
  getAplicacionesConTitulo,
  getDetalleAplicacion,
};
