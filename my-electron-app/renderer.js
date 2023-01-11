const information = document.getElementById("info");
information.innerText = `本应用正在使用 Chrome (v${versions.chrome()}), Node.js (v${versions.node()}), 和 Electron (v${versions.electron()})`;

const func = async () => {
  const response = await window.electronAPI.ping();
  console.log(response); // 打印 'pong'
};
func();

const setButton = document.getElementById("btn");
const titleInput = document.getElementById("title");
setButton.addEventListener("click", () => {
  const title = titleInput.value;
  window.electronAPI.setTitle(title);
});

const btn = document.getElementById("a_btn");
const filePathElement = document.getElementById("filePath");
btn.addEventListener("click", async () => {
  const filePath = await window.electronAPI.openFile();
  filePathElement.innerText = filePath;
});

const counter = document.getElementById("counter");
window.electronAPI.handleCounter((event, value) => {
  const oldValue = Number(counter.innerText);
  const newValue = oldValue + value;
  counter.innerText = newValue;
  event.sender.send("counter-value", newValue);
});

// elsewhere in your code to send a message to the other renderers message handler
// window.electronMessagePort.postmessage('ping')

const makeStreamingRequest = (element, callback) => {
  // MessageChannels are lightweight--it's cheap to create a new one for each
  // request.
  const { port1, port2 } = new MessageChannel();
  // We send one end of the port to the main process ...
  ipcRenderer.postMessage("give-me-a-stream", { element, count: 10 }, [port2]);
  // ... and we hang on to the other end. The main process will send messages
  // to its end of the port, and close it when it's finished.
  port1.onmessage = (event) => {
    callback(event.data);
  };
  port1.onclose = () => {
    console.log("stream ended");
  };
};
makeStreamingRequest(42, (data) => {
  console.log("got response data:", data);
});
// We will see "got response data: 42" 10 times.

window.onmessage = (event) => {
  // event.source === window means the message is coming from the preload
  // script, as opposed to from an <iframe> or other source.
  if (event.source === window && event.data === "main-world-port") {
    const [port] = event.ports;
    // 一旦我们有了这个端口，我们就可以直接与主进程通信
    port.onmessage = (event) => {
      console.log("from main process:", event.data);
      port.postMessage(event.data * 2);
    };
  }
};
