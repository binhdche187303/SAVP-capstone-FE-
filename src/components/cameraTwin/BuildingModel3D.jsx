import { Html } from "@react-three/drei";
import { useMemo, useState } from "react";
import { FLOOR_HEIGHT_M, toWorld } from "./campusModel";
import { facadeTexture, roofTexture } from "./textures";
import { NAVY, STATE } from "./theme";

const BAY = 3.6; // bước cột minh hoạ (m)

// hướng mặt chính → [trục, dấu]: s = +z, n = -z, e = +x, w = -x
const FRONT = { s: ["z", 1], n: ["z", -1], e: ["x", 1], w: ["x", -1] };

/** Hộp có texture mặt tiền 4 phía + mái riêng. Thứ tự vật liệu BoxGeometry: +x, -x, +y, -y, +z, -z. */
const FacadeBox = ({ w, d, h, style, rows, tint, roof = true }) => {
  const mats = useMemo(() => {
    const side = (len) => facadeTexture(style, len / BAY, rows);
    const fx = side(d);
    const fz = side(w);
    const top = roofTexture(Math.max(1, w / 12), Math.max(1, d / 12));
    return [fx, fx, top, top, fz, fz];
  }, [w, d, style, rows]);
  return (
    <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      {mats.map((map, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={i === 2 && !roof ? null : map}
          color={tint}
          roughness={i === 2 || i === 3 ? 0.95 : 0.55}
          metalness={i === 2 || i === 3 ? 0 : 0.08}
        />
      ))}
    </mesh>
  );
};

/** Tường chắn mái + khối kỹ thuật + bể nước. */
const Roof = ({ w, d, h, accent }) => (
  <group position={[0, h, 0]}>
    {[
      [0, d / 2, w, 0.25],
      [0, -d / 2, w, 0.25],
      [w / 2, 0, 0.25, d],
      [-w / 2, 0, 0.25, d],
    ].map(([x, z, sx, sz], i) => (
      <mesh key={i} position={[x, 0.5, z]} castShadow>
        <boxGeometry args={[sx, 1, sz]} />
        <meshStandardMaterial color={accent} />
      </mesh>
    ))}
    {w > 14 && d > 10 && (
      <>
        <mesh position={[-w * 0.22, 1.4, -d * 0.12]} castShadow>
          <boxGeometry
            args={[Math.min(10, w * 0.22), 2.8, Math.min(8, d * 0.35)]}
          />
          <meshStandardMaterial color="#e2e5e8" />
        </mesh>
        <mesh position={[w * 0.25, 1, d * 0.15]} castShadow>
          <cylinderGeometry args={[1.4, 1.4, 2, 16]} />
          <meshStandardMaterial
            color="#9aa3ad"
            metalness={0.4}
            roughness={0.4}
          />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[w * 0.05 + i * 2.4, 0.6, -d * 0.25]}
            castShadow
          >
            <boxGeometry args={[1.8, 1.2, 1.8]} />
            <meshStandardMaterial color="#b8bec5" />
          </mesh>
        ))}
      </>
    )}
  </group>
);

/** Sảnh vào + mái che ở mặt chính. */
const Entrance = ({ w, d, front, wide, color = "#e9edf1" }) => {
  const [axis, sign] = FRONT[front] || FRONT.s;
  const along = axis === "z" ? w : d;
  const cw = Math.min(along * (wide ? 0.45 : 0.3), 26);
  const off = (axis === "z" ? d : w) / 2 + 2.2;
  const pos = axis === "z" ? [0, 0, sign * off] : [sign * off, 0, 0];
  const size = axis === "z" ? [cw, 0.35, 4.4] : [4.4, 0.35, cw];
  const steps = axis === "z" ? [cw + 2, 0.3, 6] : [6, 0.3, cw + 2];
  return (
    <group position={pos}>
      <mesh position={[0, 4.4, 0]} castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={
            axis === "z"
              ? [(s * cw) / 2.3, 2.2, sign * 1.6]
              : [sign * 1.6, 2.2, (s * cw) / 2.3]
          }
          castShadow
        >
          <cylinderGeometry args={[0.25, 0.25, 4.4, 10]} />
          <meshStandardMaterial color="#d7dce1" />
        </mesh>
      ))}
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={steps} />
        <meshStandardMaterial color="#e7e2d8" />
      </mesh>
    </group>
  );
};

/** Khối kính giữa mặt chính (kiểu tòa A1). */
const Curtain = ({ w, d, h, front }) => {
  const [axis, sign] = FRONT[front] || FRONT.s;
  const cw = (axis === "z" ? w : d) * 0.26;
  const map = useMemo(
    () => facadeTexture("curtain", cw / 2.4, Math.round(h / FLOOR_HEIGHT_M)),
    [cw, h],
  );
  const off = (axis === "z" ? d : w) / 2 + 0.9;
  return (
    <group position={axis === "z" ? [0, 0, sign * off] : [sign * off, 0, 0]}>
      <mesh position={[0, (h + 3) / 2, 0]} castShadow>
        <boxGeometry
          args={axis === "z" ? [cw, h + 3, 1.8] : [1.8, h + 3, cw]}
        />
        <meshStandardMaterial map={map} metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, h + 3.2, 0]}>
        <boxGeometry
          args={axis === "z" ? [cw + 0.6, 0.4, 2.2] : [2.2, 0.4, cw + 0.6]}
        />
        <meshStandardMaterial color="#e5e9ec" />
      </mesh>
    </group>
  );
};

