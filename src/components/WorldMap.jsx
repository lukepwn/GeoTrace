import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { MapPinned } from "lucide-react";
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  BEACONS,
  WORD_LENGTH,
  HIT_RADIUS,
  computePrecisionBonus,
} from "../gameLogic";

const FLAG_LIFETIME_MS = 900;

// Abstract sci-fi/fantasy landmass silhouettes, purely decorative.
const ISLANDS = [
  {
    d: "M40,40 Q220,10 400,90 Q440,220 320,340 Q150,400 60,300 Q0,180 40,40 Z",
    fill: "#101a2c",
  },
  {
    d: "M420,30 Q650,0 800,120 Q820,250 680,330 Q500,360 440,240 Q400,120 420,30 Z",
    fill: "#0f1826",
  },
  {
    d: "M840,20 Q1060,10 1160,110 Q1180,240 1040,360 Q880,380 800,270 Q790,120 840,20 Z",
    fill: "#101a2c",
  },
  {
    d: "M30,460 Q220,440 380,540 Q420,680 280,830 Q120,870 40,760 Q0,600 30,460 Z",
    fill: "#0f1826",
  },
  {
    d: "M420,480 Q640,460 790,560 Q830,700 660,830 Q480,870 420,730 Q390,590 420,480 Z",
    fill: "#101a2c",
  },
  {
    d: "M840,470 Q1060,450 1160,560 Q1190,700 1030,830 Q860,870 800,740 Q790,590 840,470 Z",
    fill: "#0f1826",
  },
];

// Pointer must move less than this (px) between down/up to count as a click, not a pan.
const CLICK_DRAG_THRESHOLD = 6;
// WASD pan speed, in px/sec at 1x zoom.
const PAN_SPEED = 900;

// Keys mapped to their pan direction; inverted from arrow-key convention (W moves view up).
const PAN_KEYS = {
  w: [0, 1],
  s: [0, -1],
  a: [1, 0],
  d: [-1, 0],
};

export default function WorldMap({
  currentTrace,
  onSelectLetter,
  onNavigate,
  disabled,
}) {
  const [flags, setFlags] = useState([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutsRef = useRef(new Set());
  const pointerDownRef = useRef(null);
  const transformRef = useRef(null);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, []);

  // WASD pans the map smoothly; held keys combine into a normalized diagonal vector each frame.
  useEffect(() => {
    const pressedKeys = new Set();
    let animationFrameId = null;
    let lastTimestamp = null;

    const step = (timestamp) => {
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      let vx = 0;
      let vy = 0;
      pressedKeys.forEach((key) => {
        const dir = PAN_KEYS[key];
        if (!dir) return;
        vx += dir[0];
        vy += dir[1];
      });

      const instance = transformRef.current?.instance;
      if ((vx || vy) && instance) {
        const magnitude = Math.hypot(vx, vy) || 1;
        const { positionX, positionY, scale } = instance.transformState;
        const distance = PAN_SPEED * scale * deltaSeconds;
        transformRef.current.setTransform(
          positionX + (vx / magnitude) * distance,
          positionY + (vy / magnitude) * distance,
          scale,
          0,
        );
      }

      animationFrameId = requestAnimationFrame(step);
    };

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (!PAN_KEYS[key] || disabled) return;
      event.preventDefault();
      if (pressedKeys.size === 0) {
        lastTimestamp = null;
        animationFrameId = requestAnimationFrame(step);
      }
      pressedKeys.add(key);
    };

    const handleKeyUp = (event) => {
      const key = event.key.toLowerCase();
      pressedKeys.delete(key);
      if (pressedKeys.size === 0 && animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    const handleBlur = () => {
      pressedKeys.clear();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [disabled]);

  const tracePoints = useMemo(
    () => currentTrace.map((t) => `${t.beacon.x},${t.beacon.y}`).join(" "),
    [currentTrace],
  );

  const handlePointerDown = useCallback((event) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (disabled || !start) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_DRAG_THRESHOLD) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const mapX = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
      const mapY = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;

      let closestBeacon = null;
      let closestDistance = Infinity;
      for (const beacon of BEACONS) {
        const dxb = beacon.x - mapX;
        const dyb = beacon.y - mapY;
        const distance = Math.sqrt(dxb * dxb + dyb * dyb);
        if (distance <= HIT_RADIUS && distance < closestDistance) {
          closestDistance = distance;
          closestBeacon = beacon;
        }
      }

      const addFlag = (status, bonus) => {
        const flagId = `flag-${Date.now()}-${Math.random()}`;
        setFlags((prev) => [
          ...prev,
          { id: flagId, x: mapX, y: mapY, status, bonus },
        ]);
        const timeoutId = setTimeout(() => {
          setFlags((prev) => prev.filter((f) => f.id !== flagId));
          timeoutsRef.current.delete(timeoutId);
        }, FLAG_LIFETIME_MS);
        timeoutsRef.current.add(timeoutId);
      };

      if (!closestBeacon) {
        addFlag("miss", 0);
        return;
      }

      // Re-clicking the same beacon repositions its flag instead of adding a duplicate.
      const isReposition = currentTrace.some(
        (t) => t.beacon.id === closestBeacon.id,
      );
      const isFull = !isReposition && currentTrace.length >= WORD_LENGTH;
      if (isFull) {
        addFlag("full", 0);
        return;
      }

      const { precision, bonus } = computePrecisionBonus(closestDistance);
      addFlag("hit", bonus);
      onSelectLetter(closestBeacon, { precision, bonus, isReposition });
    },
    [disabled, currentTrace, onSelectLetter],
  );

  return (
    <div
      className={`map-viewport${isNavigating ? " map-viewport--active" : ""}`}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={2.4}
        minScale={1}
        maxScale={4}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.15 }}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: true }}
        alignmentAnimation={{ disabled: true }}
        onPanningStart={() => {
          setIsNavigating(true);
          onNavigate?.();
        }}
        onPanningStop={() => setIsNavigating(false)}
        onZoomStart={() => {
          setIsNavigating(true);
          onNavigate?.();
        }}
        onZoomStop={() => setIsNavigating(false)}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
        >
          <div
            className="world-map-canvas"
            style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <svg
              className="world-map-svg"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {ISLANDS.map((island, i) => (
                <path
                  key={i}
                  d={island.d}
                  fill={island.fill}
                  stroke="#1b2942"
                  strokeWidth={2}
                />
              ))}

              {tracePoints && (
                <polyline
                  points={tracePoints}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow)"
                  opacity={0.9}
                />
              )}
            </svg>

            {BEACONS.map((beacon) => {
              const traceEntry = currentTrace.find(
                (t) => t.beacon.id === beacon.id,
              );
              return (
                <div
                  key={beacon.id}
                  className={`beacon${traceEntry ? " beacon--selected" : ""}`}
                  style={{ left: beacon.x, top: beacon.y }}
                  title={beacon.region}
                >
                  {beacon.char}
                  {traceEntry && (
                    <span className="beacon-bonus">+{traceEntry.bonus}</span>
                  )}
                </div>
              );
            })}

            {flags.map((flag) => (
              <div
                key={flag.id}
                className={`flag-marker flag-marker--${flag.status}`}
                style={{ left: flag.x, top: flag.y }}
              >
                <span className="flag-marker-radius" />
                <MapPinned size={22} className="flag-marker-icon" />
                {flag.status === "hit" && (
                  <span className="flag-marker-bonus">+{flag.bonus} BONUS</span>
                )}
                {flag.status === "full" && (
                  <span className="flag-marker-bonus"></span>
                )}
              </div>
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
