import { createServer } from "http";
import { customAlphabet } from "nanoid";
import { Server, Socket } from "socket.io";
import {
  getQuestionsFromFirestore,
  type Difficulty,
  type ServerQuestion as Question,
  type Topic,
} from "./questions";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: "*" },
});

type UserProfile = {
  uid: string;
  name: string;
};

const socketProfiles = new Map<string, UserProfile>();

const QUESTION_TIME_MS = 15_000;
const REVEAL_MS = 2_000;
const POSTGAME_TTL_MS = 60_000;
const COUNTDOWN_MS = 3_000;

const CLASSIC_MAX_PLAYERS = 5;
const SURVIVAL_MAX_PLAYERS = 10;
const MIN_START_PLAYERS = 2;
const QUESTIONS_PER_MATCH = 10;
const MAX_POINTS_PER_QUESTION = 10;

type RoomMode = "classic" | "survival";
type RoomStatus = "waiting" | "countdown" | "playing" | "postgame";

type Player = {
  uid: string;
  name: string;
  alive: boolean;
  eliminatedAtQuestion?: number;
};

type RoundAnswer = {
  choiceIndex: number;
  answeredAtMs: number;
  timeLeftMs: number;
};

type Room = {
  roomId: string;
  mode: RoomMode;
  status: RoomStatus;
  hostUid: string;
  reservedHostUid?: string;
  players: Player[];
  presentUids: string[];

  topic: Topic;
  difficulty: Difficulty;

  questions: Question[];
  qIndex: number;
  deadlineMs: number;

  scores: Record<string, number>;
  roundAnswers: Record<string, RoundAnswer>;

  roundTimer?: NodeJS.Timeout;
  revealTimer?: NodeJS.Timeout;
  postGameTimer?: NodeJS.Timeout;

  countdownTimer?: NodeJS.Timeout;
  countdownEndAtMs?: number;

  rematch?: {
    offerUid: string;
    accepts: Record<string, boolean>;
  };
};

const rooms = new Map<string, Room>();
const genRoomId = customAlphabet("0123456789", 6);

function safePublicQuestion(q: Question) {
  return {
    id: q.id,
    question: q.question,
    options: q.options,
    image: q.image ?? null,
  };
}

function getRoomMaxPlayers(mode: RoomMode) {
  return mode === "survival" ? SURVIVAL_MAX_PLAYERS : CLASSIC_MAX_PLAYERS;
}

function sanitizePlayers(players: Player[]) {
  return players.map((p) => ({
    uid: p.uid,
    name: p.name,
    alive: p.alive,
    eliminatedAtQuestion: p.eliminatedAtQuestion ?? null,
  }));
}

function buildRanking(room: Room) {
  const arr = room.players.map((p) => ({
    uid: p.uid,
    name: p.name,
    score: room.scores[p.uid] ?? 0,
    alive: p.alive,
    eliminatedAtQuestion: p.eliminatedAtQuestion ?? null,
  }));

  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    if (room.mode === "survival") {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;

      const aElim = a.eliminatedAtQuestion ?? Number.MAX_SAFE_INTEGER;
      const bElim = b.eliminatedAtQuestion ?? Number.MAX_SAFE_INTEGER;
      if (bElim !== aElim) return bElim - aElim;
    }

    return a.name.localeCompare(b.name);
  });

  return arr.map((x, i) => ({ ...x, rank: i + 1 }));
}

function getProfile(socket: Socket): UserProfile | null {
  return socketProfiles.get(socket.id) ?? null;
}

function getUid(socket: Socket): string {
  return getProfile(socket)?.uid ?? "";
}

function getPlayer(room: Room, uid: string) {
  return room.players.find((p) => p.uid === uid) ?? null;
}

function getPlayerName(room: Room, uid: string) {
  return getPlayer(room, uid)?.name ?? uid;
}

function hasPlayer(room: Room, uid: string) {
  return room.players.some((p) => p.uid === uid);
}

function isPresentInRoom(room: Room, uid: string) {
  return room.presentUids.includes(uid);
}

function addPresentUid(room: Room, uid: string) {
  if (!room.presentUids.includes(uid)) {
    room.presentUids.push(uid);
  }
}

function removePresentUid(room: Room, uid: string) {
  room.presentUids = room.presentUids.filter((x) => x !== uid);
}

function getPresentPlayers(room: Room) {
  return room.players.filter((p) => room.presentUids.includes(p.uid));
}

function getConnectedUidSet() {
  return new Set(Array.from(socketProfiles.values()).map((p) => p.uid));
}

