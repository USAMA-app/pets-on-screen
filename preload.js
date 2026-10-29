const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pets', {
  catalog: () => ipcRenderer.invoke('catalog'),
  list: () => ipcRenderer.invoke('pets'),
  add: d => ipcRenderer.invoke('add', d),
  update: d => ipcRenderer.invoke('update', d),
  remove: id => ipcRenderer.invoke('remove', id),
  stats: list => ipcRenderer.send('stats', list),
  act: a => ipcRenderer.send('act', a),
  onPets: cb => ipcRenderer.on('pets', (_, list) => cb(list)),
  hover: over => ipcRenderer.send('hover', over),
  menu: state => ipcRenderer.send('menu', state),
  onAction: cb => ipcRenderer.on('action', (_, a) => cb(a)),
  onCursor: cb => ipcRenderer.on('cursor', (_, p) => cb(p)),
});
