import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useRef, useState } from "react";
import StatsImpl from "stats.js";

function StatsInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useHotkey({ key: "~", shift: true }, () => {
    setVisible((val) => !val);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !visible) return;

    const panels = [0, 1, 2].map((id) => {
      const stats = new StatsImpl();
      stats.showPanel(id);
      stats.dom.style.position = "relative";
      container.appendChild(stats.dom);
      return stats;
    });

    let frame: number;
    function loop() {
      for (const stats of panels) stats.update();
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      for (const stats of panels) container.removeChild(stats.dom);
    };
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 9999,
        display: "flex",
      }}
    />
  );
}

export function Stats() {
  if (!import.meta.env.DEV) return null;
  return <StatsInner />;
}
