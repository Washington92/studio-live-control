const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wmixNative', Object.freeze({
  status: () => ipcRenderer.invoke('wmix:engine-status'),
  restart: () => ipcRenderer.invoke('wmix:engine-restart'),
  select: () => ipcRenderer.invoke('wmix:engine-select'),
  command: (name) => ipcRenderer.invoke('wmix:engine-command', name),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('wmix:engine-event', listener);
    return () => ipcRenderer.removeListener('wmix:engine-event', listener);
  },
}));
