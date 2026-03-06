// public/js/proyeccion.js
// ============================================================
// WINN - Proyección (solo lectura)
// ------------------------------------------------------------
// Responsabilidad:
// - Mostrar QR + URL para que los estudiantes se conecten
// - Escuchar eventos Socket.IO del backend:
//   - juegoIniciado: el juego arrancó
//   - nuevaPregunta: llega una pregunta para proyectar
//   - mostrar-ranking: mostrar ranking intermedio
//   - juegoFinalizado: mostrar resultados finales
//
// Nota:
// - proyeccion.html carga Socket.IO con: /socket.io/socket.io.js
// - proyeccion.html NO tiene #contenido; todo vive en #pantalla-espera
//   por eso aquí renderizamos siempre dentro de #pantalla-espera.
// ============================================================

'use strict';

console.log('[proyeccion] ✅ Proyección abierta');

// ============================================================
// 1) Socket.IO
// ============================================================
const socket = io();

// ============================================================
// 2) Cache de DOM
// ============================================================
const DOM = {
  root: null,        // #pantalla-espera (contenedor principal)
  qr: null,          // #qrConexion
  url: null,         // #urlConexion
};

function cacheDom() {
  DOM.root = document.getElementById('pantalla-espera');
  DOM.qr = document.getElementById('qrConexion');
  DOM.url = document.getElementById('urlConexion');

  if (!DOM.root) console.warn('[proyeccion] Falta #pantalla-espera en proyeccion.html');
  if (!DOM.qr) console.warn('[proyeccion] Falta #qrConexion en proyeccion.html');
  if (!DOM.url) console.warn('[proyeccion] Falta #urlConexion en proyeccion.html');
}

// ============================================================
// 3) Render: QR + URL (vía preload -> IPC -> main)
// ============================================================
async function renderDatosConexion() {
  if (!window.conexion?.obtenerDatos) {
    console.warn('[proyeccion] window.conexion.obtenerDatos() no está disponible (preload)');
    return;
  }

  try {
    const { qr, url } = await window.conexion.obtenerDatos();
    if (DOM.qr) DOM.qr.src = qr;
    if (DOM.url) DOM.url.textContent = url;
  } catch (e) {
    console.error('[proyeccion] ❌ No se pudieron obtener datos de conexión:', e);
  }
}

// ============================================================
// 4) Helpers UI
// ============================================================
function setModoPantallaJuego() {
  // Reutilizamos el mismo contenedor, solo cambiamos la clase para estilos
  if (!DOM.root) return;

  DOM.root.className = '';               // limpiamos clases previas
  DOM.root.classList.add('pantalla-juego');
}

function mostrarPreguntaProyeccion(pregunta) {
  if (!DOM.root) return;

  setModoPantallaJuego();

  const enunciado = pregunta?.enunciado ?? '(Sin enunciado)';
  const respuestas = Array.isArray(pregunta?.respuestas) ? pregunta.respuestas : [];
  const tiempo = pregunta?.tiempo_limite ?? 15;

  DOM.root.innerHTML = `
    <div class="pregunta-contenido">
      <h1>${enunciado}</h1>

      <div class="respuestas-grid">
        ${respuestas
      .map((r, i) => `<div class="respuesta-tarjeta color-${i}">${r?.respuesta ?? ''}</div>`)
      .join('')}
      </div>

      <div id="temporizador" class="temporizador"></div>
    </div>
  `;

  iniciarTemporizador(tiempo);
}

function iniciarTemporizador(segundos) {
  const timer = document.getElementById('temporizador');
  let restante = Number(segundos) || 0;

  // Si no hay timer (por CSS/HTML), no rompemos
  if (!timer) return;

  timer.textContent = `⏱️ ${restante}s`;

  const intervalo = setInterval(() => {
    restante--;
    if (restante >= 0) timer.textContent = `⏱️ ${restante}s`;

    if (restante < 0) {
      clearInterval(intervalo);
      timer.textContent = '🛑 Tiempo finalizado';
      // Solo avisamos; el backend decide si muestra ranking
      socket.emit('fin-pregunta');
    }
  }, 1000);
}

function renderRankingActual() {
  if (!DOM.root) return;

  setModoPantallaJuego();

  DOM.root.innerHTML = `
    <div class="pregunta-contenido">
      <h1>🏆 Ranking actual</h1>
      <div id="rankingLista">Cargando...</div>
    </div>
  `;

  fetch('/api/ranking')
    .then(res => res.json())
    .then(data => {
      const div = document.getElementById('rankingLista');
      if (!div) return;

      if (!Array.isArray(data) || data.length === 0) {
        div.textContent = 'Aún no hay resultados.';
        return;
      }

      div.innerHTML = data
        .map((e, i) => `<p>${i + 1}. ${e.nombre} - ${e.puntaje}</p>`)
        .join('');
    })
    .catch(err => console.error('[proyeccion] ❌ Error cargando ranking:', err));
}

function renderFinal(ranking) {
  if (!DOM.root) return;

  setModoPantallaJuego();

  const top = Array.isArray(ranking) ? ranking : [];
  DOM.root.innerHTML = `
    <div class="pregunta-contenido resultado-final">
      <h1>🏁 Juego finalizado</h1>
      <ol class="ranking-final">
        ${top.map(r => `<li>${r.nombre} — ${r.puntaje}</li>`).join('')}
      </ol>
    </div>
  `;
}

// ============================================================
// 5) Eventos Socket.IO
// ============================================================
socket.on('juegoIniciado', async () => {
  console.log('[proyeccion] 🚀 juegoIniciado');

  // Opcional: intentar pintar la pregunta actual si el backend la expone
  // (así, aunque la proyección se abrió tarde, se sincroniza)
  try {
    const res = await fetch('/api/pregunta-actual');
    const data = await res.json();
    if (data?.pregunta) mostrarPreguntaProyeccion(data.pregunta);
  } catch (e) {
    // Si no existe el endpoint, no pasa nada
    console.warn('[proyeccion] No se pudo obtener /api/pregunta-actual:', e?.message || e);
  }
});

socket.on('nuevaPregunta', (pregunta) => {
  console.log('[proyeccion] 📨 nuevaPregunta');
  mostrarPreguntaProyeccion(pregunta);
});

socket.on('mostrar-ranking', () => {
  console.log('[proyeccion] 🏆 mostrar-ranking');
  renderRankingActual();
});

socket.on('juegoFinalizado', ({ ranking } = {}) => {
  console.log('[proyeccion] ✅ juegoFinalizado');
  renderFinal(ranking);
});

// ============================================================
// 6) Boot
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  cacheDom();
  await renderDatosConexion();
});