function chooseNextHostUid(room: Room): string {
  const presentPlayers = room.players.filter((p) => room.presentUids.includes(p.uid));
  if (presentPlayers.length > 0) {
    return presentPlayers[0].uid;
  }
  return room.players[0]?.uid ?? "";
}

function ensureValidHost(room: Room) {
  const hostStillExists = room.players.some((p) => p.uid === room.hostUid);

  if (room.status === "waiting" || room.status === "countdown") {
    // Nếu host hiện tại vẫn còn trong room thì giữ nguyên host,
    // dù người đó chưa quay lại màn phòng.
    if (hostStillExists) {
      return;
    }

    // Nếu host cũ đã rời hẳn khỏi room thì ưu tiên reservedHostUid
    // nếu người này vẫn còn trong room.
    if (
      room.reservedHostUid &&
      room.players.some((p) => p.uid === room.reservedHostUid)
    ) {
      room.hostUid = room.reservedHostUid;
      return;
    }

    // Nếu không còn host cũ / reserved host thì mới chuyển cho
    // người đang có mặt trong phòng, rồi mới fallback sang player đầu tiên.
    const nextPresentHost = room.players.find((p) =>
      room.presentUids.includes(p.uid)
    );

    room.hostUid = nextPresentHost?.uid ?? room.players[0]?.uid ?? "";

    if (room.reservedHostUid && room.reservedHostUid !== room.hostUid) {
      room.reservedHostUid = undefined;
    }

    return;
  }

  if (!hostStillExists) {
    room.hostUid = room.players[0]?.uid ?? "";
  }
}

function getAlivePlayers(room: Room) {
  return room.players.filter((p) => p.alive);
}

function getRoundEligiblePlayers(room: Room) {
  if (room.mode === "survival") {
    return room.players.filter((p) => p.alive);
  }
  return room.players;
}

function emitRoomState(room: Room, extras?: Record<string, unknown>) {
  ensureValidHost(room);
  const presentPlayers = getPresentPlayers(room);
  const alivePlayers = getAlivePlayers(room);

  io.to(room.roomId).emit("room_state", {
    roomId: room.roomId,
    mode: room.mode,
    status: room.status,
    hostUid: room.hostUid,
    hostName: getPlayerName(room, room.hostUid),
    maxPlayers: getRoomMaxPlayers(room.mode),
    players: sanitizePlayers(presentPlayers),
    playerCount: presentPlayers.length,
    presentUids: [...room.presentUids],
    aliveCount: alivePlayers.length,
    aliveUids: alivePlayers.map((p) => p.uid),
    countdownEndAtMs: room.countdownEndAtMs ?? null,
    serverNowMs: Date.now(),
    topic: room.topic,
    difficulty: room.difficulty,
    ...extras,
  });
}

function clearTimers(room: Room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.revealTimer) clearTimeout(room.revealTimer);
  if (room.postGameTimer) clearTimeout(room.postGameTimer);
  if (room.countdownTimer) clearTimeout(room.countdownTimer);

  room.roundTimer = undefined;
  room.revealTimer = undefined;
  room.postGameTimer = undefined;
  room.countdownTimer = undefined;
}

function scheduleRoomDeletion(room: Room) {
  if (room.postGameTimer) clearTimeout(room.postGameTimer);

  room.postGameTimer = setTimeout(() => {
    const still = rooms.get(room.roomId);
    if (!still) return;
    if (still.status !== "postgame") return;

    clearTimers(still);
    rooms.delete(still.roomId);
    console.log("room deleted by ttl:", still.roomId);
  }, POSTGAME_TTL_MS);
}

async function prepareNewMatch(room: Room, countQuestions = QUESTIONS_PER_MATCH) {
  clearTimers(room);

  const questions = await getQuestionsFromFirestore(countQuestions);

  room.questions = questions;
  room.qIndex = 0;
  room.deadlineMs = 0;
  room.roundAnswers = {};

  room.scores = {};
  for (const p of room.players) {
    room.scores[p.uid] = 0;
  }

  room.players = room.players.map((p) => ({
    ...p,
    alive: true,
    eliminatedAtQuestion: undefined,
  }));

  room.rematch = undefined;
  room.countdownEndAtMs = undefined;
}

function resetRoomToLobby(room: Room) {
  clearTimers(room);

  room.status = "waiting";
  room.questions = [];
  room.qIndex = 0;
  room.deadlineMs = 0;
  room.roundAnswers = {};
  room.scores = {};
  room.rematch = undefined;
  room.countdownEndAtMs = undefined;
  room.presentUids = [];
  room.reservedHostUid = room.hostUid;

  room.players = room.players.map((p) => ({
    ...p,
    alive: true,
    eliminatedAtQuestion: undefined,
  }));

  for (const p of room.players) {
    room.scores[p.uid] = 0;
  }

  ensureValidHost(room);
}

