const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("client connected", socket.id);

  socket.emit("auth", { uid: "HOST_UID" }, (res) => {
    console.log("auth res:", res);

    socket.emit("create_room", {}, (r) => {
      console.log("create_room res:", r);
      socket.disconnect();
    });
  });
});
