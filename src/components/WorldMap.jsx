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
  BEACONS as DEFAULT_BEACONS,
  WORD_LENGTH,
  HIT_RADIUS,
  computePrecisionBonus,
} from "../gameLogic";
import { LEVEL_ONE } from "../config/levels/levelone";

const FLAG_LIFETIME_MS = 900;
const CLICK_DRAG_THRESHOLD = 6;
const PAN_SPEED = 900;

const PAN_KEYS = {
  w: [0, 1],
  s: [0, -1],
  a: [1, 0],
  d: [-1, 0],
};

export default function WorldMap({
  currentTrace = [],
  onSelectLetter,
  onNavigate,
  disabled = false,
  level = LEVEL_ONE,
  beacons = null,
}) {
  const [flags, setFlags] = useState([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutsRef = useRef(new Set());
  const pointerDownRef = useRef(null);
  const transformRef = useRef(null);

  const activeBeacons = useMemo(
    () => beacons || level?.beacons || DEFAULT_BEACONS,
    [beacons, level],
  );

  const islands = useMemo(() => level?.islands || LEVEL_ONE.islands, [level]);
  const theme = useMemo(() => level?.theme || LEVEL_ONE.theme, [level]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, []);

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
      for (const beacon of activeBeacons) {
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
    [disabled, currentTrace, onSelectLetter, activeBeacons],
  );

  return (
    <div
      className={`map-viewport${isNavigating ? " map-viewport--active" : ""}`}
      style={{
        "--level-pan-border": theme.panningBorder,
        "--level-pan-glow": theme.panningGlow,
        "--level-pan-glow-soft": theme.panningGlowSoft || theme.panningGlow,
      }}
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
            style={{
              width: MAP_WIDTH,
              height: MAP_HEIGHT,
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <svg
              className="world-map-svg"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              style={{
                willChange: "transform",
                transform: "translateZ(0)",
              }}
            >
              <defs>
                {/* 1. Hardware-Accelerated 3D Lighting Gradients */}
                <linearGradient
                  id={`base-shelf-grad-${level.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  {theme.shelfGrad.stops.map((stop, idx) => (
                    <stop
                      key={idx}
                      offset={stop.offset}
                      stopColor={stop.color}
                    />
                  ))}
                </linearGradient>

                <linearGradient
                  id={`plateau-grad-${level.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  {theme.plateauGrad.stops.map((stop, idx) => (
                    <stop
                      key={idx}
                      offset={stop.offset}
                      stopColor={stop.color}
                    />
                  ))}
                </linearGradient>

                <linearGradient
                  id={`peak-grad-${level.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  {theme.peakGrad.stops.map((stop, idx) => (
                    <stop
                      key={idx}
                      offset={stop.offset}
                      stopColor={stop.color}
                    />
                  ))}
                </linearGradient>

                {/* 2. Fast Coastal Shadow */}
                <filter
                  id={`ocean-shelf-shadow-${level.id}`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy={theme.oceanShelfShadow.shadow1.dy}
                    stdDeviation={theme.oceanShelfShadow.shadow1.stdDev}
                    floodColor={theme.oceanShelfShadow.shadow1.color}
                    floodOpacity={theme.oceanShelfShadow.shadow1.opacity}
                  />
                  <feDropShadow
                    dx="0"
                    dy={theme.oceanShelfShadow.shadow2.dy}
                    stdDeviation={theme.oceanShelfShadow.shadow2.stdDev}
                    floodColor={theme.oceanShelfShadow.shadow2.color}
                    floodOpacity={theme.oceanShelfShadow.shadow2.opacity}
                  />
                </filter>

                {/* 3. Fast Polyline Glow */}
                <filter
                  id={`trace-glow-${level.id}`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="0"
                    stdDeviation="4"
                    floodColor={theme.traceColor || theme.accentColor}
                    floodOpacity="0.9"
                  />
                </filter>
              </defs>

              {/* Render Fast 3D Layered Islands */}
              {islands.map((island) => (
                <g
                  key={island.id}
                  filter={`url(#ocean-shelf-shadow-${level.id})`}
                >
                  {/* Layer 1: Base Landmass */}
                  <path
                    d={island.d}
                    fill={`url(#base-shelf-grad-${level.id})`}
                    stroke={theme.shelfStroke}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    fillRule="evenodd"
                  />

                  {/* Layer 2: Mid-Tier Plateau */}
                  {island.plateau && (
                    <path
                      d={island.plateau}
                      fill={`url(#plateau-grad-${level.id})`}
                      stroke={theme.plateauStroke}
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                      fillRule="evenodd"
                      opacity="0.9"
                    />
                  )}

                  {/* Layer 3: Top Peak Elevation */}
                  {island.peak && (
                    <path
                      d={island.peak}
                      fill={`url(#peak-grad-${level.id})`}
                      stroke={theme.peakStroke}
                      strokeWidth="1"
                      strokeDasharray="3 3"
                      strokeOpacity="0.7"
                      fillRule="evenodd"
                    />
                  )}
                </g>
              ))}

              {tracePoints && (
                <polyline
                  points={tracePoints}
                  fill="none"
                  stroke={theme.traceColor || "#38bdf8"}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={`url(#trace-glow-${level.id})`}
                  opacity={0.95}
                />
              )}
            </svg>

            {activeBeacons.map((beacon) => {
              const traceEntry = currentTrace.find(
                (t) => t.beacon.id === beacon.id,
              );
              return (
                <div
                  key={beacon.id}
                  className={`beacon${traceEntry ? " beacon--selected" : ""}`}
                  style={{
                    left: beacon.x,
                    top: beacon.y,
                    borderColor: traceEntry
                      ? theme.accentColor
                      : theme.beaconBorder,
                    color: traceEntry ? "#06121c" : theme.beaconBorder,
                    background: traceEntry
                      ? theme.accentColor
                      : theme.beaconBackground,
                    boxShadow: traceEntry
                      ? `0 0 22px ${theme.beaconGlow}, 0 0 6px #fff`
                      : `0 0 10px ${theme.beaconGlow}`,
                  }}
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
