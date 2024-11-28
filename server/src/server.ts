import "dotenv/config";
import express from "express";
import axios from "axios";
import cors from "cors";
import { Server as SocketServer } from "socket.io";
import { createServer } from "http";

interface User {
  socketId: string;
  sessionId: string | null;
  connectionId: string | null;
}

interface Session {
  sessionId: string;
  users: User[];
}

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const OPENVIDU_URL =
  process.env.OPENVIDU_URL || "https://openvidu.toktok.mcv.kr";
const OPENVIDU_SECRET = process.env.OPENVIDU_SECRET || "MY_SECRET";
const basicAuth = Buffer.from(`OPENVIDUAPP:${OPENVIDU_SECRET}`).toString(
  "base64"
);

const waitingUsers: User[] = [];
const activeSessions: Session[] = [];

async function createOpenViduSession(): Promise<string> {
  try {
    const response = await axios.post(
      `${OPENVIDU_URL}/openvidu/api/sessions`,
      {},
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.id;
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      return error.response.data.sessionId;
    }
    throw new Error("Failed to create session: " + error.message);
  }
}

async function createOpenViduToken(sessionId: string): Promise<string> {
  try {
    const response = await axios.post(
      `${OPENVIDU_URL}/openvidu/api/sessions/${sessionId}/connection`,
      {},
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.token;
  } catch (error: any) {
    throw new Error("Failed to create token: " + error.message);
  }
}

async function handleMatching(user1: User, user2: User) {
  try {
    const sessionId = await createOpenViduSession();
    const token1 = await createOpenViduToken(sessionId);
    const token2 = await createOpenViduToken(sessionId);

    user1.sessionId = sessionId;
    user2.sessionId = sessionId;

    const session: Session = {
      sessionId,
      users: [user1, user2],
    };

    activeSessions.push(session);

    io.to(user1.socketId).emit("matched", { token: token1, sessionId });
    io.to(user2.socketId).emit("matched", { token: token2, sessionId });
  } catch (error) {
    console.error("Matching error:", error);
    io.to(user1.socketId).emit("error", {
      message: "매칭 중 오류가 발생했습니다.",
    });
    io.to(user2.socketId).emit("error", {
      message: "매칭 중 오류가 발생했습니다.",
    });
  }
}

function findSession(socketId: string): Session | undefined {
  return activeSessions.find((session) =>
    session.users.some((user) => user.socketId === socketId)
  );
}

function getOtherUserInSession(
  session: Session,
  socketId: string
): User | undefined {
  return session.users.find((user) => user.socketId !== socketId);
}

function removeFromWaiting(socketId: string) {
  const index = waitingUsers.findIndex((user) => user.socketId === socketId);
  if (index !== -1) {
    waitingUsers.splice(index, 1);
  }
}

function removeFromSession(socketId: string) {
  const sessionIndex = activeSessions.findIndex((session) =>
    session.users.some((user) => user.socketId === socketId)
  );

  if (sessionIndex !== -1) {
    const session = activeSessions[sessionIndex];
    const otherUser = getOtherUserInSession(session, socketId);

    if (otherUser) {
      io.to(otherUser.socketId).emit("peerLeft");
    }

    activeSessions.splice(sessionIndex, 1);
  }
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("requestMatch", () => {
    const user: User = {
      socketId: socket.id,
      sessionId: null,
      connectionId: null,
    };

    if (waitingUsers.length > 0) {
      const matchedUser = waitingUsers.shift()!;
      handleMatching(user, matchedUser);
    } else {
      waitingUsers.push(user);
      socket.emit("waiting");
    }
  });

  socket.on("cancelMatch", () => {
    removeFromWaiting(socket.id);
  });

  socket.on("leaveSession", () => {
    removeFromSession(socket.id);
    // 새로운 매칭을 위한 상태 초기화
  });

  socket.on("chat-message", (message: { text: string }) => {
    const session = findSession(socket.id);
    if (session) {
      const otherUser = getOtherUserInSession(session, socket.id);
      if (otherUser) {
        io.to(otherUser.socketId).emit("chat-message", message);
      }
    }
  });

  socket.on("typing", (isTyping: boolean) => {
    const session = findSession(socket.id);
    if (session) {
      const otherUser = getOtherUserInSession(session, socket.id);
      if (otherUser) {
        io.to(otherUser.socketId).emit("typing", isTyping);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    removeFromWaiting(socket.id);
    removeFromSession(socket.id);
  });

  // 화면 공유 관련 이벤트
  socket.on("screen-share-started", () => {
    const session = findSession(socket.id);
    if (session) {
      const otherUser = getOtherUserInSession(session, socket.id);
      if (otherUser) {
        io.to(otherUser.socketId).emit("peer-screen-share-started");
      }
    }
  });

  socket.on("screen-share-stopped", () => {
    const session = findSession(socket.id);
    if (session) {
      const otherUser = getOtherUserInSession(session, socket.id);
      if (otherUser) {
        io.to(otherUser.socketId).emit("peer-screen-share-stopped");
      }
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
