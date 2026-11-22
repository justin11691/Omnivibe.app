const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  launchStage: (displayIndex) => ipcRenderer.invoke('stage:launch', displayIndex),
  getAllDisplays: () => ipcRenderer.invoke('display:get-all'),
  saveLicense: (licenseData) => ipcRenderer.invoke('license:save', licenseData),
  readLicense: () => ipcRenderer.invoke('license:read'),
  getTrialStatus: () => ipcRenderer.invoke('trial:status'),
  getBridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  getMacScreenPermission: () => ipcRenderer.invoke('system:mac-screen-permission'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
