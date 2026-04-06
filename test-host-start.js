const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", { transports: ["websocket"] });

socket.on("room_state", (s) => console.log("room_state:", s));
socket.on("game_started", (p) => console.log("game_started:", p));
socket.on("round_start", (p) => console.log("round_start:", p));

socket.on("connect", () => {
  console.log("host connected", socket.id);

  socket.emit("auth", { uid: "HOST_UID" }, (res) => {
    console.log("auth res:", res);

    socket.emit("create_room", {}, (r) => {
      console.log("create_room res:", r);
      console.log("=== COPY ROOM_ID FOR JOINER:", r.roomId, "===");
      console.log("Host đang đứng chờ. Khi joiner vào xong, mình sẽ bấm Start bằng test-start.js");
      // KHÔNG auto start nữa
    });
  });
});
