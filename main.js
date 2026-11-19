// compta — application Windows (Electron)
// Les données restent dans un dossier du PC (par défaut Documents\compta).
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");
const { pathToFileURL } = require("url");

/* ---------- journal d'erreurs : %APPDATA%\compta\compta.log ---------- */
const SMOKE = process.argv.includes("--smoke");
function log(...a) { try { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.appendFileSync(path.join(app.getPath("userData"), "compta.log"), new Date().toISOString() + " " + a.map(x => x && x.stack ? x.stack : String(x)).join(" ") + "\n"); } catch (e) {} }
function fatal(where, err) {
  log("ERREUR", where, err);
  if (SMOKE) { console.error(where, err); app.exit(1); return; }
  try { dialog.showErrorBox("compta : erreur", `${where}\n\n${err && err.stack || err}\n\nJournal : ${path.join(app.getPath("userData"), "compta.log")}`); } catch (e) {}
}
process.on("uncaughtException", e => fatal("Erreur inattendue", e));
process.on("unhandledRejection", e => log("Promesse rejetée", e));

let autoUpdater = null;
try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { autoUpdater = null; }

protocol.registerSchemesAsPrivileged([
  { scheme: "cfile", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

/* ---------- configuration & dossiers ---------- */
const cfgPath = () => path.join(app.getPath("userData"), "config.json");
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath(), "utf8")); } catch (e) { return {}; } }
function writeCfg(c) { fs.mkdirSync(path.dirname(cfgPath()), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 1)); }
const dataDir = () => readCfg().dataDir || path.join(app.getPath("documents"), "compta");
const dataFile = () => path.join(dataDir(), "compta-data.json");
const filesDir = () => path.join(dataDir(), "Justificatifs");
const backupDir = () => path.join(dataDir(), "Sauvegardes");
const exportDir = () => path.join(dataDir(), "Exports");
function ensureDirs() { for (const d of [dataDir(), filesDir(), backupDir(), exportDir()]) fs.mkdirSync(d, { recursive: true }); }
const safeName = n => String(n || "fichier").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "fichier";
function findFile(id) {
  if (!/^[a-f0-9]{8,32}$/i.test(id || "")) return null;
  try { const f = fs.readdirSync(filesDir()).find(x => x.startsWith(id + "-")); return f ? path.join(filesDir(), f) : null; } catch (e) { return null; }
}
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

/* ---------- données ---------- */
ipcMain.handle("load", async () => {
  ensureDirs();
  let data = null;
  try { data = JSON.parse(await fsp.readFile(dataFile(), "utf8")); } catch (e) { data = null; }
  return { data, dir: dataDir() };
});

ipcMain.handle("save", async (_e, json) => {
  try {
    if (typeof json !== "string" || json.length < 2) return false;
    JSON.parse(json); // refuse un contenu cassé
    ensureDirs();
    // une sauvegarde par jour, 60 jours gardés
    const bk = path.join(backupDir(), `compta-${today()}.json`);
    if (fs.existsSync(dataFile()) && !fs.existsSync(bk)) {
      await fsp.copyFile(dataFile(), bk);
      const all = (await fsp.readdir(backupDir())).filter(f => /^compta-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      for (const f of all.slice(0, Math.max(0, all.length - 60))) await fsp.unlink(path.join(backupDir(), f)).catch(() => {});
    }
    const tmp = dataFile() + ".tmp";
    await fsp.writeFile(tmp, json, "utf8");
    await fsp.rename(tmp, dataFile());
    return true;
  } catch (e) { console.error(e); return false; }
});

/* ---------- justificatifs ---------- */
ipcMain.handle("blob:save", async (_e, name, type, bytes) => {
  ensureDirs();
  const id = crypto.randomBytes(8).toString("hex");
  await fsp.writeFile(path.join(filesDir(), `${id}-${safeName(name)}`), Buffer.from(bytes));
  return { id };
});
ipcMain.handle("blob:delete", async (_e, id) => {
  const p = findFile(id); if (!p) return false;
  // pas de suppression définitive : on range dans un sous-dossier
  const trash = path.join(filesDir(), "_supprimés"); fs.mkdirSync(trash, { recursive: true });
  await fsp.rename(p, path.join(trash, path.basename(p))).catch(() => {});
  return true;
});

/* ---------- exports ---------- */
ipcMain.handle("file:saveAs", async (e, filename, bytes) => {
  ensureDirs();
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(exportDir(), safeName(filename)) });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, Buffer.from(bytes));
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
ipcMain.handle("dir:open", async () => { ensureDirs(); return shell.openPath(dataDir()); });
ipcMain.handle("app:version", () => app.getVersion());

