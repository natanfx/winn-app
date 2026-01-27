// src/main/preload.js
// Preload: puente seguro entre Renderer (HTML/JS) y el proceso principal de Electron.
//
// Objetivo:
// - Exponer SOLO lo necesario al front (por seguridad).
// - Mantener aislado el acceso a IPC.
//
// Nota:
// - Aquí conservamos tu API actual:
//   window.electronAPI -> abrir/cerrar proyección
//   window.conexion    -> obtener IP/URL/QR para mostrar al usuario

const { contextBridge, ipcRenderer } = require('electron');

/**
 * API principal para control de ventanas (Electron).
 * Se usa desde public/js/index.js (docente).
 */
contextBridge.exposeInMainWorld('electronAPI', {
  abrirProyeccion: () => ipcRenderer.invoke('abrir-proyeccion'),
  cerrarProyeccion: () => ipcRenderer.invoke('cerrar-proyeccion'),
});

/**
 * API auxiliar para IP/URL/QR.
 * Se usa desde proyeccion.js y/o la vista docente.
 */
contextBridge.exposeInMainWorld('conexion', {
  obtenerDatos: () => ipcRenderer.invoke('obtener-datos-conexion'),
});
