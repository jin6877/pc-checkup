const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const si = require('systeminformation');
const { analyze } = require('./lib/analyze');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 720,
    minHeight: 600,
    title: 'PC 점검',
    backgroundColor: '#0b1220',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('renderer/index.html');
}

// 현재 시스템 상태를 수집해서 진단 결과를 돌려준다.
ipcMain.handle('scan', async () => {
  const [mem, cpu, load, processes, osInfo] = await Promise.all([
    si.mem(),
    si.cpu(),
    si.currentLoad(),
    si.processes(),
    si.osInfo()
  ]);
  return analyze({ mem, cpu, load, processes, osInfo });
});

ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
