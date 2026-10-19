import { Html } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { BLOCK_STYLE, PLAN_W } from "../../utils/floorPlan";
import CameraMarker from "./CameraMarker";
import { ViewRig } from "./MapControls";
import { tileTexture } from "./textures";
import { cameraKind } from "./twinData";

// 1 đơn vị mặt bằng (hệ 1000 × h của buildPlan) = 5 cm ⇒ mặt bằng rộng ~50 m.
const S = 0.05;
const WALL_H = 1.4; // tường thấp kiểu cutaway: đủ phân biệt phòng, không che camera
const WALL_T = 0.15;
const CAM_Y = 2.2;
const DOOR = 1.6;

export const floorHome = (planHeight) => ({
  position: [0, 34 + planHeight * S * 0.6, 30 + planHeight * S * 0.7],
  target: [0, 0, 1],
});

// màu sàn / tường kiểu nội thất (thay màu pastel của sơ đồ 2D)
const FLOOR_LOOK = {
  room: { floor: "#efe7da", line: "#ddd2c0", wall: "#f8f8f6" },
  corridor: { floor: "#e7e9ec", line: "#d5d9de", wall: "#f1f2f4" },
  lobby: { floor: "#f3efe8", line: "#e0d8cb", wall: "#f8f8f6" },
  gate: { floor: "#f6efdd", line: "#e5d9bd", wall: "#f8f8f6" },
  parking: { floor: "#d9dce0", line: "#c4c8cd", wall: "#e5e7ea" },
  restricted: { floor: "#e6e8ec", line: "#cfd3da", wall: "#fbe9e9" },
};

