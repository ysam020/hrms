import { useState, useEffect, useRef } from "react";

const AnimatedClock = ({ targetDate, onExpire, theme, sessionColor }) => {
  const [time, setTime] = useState({ minutes: 0, seconds: 0 });
  const workerRef = useRef<Worker | null>(null);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!targetDate) return;

    // Lazy-create the timer worker once
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../../core/workers/timer.worker.ts", import.meta.url),
      );
    }

    const worker = workerRef.current;

    worker.onmessage = ({ data }) => {
      if (data.type === "tick") {
        setTime({ minutes: data.minutes, seconds: data.seconds });
      } else if (data.type === "expired") {
        onExpire && onExpire();
      }
    };

    worker.postMessage({ type: "start", targetDate });

    return () => {
      worker.postMessage({ type: "stop" });
    };
  }, [targetDate, onExpire]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        borderRadius: "24px",
        background:
          theme === "light"
            ? "linear-gradient(135deg, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.05) 100%)"
            : "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.08) 100%)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${
          theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)"
        }`,
        transition: "all 0.3s ease",
        boxShadow:
          theme === "light"
            ? "0 2px 8px rgba(0, 0, 0, 0.04)"
            : "0 2px 8px rgba(0, 0, 0, 0.2)",
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: sessionColor,
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          boxShadow: `0 0 8px ${sessionColor}`,
        }}
      />
      <div
        style={{
          fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
          fontSize: "12px",
          fontWeight: "600",
          color: sessionColor,
          letterSpacing: "0.8px",
        }}
      >
        {String(time.minutes).padStart(2, "0")}:
        {String(time.seconds).padStart(2, "0")}
      </div>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(0.85); }
          }
        `}
      </style>
    </div>
  );
};

export default AnimatedClock;
