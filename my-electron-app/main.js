// electron 模块可以用来控制应用的生命周期和创建原生浏览窗口
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  MessageChannelMain,
  session,
  shell,
} = require("electron");
const path = require("path");
const URL = require("url").URL;
// require('update-electron-app')()
// console.log(app, BrowserWindow);

session
  .fromPartition("some-partition")
  .setPermissionRequestHandler((webContents, permission, callback) => {
    const parsedUrl = new URL(webContents.getURL());
    if (permission === "notifications") {
      // 批准权限请求
      callback(true);
    }
    // 校验 URL
    if (parsedUrl.protocol !== "https:" || parsedUrl.host !== "example.com") {
      // Denies the permissions request
      return callback(false);
    }
  });

session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": ["default-src 'none'"],
    },
  });
});

app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    // 如果未使用，则删除预加载脚本或验证其位置是否合法
    delete webPreferences.preload;
    // 禁用 Node.js 集成
    webPreferences.nodeIntegration = false;
    // 验证正在加载的 URL
    if (!params.src.startsWith("https://example.com/")) {
      event.preventDefault();
    }
  });

  contents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== "https://example.com") {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    // 在此示例中我们要求操作系统
    // 在默认浏览器中打开此事件的 url。
    //
    // 关于哪些URL应该被允许通过shell.openExternal打开，
    // 请参照以下项目。
    if (isSafeForExternalOpen(url)) {
      setImmediate(() => {
        shell.openExternal(url);
      });
    }
    return { action: "deny" };
  });
});

async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog();
  if (canceled) {
    return;
  } else {
    return filePaths[0];
  }
}

const createWindow = () => {
  // console.log(__dirname)
  // 创建浏览窗口
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
      nodeIntegration: true,
    },
  });

  ipcMain.handle("ping", () => "pong");
  ipcMain.handle("dialog:openFile", handleFileOpen);
  ipcMain.handle("get-secrets", (e) => {
    if (!validateSender(e.senderFrame)) return null;
    return getSecrets();
  });

  function validateSender(frame) {
    // Value the host of the URL using an actual URL parser and an allowlist
    if (new URL(frame.url).host === "electronjs.org") return true;
    return false;
  }
  ipcMain.on("set-title", (event, title) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    win.setTitle(title);
  });
  ipcMain.on("asynchronous-message", (event, arg) => {
    // console.log(arg); // 在 Node 控制台中打印“ping”
    // 作用如同 `send`，但返回一个消息
    // 到发送原始消息的渲染器
    event.reply("asynchronous-reply", "pong");
  });
  ipcMain.on("synchronous-message", (event, arg) => {
    // console.log(arg); // 在 Node 控制台中打印“ping”
    event.returnValue = "pong";
  });
  ipcMain.on("counter-value", (_event, value) => {
    console.log(value); // will print value to Node console
  });
  // In the main process, we receive the port.
  ipcMain.on("port", (event) => {
    // console.log(event);
    // 当我们在主进程中接收到 MessagePort 对象, 它就成为了
    // MessagePortMain.
    const port = event.ports[0];
    // MessagePortMain 使用了 Node.js 风格的事件 API, 而不是
    // web 风格的事件 API. 因此使用 .on('message', ...) 而不是 .onmessage = ...
    port.on("message", (event) => {
      // 收到的数据是： { answer: 42 }
      const data = event.data;
      // console.log(data)
    });
    // MessagePortMain 阻塞消息直到 .start() 方法被调用
    port.start();
  });

  // console.log(app.name);
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: () => mainWindow.webContents.send("update-counter", 1),
          label: "Increment",
        },
        {
          click: () => mainWindow.webContents.send("update-counter", -1),
          label: "Decrement",
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // 加载 index.html
  mainWindow.loadFile("index.html");

  // const contents = mainWindow.webContents;
  // console.log(contents);

  // 打开开发工具
  mainWindow.webContents.openDevTools();
};