/** 4 tường; tường phía hành lang (hướng về tâm mặt bằng) chừa ô cửa. */
const Walls = ({ w, d, color, doorSide }) => {
  const seg = (w - DOOR) / 2;
  const z = (doorSide * d) / 2;
  const walls = [
    [-w / 2, 0, WALL_T, d],
    [w / 2, 0, WALL_T, d],
    [0, (-doorSide * d) / 2, w, WALL_T],
    [-(DOOR / 2 + seg / 2), z, seg, WALL_T],
    [DOOR / 2 + seg / 2, z, seg, WALL_T],
  ];
  return (
    <>
      {walls.map(([x, wz, sx, sz], i) => (
        <group key={i} position={[x, 0, wz]}>
          <mesh position={[0, WALL_H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[sx, WALL_H, sz]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* viền đỉnh tường cho dễ nhìn ranh phòng */}
          <mesh position={[0, WALL_H + 0.02, 0]}>
            <boxGeometry args={[sx + 0.02, 0.04, sz + 0.02]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        </group>
      ))}
    </>
  );
};

const Box = ({ p, s, c, r = 0.7 }) => (
  <mesh position={p} castShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} />
  </mesh>
);

const Plant = ({ p }) => (
  <group position={p}>
    <Box p={[0, 0.2, 0]} s={[0.4, 0.4, 0.4]} c="#a8a29e" />
    <mesh position={[0, 0.75, 0]} castShadow>
      <icosahedronGeometry args={[0.38, 0]} />
      <meshStandardMaterial color="#4d8f45" flatShading />
    </mesh>
  </group>
);

const Chair = ({ p }) => (
  <group position={p}>
    <Box p={[0, 0.25, 0]} s={[0.42, 0.06, 0.42]} c="#334155" />
    <Box p={[0, 0.12, 0]} s={[0.06, 0.24, 0.06]} c="#64748b" />
  </group>
);

/** Nội thất MINH HOẠ suy từ loại khối + sức chứa phòng. Không phải bố trí thật. */
const Furniture = ({ block, w, d }) => {
  if (block.kind === "room") {
    const seats = Math.max(4, Math.min(block.capacity || 8, 40));
    if (seats > 20 && w > 6 && d > 4) {
      // phòng học: dãy bàn hướng về bảng
      const cols = Math.max(2, Math.floor((w - 1.5) / 1.6));
      const rows = Math.max(1, Math.min(Math.ceil(seats / (cols * 2)), Math.floor((d - 2.4) / 1.1)));
      return (
        <group>
          <Box p={[0, 0.7, -d / 2 + 0.25]} s={[Math.min(4, w * 0.5), 1.1, 0.06]} c="#1f2937" />
          <Box p={[w * 0.3, 0.4, -d / 2 + 0.9]} s={[1.2, 0.75, 0.6]} c="#a47148" />
          {Array.from({ length: rows * cols }, (_, i) => {
            const x = -w / 2 + 0.9 + ((i % cols) + 0.5) * ((w - 1.8) / cols);
            const z = -d / 2 + 2 + Math.floor(i / cols) * 1.1;
            return (
              <group key={i} position={[x, 0, z]}>
                <Box p={[0, 0.38, 0]} s={[1.2, 0.05, 0.45]} c="#c8a27a" />
                <Chair p={[-0.3, 0, 0.42]} />
                <Chair p={[0.3, 0, 0.42]} />
              </group>
            );
          })}
        </group>
      );
    }
    const perSide = Math.ceil(seats / 2);
    const len = Math.min(w * 0.7, perSide * 0.75);
    const tw = Math.min(1.4, d * 0.35);
    return (
      <group>
        <Box p={[0, 0.4, 0]} s={[len, 0.08, tw]} c="#a47148" r={0.5} />
        {Array.from({ length: perSide * 2 }, (_, i) => {
          const side = i < perSide ? -1 : 1;
          const x = -len / 2 + (len * ((i % perSide) + 0.5)) / perSide;
          return <Chair key={i} p={[x, 0, side * (tw / 2 + 0.35)]} />;
        })}
        <Box p={[-w / 2 + 0.5, 0.6, -d / 2 + 0.35]} s={[0.8, 1.2, 0.4]} c="#94a3b8" />
        <Plant p={[w / 2 - 0.5, 0, -d / 2 + 0.5]} />
      </group>
    );
  }
  if (block.kind === "lobby" || block.kind === "gate") {
    const dw = Math.min(4, w * 0.4);
    return (
      <group>
        <Box p={[0, 0.55, -d * 0.2]} s={[dw, 1.1, 0.7]} c="#e2e8f0" r={0.4} />
        <Box p={[0, 1.13, -d * 0.2]} s={[dw + 0.1, 0.06, 0.8]} c="#a47148" />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * w * 0.28, 0, d * 0.15]}>
            <Box p={[0, 0.22, 0]} s={[1.8, 0.44, 0.8]} c="#64748b" />
            <Box p={[0, 0.55, -0.35]} s={[1.8, 0.4, 0.15]} c="#64748b" />
          </group>
        ))}
        <Plant p={[-w / 2 + 0.6, 0, -d / 2 + 0.6]} />
        <Plant p={[w / 2 - 0.6, 0, -d / 2 + 0.6]} />
      </group>
    );
  }
  if (block.kind === "restricted") {
    const n = Math.max(2, Math.min(6, Math.floor((w - 1) / 0.9)));
    return (
      <group>
        {Array.from({ length: n }, (_, i) => (
          <Box key={i} p={[-w / 2 + 0.9 + i * 0.9, 0.9, -d / 4]} s={[0.6, 1.8, 0.9]} c="#1f2937" r={0.3} />
        ))}
      </group>
    );
  }
  if (block.kind === "corridor") {
    return (
      <group>
        <Plant p={[-w / 2 + 0.6, 0, 0]} />
        <Plant p={[w / 2 - 0.6, 0, 0]} />
      </group>
    );
  }
  return null;
};

