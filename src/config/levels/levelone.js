// Level 1: Oceanic Archipelago
export const LEVEL_ONE = {
  id: "levelone",
  name: "Archipelago",
  subtitle: "Level 1 • Oceanic Expanse",
  description:
    "Navigate isolated islands across a sprawling oceanic archipelago.",
  isPremium: false,
  seed: 42,
  mapDimensions: {
    width: 1200,
    height: 900,
  },
  regions: [
    { name: "Ember Coast", x0: 60, y0: 60, x1: 380, y1: 380 },
    { name: "Frostpeak Range", x0: 430, y0: 60, x1: 780, y1: 340 },
    { name: "Crystal Highlands", x0: 830, y0: 60, x1: 1140, y1: 380 },
    { name: "Sunken Delta", x0: 60, y0: 480, x1: 380, y1: 840 },
    { name: "Shadow Marsh", x0: 430, y0: 500, x1: 780, y1: 840 },
    { name: "Storm Isles", x0: 830, y0: 480, x1: 1140, y1: 840 },
  ],
  islands: [
    {
      id: "fjord",
      name: "Crescent Fjord",
      d: "M40,50 Q200,20 380,60 Q420,180 340,320 Q240,220 180,180 Q120,240 70,330 Q10,200 40,50 Z",
      plateau:
        "M80,85 Q200,60 340,95 Q370,180 300,270 Q230,210 180,185 Q130,230 100,280 Q50,190 80,85 Z",
      peak: "M120,110 Q200,90 300,120 Q320,170 270,220 Q220,185 180,180 Q150,205 130,235 Q100,170 120,110 Z",
    },
    {
      id: "atoll",
      name: "Sunken Atoll",
      d: "M430,30 Q650,5 780,90 Q820,240 700,340 Q530,370 430,260 Q390,130 430,30 Z M560,130 Q640,110 680,160 Q700,230 630,270 Q540,270 510,220 Q500,160 560,130 Z",
      plateau:
        "M470,65 Q640,45 740,110 Q770,220 670,295 Q540,320 470,230 Q440,130 470,65 Z M580,150 Q630,135 660,175 Q675,220 625,250 Q560,250 535,215 Q530,170 580,150 Z",
      peak: "M500,95 Q620,80 700,130 Q725,200 645,260 Q550,275 500,210 Z",
    },
    {
      id: "ridge",
      name: "Iron Ridge",
      d: "M840,40 Q940,10 1030,35 Q1130,20 1180,110 Q1150,210 1090,235 Q1145,305 1060,370 Q940,360 880,315 Q815,335 780,240 Q810,130 840,40 Z",
      plateau:
        "M875,75 Q950,50 1030,65 Q1100,60 1135,125 Q1110,195 1055,220 Q1095,275 1030,320 Q940,315 885,280 Q840,290 820,225 Q840,145 875,75 Z",
      peak: "M910,105 Q965,85 1030,95 Q1075,95 1095,140 Q1075,185 1030,200 Q1050,235 1010,265 Q950,260 915,235 Q875,225 890,155 Z",
    },
    {
      id: "peninsula",
      name: "Mist Cape",
      d: "M30,470 Q170,430 330,480 Q410,510 390,630 Q440,730 360,830 Q220,870 150,790 Q80,840 35,745 Q15,620 30,470 Z",
      plateau:
        "M75,510 Q180,475 300,515 Q360,535 345,625 Q385,705 320,780 Q215,815 160,750 Q105,785 70,715 Q50,620 75,510 Z",
      peak: "M110,545 Q190,520 270,550 Q315,565 300,625 Q330,685 285,735 Q205,760 165,715 Q125,735 100,685 Q90,620 110,545 Z",
    },
    {
      id: "archipelago",
      name: "The Shards",
      d: "M460,490 Q650,450 760,540 Q790,680 650,780 Q510,810 440,680 Z M760,720 Q800,700 815,740 Q795,770 755,760 Z M410,770 Q430,750 440,780 Q420,800 400,790 Z M715,485 Q745,475 755,505 Q725,525 705,505 Z",
      plateau: "M495,530 Q640,495 720,565 Q745,665 635,740 Q530,760 480,670 Z",
      peak: "M530,565 Q630,535 685,585 Q705,650 625,705 Q550,715 515,655 Z",
    },
    {
      id: "caldera",
      name: "Abyssal Caldera",
      d: "M880,480 Q1060,450 1150,540 Q1190,690 1080,800 Q920,850 830,760 Q790,620 880,480 Z",
      plateau:
        "M905,525 Q1040,500 1105,570 Q1135,675 1050,755 Q935,790 870,725 Q835,625 905,525 Z",
      peak: "M940,560 Q1025,545 1065,595 Q1085,665 1025,715 Q950,735 910,685 Q885,625 940,560 Z",
    },
  ],
  theme: {
    accentColor: "#38bdf8",
    panningBorder: "#38bdf8",
    panningGlow: "rgba(56, 189, 248, 0.55)",
    panningGlowSoft: "rgba(56, 189, 248, 0.25)",
    oceanBg: "radial-gradient(ellipse at center, #0c1220 0%, #060a12 100%)",
    shelfGrad: {
      id: "base-shelf-grad-levelone",
      stops: [
        { offset: "0%", color: "#1e3450" },
        { offset: "60%", color: "#111f32" },
        { offset: "100%", color: "#0a1320" },
      ],
    },
    shelfStroke: "#3b6999",
    plateauGrad: {
      id: "plateau-grad-levelone",
      stops: [
        { offset: "0%", color: "#254266" },
        { offset: "100%", color: "#12233a" },
      ],
    },
    plateauStroke: "#467cb4",
    peakGrad: {
      id: "peak-grad-levelone",
      stops: [
        { offset: "0%", color: "#2f5788" },
        { offset: "100%", color: "#1a3250" },
      ],
    },
    peakStroke: "#38bdf8",
    oceanShelfShadow: {
      shadow1: { color: "#000000", opacity: 0.75, dy: 12, stdDev: 10 },
      shadow2: { color: "#0284c7", opacity: 0.25, dy: 2, stdDev: 4 },
    },
    traceColor: "#38bdf8",
    beaconBorder: "#38bdf8",
    beaconGlow: "rgba(56, 189, 248, 0.55)",
    beaconBackground: "rgba(9, 14, 23, 0.85)",
  },
};
