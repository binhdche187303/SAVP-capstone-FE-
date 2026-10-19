import { Html } from "@react-three/drei";
import { useState } from "react";
import CameraFieldOfView from "./CameraFieldOfView";
import { KIND, STATE, markerColor } from "./theme";

/**
 * Camera trên scene 3D: thân camera nhỏ hướng theo `angle`, chấm trạng thái, nhãn mã chỉ hiện
 * khi rê chuột / được chọn (tránh chồng nhãn ở mức tổng quan).
 */
const CameraMarker = ({
  position,
  angle = 0,
  kind = "ai",
  state = "online",
  code,
  selected = false,
  showFov = false,
  fovRadius = 4,
  scale = 1,
  onSelect,
}) => {
  const [hover, setHover] = useState(false);
  const color = markerColor(kind, state);
  const rad = (angle * Math.PI) / 180;

  return (
    <group position={position}>
      {selected && showFov && (
        <group position={[0, -position[1] + 0.02, 0]}>
          <CameraFieldOfView angle={angle} radius={fovRadius} color={KIND[kind].color} />
        </group>
      )}
      <group
        scale={scale * (selected ? 1.35 : hover ? 1.15 : 1)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
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
        {/* cột đỡ */}
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        {/* thân camera quay theo hướng nhìn */}
        <group rotation={[0, -rad, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.7, 0.32, 0.34]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.15, 0.14, 12]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
        {/* chấm trạng thái */}
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshBasicMaterial color={STATE[state].color} />
        </mesh>
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -position[1] + 0.03, 0]}>
            <ringGeometry args={[0.55, 0.75, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
        )}
      </group>
      {(hover || selected) && code && (
        <Html position={[0, 0.8 * scale, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
            {code}
            <span className="ml-1 font-normal text-slate-300">· {STATE[state].label}</span>
          </div>
        </Html>
      )}
    </group>
  );
};

export default CameraMarker;