function calculatePoints(timeLeftMs: number) {
  const clamped = Math.max(0, Math.min(QUESTION_TIME_MS, timeLeftMs));
  const timeLeftSec = Math.ceil(clamped / 1000);

  if (timeLeftSec <= 0) return 0;
  if (timeLeftSec >= 11) return 10;
  if (timeLeftSec >= 6) return 8;
  return 6;
}

function beginCountdown(room: Room) {
  clearTimers(room);

  room.status = "countdown";
  room.countdownEndAtMs = Date.now() + COUNTDOWN_MS;

  emitRoomState(room);

  io.to(room.roomId).emit("countdown_start", {
    roomId: room.roomId,
    mode: room.mode,
    topic: room.topic,
    difficulty: room.difficulty,
    endAtMs: room.countdownEndAtMs,
    serverNowMs: Date.now(),
  });

  room.countdownTimer = setTimeout(() => {
    const still = rooms.get(room.roomId);
    if (!still) return;

    const connectedUids = getConnectedUidSet();
    const readyPlayers = still.players.filter(
      (p) => connectedUids.has(p.uid) && still.presentUids.includes(p.uid)
    );

    if (readyPlayers.length < MIN_START_PLAYERS) {
      still.status = "waiting";
      still.countdownEndAtMs = undefined;
      still.players = readyPlayers;
      still.presentUids = readyPlayers.map((p) => p.uid);
      ensureValidHost(still);
      emitRoomState(still, { reason: "not_enough_players" });
      return;
    }

    still.players = readyPlayers;
    still.presentUids = readyPlayers.map((p) => p.uid);
    still.status = "playing";
    still.countdownEndAtMs = undefined;
    ensureValidHost(still);

    emitRoomState(still);
    io.to(still.roomId).emit("game_started", {
      roomId: still.roomId,
      mode: still.mode,
      topic: still.topic,
      difficulty: still.difficulty,
      totalQuestions: still.questions.length,
    });

    startRound(still);
  }, COUNTDOWN_MS + 30);
}

function startRound(room: Room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.roundTimer = undefined;
  room.revealTimer = undefined;

  room.roundAnswers = {};
  room.deadlineMs = Date.now() + QUESTION_TIME_MS;

  const q = room.questions[room.qIndex];
  if (!q) return;

  const eligiblePlayers = getRoundEligiblePlayers(room);

  io.to(room.roomId).emit("round_start", {
    roomId: room.roomId,
    mode: room.mode,
    topic: room.topic,
    difficulty: room.difficulty,
    qIndex: room.qIndex,
    question: safePublicQuestion(q),
    deadlineMs: room.deadlineMs,
    serverNowMs: Date.now(),
    scores: room.scores,
    players: sanitizePlayers(room.players),
    activeUids: eligiblePlayers.map((p) => p.uid),
    aliveUids: getAlivePlayers(room).map((p) => p.uid),
  });

  room.roundTimer = setTimeout(() => {
    finalizeRound(room);
  }, QUESTION_TIME_MS + 30);
}

function endMatch(room: Room, reason: string, extras?: Record<string, unknown>) {
  clearTimers(room);

  const ranking = buildRanking(room);

  io.to(room.roomId).emit("match_end", {
    roomId: room.roomId,
    mode: room.mode,
    topic: room.topic,
    difficulty: room.difficulty,
    scores: room.scores,
    ranking,
    reason,
    ...extras,
  });

  room.status = "postgame";
  room.rematch = undefined;
  room.countdownEndAtMs = undefined;
  room.presentUids = [];
  room.reservedHostUid = room.hostUid;

  ensureValidHost(room);
  emitRoomState(room, { reason });
  scheduleRoomDeletion(room);
}

function maybeFinishRoundEarly(room: Room) {
  if (room.status !== "playing") return;

  const eligiblePlayers = getRoundEligiblePlayers(room);
  if (eligiblePlayers.length === 0) {
    finalizeRound(room);
    return;
  }

  const allAnswered = eligiblePlayers.every((p) => room.roundAnswers[p.uid] !== undefined);
  if (!allAnswered) return;

  setTimeout(() => {
    const still = rooms.get(room.roomId);
    if (!still) return;
    finalizeRound(still);
  }, 20);
}

