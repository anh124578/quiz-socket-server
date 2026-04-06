const { io } = require("socket.io-client");

const ROOM_ID = "M67SRC";


const socket = io("http://localhost:3000", { transports: ["websocket"] });

socket.on("room_state", (s) => console.log("room_state:", s));
socket.on("game_started", (p) => console.log("game_started:", p));

socket.on("connect", () => {
  console.log("starter connected", socket.id);

  socket.emit("auth", { uid: "HOST_UID" }, (res) => {
    console.log("auth res:", res);

    socket.emit("start_game", { roomId: ROOM_ID }, (r) => {
      console.log("start_game res:", r);
      socket.disconnect();
    });
  });
});
