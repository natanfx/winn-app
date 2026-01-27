// test-db.js
// Script de diagnóstico rápido para validar que:
// 1) se puede abrir la BD
// 2) existen tablas (y por ende el schema se aplicó)
// 3) cerramos la conexión de forma limpia

'use strict';

// ------------------------------------------------------------
// Imports
// ------------------------------------------------------------

// database.js exporta: { db, ...funciones }
// Aquí solo necesitamos el handle de sqlite3.
const { db } = require('./src/db/database');

// ------------------------------------------------------------
// Lógica principal
// ------------------------------------------------------------

/**
 * Lista las tablas existentes en la base de datos.
 * Útil para confirmar que el schema.sql se ejecutó correctamente.
 */
function listarTablas() {
  db.serialize(() => {
    const sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";

    db.all(sql, (err, rows) => {
      if (err) {
        console.error('❌ Error al consultar las tablas:', err.message);
        return cerrarConexion(1);
      }

      console.log('✅ Tablas encontradas en la base de datos:');
      console.table(rows);

      cerrarConexion(0);
    });
  });
}

/**
 * Cierra la conexión a SQLite.
 * @param {number} exitCode 0 = OK, 1 = error
 */
function cerrarConexion(exitCode) {
  db.close((err) => {
    if (err) {
      console.error('❌ Error al cerrar la conexión SQLite:', err.message);
      process.exit(1);
    }
    process.exit(exitCode);
  });
}

// ------------------------------------------------------------
// Ejecutar
// ------------------------------------------------------------

listarTablas();