/* ---------- fenêtre ---------- */
let win = null, closing = false;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: "compta", backgroundColor: "#F3F4F2", show: !SMOKE,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => fatal("Chargement impossible", `${code} ${desc} ${url}`));
  win.webContents.on("render-process-gone", (_e, d) => fatal("La fenêtre s'est arrêtée", d && d.reason));
  win.webContents.on("console-message", (_e, level, msg, line, src) => { if (level >= 3) log("console", msg, src + ":" + line); });
  if (SMOKE) win.webContents.once("did-finish-load", async () => {
    try {
      await new Promise(r => setTimeout(r, 1500));
      const ok = await win.webContents.executeJavaScript(`!!(window.compta && window.compta.isDesktop) && !!document.querySelector("#tabs svg") && /dossier compta/.test(document.querySelector("#store").textContent)`);
      console.log("SMOKE", ok ? "OK" : "ECHEC"); app.exit(ok ? 0 : 2);
    } catch (e) { console.error(e); app.exit(3); }
  });
  win.loadFile(path.join(__dirname, "app", "index.html")).catch(e => fatal("Chargement de l'interface", e));

  // liens : justificatifs -> programme par défaut, web -> navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("cfile://")) { const p = findFile(url.replace(/^cfile:\/\/f\//, "").replace(/[/?#].*$/, "")); if (p) shell.openPath(p); }
    else if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (ev, url) => { if (!url.startsWith("file://")) { ev.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });

  // enregistrer avant de fermer
  win.on("close", ev => {
    if (closing) return;
    ev.preventDefault(); closing = true;
    win.webContents.send("flush");
    setTimeout(() => { if (win && !win.isDestroyed()) win.destroy(); }, 4000);
  });
  win.on("closed", () => { win = null; });
}
ipcMain.on("flushed", () => { if (win && !win.isDestroyed()) win.destroy(); });

/* ---------- menu ---------- */
async function chooseDataDir() {
  const r = await dialog.showOpenDialog(win, { title: "Dossier des données compta", defaultPath: dataDir(), properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return;
  const c = readCfg(); c.dataDir = r.filePaths[0]; writeCfg(c);
  closing = false; win.reload();
}
function buildMenu() {
  const tpl = [
    { label: "Fichier", submenu: [
      { label: "Ouvrir le dossier des données", accelerator: "CmdOrCtrl+Shift+O", click: () => { ensureDirs(); shell.openPath(dataDir()); } },
      { label: "Choisir un autre dossier de données…", click: chooseDataDir },
      { type: "separator" },
      { role: "quit", label: "Quitter" }
    ]},
    { label: "Édition", submenu: [
      { role: "undo", label: "Annuler" }, { role: "redo", label: "Rétablir" }, { type: "separator" },
      { role: "cut", label: "Couper" }, { role: "copy", label: "Copier" }, { role: "paste", label: "Coller" }, { role: "selectAll", label: "Tout sélectionner" }
    ]},
    { label: "Affichage", submenu: [
      { role: "reload", label: "Recharger" },
      { role: "resetZoom", label: "Taille normale" }, { role: "zoomIn", label: "Agrandir" }, { role: "zoomOut", label: "Réduire" },
      { type: "separator" }, { role: "togglefullscreen", label: "Plein écran" },
      { role: "toggleDevTools", label: "Outils de développement" }
    ]},
    { label: "Aide", submenu: [
      { label: "Rechercher une mise à jour", click: () => checkUpdates(true) },
      { label: "À propos de compta", click: () => dialog.showMessageBox(win, { type: "info", title: "compta", message: `compta ${app.getVersion()}`, detail: `Données : ${dataDir()}` }) }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------- mises à jour (GitHub Releases) ---------- */
let manualCheck = false;
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", async info => {
    const r = await dialog.showMessageBox(win, {
      type: "info", buttons: ["Redémarrer et installer", "Plus tard"], defaultId: 0, cancelId: 1,
      title: "Mise à jour", message: `compta ${info.version} est prête.`,
      detail: "Tes données ne sont pas touchées par la mise à jour. Si tu choisis « Plus tard », elle s'installera à la prochaine fermeture."
    });
    if (r.response === 0) { closing = false; autoUpdater.quitAndInstall(); }
  });
  autoUpdater.on("update-not-available", () => { if (manualCheck) dialog.showMessageBox(win, { type: "info", title: "Mise à jour", message: `compta ${app.getVersion()} est à jour.` }); manualCheck = false; });
  autoUpdater.on("error", err => { if (manualCheck) dialog.showMessageBox(win, { type: "warning", title: "Mise à jour", message: "Impossible de vérifier les mises à jour.", detail: String(err && err.message || err) }); manualCheck = false; });
  checkUpdates(false);
}
function checkUpdates(manual) {
  if (!autoUpdater || !app.isPackaged) { if (manual) dialog.showMessageBox(win, { type: "info", title: "Mise à jour", message: "Les mises à jour ne marchent que dans la version installée." }); return; }
  manualCheck = manual; autoUpdater.checkForUpdates().catch(() => {});
}

/* ---------- démarrage ---------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else createWindow(); });
  log("démarrage", app.getVersion(), process.platform, process.arch);
  app.whenReady().then(() => {
    app.setAppUserModelId("com.karimdabbeche.compta");
    protocol.handle("cfile", req => {
      const id = new URL(req.url).pathname.replace(/^\//, "");
      const p = findFile(id);
      if (!p) return new Response("introuvable", { status: 404 });
      return net.fetch(pathToFileURL(p).toString());
    });
    buildMenu(); createWindow(); if (!SMOKE) setupUpdates();
  }).catch(e => fatal("Démarrage", e));
  app.on("window-all-closed", () => app.quit());
}
