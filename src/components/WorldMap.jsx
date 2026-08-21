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

export default function WorldMap({ currentTrace, onSelectLetter, disabled }) {
  const [flags, setFlags] = useState([]);
  const timeoutsRef = useRef(new Set());
  const pointerDownRef = useRef(null);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, []);

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

      const addFlag = (hit, bonus) => {
        const flagId = `flag-${Date.now()}-${Math.random()}`;
        setFlags((prev) => [
          ...prev,
          { id: flagId, x: mapX, y: mapY, hit, bonus },
        ]);
        const timeoutId = setTimeout(() => {
          setFlags((prev) => prev.filter((f) => f.id !== flagId));
          timeoutsRef.current.delete(timeoutId);
        }, FLAG_LIFETIME_MS);
        timeoutsRef.current.add(timeoutId);
      };

      if (!closestBeacon) {
        addFlag(false, 0);
        return;
      }

      // Re-clicking a letter already in the trace repositions its flag instead of adding a duplicate.
      const isReposition = currentTrace.some(
        (t) => t.beacon.char === closestBeacon.char,
      );
      const isFull = !isReposition && currentTrace.length >= WORD_LENGTH;
      if (isFull) {
        addFlag(false, 0);
        return;
      }

      const { precision, bonus } = computePrecisionBonus(closestDistance);
      addFlag(true, bonus);
      onSelectLetter(closestBeacon, { precision, bonus, isReposition });
    },
    [disabled, currentTrace, onSelectLetter],
  );

  return (
    <TransformWrapper
      initialScale={2.4}
      minScale={1}
      maxScale={4}
      limitToBounds={false}
      centerOnInit
      wheel={{ step: 0.15 }}
      doubleClick={{ disabled: true }}
      velocityAnimation={{
        sensitivityMouse: 0.5,
        sensitivityTouch: 0.6,
        maxStrengthMouse: 8,
        maxStrengthTouch: 10,
        animationTime: 300,
        maxAnimationTime: 400,
      }}
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
              className={`flag-marker${flag.hit ? " flag-marker--hit" : " flag-marker--miss"}`}
              style={{ left: flag.x, top: flag.y }}
            >
              <span className="flag-marker-radius" />
              <MapPinned size={22} className="flag-marker-icon" />
              {flag.hit && (
                <span className="flag-marker-bonus">+{flag.bonus} BONUS</span>
              )}
            </div>
          ))}
        </div>
      </TransformComponent>
    </TransformWrapper>
  );
}
