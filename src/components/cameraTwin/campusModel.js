// Hình khối khuôn viên UEL cho sơ đồ 3D. DB chưa có hình học tòa nhà ⇒ cấu hình tĩnh ở đây.
// Bố cục đồ lại từ "Sơ đồ khuôn viên trường" (Đoàn trường ĐH Kinh tế – Luật, ảnh ~1535 × 1024 px),
// đối chiếu bộ "Bản vẽ vị trí Camera - KTL - Final"; quy đổi ~0,4 m/px (khớp bề ngang A1).
// Số tầng theo tài liệu quy hoạch trường cung cấp. Chiều cao tầng, mặt tiền, mái, cây: MINH HOẠ.
// Mỗi giá trị có `source` để UI đánh dấu phần nào là dữ liệu thật / ước lượng.

export const PX_TO_M = 0.4;
const ORIGIN = [915, 525];

/** Toạ độ ảnh sơ đồ → mét trong scene 3D (x: đông, z: nam). */
export const toWorld = ([px, py]) => [
  (px - ORIGIN[0]) * PX_TO_M,
  (py - ORIGIN[1]) * PX_TO_M,
];

export const FLOOR_HEIGHT_M = 3.6; // ước lượng — chưa có mặt cắt

export const SOURCE = {
  drawing: "Theo sơ đồ khuôn viên",
  planning: "Theo tài liệu quy hoạch",
  estimated: "Ước lượng / minh hoạ",
};

// rect: [x0, y0, x1, y1] theo px sơ đồ. match: các cách viết zone.building / room.siteName quy về tòa này.
// style: kiểu mặt tiền minh hoạ (BuildingModel3D). front: hướng mặt chính (s/n/e/w).
export const BUILDINGS = [
  {
    id: "A1",
    name: "KTL.A1",
    role: "Khối quản lý hành chính",
    rect: [755, 632, 972, 752],
    floors: 9,
    areaM2: 1635,
    style: "tower",
    front: "s",
    color: "#f1f3f5",
    match: ["A1", "KTL.A1", "KTLA1"],
    sources: { position: "drawing", floors: "planning", footprint: "drawing" },
  },
  {
    id: "A2",
    name: "KTL.A2",
    role: "Khối hội trường",
    rect: [815, 540, 910, 630],
    floors: 2,
    areaM2: 1055,
    style: "hall",
    front: "n",
    labelAt: "n", // A1 cao hơn nằm ngay phía nam ⇒ đặt nhãn ở mép bắc cho khỏi bị che
    color: "#f3e3c8",
    match: ["A2", "KTL.A2", "KTLA2", "HOI TRUONG", "HOITRUONG", "HT"],
    note: "Tài liệu ghi 2 tầng (quy hoạch) và 3 tầng (giới thiệu hiện trạng) — cần xác nhận.",
    sources: { position: "drawing", floors: "planning", footprint: "drawing" },
  },
  {
    id: "B1",
    name: "KTL.B1",
    role: "Khối lớp học 1",
    rect: [1012, 655, 1150, 742],
    floors: 6,
    areaM2: 2260,
    style: "band",
    front: "s",
    color: "#f8f8f6",
    match: ["B1", "KTL.B1", "KTLB1"],
    note: "Diện tích thật 2.260 m² lớn hơn khối vẽ — khối vẽ theo sơ đồ, chưa đúng kích thước.",
    sources: { position: "drawing", floors: "planning", footprint: "estimated" },
  },
  {
    id: "B2",
    name: "KTL.B2",
    role: "Khối văn phòng khoa",
    rect: [1152, 600, 1230, 742],
    floors: 6,
    areaM2: 590,
    style: "grid",
    front: "s",
    color: "#f4f5f7",
    match: ["B2", "KTL.B2", "KTLB2"],
    sources: { position: "drawing", floors: "planning", footprint: "estimated" },
  },
  {
    id: "CT",
    name: "Căn tin",
    role: "Căn tin",
    rect: [600, 500, 738, 585],
    floors: 1,
    style: "canteen",
    front: "s",
    color: "#e0773a",
    match: ["CAN TIN", "CANTIN"],
    sources: { position: "drawing", floors: "estimated", footprint: "drawing" },
  },
  {
    id: "XO",
    name: "Nhà xe ô tô",
    role: "Nhà xe",
    rect: [636, 405, 712, 466],
    floors: 1,
    roof: "flat",
    color: "#c4c6ec",
    match: ["NHA XE O TO"],
    sources: { position: "drawing", floors: "estimated", footprint: "drawing" },
  },
  {
    id: "XM",
    name: "Nhà xe máy",
    role: "Nhà xe",
    rect: [995, 170, 1103, 252],
    floors: 1,
    roof: "flat",
    color: "#f3dcc0",
    match: ["NHA XE MAY"],
    sources: { position: "drawing", floors: "estimated", footprint: "drawing" },
  },
  {
    id: "TT",
    name: "Khu thể dục thể thao",
    role: "Nhà thể thao",
    rect: [490, 188, 712, 270],
    floors: 2,
    style: "hall",
    front: "s",
    color: "#f3dcc0",
    match: ["THE THAO", "THE DUC", "NHA THI DAU"],
    sources: { position: "drawing", floors: "estimated", footprint: "drawing" },
  },
];

// Tòa đã có trong quy hoạch nhưng chưa xác định được vị trí trên sơ đồ ⇒ không vẽ, chỉ liệt kê.
export const UNPLACED_BUILDINGS = [
  {
    id: "A3",
    name: "KTL.A3",
    role: "Khối thư viện (3–5 tầng theo quy hoạch)",
    areaM2: 2900,
    match: ["A3", "KTL.A3", "KTLA3"],
  },
];

