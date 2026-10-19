import { useMemo } from "react";
import { DoubleSide, Shape } from "three";

/**
 * Vùng quan sát hình quạt nằm ngang (mặt XZ), đỉnh tại gốc toạ độ của group cha.
 * angle: độ, cùng quy ước sơ đồ 2D (0° = hướng +x, 90° = hướng +z / "xuống" trên mặt bằng).
 */
const CameraFieldOfView = ({ angle = 0, radius = 4, spread = 30, color = "#2563eb", y = 0.05 }) => {
  const shape = useMemo(() => {
    const s = new Shape();
    const a1 = ((angle - spread) * Math.PI) / 180;
    const a2 = ((angle + spread) * Math.PI) / 180;
    s.moveTo(0, 0);
    // Shape vẽ trên mặt XY rồi xoay -90° quanh X ⇒ y của shape = -z thế giới.
    for (let i = 0; i <= 24; i++) {
      const a = a1 + ((a2 - a1) * i) / 24;
      s.lineTo(radius * Math.cos(a), -radius * Math.sin(a));
    }
    s.lineTo(0, 0);
    return s;
  }, [angle, radius, spread]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={() => null}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color={color} transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
    </mesh>
  );
};

export default CameraFieldOfView;