function finalizeRound(room: Room) {
  if (room.status !== "playing") return;

  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.roundTimer = undefined;
  room.revealTimer = undefined;

  const q = room.questions[room.qIndex];
  if (!q) return;

  const eligiblePlayers = getRoundEligiblePlayers(room);

  if (room.mode === "classic") {
    for (const player of eligiblePlayers) {
      const answer = room.roundAnswers[player.uid];
      if (!answer) continue;

      if (answer.choiceIndex === q.correctIndex) {
        const points = calculatePoints(answer.timeLeftMs);
        room.scores[player.uid] = (room.scores[player.uid] ?? 0) + points;
      }
    }
  } else {
    for (const player of eligiblePlayers) {
      const answer = room.roundAnswers[player.uid];
      const isCorrect = answer?.choiceIndex === q.correctIndex;

      if (isCorrect) {
        const points = calculatePoints(answer.timeLeftMs);
        room.scores[player.uid] = (room.scores[player.uid] ?? 0) + points;
      } else {
        player.alive = false;
        player.eliminatedAtQuestion = room.qIndex;
      }
    }
  }

  const answersSummary = room.players.map((player) => {
    const answer = room.roundAnswers[player.uid];
    const isCorrect = answer?.choiceIndex === q.correctIndex;

    return {
      uid: player.uid,
      name: player.name,
      choiceIndex: answer?.choiceIndex ?? null,
      isCorrect: !!isCorrect,
      timeLeftMs: answer?.timeLeftMs ?? null,
      alive: player.alive,
      eliminatedAtQuestion: player.eliminatedAtQuestion ?? null,
    };
  });

  const alivePlayers = getAlivePlayers(room);

  io.to(room.roomId).emit("round_result", {
    roomId: room.roomId,
    mode: room.mode,
    topic: room.topic,
    difficulty: room.difficulty,
    qIndex: room.qIndex,
    correctIndex: q.correctIndex,
    scores: room.scores,
    answersSummary,
    aliveCount: alivePlayers.length,
    aliveUids: alivePlayers.map((p) => p.uid),
  });

  room.revealTimer = setTimeout(() => {
    const still = rooms.get(room.roomId);
    if (!still) return;
    if (still.status !== "playing") return;

    if (still.mode === "survival") {
      const stillAlive = getAlivePlayers(still);

      if (stillAlive.length <= 1) {
        const winner = stillAlive[0] ?? null;
        endMatch(still, "survival_last_alive", {
          winnerUid: winner?.uid ?? null,
          winnerName: winner?.name ?? null,
        });
        return;
      }
    }

    still.qIndex += 1;

    const done = still.qIndex >= still.questions.length;
    if (done) {
      endMatch(still, "normal_finish");
      return;
    }

    startRound(still);
  }, REVEAL_MS);
}

function removePlayerFromRoom(room: Room, uid: string) {
  const beforeHostUid = room.hostUid;

  if (room.reservedHostUid === uid) {
    room.reservedHostUid = undefined;
  }

  room.players = room.players.filter((p) => p.uid !== uid);
  room.presentUids = room.presentUids.filter((x) => x !== uid);
  delete room.scores[uid];
  delete room.roundAnswers[uid];

  if (room.rematch) {
    delete room.rematch.accepts[uid];

    if (room.rematch.offerUid === uid) {
      room.rematch.offerUid = chooseNextHostUid(room);
    }

    if (!room.rematch.offerUid) {
      room.rematch = undefined;
    }
  }

  ensureValidHost(room);

  return {
    hostChanged: beforeHostUid !== room.hostUid && !!room.hostUid,
    newHostUid: room.hostUid || null,
  };
}

