const { io } = require("socket.io-client");

const ROOM_ID = "M67SRC";


const socket = io("http://localhost:3000", { transports: ["websocket"] });

socket.on("room_state", (s) => console.log("room_state:", s));
socket.on("game_started", (p) => console.log("game_started:", p));

socket.on("round_start", (p) => {
  console.log("round_start:", p);

  // auto trả lời sau 500ms để test
  setTimeout(() => {
    socket.emit(
      "submit_answer",
      { roomId: ROOM_ID, qIndex: p.qIndex, choiceIndex: 1 },
      (res) => console.log("submit_answer res:", res)
    );
  }, 500);
});

socket.on("round_result", (p) => {
  console.log("round_result:", p);
});

socket.on("connect", () => {
  console.log("joiner connected", socket.id);

  socket.emit("auth", { uid: "JOINER_UID" }, (res) => {
    console.log("auth res:", res);

    socket.emit("join_room", { roomId: ROOM_ID }, (r) => {
      console.log("join_room res:", r);
      console.log("Joiner đang ở lại...");
    });
  });
});
