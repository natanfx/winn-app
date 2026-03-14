// src/main/main.js
// Proceso principal de Electron.
// Responsabilidades:
// - Definir ventanas (docente y proyección)
// - Exponer IPC (abrir/cerrar proyección, obtener IP/URL/QR)
// - Arrancar el backend (Express + Socket.IO + SQLite) UNA sola vez

const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const os = require('os');

/**
 * Estado global de ventanas
 */
let proyeccionWindow = null;
let permitirCerrarProyeccion = false;
/**
 * Bandera de desarrollo
 */
const isDev = !app.isPackaged;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Obtiene la IP local IPv4 (para mostrar URL y generar QR).
 * Si no detecta, regresa 'localhost'.
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

/**
 * Devuelve ruta segura a assets (iconos).
 * - En empaquetado: process.resourcesPath
 * - En dev: desde la raíz del proyecto
 */
function getAssetPath(...segments) {
  if (app.isPackaged) return path.join(process.resourcesPath, ...segments);
  // __dirname = src/main en dev
  return path.join(__dirname, '..', '..', ...segments);
}

// ------------------------------------------------------------
// Backend (Express + Socket.IO + SQLite)
// ------------------------------------------------------------

/**
 * Arranca el backend por require.
 * Ojo: se debe invocar una sola vez por ejecución de app.
 */
function startBackend() {
  // MISMA ruta relativa en dev y empaquetado (porque vive dentro de src/)
  const backendPath = path.join(__dirname, '..', 'backend', 'server.js');

  console.log('[main] Iniciando backend desde:', backendPath);

  try {
    require(backendPath);
  } catch (err) {
    console.error('[main] Error al iniciar backend:', err);
  }
}

// ------------------------------------------------------------
// Ventanas
// ------------------------------------------------------------

/**
 * Crea la ventana principal (docente).
 * Carga el HTML desde /public (file://) y usa preload.
 */
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 850,
    show: false,
    resizable: false,
    x: 0,
    y: 0,
    icon: getAssetPath('assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, '../../public/docente.html'));

  win.once('ready-to-show', () => {
    win.show();
  });
}


/**
 * Abre (o enfoca) la ventana de proyección.
 * Si hay monitor secundario, intenta abrirla en el segundo display.
 */
function openProyeccionWindow() {
  // Si ya existe, solo enfocar
  if (proyeccionWindow && !proyeccionWindow.isDestroyed()) {
    proyeccionWindow.focus();
    return;
  }

  // ------------------------------------------------------------
  // Selección de pantalla (secundaria si existe)
  // ------------------------------------------------------------

  const displays = screen.getAllDisplays();
  const secundaria = displays.length > 1 ? displays[1] : displays[0];

  const x = secundaria.bounds.x;
  const y = secundaria.bounds.y;

  // ------------------------------------------------------------
  // Crear ventana de proyección
  // ------------------------------------------------------------

  proyeccionWindow = new BrowserWindow({
    x,
    y,
    width: secundaria.bounds.width,
    height: secundaria.bounds.height,
    show: false,
    minimizable: false,
  closable: false,
  resizable: true,
    icon: getAssetPath('assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  proyeccionWindow.on('close', (e) => {
    if (!permitirCerrarProyeccion) {
      e.preventDefault();
      proyeccionWindow.focus();
    }
  })

  // Maximizar en la pantalla donde cayó
  proyeccionWindow.maximize();

  // Mostrar cuando esté lista
  proyeccionWindow.once('ready-to-show', () => {
    proyeccionWindow.show();
  });

  // Cargar vista
  proyeccionWindow.loadURL('http://localhost:3000/proyeccion.html');

  proyeccionWindow.on('closed', () => {
    proyeccionWindow = null;
  });
}

/**
 * Cierra la ventana de proyección si existe.
 */
function closeProyeccionWindow() {
  if (proyeccionWindow && !proyeccionWindow.isDestroyed()) {
    permitirCerrarProyeccion = true;
    proyeccionWindow.close();
  }
  proyeccionWindow = null;
  permitirCerrarProyeccion = false;
}

// ------------------------------------------------------------
// IPC handlers (Renderer <-> Main)
// ------------------------------------------------------------

/**
 * Renderer solicita abrir proyección
 */
ipcMain.handle('abrir-proyeccion', () => {
  openProyeccionWindow();
  return true;
});

/**
 * Renderer solicita cerrar proyección
 */
ipcMain.handle('cerrar-proyeccion', () => {
  closeProyeccionWindow();
  return true;
});

/**
 * Renderer solicita IP/URL/QR
 * - url: http://<ip>:3000
 * - qr: dataURL del QR para mostrar en <img>
 */
ipcMain.handle('obtener-datos-conexion', async () => {
  const ip = getLocalIP();
  const url = `http://${ip}:3000`;
  const qr = await QRCode.toDataURL(url);
  return { ip, url, qr };
});

// ------------------------------------------------------------
// Ciclo de vida Electron
// ------------------------------------------------------------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // BD en userData (Application Support / AppData), no dentro de la app instalada
  const userDataDir = app.getPath('userData');
  process.env.WINN_DB_PATH = path.join(userDataDir, 'winn.db');

  console.log('[main] userDataDir:', userDataDir);
  console.log('[main] WINN_DB_PATH:', process.env.WINN_DB_PATH);

  startBackend();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('cerrar-winn', async () => {
  try {
    closeProyeccionWindow();
  } catch (e) {
    console.error('[main] Error cerrando proyección al salir:', e);
  }

  // Cerrar ventanas rápido
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.destroy();
    });
  } catch { }

  // Salir
  setTimeout(() => app.exit(0), 150);
  app.quit();
  return true;
});