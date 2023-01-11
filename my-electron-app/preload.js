const { contextBridge, ipcRenderer  } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  // 能暴露的不仅仅是函数，我们还可以暴露变量
})

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    setTitle: (title) => ipcRenderer.send('set-title', title),
    handleCounter: (callback) => ipcRenderer.on('update-counter', callback),
})

ipcRenderer.on('asynchronous-reply', (_event, arg) => {
    console.log(arg) // 在 DevTools 控制台中打印“pong”
  })
ipcRenderer.send('asynchronous-message', 'ping')
// 这份代码的结构与 invoke 模型非常相似，但出于性能原因，我们建议避免使用此 API。
// 它的同步特性意味着它将阻塞渲染器进程，直到收到回复为止。
const result = ipcRenderer.sendSync('synchronous-message', 'ping')
console.log(result) // 在 DevTools 控制台中打印“pong”

// 所有的 Node.js API接口 都可以在 preload 进程中被调用.
// 它拥有与Chrome扩展一样的沙盒。
window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency])
    }
})

// MessagePorts are created in pairs. 连接的一对消息端口被称为通道。
const channel = new MessageChannel()
// port1 和 port2 之间唯一的不同是你如何使用它们。 消息
// 发送到port1 将被port2 接收，反之亦然。
const port1 = channel.port1
const port2 = channel.port2
// 允许在另一端还没有注册监听器的情况下就通过通道向其发送消息
// 消息将排队等待，直到一个监听器注册为止。
port2.postMessage({ answer: 42 })
// 这次我们通过 ipc 向主进程发送 port1 对象。 类似的，
// 我们也可以发送 MessagePorts 到其他 frames, 或发送到 Web Workers, 等.
ipcRenderer.postMessage('port', null, [port1])

// We need to wait until the main world is ready to receive the message before
// sending the port. 我们在预加载时创建此 promise ，以此保证
// 在触发 load 事件之前注册 onload 侦听器。
const windowLoaded = new Promise(resolve => {
  window.onload = resolve
})
ipcRenderer.on('main-world-port', async (event) => {
  await windowLoaded
  // 我们使用 window.postMessage 将端口
  // 发送到主进程
  window.postMessage('main-world-port', '*', event.ports)
})