import { useRef, useState, useCallback } from "react";

const SUPPORTED =
  typeof window !== "undefined" && typeof window.Profiler === "function";

function useProfiler({ sampleInterval = 10, maxBufferSize = 10000 } = {}) {
  const profilerRef = useRef<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);

  const start = useCallback(() => {
    if (!SUPPORTED || profilerRef.current) return;
    try {
      profilerRef.current = new window.Profiler({
        sampleInterval,
        maxBufferSize,
      });
      setIsActive(true);
    } catch (e) {
      // unsupported or policy not set
    }
  }, [sampleInterval, maxBufferSize]);

  const stop = useCallback(async () => {
    if (!profilerRef.current) return;
    try {
      const trace = await profilerRef.current.stop();
      profilerRef.current = null;
      setIsActive(false);
      setLastTrace(trace);
      return trace;
    } catch (e) {
      // ignore
    }
  }, []);

  // Cancel without showing results (e.g. Escape while recording)
  const cancel = useCallback(async () => {
    if (!profilerRef.current) return;
    try {
      await profilerRef.current.stop();
    } catch (e) {
      // ignore
    }
    profilerRef.current = null;
    setIsActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (isActive) {
      stop();
    } else {
      start();
    }
  }, [isActive, start, stop]);

  const clear = useCallback(() => setLastTrace(null), []);

  return {
    isActive,
    lastTrace,
    start,
    stop,
    cancel,
    toggle,
    clear,
    supported: SUPPORTED,
  };
}

export default useProfiler;