function handlePlayerLeft(
  room: Room,
  uid: string,
  source: "leave_room" | "disconnect"
) {
  const leftPlayer = getPlayer(room, uid);
  const leftPlayerName = leftPlayer?.name ?? uid;
  const leftPlayerWasAlive = leftPlayer?.alive ?? false;

  const { hostChanged, newHostUid } = removePlayerFromRoom(room, uid);

  if (room.players.length === 0) {
    clearTimers(room);
    rooms.delete(room.roomId);
    console.log("room deleted (empty):", room.roomId);
    return;
  }

  if (room.status === "waiting") {
    emitRoomState(room, {
      reason: "player_left",
      leftUid: uid,
      leftName: leftPlayerName,
      source,
      hostChanged,
      newHostUid,
    });
    return;
  }

  if (room.status === "countdown") {
    const connectedUids = getConnectedUidSet();
    const readyPlayers = room.players.filter(
      (p) => connectedUids.has(p.uid) && room.presentUids.includes(p.uid)
    );

    if (readyPlayers.length < MIN_START_PLAYERS) {
      clearTimers(room);
      room.status = "waiting";
      room.countdownEndAtMs = undefined;
      room.players = readyPlayers;
      room.presentUids = readyPlayers.map((p) => p.uid);
      ensureValidHost(room);

      emitRoomState(room, {
        reason: "not_enough_players",
        leftUid: uid,
        leftName: leftPlayerName,
        source,
        hostChanged,
        newHostUid,
      });
      return;
    }

    emitRoomState(room, {
      reason: "player_left",
      leftUid: uid,
      leftName: leftPlayerName,
      source,
      hostChanged,
      newHostUid,
    });
    return;
  }

  if (room.status === "playing") {
    io.to(room.roomId).emit("player_left", {
      roomId: room.roomId,
      leftUid: uid,
      leftName: leftPlayerName,
      leftWasAlive: leftPlayerWasAlive,
      source,
    });

    if (room.mode === "survival") {
      const alivePlayers = getAlivePlayers(room);

      if (alivePlayers.length <= 1) {
        const winner = alivePlayers[0] ?? null;
        endMatch(room, "all_others_left", {
          winnerUid: winner?.uid ?? null,
          winnerName: winner?.name ?? null,
          leftUid: uid,
          leftName: leftPlayerName,
        });
        return;
      }
    } else {
      if (room.players.length === 1) {
        const winner = room.players[0];
        endMatch(room, "all_others_left", {
          winnerUid: winner.uid,
          winnerName: winner.name,
          leftUid: uid,
          leftName: leftPlayerName,
        });
        return;
      }
    }

    emitRoomState(room, {
      reason: "player_left",
      leftUid: uid,
      leftName: leftPlayerName,
      source,
      hostChanged,
      newHostUid,
    });

    maybeFinishRoundEarly(room);
    return;
  }

  if (room.status === "postgame") {
    emitRoomState(room, {
      reason: "player_left",
      leftUid: uid,
      leftName: leftPlayerName,
      source,
      hostChanged,
      newHostUid,
    });

    if (room.players.length === 1) {
      scheduleRoomDeletion(room);
    }

    return;
  }
}