/** Nhà xe: cột thép + mái tôn dốc nhẹ. */
const Shed = ({ w, d, h, color, tint }) => {
  const n = Math.max(2, Math.round(w / 8));
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) =>
        [-1, 1].map((s) => (
          <mesh
            key={`${i}${s}`}
            position={[-w / 2 + (w * i) / n, h / 2, (s * d) / 2.3]}
            castShadow
          >
            <boxGeometry args={[0.35, h, 0.35]} />
            <meshStandardMaterial color="#8a939d" />
          </mesh>
        )),
      )}
      <mesh
        position={[0, h + 0.2, 0]}
        rotation={[0.06, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w + 1, 0.3, d + 1]} />
        <meshStandardMaterial
          color={tint || color}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>
    </>
  );
};

/**
 * Khối nhà: mặt tiền texture theo `style`, mái có tường chắn + thiết bị kỹ thuật, sảnh ở mặt chính.
 * Chi tiết mặt tiền là MINH HOẠ (chưa có mặt đứng); vị trí, footprint, số tầng theo campusModel.
 */
const BuildingModel3D = ({
  building,
  summary,
  selected,
  dimmed,
  onSelect,
  onOpen,
}) => {
  const [hover, setHover] = useState(false);
  const [x0, z0] = toWorld([building.rect[0], building.rect[1]]);
  const [x1, z1] = toWorld([building.rect[2], building.rect[3]]);
  const w = x1 - x0;
  const d = z1 - z0;
  const fh = building.style === "hall" ? FLOOR_HEIGHT_M * 1.5 : FLOOR_HEIGHT_M;
  const h = building.floors * fh;
  const flat = building.roof === "flat";
  const clickable = !!onSelect;
  const tint = selected
    ? "#cfe0f5"
    : hover
      ? "#f3f8ff"
      : dimmed
        ? "#c8ccd2"
        : "#ffffff";
  const status = summary?.total
    ? summary.alert
      ? STATE.alert.color
      : summary.offline
        ? "#64748b"
        : STATE.online.color
    : null;
  const top = flat ? fh + 1 : h + (building.style === "tower" ? 6 : 3);

  return (
    <group
      position={[x0 + w / 2, 0, z0 + d / 2]}
      onClick={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen();
      }}
      onPointerOver={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      {flat ? (
        <Shed
          w={w}
          d={d}
          h={fh}
          color={building.color}
          tint={selected ? "#9fb7d6" : hover ? "#dbe4ee" : undefined}
        />
      ) : (
        <>
          <FacadeBox
            w={w}
            d={d}
            h={h}
            style={building.style}
            rows={building.floors}
            tint={tint}
          />
          <Roof
            w={w}
            d={d}
            h={h}
            accent={building.style === "canteen" ? "#ffffff" : "#e4e7ea"}
          />
          {building.style === "tower" && (
            <Curtain w={w} d={d} h={h} front={building.front} />
          )}
          {building.style === "band" && (
            <mesh position={[0, h * 0.55, d / 2 + 0.15]}>
              <boxGeometry args={[w * 0.85, 1.2, 0.2]} />
              <meshStandardMaterial color="#e3a43b" />
            </mesh>
          )}
          {building.floors > 1 && (
            <Entrance
              w={w}
              d={d}
              front={building.front}
              wide={building.style === "tower"}
            />
          )}
        </>
      )}

      {/* bệ nền + vỉa hè quanh nhà */}
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[w + 6, 0.16, d + 6]} />
        <meshStandardMaterial color={selected ? "#bcd0ea" : "#e4e1da"} />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
          <ringGeometry
            args={[Math.max(w, d) * 0.62, Math.max(w, d) * 0.66, 48]}
          />
          <meshBasicMaterial color={NAVY} transparent opacity={0.6} />
        </mesh>
      )}

      <Html
        position={[0, top, building.labelAt === "n" ? -d / 2 - 4 : 0]}
        center
        zIndexRange={[20, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="flex select-none flex-col items-center gap-0.5">
          {status && (
            <div
              className="flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-white py-0.5 pl-0.5 pr-2 text-[11px] font-bold text-white shadow-md"
              style={{ background: status }}
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-white/25">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="currentColor"
                >
                  <path d="M4 7h11a2 2 0 0 1 2 2v1.5l3.5-2.5v8L17 13.5V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                </svg>
              </span>
              {summary.total}
              {summary.offline > 0 && (
                <span className="font-medium opacity-90">
                  · {summary.offline} mất
                </span>
              )}
              {summary.alert > 0 && (
                <span className="font-medium opacity-90">
                  · {summary.alert} ⚠
                </span>
              )}
            </div>
          )}
          <div
            className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold shadow ${selected ? "bg-[#c2410c] text-white" : "bg-[#1e3a5f] text-white"}`}
          >
            {building.name}
          </div>
        </div>
      </Html>
    </group>
  );
};

export default BuildingModel3D;
