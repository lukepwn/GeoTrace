// Level 2: The Great Caldera (Massive Central Volcano Megastructure)
export const LEVEL_TWO = {
  id: "leveltwo",
  name: "Volcanic Rift",
  subtitle: "Level 2 • The Great Caldera",
  description:
    "Ascend a massive volcanic megastructure with molten flows and obsidian ridges.",
  isPremium: false,
  seed: 991,
  mapDimensions: {
    width: 1200,
    height: 900,
  },
  regions: [
    { name: "North Ash Ridge", x0: 380, y0: 60, x1: 820, y1: 270 },
    { name: "East Lava Flows", x0: 800, y0: 240, x1: 1140, y1: 520 },
    { name: "Pyroclast Delta", x0: 760, y0: 560, x1: 1120, y1: 840 },
    { name: "South Caldera Base", x0: 380, y0: 630, x1: 820, y1: 850 },
    { name: "West Obsidian Ridge", x0: 60, y0: 340, x1: 400, y1: 680 },
    { name: "Central Magma Core", x0: 430, y0: 310, x1: 770, y1: 590 },
  ],
  islands: [
    // Massive Central Volcano
    {
      id: "grand-caldera",
      name: "Mount Ignis (Great Caldera)",
      // Layer 1: Huge sweeping base volcanic shelf with jagged lava ridges & peninsulas
      d: "M600,60 Q760,40 910,130 Q1060,220 1120,380 Q1160,540 1080,690 Q980,820 800,850 Q600,870 420,840 Q240,810 140,680 Q60,530 90,360 Q130,200 280,110 Q430,40 600,60 Z M220,240 Q160,300 200,380 Q280,360 260,280 Z M980,260 Q1050,330 1020,420 Q940,380 950,290 Z M930,680 Q1010,740 970,810 Q890,790 910,710 Z M190,660 Q260,630 270,720 Q190,770 170,700 Z",
      // Layer 2: Elevated Caldera Slope / Plateau
      plateau:
        "M600,160 Q730,140 850,220 Q950,300 970,450 Q960,600 860,700 Q730,770 600,760 Q460,770 340,690 Q240,590 240,450 Q250,310 350,220 Q470,140 600,160 Z",
      // Layer 3: The Peak Rim and Fiery Inner Caldera
      peak: "M600,260 Q700,250 780,320 Q840,380 830,480 Q810,580 730,630 Q630,660 550,640 Q440,600 400,500 Q380,400 440,330 Q510,260 600,260 Z",
    },
    // Supporting Magma Outcroppings & Cinder Islets
    {
      id: "magma-vent-north",
      name: "Northern Pyre Spire",
      d: "M200,60 Q260,40 290,90 Q270,140 210,130 Q160,110 200,60 Z",
      plateau: "M220,75 Q250,65 270,95 Q250,120 220,110 Z",
      peak: "M235,85 Q250,80 255,95 Q245,105 235,95 Z",
    },
    {
      id: "magma-vent-east",
      name: "Eastern Cinder Rock",
      d: "M1030,120 Q1110,100 1140,160 Q1110,210 1040,190 Q1000,160 1030,120 Z",
      plateau: "M1050,135 Q1090,125 1110,160 Q1090,185 1055,175 Z",
      peak: "M1070,145 Q1090,140 1095,155 Q1085,165 1070,155 Z",
    },
    {
      id: "magma-vent-south",
      name: "Southern Basalt Shard",
      d: "M150,790 Q210,770 230,830 Q190,870 140,850 Q120,820 150,790 Z",
      plateau: "M165,805 Q195,795 210,830 Q185,850 155,835 Z",
      peak: "M175,815 Q190,810 195,825 Q185,835 175,825 Z",
    },
  ],
  theme: {
    accentColor: "#f43f5e",
    panningBorder: "#f43f5e",
    panningGlow: "rgba(244, 63, 94, 0.65)",
    panningGlowSoft: "rgba(244, 63, 94, 0.3)",
    oceanBg: "radial-gradient(ellipse at center, #1b0710 0%, #090205 100%)",
    shelfGrad: {
      id: "base-shelf-grad-leveltwo",
      stops: [
        { offset: "0%", color: "#3d0817" },
        { offset: "60%", color: "#22050e" },
        { offset: "100%", color: "#0f0206" },
      ],
    },
    shelfStroke: "#9f1239",
    plateauGrad: {
      id: "plateau-grad-leveltwo",
      stops: [
        { offset: "0%", color: "#881337" },
        { offset: "100%", color: "#4c0519" },
      ],
    },
    plateauStroke: "#be123c",
    peakGrad: {
      id: "peak-grad-leveltwo",
      stops: [
        { offset: "0%", color: "#e11d48" },
        { offset: "100%", color: "#881337" },
      ],
    },
    peakStroke: "#fb7185",
    oceanShelfShadow: {
      shadow1: { color: "#000000", opacity: 0.85, dy: 14, stdDev: 12 },
      shadow2: { color: "#e11d48", opacity: 0.35, dy: 2, stdDev: 6 },
    },
    traceColor: "#fb7185",
    beaconBorder: "#f43f5e",
    beaconGlow: "rgba(244, 63, 94, 0.6)",
    beaconBackground: "rgba(28, 7, 14, 0.9)",
  },
};
