import { Html } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, Shape } from "three";
import BuildingModel3D from "./BuildingModel3D";
import CameraMarker from "./CameraMarker";
import { ViewRig } from "./MapControls";
import { BOUNDARY, BUILDINGS, LANDSCAPE, OUTER_ROADS, ROADS, STREETS, makeTrees, toWorld } from "./campusModel";
import { grassTexture, tileTexture, waterTexture } from "./textures";
import { STATE } from "./theme";
import { cameraKind } from "./twinData";

export const CAMPUS_HOME = { position: [-30, 250, 330], target: [0, 0, 20] };

// màu đường theo chú thích sơ đồ khuôn viên
const ROAD_STYLE = {
  road: { color: "#9ea4ab", edge: "#e6e3dc" },
  parking: { color: "#f3cf5b", edge: "#ece7da" },
  walk: { color: "#62b45c", edge: "#e6e3dc" },
};

/** Tâm 1 hình chữ nhật px → toạ độ thế giới. */
export const rectCenter = (rect) => {
  const [x0, z0] = toWorld([rect[0], rect[1]]);
  const [x1, z1] = toWorld([rect[2], rect[3]]);
  return [(x0 + x1) / 2, 0, (z0 + z1) / 2];
};

const rectBox = (rect) => {
  const [x0, z0] = toWorld([rect[0], rect[1]]);
  const [x1, z1] = toWorld([rect[2], rect[3]]);
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
};

const Label = ({ position, children, tone = "plain" }) => (
  <Html position={position} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
    <span
      className={
        tone === "navy"
          ? "whitespace-nowrap rounded bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow"
          : "whitespace-nowrap text-[10px] font-semibold text-slate-700 [text-shadow:0_0_3px_#fff,0_0_3px_#fff]"
      }
    >
      {children}
    </span>
  </Html>
);

