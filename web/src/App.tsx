import { useState, useEffect, useCallback, useRef } from "react";
import { OpenVidu, Session, Publisher, StreamManager } from "openvidu-browser";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  IoVideocam,
  IoVideocamOff,
  IoMic,
  IoMicOff,
  IoRefresh,
  IoClose,
  IoWarning,
  IoSend,
  IoChatbubble,
} from "react-icons/io5";
import { MdScreenShare, MdStopScreenShare } from "react-icons/md";
import { BiExit } from "react-icons/bi";
import { ReactNode } from "react";

interface ControlButtonProps {
  onClick: () => void;
  icon: ReactNode;
  activeIcon: ReactNode;
  isActive: boolean;
  activeColor?: string;
}

interface Message {
  text: string;
  isMine: boolean;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [subscriber, setSubscriber] = useState<StreamManager | null>(null);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const OV = useRef<OpenVidu | null>(null);

  useEffect(() => {
    const newSocket = io("https://api.toktok.mcv.kr");
    setSocket(newSocket);
    return () => {
      newSocket.close();
    };
  }, []);

  const initializeSession = useCallback(async (token: string) => {
    try {
      if (!OV.current) {
        OV.current = new OpenVidu();
      }

      const newSession = OV.current.initSession();

      newSession.on("streamCreated", (event) => {
        const newSubscriber = newSession.subscribe(event.stream, "subscriber");
        setSubscriber(newSubscriber);
      });

      newSession.on("streamDestroyed", () => {
        setSubscriber(null);
      });

      setSession(newSession);
      await newSession.connect(token);

      const newPublisher = await OV.current.initPublisher("publisher", {
        audioSource: undefined,
        videoSource: undefined,
        publishAudio: true,
        publishVideo: true,
        resolution: "640x480",
        frameRate: 30,
        insertMode: "APPEND",
        mirror: false,
      });

      await newSession.publish(newPublisher);
      setPublisher(newPublisher);
      setIsConnecting(false);
      setIsWaiting(false);
    } catch (err) {
      console.error("Session initialization error:", err);
      setError("화상 채팅 연결에 실패했습니다.");
      setIsConnecting(false);
      setIsWaiting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (session) {
      session.disconnect();
      setSession(null);
      setPublisher(null);
      setSubscriber(null);
      setIsMuted(false);
      setIsVideoOff(false);
      setIsScreenSharing(false);
      setMessages([]);
    }
  }, [session]);

  useEffect(() => {
    if (!socket) return;

    socket.on("matched", ({ token }) => {
      initializeSession(token);
    });

    socket.on("waiting", () => {
      setIsWaiting(true);
    });

    socket.on("peerLeft", () => {
      disconnect();
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setIsConnecting(false);
      setIsWaiting(false);
    });

    socket.on("chat-message", (message: { text: string }) => {
      setMessages((prev) => [...prev, { text: message.text, isMine: false }]);
    });

    return () => {
      socket.off("matched");
      socket.off("waiting");
      socket.off("peerLeft");
      socket.off("error");
      socket.off("chat-message");
    };
  }, [socket, initializeSession, disconnect]);

  const startMatching = () => {
    setIsConnecting(true);
    setError("");
    socket?.emit("requestMatch");
  };

  const cancelMatching = () => {
    socket?.emit("cancelMatch");
    setIsConnecting(false);
    setIsWaiting(false);
  };

  const toggleAudio = () => {
    if (publisher) {
      publisher.publishAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (publisher) {
      publisher.publishVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!session || !publisher || !OV.current) return;

    try {
      if (!isScreenSharing) {
        const screenPublisher = await OV.current.initPublisher(undefined, {
          videoSource: "screen",
          publishAudio: false,
        });
        await session.unpublish(publisher);
        await session.publish(screenPublisher);
        setPublisher(screenPublisher);
        setIsScreenSharing(true);
      } else {
        const videoPublisher = await OV.current.initPublisher(undefined, {
          videoSource: undefined,
          publishAudio: !isMuted,
        });
        await session.unpublish(publisher);
        await session.publish(videoPublisher);
        setPublisher(videoPublisher);
        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Screen sharing error:", err);
    }
  };

  const sendMessage = () => {
    if (!currentMessage.trim()) return;

    socket?.emit("chat-message", { text: currentMessage });
    setMessages((prev) => [...prev, { text: currentMessage, isMine: true }]);
    setCurrentMessage("");
  };

  const ControlButton = ({
    onClick,
    icon,
    activeIcon,
    isActive,
    activeColor = "red",
  }: ControlButtonProps) => (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`p-4 rounded-xl transition-all duration-200 
                ${
                  isActive
                    ? `bg-${activeColor}-500/20 text-${activeColor}-400`
                    : "bg-white/10 text-white/80"
                }
                hover:shadow-lg backdrop-blur-sm border border-white/10`}
    >
      {isActive ? activeIcon : icon}
    </motion.button>
  );

  return !session ? (
    <div className="min-h-screen bg-[#6B7FE3] relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/home.png')] bg-cover bg-center" />
      <div className="relative z-10 max-w-7xl mx-auto p-8 h-screen flex flex-col justify-center">
        <div className="space-y-8 w-full max-w-md">
          <h1 className="text-6xl font-bold text-white">TokTok</h1>
          <p className="text-xl text-white/90">많은 매칭이 진행 중이에요</p>

          <div>
            {isConnecting || isWaiting ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center space-y-4 w-full"
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-4 border-white border-t-transparent animate-spin" />
                    <div className="absolute inset-2 rounded-full border-4 border-white/50 border-t-transparent animate-spin-reverse" />
                  </div>
                  <span className="text-white/90 font-medium">
                    {isWaiting ? "상대방을 찾는 중..." : "연결 중..."}
                  </span>
                </div>
                <button
                  onClick={cancelMatching}
                  className="px-6 py-2 text-white/90 hover:text-white transition-colors duration-200 font-medium"
                >
                  취소
                </button>
              </motion.div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startMatching}
                className="px-12 py-4 bg-white rounded-full text-[#6B7FE3] text-lg font-medium 
                     shadow-lg hover:shadow-white/25 transition-all duration-300 flex items-center gap-2"
              >
                <IoVideocam size={24} />
                비디오챗 시작하기
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-[#6B7FE3]">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center bg-black/20 backdrop-blur-md 
                 rounded-2xl px-6 py-4 mb-8 border border-white/10"
        >
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-white">TokTok</h1>
          </div>
        </motion.div>

        <div className="space-y-8">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-500/10 border border-red-500/20 text-red-400 
                       p-4 rounded-xl flex items-center space-x-3"
              >
                <IoWarning size={20} />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-8">
            <div className="flex-1 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="relative group"
                >
                  <div
                    className="aspect-video bg-black/40 rounded-2xl overflow-hidden 
                            shadow-lg group-hover:shadow-xl transition-all duration-300 
                            border border-white/10"
                  >
                    <div id="publisher" className="w-full h-full" />
                  </div>
                  <div
                    className="absolute bottom-4 left-4 px-4 py-2 bg-black/50 
                            text-white/90 rounded-full text-sm font-medium 
                            backdrop-blur-md border border-white/10"
                  >
                    나
                  </div>
                </motion.div>

                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="relative group"
                >
                  <div
                    className={`aspect-video bg-black/40 rounded-2xl overflow-hidden 
                             shadow-lg transition-all duration-300 border border-white/10
                             ${
                               subscriber
                                 ? "group-hover:shadow-xl"
                                 : "opacity-50"
                             }`}
                  >
                    <div id="subscriber" className="w-full h-full" />
                  </div>
                  <div
                    className="absolute bottom-4 left-4 px-4 py-2 bg-black/50 
                            text-white/90 rounded-full text-sm font-medium 
                            backdrop-blur-md border border-white/10"
                  >
                    {subscriber ? "상대방" : "대기 중..."}
                  </div>
                </motion.div>
              </div>

              <div className="flex justify-center gap-4">
                <ControlButton
                  onClick={toggleAudio}
                  icon={<IoMic size={24} />}
                  activeIcon={<IoMicOff size={24} />}
                  isActive={isMuted}
                />
                <ControlButton
                  onClick={toggleVideo}
                  icon={<IoVideocam size={24} />}
                  activeIcon={<IoVideocamOff size={24} />}
                  isActive={isVideoOff}
                />
                <ControlButton
                  onClick={toggleScreenShare}
                  icon={<MdScreenShare size={24} />}
                  activeIcon={<MdStopScreenShare size={24} />}
                  isActive={isScreenSharing}
                  activeColor="blue"
                />
                <ControlButton
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  icon={<IoChatbubble size={24} />}
                  activeIcon={<IoChatbubble size={24} />}
                  isActive={isChatOpen}
                  activeColor="purple"
                />
                <ControlButton
                  onClick={() => {
                    disconnect();
                    startMatching();
                  }}
                  icon={<IoRefresh size={24} />}
                  activeIcon={<IoRefresh size={24} />}
                  isActive={false}
                />
                <ControlButton
                  onClick={disconnect}
                  icon={<BiExit size={24} />}
                  activeIcon={<BiExit size={24} />}
                  isActive={true}
                />
              </div>
            </div>

            <AnimatePresence>
              {isChatOpen && (
                <motion.div
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  className="w-80 bg-black/20 backdrop-blur-xl rounded-2xl 
                         border border-white/10 flex flex-col"
                >
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium">채팅</h3>
                      <button
                        onClick={() => setIsChatOpen(false)}
                        className="text-white/80 hover:text-white"
                      >
                        <IoClose size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${
                          message.isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                            message.isMine
                              ? "bg-purple-500/20 text-purple-100"
                              : "bg-white/10 text-white/90"
                          }`}
                        >
                          {message.text}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="p-4 border-t border-white/10">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="메시지를 입력하세요..."
                        className="flex-1 bg-white/10 border border-white/20 rounded-xl 
                               px-4 py-2 text-white placeholder-white/50 outline-none 
                               focus:ring-2 focus:ring-purple-500/50"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={sendMessage}
                        className="p-2 text-white/80 hover:text-white"
                      >
                        <IoSend size={20} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