// match: so với zone_code / zone_name (đã bỏ dấu, viết hoa) của zone loại "gate".
// face: hướng nhìn của camera cổng vào trong khuôn viên (độ, 0° = đông, 90° = nam).
export const GATES = [
  { id: "G1", name: "Cổng 1", at: [866, 932], side: "Cổng chính", face: -90, match: ["GATE_MAIN", "CONG CHINH", "CONG 1"] },
  { id: "G2", name: "Cổng 2", at: [380, 333], side: "Đ. Trần Đại Nghĩa", face: 0, match: ["CONG 2"] },
  { id: "G3", name: "Cổng 3", at: [955, 116], side: "Đ. Lương Văn Can", face: 90, match: ["CONG 3"] },
  {
    id: "G4",
    name: "Cổng 4",
    at: [1474, 290],
    side: "Theo bản vẽ camera (không có trên sơ đồ khuôn viên)",
    face: 180,
    match: ["CONG 4", "GATE_SIDE", "CONG PHU"],
  },
];

// kind: sport | water | construction | plaza | garden | canal | bus | sign
export const LANDSCAPE = [
  { id: "lotus", name: "Hồ sen", kind: "water", rect: [1012, 322, 1168, 428] },
  { id: "garden", name: "Vườn tượng", kind: "garden", rect: [1178, 462, 1240, 528] },
  { id: "build", name: "Khu vực đang thi công", kind: "construction", rect: [790, 322, 942, 530] },
  { id: "square", name: "Quảng trường 6 tháng 11", kind: "plaza", rect: [812, 755, 918, 880] },
  { id: "canal", name: "", kind: "canal", rect: [1396, 135, 1436, 868] },
  { id: "bus1", name: "", kind: "bus", rect: [812, 842, 830, 866] },
  { id: "bus2", name: "", kind: "bus", rect: [900, 842, 918, 866] },
  { id: "sign", name: "UEL", kind: "sign", rect: [585, 880, 760, 925] },
];

// type: road (xe lưu thông) | parking (đường có thể đỗ ô tô) | walk (dành cho người đi bộ) — theo chú thích sơ đồ.
export const ROADS = [
  { name: "", type: "road", w: 9, pts: [[380, 300], [740, 296], [960, 296]] },
  { name: "", type: "road", w: 9, pts: [[955, 112], [955, 300]] },
  { name: "Đường Thống Nhất", type: "parking", w: 8, pts: [[960, 290], [1478, 290]] },
  { name: "Đường Vượt Trội", type: "walk", w: 6, pts: [[752, 335], [752, 745]] },
  { name: "Đường Tiên Phong", type: "walk", w: 6, pts: [[985, 300], [985, 745]] },
  { name: "Đường Kinh Doanh", type: "parking", w: 8, pts: [[1376, 290], [1376, 885]] },
  { name: "Đường Quản Lý", type: "parking", w: 8, pts: [[1008, 766], [1376, 766]] },
  { name: "Đường Tương Lai", type: "parking", w: 8, pts: [[935, 886], [1455, 886]] },
  { name: "Đường Kiến Tạo", type: "parking", w: 8, pts: [[380, 886], [800, 886]] },
  { name: "", type: "road", w: 10, pts: [[748, 760], [1008, 760]] },
  { name: "", type: "road", w: 10, pts: [[866, 870], [866, 935]] },
  {
    name: "Đường Sáng Tạo",
    type: "road",
    w: 9,
    pts: [[395, 333], [432, 345], [434, 470], [456, 600], [500, 720], [560, 810], [640, 870], [800, 886]],
  },
  {
    name: "Đường Công nghệ Tài chính",
    type: "road",
    w: 9,
    pts: [[700, 300], [640, 330], [590, 400], [570, 500], [590, 600], [650, 690], [748, 760]],
  },
  { name: "Đường Thanh Niên", type: "road", w: 6, pts: [[528, 725], [636, 678]] },
];

export const BOUNDARY = [[392, 112], [1478, 112], [1478, 938], [352, 938], [352, 380], [378, 300]];

export const STREETS = [
  { name: "Đường Lương Văn Can", at: [920, 88] },
  { name: "Đường Trần Đại Nghĩa", at: [330, 600], vertical: true },
];

// Các trục đường ngoài khuôn viên (chỉ để vẽ mặt đường, không có camera).
export const OUTER_ROADS = [
  [[300, 92], [1530, 92]],
  [[340, 140], [326, 1000]],
  [[300, 962], [1530, 962]],
  [[1505, 92], [1505, 1000]],
];

// Cây xanh MINH HOẠ: rải đều trên các mảng xanh, né đường/nhà/cảnh quan (không phải vị trí cây thật).
const inRect = ([x, y], [x0, y0, x1, y1], pad) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad;
const nearSeg = ([x, y], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const insidePoly = ([x, y], poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const makeTrees = () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let y = 125; y < 930; y += 26) {
    for (let x = 365; x < 1470; x += 26) {
      const p = [x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16];
      if (rnd() < 0.35) continue;
      if (!insidePoly(p, BOUNDARY)) continue;
      if (BUILDINGS.some((b) => inRect(p, b.rect, 12))) continue;
      if (LANDSCAPE.some((l) => inRect(p, l.rect, l.kind === "canal" ? 6 : 12))) continue;
      if (ROADS.some((r) => r.pts.slice(1).some((q, i) => nearSeg(p, r.pts[i], q) < 14))) continue;
      out.push({ p, s: 0.8 + rnd() * 0.5, c: Math.floor(rnd() * 3) });
    }
  }
  return out;
};