/** Đoạn thẳng px → hộp nằm trên mặt đất. */
const Segment = ({ a, b, width, y, h, color, extra = 0 }) => {
  const [ax, az] = toWorld(a);
  const [bx, bz] = toWorld(b);
  const len = Math.hypot(bx - ax, bz - az);
  return (
    <mesh position={[(ax + bx) / 2, y, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), 0]} receiveShadow>
      <boxGeometry args={[len + extra, h, width]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
};

const Ground = () => {
  const shape = useMemo(() => {
    const s = new Shape();
    BOUNDARY.forEach((p, i) => {
      const [x, z] = toWorld(p);
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    });
    return s;
  }, []);
  const grass = useMemo(() => grassTexture(0.04, 0.04), []);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[1400, 1100]} />
        <meshStandardMaterial color="#dde3d6" />
      </mesh>
      {OUTER_ROADS.map((r, i) => (
        <group key={i}>
          <Segment a={r[0]} b={r[1]} width={18} y={0} h={0.1} color="#e2e0da" />
          <Segment a={r[0]} b={r[1]} width={13} y={0.04} h={0.1} color="#6b7178" />
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial map={grass} color="#ffffff" roughness={1} />
      </mesh>
      {/* hàng rào */}
      {BOUNDARY.map((p, i) => (
        <Segment key={i} a={p} b={BOUNDARY[(i + 1) % BOUNDARY.length]} width={0.4} y={0.9} h={1.8} color="#e8eaec" />
      ))}
    </>
  );
};

const Roads = () => (
  <>
    {ROADS.flatMap((r, ri) => {
      const st = ROAD_STYLE[r.type];
      return r.pts.slice(1).map((p, i) => (
        <group key={`${ri}-${i}`}>
          <Segment a={r.pts[i]} b={p} width={r.w + 2.5} y={0.06} h={0.1} color={st.edge} extra={r.w + 2.5} />
          <Segment a={r.pts[i]} b={p} width={r.w} y={0.1} h={0.1} color={st.color} extra={r.w} />
        </group>
      ));
    })}
    {ROADS.filter((r) => r.name).map((r) => {
      const mid = Math.floor((r.pts.length - 1) / 2);
      const a = r.pts[mid];
      const b = r.pts[mid + 1];
      const [x, z] = toWorld([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      return <Label key={r.name} position={[x, 1, z]}>{r.name}</Label>;
    })}
  </>
);

const Pond = ({ b }) => {
  const map = useMemo(() => waterTexture(), []);
  const rocks = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const t = (i / 22) * Math.PI * 2;
        return [Math.cos(t) * b.w * 0.5, Math.sin(t) * b.d * 0.5, 0.8 + ((i * 37) % 10) / 12];
      }),
    [b.w, b.d],
  );
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} scale={[b.w / 2, b.d / 2, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial map={map} metalness={0.3} roughness={0.15} />
      </mesh>
      {rocks.map(([x, z, s], i) => (
        <mesh key={i} position={[x, 0.5, z]} scale={s} castShadow>
          <dodecahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial color={i % 2 ? "#a8a29e" : "#c4bdb4"} flatShading />
        </mesh>
      ))}
    </group>
  );
};

/** Khu đang thi công: nền đất, khung bê tông dở dang, cẩu tháp — minh hoạ. */
const Construction = ({ b }) => (
  <group position={[b.x, 0, b.z]}>
    <mesh position={[0, 0.15, 0]} receiveShadow>
      <boxGeometry args={[b.w, 0.2, b.d]} />
      <meshStandardMaterial color="#c9a77a" roughness={1} />
    </mesh>
    {[0, 1, 2, 3].map((f) => (
      <mesh key={f} position={[0, 2 + f * 3.4, 0]} castShadow>
        <boxGeometry args={[b.w * 0.42, 0.35, b.d * 0.3]} />
        <meshStandardMaterial color="#b7bcc2" />
      </mesh>
    ))}
    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
      <mesh key={`${sx}${sz}`} position={[(sx * b.w) / 5, 6.5, (sz * b.d) / 7]} castShadow>
        <boxGeometry args={[0.6, 13, 0.6]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
    ))}
    <group position={[b.w * 0.3, 0, -b.d * 0.25]}>
      <mesh position={[0, 15, 0]} castShadow>
        <boxGeometry args={[1, 30, 1]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[-8, 29.5, 0]} castShadow>
        <boxGeometry args={[24, 0.8, 0.8]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
    {[-8, -4, 0].map((dx) => (
      <mesh key={dx} position={[dx, 0.8, b.d / 2 - 2]} castShadow>
        <coneGeometry args={[0.6, 1.4, 10]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
    ))}
  </group>
);

const Plaza = ({ b }) => {
  const map = useMemo(() => tileTexture(b.w / 3, b.d / 3), [b.w, b.d]);
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[b.w, 0.12, b.d]} />
        <meshStandardMaterial map={map} />
      </mesh>
      <mesh position={[0, 6, -b.d * 0.15]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 12, 8]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.6} />
      </mesh>
      <mesh position={[1.2, 11, -b.d * 0.15]}>
        <boxGeometry args={[2.4, 1.5, 0.05]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
    </group>
  );
};

const Garden = ({ b }) => (
  <group position={[b.x, 0, b.z]}>
    <mesh position={[0, 0.15, 0]} receiveShadow>
      <cylinderGeometry args={[Math.min(b.w, b.d) / 2, Math.min(b.w, b.d) / 2, 0.15, 40]} />
      <meshStandardMaterial color="#ebe5d8" />
    </mesh>
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[4, 4, 0.2, 32]} />
      <meshStandardMaterial color="#5aa9d6" />
    </mesh>
    <mesh position={[0, 2, 0]} castShadow>
      <cylinderGeometry args={[0.6, 1, 3.4, 12]} />
      <meshStandardMaterial color="#b6a58c" />
    </mesh>
  </group>
);

const Canal = ({ b }) => {
  const map = useMemo(() => waterTexture(), []);
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[b.w + 2, 0.12, b.d]} />
        <meshStandardMaterial color="#d6d3cc" />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[b.w - 1, 0.1, b.d - 1]} />
        <meshStandardMaterial map={map} metalness={0.3} roughness={0.15} />
      </mesh>
    </group>
  );
};

const BusStop = ({ b }) => (
  <group position={[b.x, 0, b.z]}>
    <mesh position={[0, 2.6, 0]} castShadow>
      <boxGeometry args={[b.w, 0.2, b.d]} />
      <meshStandardMaterial color="#38bdf8" />
    </mesh>
    <mesh position={[0, 1.3, -b.d / 2 + 0.1]}>
      <boxGeometry args={[b.w, 2.6, 0.1]} />
      <meshStandardMaterial color="#bae6fd" transparent opacity={0.6} />
    </mesh>
  </group>
);