io.on("connection", (socket: Socket) => {
  console.log("connected:", socket.id);

  socket.on("auth", (payload: { uid: string; name?: string }, ack?: Function) => {
    const uid = String(payload?.uid || "").trim();
    const name = String(payload?.name || uid).trim() || uid;

    if (!uid) return ack?.({ ok: false, error: "Missing uid" });

    socketProfiles.set(socket.id, { uid, name });
    console.log("auth ok:", socket.id, "uid:", uid, "name:", name);
    ack?.({ ok: true, profile: { uid, name } });
  });

  socket.on("get_room_state", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    ensureValidHost(room);
    const presentPlayers = getPresentPlayers(room);

    return ack?.({
      ok: true,
      room: {
        roomId: room.roomId,
        mode: room.mode,
        status: room.status,
        hostUid: room.hostUid,
        hostName: getPlayerName(room, room.hostUid),
        maxPlayers: getRoomMaxPlayers(room.mode),
        players: sanitizePlayers(presentPlayers),
        playerCount: presentPlayers.length,
        presentUids: [...room.presentUids],
        aliveCount: getAlivePlayers(room).length,
        aliveUids: getAlivePlayers(room).map((p) => p.uid),
        countdownEndAtMs: room.countdownEndAtMs ?? null,
        serverNowMs: Date.now(),
        topic: room.topic,
        difficulty: room.difficulty,
      },
    });
  });

  socket.on("get_state", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    if (room.status !== "playing") {
      return ack?.({ ok: false, error: "Room not playing" });
    }

    const q = room.questions[room.qIndex];
    if (!q) return ack?.({ ok: false, error: "No question" });

    const me = getPlayer(room, uid);
    const meAlive = me?.alive ?? false;
    const locked = room.roundAnswers[uid] !== undefined;

    return ack?.({
      ok: true,
      round: {
        roomId: room.roomId,
        mode: room.mode,
        topic: room.topic,
        difficulty: room.difficulty,
        qIndex: room.qIndex,
        question: safePublicQuestion(q),
        deadlineMs: room.deadlineMs,
        serverNowMs: Date.now(),
        scores: room.scores,
        players: sanitizePlayers(room.players),
        activeUids: getRoundEligiblePlayers(room).map((p) => p.uid),
        aliveUids: getAlivePlayers(room).map((p) => p.uid),
        meAlive,
        locked,
      },
    });
  });

  socket.on(
    "create_room",
    (
      payload:
        | {
            mode?: RoomMode;
            topic?: Topic;
            difficulty?: Difficulty;
          }
        | undefined,
      ack?: Function
    ) => {
      const profile = getProfile(socket);
      if (!profile) return ack?.({ ok: false, error: "Not authenticated" });

      let roomId = genRoomId();
      while (rooms.has(roomId)) roomId = genRoomId();

      const mode: RoomMode = payload?.mode === "survival" ? "survival" : "classic";
      const topic: Topic = (payload?.topic ?? "react-native") as Topic;
      const difficulty: Difficulty = (payload?.difficulty ?? "easy") as Difficulty;

      const room: Room = {
        roomId,
        mode,
        status: "waiting",
        hostUid: profile.uid,
        reservedHostUid: undefined,
        players: [
          {
            uid: profile.uid,
            name: profile.name,
            alive: true,
          },
        ],
        presentUids: [profile.uid],

        topic,
        difficulty,

        questions: [],
        qIndex: 0,
        deadlineMs: 0,
        scores: {},
        roundAnswers: {},
      };

      rooms.set(roomId, room);
      socket.join(roomId);

      console.log(
        "room created:",
        roomId,
        "host:",
        profile.uid,
        "mode:",
        mode,
        "topic:",
        topic,
        "difficulty:",
        difficulty
      );

      ack?.({ ok: true, roomId, mode, topic, difficulty });

      emitRoomState(room);
    }
  );

  socket.on("join_room", (payload: { roomId: string }, ack?: Function) => {
    const profile = getProfile(socket);
    if (!profile) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) {
      return ack?.({ ok: false, error: "Sai mã phòng / phòng không tồn tại" });
    }

    const alreadyInRoom = hasPlayer(room, profile.uid);

    if (!alreadyInRoom && room.status !== "waiting") {
      return ack?.({ ok: false, error: "Phòng không còn chờ" });
    }

    const roomMaxPlayers = getRoomMaxPlayers(room.mode);
    if (!alreadyInRoom && room.players.length >= roomMaxPlayers) {
      return ack?.({ ok: false, error: `Phòng đã đủ ${roomMaxPlayers} người` });
    }

    if (!alreadyInRoom) {
      room.players.push({
        uid: profile.uid,
        name: profile.name,
        alive: true,
      });
    } else {
      room.players = room.players.map((p) =>
        p.uid === profile.uid ? { ...p, name: profile.name } : p
      );
    }

    ensureValidHost(room);
    socket.join(roomId);

    if (room.status === "waiting") {
      addPresentUid(room, profile.uid);
      ensureValidHost(room);
    }

    console.log(
      "room joined:",
      roomId,
      "uid:",
      profile.uid,
      "mode:",
      room.mode,
      "topic:",
      room.topic,
      "difficulty:",
      room.difficulty
    );

    ack?.({
      ok: true,
      roomId,
      mode: room.mode,
      topic: room.topic,
      difficulty: room.difficulty,
      rejoined: alreadyInRoom,
      status: room.status,
    });

    emitRoomState(room, { reason: alreadyInRoom ? "rejoin" : "player_joined" });
  });

  socket.on("leave_room", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);

    if (!room) return ack?.({ ok: false, error: "Room not found" });
    if (!hasPlayer(room, uid)) {
      return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
    }

    socket.leave(roomId);
    handlePlayerLeft(room, uid, "leave_room");

    ack?.({ ok: true });
  });

  socket.on("exit_room_view", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    if (!hasPlayer(room, uid)) {
      return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
    }

    removePresentUid(room, uid);

    if (room.reservedHostUid === uid) {
      room.reservedHostUid = undefined;
    }

    ensureValidHost(room);

    emitRoomState(room, {
      reason: "exit_room_view",
      byUid: uid,
      byName: getPlayerName(room, uid),
    });

    return ack?.({ ok: true });
  });

  socket.on("back_to_room", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found" });
    if (!hasPlayer(room, uid)) {
      return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
    }

    socket.join(roomId);

    if (room.status === "postgame") {
      resetRoomToLobby(room);
      addPresentUid(room, uid);

      if (uid === room.hostUid) {
        room.reservedHostUid = undefined;
      }

      ensureValidHost(room);

      emitRoomState(room, {
        reason: "back_to_room",
        byUid: uid,
        byName: getPlayerName(room, uid),
      });

      return ack?.({
        ok: true,
        roomId,
        status: room.status,
        mode: room.mode,
        topic: room.topic,
        difficulty: room.difficulty,
      });
    }

    if (room.status === "waiting") {
      addPresentUid(room, uid);

      if (uid === room.hostUid) {
        room.reservedHostUid = undefined;
      }

      ensureValidHost(room);
    }

    emitRoomState(room, {
      reason: "back_to_room",
      byUid: uid,
      byName: getPlayerName(room, uid),
    });

    return ack?.({
      ok: true,
      roomId,
      status: room.status,
      mode: room.mode,
      topic: room.topic,
      difficulty: room.difficulty,
    });
  });

  socket.on(
    "start_game",
    async (
      payload: {
        roomId: string;
        topic?: Topic;
        difficulty?: Difficulty;
      },
      ack?: Function
    ) => {
      const uid = getUid(socket);
      if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

      const roomId = String(payload?.roomId || "").toUpperCase().trim();
      const room = rooms.get(roomId);
      if (!room) return ack?.({ ok: false, error: "Room not found" });

      ensureValidHost(room);

      if (room.hostUid !== uid) {
        return ack?.({ ok: false, error: "Chỉ host mới được Start" });
      }

      if (room.status !== "waiting") {
        return ack?.({ ok: false, error: "Phòng không ở trạng thái waiting" });
      }

      if (!isPresentInRoom(room, uid)) {
        return ack?.({ ok: false, error: "Bạn chưa ở màn phòng" });
      }

      const connectedUids = getConnectedUidSet();
      const readyPlayers = room.players.filter(
        (p) => connectedUids.has(p.uid) && room.presentUids.includes(p.uid)
      );

      if (readyPlayers.length < MIN_START_PLAYERS) {
        emitRoomState(room, { reason: "not_enough_players" });
        return ack?.({
          ok: false,
          error: `Cần tối thiểu ${MIN_START_PLAYERS} người đang ở trong phòng để bắt đầu`,
        });
      }

      room.topic = (payload?.topic ?? room.topic ?? "react-native") as Topic;
      room.difficulty = (payload?.difficulty ?? room.difficulty ?? "easy") as Difficulty;

      room.players = readyPlayers.map((p) => ({
        ...p,
        alive: true,
        eliminatedAtQuestion: undefined,
      }));
      room.presentUids = readyPlayers.map((p) => p.uid);
      ensureValidHost(room);

      try {
        await prepareNewMatch(room, QUESTIONS_PER_MATCH);

        if (!room.questions.length) {
          emitRoomState(room, { reason: "no_questions" });
          return ack?.({
            ok: false,
            error: "Không có câu hỏi phù hợp trong Firebase",
          });
        }

        console.log(
          "start_game -> countdown:",
          roomId,
          "by host:",
          uid,
          "mode:",
          room.mode,
          "questions:",
          room.questions.length
        );

        ack?.({
          ok: true,
          mode: room.mode,
          topic: room.topic,
          difficulty: room.difficulty,
          questionCount: room.questions.length,
        });

        beginCountdown(room);
      } catch (error) {
        console.error("start_game firebase error:", error);
        emitRoomState(room, { reason: "load_questions_failed" });
        return ack?.({
          ok: false,
          error: "Không tải được câu hỏi từ Firebase",
        });
      }
    }
  );

  socket.on(
    "submit_answer",
    (payload: { roomId: string; qIndex: number; choiceIndex: number }, ack?: Function) => {
      const uid = getUid(socket);
      if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

      const roomId = String(payload?.roomId || "").toUpperCase().trim();
      const room = rooms.get(roomId);
      if (!room) return ack?.({ ok: false, error: "Room not found" });

      if (room.status !== "playing") {
        return ack?.({ ok: false, error: "Game chưa bắt đầu" });
      }

      if (!hasPlayer(room, uid)) {
        return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
      }

      if (payload.qIndex !== room.qIndex) {
        return ack?.({ ok: false, error: "Sai qIndex" });
      }

      if (Date.now() > room.deadlineMs) {
        return ack?.({ ok: false, error: "Hết giờ" });
      }

      const q = room.questions[room.qIndex];
      if (!q) return ack?.({ ok: false, error: "Không có câu hỏi" });

      if (
        typeof payload.choiceIndex !== "number" ||
        payload.choiceIndex < 0 ||
        payload.choiceIndex >= q.options.length
      ) {
        return ack?.({ ok: false, error: "choiceIndex không hợp lệ" });
      }

      const me = getPlayer(room, uid);
      if (!me) {
        return ack?.({ ok: false, error: "Không tìm thấy người chơi" });
      }

      if (room.mode === "survival" && !me.alive) {
        return ack?.({ ok: false, error: "Bạn đã bị loại" });
      }

      if (room.roundAnswers[uid] !== undefined) {
        return ack?.({ ok: true, locked: true });
      }

      const now = Date.now();
      const timeLeftMs = Math.max(0, room.deadlineMs - now);

      room.roundAnswers[uid] = {
        choiceIndex: payload.choiceIndex,
        answeredAtMs: now,
        timeLeftMs,
      };

      ack?.({
        ok: true,
        locked: true,
        timeLeftMs,
      });

      maybeFinishRoundEarly(room);
    }
  );

  socket.on("rematch_request", (payload: { roomId: string }, ack?: Function) => {
    const uid = getUid(socket);
    if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

    const roomId = String(payload?.roomId || "").toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    if (room.status !== "postgame") {
      return ack?.({ ok: false, error: "Chưa ở postgame" });
    }

    if (!hasPlayer(room, uid)) {
      return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
    }

    if (!room.rematch) {
      room.rematch = { offerUid: uid, accepts: { [uid]: true } };
    } else {
      room.rematch.offerUid = uid;
      room.rematch.accepts[uid] = true;
    }

    io.to(roomId).emit("rematch_offered", {
      roomId,
      mode: room.mode,
      topic: room.topic,
      difficulty: room.difficulty,
      fromUid: uid,
      fromName: getPlayerName(room, uid),
    });

    ack?.({ ok: true });
  });

  socket.on(
    "rematch_answer",
    async (payload: { roomId: string; accept: boolean }, ack?: Function) => {
      const uid = getUid(socket);
      if (!uid) return ack?.({ ok: false, error: "Not authenticated" });

      const roomId = String(payload?.roomId || "").toUpperCase().trim();
      const room = rooms.get(roomId);
      if (!room) return ack?.({ ok: false, error: "Room not found" });

      if (room.status !== "postgame") {
        return ack?.({ ok: false, error: "Không ở postgame" });
      }

      if (!hasPlayer(room, uid)) {
        return ack?.({ ok: false, error: "Bạn không ở trong phòng" });
      }

      if (!room.rematch) {
        return ack?.({ ok: false, error: "Chưa có lời mời rematch" });
      }

      room.rematch.accepts[uid] = !!payload.accept;
      ack?.({ ok: true });

      if (!payload.accept) {
        io.to(roomId).emit("rematch_declined", {
          roomId,
          mode: room.mode,
          topic: room.topic,
          difficulty: room.difficulty,
          byUid: uid,
          byName: getPlayerName(room, uid),
        });

        room.rematch = undefined;
        ensureValidHost(room);
        emitRoomState(room, { reason: "rematch_declined" });
        return;
      }

      const allAccepted = room.players.every(
        (p) => room.rematch?.accepts[p.uid] === true
      );
      if (!allAccepted) return;

      try {
        clearTimers(room);
        await prepareNewMatch(room, QUESTIONS_PER_MATCH);

        if (!room.questions.length) {
          room.rematch = undefined;
          emitRoomState(room, { reason: "no_questions" });
          io.to(roomId).emit("rematch_failed", {
            roomId,
            error: "Không có câu hỏi phù hợp trong Firebase",
          });
          return;
        }

        room.status = "waiting";
        room.rematch = undefined;
        room.countdownEndAtMs = undefined;
        room.presentUids = [];
        room.reservedHostUid = room.hostUid;
        ensureValidHost(room);

        emitRoomState(room);
        io.to(roomId).emit("rematch_ready", {
          roomId,
          mode: room.mode,
          topic: room.topic,
          difficulty: room.difficulty,
        });

        setTimeout(() => {
          const still = rooms.get(roomId);
          if (!still) return;
          if (still.status !== "waiting") return;
          if (still.players.length < MIN_START_PLAYERS) return;
          beginCountdown(still);
        }, 400);
      } catch (error) {
        console.error("rematch firebase error:", error);
        room.rematch = undefined;
        emitRoomState(room, { reason: "load_questions_failed" });
        io.to(roomId).emit("rematch_failed", {
          roomId,
          error: "Không tải được câu hỏi từ Firebase",
        });
      }
    }
  );

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);

    const profile = socketProfiles.get(socket.id);
    socketProfiles.delete(socket.id);

    if (!profile) return;

    for (const room of rooms.values()) {
      if (hasPlayer(room, profile.uid)) {
        handlePlayerLeft(room, profile.uid, "disconnect");
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

httpServer.listen(PORT, HOST, () => {
  console.log(`Socket.IO server running on ${HOST}:${PORT}`);
});