const Block = ({ block, cx, cz, selected, layers, onSelect }) => {
  const [hover, setHover] = useState(false);
  const w = block.w * S;
  const d = block.h * S;
  const look = FLOOR_LOOK[block.kind] || FLOOR_LOOK.lobby;
  const accent = (BLOCK_STYLE[block.kind] || BLOCK_STYLE.lobby).stroke;
  const x = (block.x + block.w / 2 - cx) * S;
  const z = (block.y + block.h / 2 - cz) * S;
  const map = useMemo(() => tileTexture(w / 1.2, d / 1.2, look.floor, look.line), [w, d, look]);
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.06, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial map={map} color={selected ? "#cfe0f5" : hover ? "#f8fbff" : "#ffffff"} />
      </mesh>
      {/* phủ màu loại khối (giữ quy ước màu của sơ đồ 2D) */}
      <mesh position={[0, 0.125, 0]}>
        <boxGeometry args={[w - 0.05, 0.01, d - 0.05]} />
        <meshBasicMaterial color={accent} transparent opacity={selected ? 0.35 : 0.12} />
      </mesh>
      {block.kind !== "corridor" && (
        <Walls w={w} d={d} color={selected ? "#bcd0ea" : look.wall} doorSide={z < 0 ? 1 : -1} />
      )}
      {layers.furniture && <Furniture block={block} w={w} d={d} />}
      {layers.labels && (
        <Html position={[0, WALL_H + 0.6, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap rounded-md px-2 py-0.5 text-center text-white shadow ${selected ? "bg-[#c2410c]" : "bg-[#1e3a5f]"}`}>
            <div className="text-[11px] font-bold leading-tight">{block.label}</div>
            <div className="font-mono text-[9px] leading-tight text-slate-200">
              {block.sub}
              {block.kind === "restricted" ? " · khu hạn chế" : ""}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

/** Vỏ ngoài tầng: tường thấp + dải kính quanh mặt bằng. */
const Shell = ({ w, d }) =>
  [
    [0, -d / 2, w, 0.3],
    [0, d / 2, w, 0.3],
    [-w / 2, 0, 0.3, d],
    [w / 2, 0, 0.3, d],
  ].map(([x, z, sx, sz], i) => (
    <group key={i} position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[sx, 0.9, sz]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[sx, 0.7, sz]} />
        <meshStandardMaterial color="#7fa6c9" transparent opacity={0.45} metalness={0.4} roughness={0.1} />
      </mesh>
    </group>
  ));

/** Mặt bằng tầng dạng 3D cutaway — hình học lấy nguyên từ buildPlan (giống sơ đồ 2D). */
const FloorPlan3D = ({
  plan,
  placed,
  stateById,
  layers,
  apiRef,
  selectedCameraId,
  selectedBlockKey,
  onSelectCamera,
  onSelectBlock,
  onClear,
}) => {
  const cx = PLAN_W / 2;
  const cz = plan.height / 2;
  const home = floorHome(plan.height);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 35, near: 0.5, far: 1000, position: home.position }}
      onPointerMissed={onClear}
      fallback={<div className="p-6 text-sm text-slate-500">Trình duyệt không hỗ trợ WebGL — không hiển thị được mặt bằng 3D.</div>}
    >
      <color attach="background" args={["#e3ecf3"]} />
      <hemisphereLight args={["#ffffff", "#cbd5e1", 1]} />
      <directionalLight
        position={[-25, 40, 20]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-normalBias={0.04}
      />
      {/* sàn tầng */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[PLAN_W * S + 1, 0.1, plan.height * S + 1]} />
        <meshStandardMaterial color="#f4f4f2" />
      </mesh>
      <Shell w={PLAN_W * S + 1} d={plan.height * S + 1} />
      {plan.blocks.map((b) => (
        <Block
          key={b.key}
          block={b}
          cx={cx}
          cz={cz}
          layers={layers}
          selected={selectedBlockKey === b.key}
          onSelect={() => onSelectBlock(b.key)}
        />
      ))}
      {placed
        .filter((c) => layers[cameraKind(c.device)])
        .map((c) => (
          <CameraMarker
            key={c.device.id}
            position={[(c.x - cx) * S, CAM_Y, (c.y - cz) * S]}
            angle={c.angle}
            kind={cameraKind(c.device)}
            state={stateById[c.device.id] || "offline"}
            code={c.device.device_code}
            fovRadius={80 * S}
            selected={selectedCameraId === c.device.id}
            showFov={layers.fov}
            onSelect={() => onSelectCamera(c.device.id)}
          />
        ))}
      <ViewRig apiRef={apiRef} home={home} minDistance={8} maxDistance={160} />
    </Canvas>
  );
};

export default FloorPlan3D;
