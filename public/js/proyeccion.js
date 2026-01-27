// public/js/proyeccion.js
// Vista de proyección (solo lectura):
// - Se abre desde Electron (ventana secundaria)
// - Se conecta a Socket.IO (servido por tu backend Express)
// - Muestra QR/URL de conexión
// - Muestra pregunta actual / pantallas de “ranking” / fin del juego
//
// Nota importante:
// - proyeccion.html se carga desde http://localhost:3000/proyeccion.html
// - Por eso aquí SÍ funciona: const socket = io();

'use strict';

// ------------------------------------------------------------
// Socket.IO
// ------------------------------------------------------------

// Socket.IO (proyeccion.html ya carga /socket.io/socket.io.js)
const socket = io();

// ------------------------------------------------------------
// Cache de DOM (evita repetir document.getElementById muchas veces)
// ------------------------------------------------------------

const DOM = {
  qrConexion: null,
  urlConexion: null,
  contenido: null,
};

// ------------------------------------------------------------
// Helpers DOM / UI
// ------------------------------------------------------------

/**
 * Inicializa el cache de referencias DOM.
 * Si algo no existe, lo reporta en consola (no rompe la app).
 */
function cacheDom() {
  DOM.qrConexion = document.getElementById('qrConexion');
  DOM.urlConexion = document.getElementById('urlConexion');
  DOM.contenido = document.getElementById('contenido');

  if (!DOM.qrConexion) console.warn('[proyeccion] Falta #qrConexion en el HTML');
  if (!DOM.urlConexion) console.warn('[proyeccion] Falta #urlConexion en el HTML');
  if (!DOM.contenido) console.warn('[proyeccion] Falta #contenido en el HTML');
}

/**
 * Render del QR y URL de conexión.
 * Esta info viene desde Electron (preload -> IPC -> main).
 */
async function renderDatosConexion() {
  if (!window.conexion?.obtenerDatos) {
    console.warn('[proyeccion] window.conexion.obtenerDatos() no está disponible (preload)');
    return;
  }

  try {
    const { qr, url } = await window.conexion.obtenerDatos();

    if (DOM.qrConexion) DOM.qrConexion.src = qr;
    if (DOM.urlConexion) DOM.urlConexion.textContent = url;
  } catch (err) {
    console.error('❌ Error obteniendo datos de conexión:', err);
  }
}

/**
 * Render de pantalla “pregunta”.
 * La proyección NO permite responder: solo muestra.
 */
function renderPregunta(pregunta) {
  if (!DOM.contenido) return;

  const enunciado = pregunta?.enunciado ?? '(Sin enunciado)';
  const respuestas = Array.isArray(pregunta?.respuestas) ? pregunta.respuestas : [];

  DOM.contenido.innerHTML = `
    <h1>${enunciado}</h1>
    <div id="respuestas"></div>
  `;

  const respuestasDiv = document.getElementById('respuestas');
  if (!respuestasDiv) return;

  // Colores usados para distinguir opciones visualmente (solo UI).
  const colores = ['#4caf50', '#f44336', '#7d2097', '#1273c3'];

  respuestas.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.textContent = r?.respuesta ?? '(Sin texto)';
    btn.style.backgroundColor = colores[i % colores.length];
    btn.disabled = true;
    respuestasDiv.appendChild(btn);
  });
}

/**
 * Render de pantalla “tiempo finalizado / mostrando ranking”.
 */
function renderMostrandoRanking() {
  if (!DOM.contenido) return;
  DOM.contenido.innerHTML = `<h1>⏱️ Tiempo finalizado</h1><h2>Mostrando ranking...</h2>`;
}

/**
 * Render de pantalla final del juego con ranking.
 */
function renderJuegoFinalizado(ranking) {
  if (!DOM.contenido) return;

  const lista = Array.isArray(ranking) ? ranking : [];
  const top = lista.slice(0, 10);

  DOM.contenido.innerHTML = `
    <h1>🏆 Juego finalizado</h1>
    <ol>
      ${top
        .map((r) => `<li>${r?.nombre ?? '(Sin nombre)'} — ${r?.puntaje ?? 0}</li>`)
        .join('')}
    </ol>
  `;
}

// ------------------------------------------------------------
// Ciclo de vida del documento
// ------------------------------------------------------------

window.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ Proyección abierta correctamente');

  cacheDom();
  await renderDatosConexion();
});

// ------------------------------------------------------------
// Eventos del juego (Socket.IO)
// ------------------------------------------------------------

/**
 * El backend informa que se inició el juego.
 * (En proyección por ahora solo log; la pantalla cambia cuando llega “nuevaPregunta”.)
 */
socket.on('juegoIniciado', () => {
  console.log('🚀 Juego iniciado');
});

/**
 * Backend envía una nueva pregunta.
 */
socket.on('nuevaPregunta', (pregunta) => {
  console.log('📩 Nueva pregunta recibida:', pregunta);
  renderPregunta(pregunta);
});

/**
 * Backend indica “mostrar ranking” (normalmente al finalizar el tiempo de una pregunta).
 */
socket.on('mostrar-ranking', () => {
  console.log('🏁 Mostrar ranking');
  renderMostrandoRanking();
});

/**
 * Backend indica fin del juego y envía ranking final.
 */
socket.on('juegoFinalizado', ({ ranking }) => {
  console.log('🏆 Juego finalizado. Ranking:', ranking);
  renderJuegoFinalizado(ranking);
});
