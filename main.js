// Pets On Screen - a transparent, always-on-top, click-through overlay for 3D pets, plus a tray icon and a pet picker.
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'models', 'catalog.json'), 'utf8')).filter(e => !e.exclude);
const storeFile = () => path.join(app.getPath('userData'), 'pets.json');
let pets;
let overlay, picker, tray;

function loadPets() {
  try { return JSON.parse(fs.readFileSync(storeFile(), 'utf8')); } catch {}
  return [{ id: crypto.randomUUID(), model: '07-puma-from-cotw-game', name: 'Puma', size: 1 }];  // first run
}
function savePets() {
  fs.writeFileSync(storeFile(), JSON.stringify(pets, null, 2));
  for (const w of [overlay, picker]) if (w && !w.isDestroyed()) w.webContents.send('pets', pets);
}

function openPicker() {
  if (picker && !picker.isDestroyed()) return picker.focus();
  picker = new BrowserWindow({
    width: 1000, height: 760, title: 'Pets On Screen', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  picker.loadFile('picker.html');
  picker.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', openPicker);

// The rectangle covering every screen, plus each screen's work area (above its taskbar) relative to it.
function desktop() {
  const ds = screen.getAllDisplays();
  const x = Math.min(...ds.map(d => d.bounds.x)), y = Math.min(...ds.map(d => d.bounds.y));
  const width = Math.max(...ds.map(d => d.bounds.x + d.bounds.width)) - x;
  const height = Math.max(...ds.map(d => d.bounds.y + d.bounds.height)) - y;
  const displays = ds.map(d => ({ x: d.workArea.x - x, y: d.workArea.y - y, width: d.workArea.width, height: d.workArea.height }));
  return { x, y, width, height, displays };
}
let area;

app.whenReady().then(() => {
  pets = loadPets();
  const gallery = process.argv.find(a => a.startsWith('--gallery'));
  overlay = new BrowserWindow({
    title: 'Pets On Screen', show: false,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });  // clicks pass through until the cursor is over a pet
  const layout = () => {  // span every screen; rebuild when screens are added, removed or rearranged
    area = desktop();
    overlay.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height });
    overlay.loadFile('index.html', { query: { displays: JSON.stringify(area.displays),
                                              ...(gallery ? { gallery: gallery.split('=')[1] || 'all' } : {}) } });
    overlay.showInactive();
  };
  layout();
  let relayout;
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, () => { clearTimeout(relayout); relayout = setTimeout(layout, 500); });
  }

  setInterval(() => {
    const p = screen.getCursorScreenPoint();
    if (!overlay.isDestroyed()) overlay.webContents.send('cursor', { x: p.x - area.x, y: p.y - area.y });
  }, 33);

  const icon = nativeImage.createFromPath(path.join(__dirname, 'models', catalog[0].thumb)).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Pets On Screen');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Adopt a pet / My pets...', click: openPicker },
    { type: 'separator' },
    { label: 'Quit Pets On Screen', click: () => app.quit() },
  ]));
  tray.on('click', openPicker);
  if (!pets.length && !gallery) openPicker();
});

ipcMain.handle('catalog', () => catalog);
ipcMain.handle('pets', () => pets);
ipcMain.handle('add', (_, d) => { pets.push({ id: crypto.randomUUID(), size: 1, ...d }); savePets(); });
ipcMain.handle('update', (_, d) => { Object.assign(pets.find(p => p.id === d.id) || {}, d); savePets(); });
ipcMain.handle('remove', (_, id) => { pets = pets.filter(p => p.id !== id); savePets(); });
ipcMain.on('hover', (_, over) => overlay.setIgnoreMouseEvents(!over, { forward: true }));
ipcMain.on('picker', openPicker);

ipcMain.on('menu', (_, s) => {
  const act = action => () => overlay.webContents.send('action', { id: s.id, action });
  const update = d => () => { Object.assign(pets.find(p => p.id === s.id) || {}, d); savePets(); };
  Menu.buildFromTemplate([
    { label: `${s.name} the ${s.kind}`, enabled: false },
    { type: 'separator' },
    { label: 'Pet', click: act('pet') },
    { label: 'Feed', click: act('feed') },
    { label: s.kind === 'bird' ? 'Come here (land on my cursor)' : 'Come here', click: act('come') },
    ...(s.fetch ? [{ label: 'Throw a ball', click: act('fetch') }] : []),
    { label: 'Nap', click: act('nap') },
    { label: 'Size', submenu: [['Small', 0.7], ['Medium', 1], ['Large', 1.4]].map(([label, v]) =>
      ({ label, type: 'radio', checked: s.size === v, click: update({ size: v }) })) },
    { type: 'separator' },
    { label: 'Rename / adopt more...', click: openPicker },
    { label: `Send ${s.name} home`, click: () => { pets = pets.filter(p => p.id !== s.id); savePets(); } },
    { type: 'separator' },
    { label: 'Quit Pets On Screen', click: () => app.quit() },
  ]).popup({ window: overlay });
});

app.on('window-all-closed', () => app.quit());
