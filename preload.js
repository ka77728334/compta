const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("compta", {
  isDesktop: true,
  load: () => ipcRenderer.invoke("load"),
  save: json => ipcRenderer.invoke("save", json),
  saveBlob: (name, type, bytes) => ipcRenderer.invoke("blob:save", name, type, bytes),
  deleteBlob: id => ipcRenderer.invoke("blob:delete", id),
  saveAs: (filename, bytes) => ipcRenderer.invoke("file:saveAs", filename, bytes),
  openDir: () => ipcRenderer.invoke("dir:open"),
  version: () => ipcRenderer.invoke("app:version"),
  onFlush: cb => ipcRenderer.on("flush", () => cb()),
  flushed: () => ipcRenderer.send("flushed")
});