const Sign = ({ b }) => (
  <group position={[b.x, 0, b.z]} rotation={[0, 0.12, 0]}>
    <mesh position={[0, 1.6, 0]} castShadow>
      <boxGeometry args={[b.w * 0.8, 3.2, 2.4]} />
      <meshStandardMaterial color="#8b5a3c" roughness={0.8} />
    </mesh>
    <Label position={[0, 4.6, 0]} tone="navy">Trường ĐH Kinh tế – Luật</Label>
  </group>
);

const LAND = { water: Pond, construction: Construction, plaza: Plaza, garden: Garden, canal: Canal, bus: BusStop, sign: Sign };

const Landscape = () =>
  LANDSCAPE.map((l) => {
    const Comp = LAND[l.kind];
    const b = rectBox(l.rect);
    return (
      <group key={l.id}>
        {Comp && <Comp b={b} />}
        {l.name && l.kind !== "sign" && (
          <Label position={[b.x, l.kind === "construction" ? 34 : 4, b.z]} tone="navy">
            {l.name}
          </Label>
        )}
      </group>
    );
  });

const CANOPY = ["#4f8f3f", "#5fa24a", "#3f7f39"];

/** Cây minh hoạ: 1 InstancedMesh thân + 3 InstancedMesh tán (3 sắc xanh). */
const Trees = () => {
  const trees = useMemo(() => makeTrees(), []);
  const trunk = useRef();
  const crowns = [useRef(), useRef(), useRef()];
  useLayoutEffect(() => {
    const o = new Object3D();
    const n = [0, 0, 0];
    trees.forEach((t, i) => {
      const [x, z] = toWorld(t.p);
      o.position.set(x, 1.6 * t.s, z);
      o.scale.set(t.s, t.s, t.s);
      o.updateMatrix();
      trunk.current.setMatrixAt(i, o.matrix);
      o.position.set(x, 5 * t.s, z);
      o.scale.set(t.s * 1.1, t.s, t.s * 1.1);
      o.updateMatrix();
      crowns[t.c].current.setMatrixAt(n[t.c]++, o.matrix);
    });
    trunk.current.instanceMatrix.needsUpdate = true;
    crowns.forEach((r, k) => {
      r.current.count = n[k];
      r.current.instanceMatrix.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees]);
  return (
    <>
      <instancedMesh ref={trunk} args={[null, null, trees.length]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 3.2, 6]} />
        <meshStandardMaterial color="#7c5a3a" />
      </instancedMesh>
      {crowns.map((r, k) => (
        <instancedMesh key={k} ref={r} args={[null, null, trees.length]} castShadow>
          <icosahedronGeometry args={[3, 1]} />
          <meshStandardMaterial color={new Color(CANOPY[k])} flatShading roughness={0.9} />
        </instancedMesh>
      ))}
    </>
  );
};

const Streets = () =>
  STREETS.map((s) => {
    const [x, z] = toWorld(s.at);
    return (
      <Html key={s.name} position={[x, 0.5, z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <span
          className="block whitespace-nowrap rounded bg-white/85 px-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600"
          style={s.vertical ? { transform: "rotate(-80deg)" } : undefined}
        >
          {s.name}
        </span>
      </Html>
    );
  });

const Gate = ({ gate, twin, selected, selectedCameraId, layers, onSelect, onSelectCamera }) => {
  const [x, z] = toWorld(gate.at);
  const ids = [...gate.cameraIds].filter((id) => twin.stateById[id]);
  const cams = ids
    .map((id) => twin.cameras.find((c) => c.id === id))
    .filter((c) => layers[cameraKind(c)]);
  const state = ids.some((id) => twin.stateById[id] === "alert")
    ? "alert"
    : ids.some((id) => twin.stateById[id] === "offline")
      ? "offline"
      : "online";
  const ring = !ids.length ? "#94a3b8" : STATE[state].color;
  // cột cổng vuông góc hướng nhìn vào trong
  const rot = -((gate.face + 90) * Math.PI) / 180;
  const frame = selected ? "#c2410c" : "#1e3a5f";

  return (
    <group position={[x, 0, z]}>
      <group
        rotation={[0, rot, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        {[-6, 6].map((dx) => (
          <mesh key={dx} position={[dx, 2.5, 0]} castShadow>
            <boxGeometry args={[1.4, 5, 1.4]} />
            <meshStandardMaterial color={frame} />
          </mesh>
        ))}
        <mesh position={[0, 5.3, 0]} castShadow>
          <boxGeometry args={[14, 0.8, 1.8]} />
          <meshStandardMaterial color={frame} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[10.5, 0.15, 0.15]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
          <ringGeometry args={[8, 9.2, 40]} />
          <meshBasicMaterial color={ring} />
        </mesh>
      </group>
      {cams.map((c, i) => {
        const off = (i - (cams.length - 1) / 2) * 3.4;
        return (
          <CameraMarker
            key={c.id}
            position={[Math.cos(rot) * off, 6.8, -Math.sin(rot) * off]}
            angle={gate.face}
            kind={cameraKind(c)}
            state={twin.stateById[c.id]}
            code={c.device_code}
            scale={2.6}
            fovRadius={24}
            selected={selectedCameraId === c.id}
            showFov={layers.fov}
            onSelect={() => onSelectCamera(c.id)}
          />
        );
      })}
      <Html position={[0, 11, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex select-none flex-col items-center gap-0.5">
          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-white text-white shadow-md" style={{ background: ring }}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M4 7h11a2 2 0 0 1 2 2v1.5l3.5-2.5v8L17 13.5V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /></svg>
          </span>
          <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white shadow ${selected ? "bg-[#c2410c]" : "bg-[#1e3a5f]"}`}>
            {gate.name}
            <span className="ml-1 font-normal text-slate-200">· {ids.length} cam</span>
          </span>
        </div>
      </Html>
    </group>
  );
};

/** Bản đồ tổng quan khuôn viên dạng 3D isometric. */
const CampusOverview3D = ({
  twin,
  apiRef,
  layers,
  selectedBuildingId,
  selectedGateId,
  selectedCameraId,
  onSelectBuilding,
  onOpenBuilding,
  onSelectGate,
  onSelectCamera,
  onClear,
}) => (
  <Canvas
    shadows
    dpr={[1, 1.75]}
    camera={{ fov: 35, near: 1, far: 3000, position: CAMPUS_HOME.position }}
    onPointerMissed={onClear}
    fallback={<div className="p-6 text-sm text-slate-500">Trình duyệt không hỗ trợ WebGL — không hiển thị được bản đồ 3D.</div>}
  >
    <color attach="background" args={["#dcebf5"]} />
    <fog attach="fog" args={["#dcebf5", 650, 1400]} />
    <hemisphereLight args={["#f4f9ff", "#9fb38a", 1]} />
    <directionalLight
      position={[-180, 300, 160]}
      intensity={1.9}
      color="#fff6e8"
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-300}
      shadow-camera-right={300}
      shadow-camera-top={240}
      shadow-camera-bottom={-240}
      shadow-camera-far={900}
      shadow-bias={-0.0004}
      shadow-normalBias={0.6}
    />
    <Ground />
    <Roads />
    <Landscape />
    <Trees />
    <Streets />
    {BUILDINGS.map((b) => {
      const tb = twin.buildings[b.id];
      return (
        <BuildingModel3D
          key={b.id}
          building={b}
          summary={twin.summarize(tb.cameraIds)}
          selected={selectedBuildingId === b.id}
          onSelect={() => onSelectBuilding(b.id)}
          onOpen={() => onOpenBuilding(b.id)}
        />
      );
    })}
    {Object.values(twin.gates).map((g) => (
      <Gate
        key={g.id}
        gate={g}
        twin={twin}
        layers={layers}
        selected={selectedGateId === g.id}
        selectedCameraId={selectedCameraId}
        onSelect={() => onSelectGate(g.id)}
        onSelectCamera={onSelectCamera}
      />
    ))}
    <ViewRig apiRef={apiRef} home={CAMPUS_HOME} minDistance={30} maxDistance={800} />
  </Canvas>
);

export default CampusOverview3D;