// app.enableSandbox()
app.whenReady().then(async () => {
  createWindow();

  // 针对mac平台
  app.on("activate", () => {
    // 在 macOS 系统内, 如果没有已开启的应用窗口
    // 点击托盘图标时通常会重新创建一个新窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // create the windows.
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      preload: path.join(__dirname, "preloadMain.js"),
    },
  });

  const secondaryWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      preload: path.join(__dirname, "preloadSecondary.js"),
    },
  });

  // set up the channel.
  const { port1, port2 } = new MessageChannelMain();

  // once the webContents are ready, send a port to each webContents with postMessage.
  mainWindow.once("ready-to-show", () => {
    mainWindow.webContents.postMessage("port", null, [port1]);
  });

  secondaryWindow.once("ready-to-show", () => {
    secondaryWindow.webContents.postMessage("port", null, [port2]);
  });

  // The worker process is a hidden BrowserWindow, so that it will have access
  // to a full Blink context (including e.g. <canvas>, audio, fetch(), etc.)
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true },
  });
  await worker.loadFile("worker.html");
  // main window 将发送内容给 worker process 同时通过 MessagePort 接收返回值
  const mainWindow2 = new BrowserWindow({
    webPreferences: { nodeIntegration: true },
  });
  mainWindow2.loadFile("app.html");
  // 打开开发工具
  mainWindow2.webContents.openDevTools();

  // 在这里我们不能使用 ipcMain.handle() , 因为回复需要传输
  // MessagePort.
  ipcMain.on("request-worker-channel", (event) => {
    // 出于安全考虑, 让我们确保只要我们期望的 frames
    // 可以访问 worker.
    if (event.senderFrame === mainWindow2.webContents.mainFrame) {
      // 创建新的通道 ...
      const { port1, port2 } = new MessageChannelMain();
      // ... 把一端送到 worker ...
      worker.webContents.postMessage("new-client", null, [port1]);
      // ... 同时把另一端送到 main window.
      event.senderFrame.postMessage("provide-worker-channel", null, [port2]);
      // 现在 main window 和 worker 可以相互通信
      // 且不需要通过 main process 了!
    }
  });
  ipcMain.on("give-me-a-stream", (event, msg) => {
    // The renderer has sent us a MessagePort that it wants us to send our
    // response over.
    const [replyPort] = event.ports;

    // Here we send the messages synchronously, but we could just as easily store
    // the port somewhere and send messages asynchronously.
    for (let i = 0; i < msg.count; i++) {
      replyPort.postMessage(msg.element);
    }

    // We close the port when we're done to indicate to the other end that we
    // won't be sending any more messages. This isn't strictly necessary--if we
    // didn't explicitly close the port, it would eventually be garbage
    // collected, which would also trigger the 'close' event in the renderer.
    replyPort.close();
  });

  // Create a BrowserWindow with contextIsolation enabled.
  const bw = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  bw.loadURL("index.html");
  // We'll be sending one end of this channel to the main world of the
  // context-isolated page.
  const { port11, port22 } = new MessageChannelMain();
  // 允许在另一端还没有注册监听器的情况下就通过通道向其发送消息 消息将排队等待，直到有一个监听器注册为止。
  port22.postMessage({ test: 21 });
  // 我们也可以接收来自渲染器主进程的消息。
  port22.on("message", (event) => {
    console.log("from renderer main world:", event.data);
  });
  port22.start();
  // 预加载脚本将接收此 IPC 消息并将端口
  // 传输到主进程。
  bw.webContents.postMessage("main-world-port", null, [port11]);
});

// 除了 macOS 外，当所有窗口都被关闭的时候退出程序。 因此, 通常
// 对应用程序和它们的菜单栏来说应该时刻保持激活状态,
// 直到用户使用 Cmd + Q 明确退出
app.on("window-all-closed", () => {
  // console.log(process.platform)
  // console.log(process.versions)
  if (process.platform !== "darwin") app.quit();
});

// 在当前文件中你可以引入所有的主进程代码
// 也可以拆分成几个文件，然后用 require 导入。
