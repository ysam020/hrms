import { useEffect } from "react";
import { useSocket } from "@web/app/providers/SocketContext";

// The shared socket connects asynchronously after mount (see SocketContext),
// so a plain socket.on() at render time can miss it — poll briefly until
// the ref is populated, matching the pattern already used in
// useNotifications.tsx.
function useSocketEvent<T = any>(
  eventName: string,
  handler: (data: T) => void,
) {
  const { socketRef } = useSocket();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let subscribedSocket: any = null;

    const subscribeWhenReady = () => {
      const socket = socketRef.current;
      if (!socket) return false;
      socket.on(eventName, handler);
      subscribedSocket = socket;
      return true;
    };

    if (!subscribeWhenReady()) {
      intervalId = setInterval(() => {
        if (subscribeWhenReady()) clearInterval(intervalId);
      }, 100);
    }

    return () => {
      clearInterval(intervalId);
      if (subscribedSocket) subscribedSocket.off(eventName, handler);
    };
  }, [eventName, handler, socketRef]);
}

export default useSocketEvent;
