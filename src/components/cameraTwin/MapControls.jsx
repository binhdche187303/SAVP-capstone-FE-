import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Minus, Plus, RotateCcw, RotateCw, Scan } from "lucide-react";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";

/**
 * Điều khiển góc nhìn trong Canvas: OrbitControls + API (zoom/xoay/reset/focus) gán vào `apiRef`
 * để các nút HTML bên ngoài Canvas gọi được. Chuyển góc nhìn có nội suy mượt.
 */
export const ViewRig = ({ apiRef, home, minDistance = 10, maxDistance = 600 }) => {
  const controls = useRef();
  const { camera } = useThree();
  const goal = useRef(null);

  useEffect(() => {
    camera.position.set(...home.position);
    controls.current?.target.set(...home.target);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.position.join(","), home.target.join(",")]);

  useEffect(() => {
    const to = (position, target) => {
      goal.current = { position: new Vector3(...position), target: new Vector3(...target) };
    };
    const offset = () => camera.position.clone().sub(controls.current.target);
    apiRef.current = {
      zoom: (factor) => {
        const t = controls.current.target;
        const off = offset().multiplyScalar(factor);
        const len = Math.min(maxDistance, Math.max(minDistance, off.length()));
        off.setLength(len);
        to(t.clone().add(off).toArray(), t.toArray());
      },
      rotate: (deg) => {
        const t = controls.current.target;
        const off = offset().applyAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
        to(t.clone().add(off).toArray(), t.toArray());
      },
      reset: () => to(home.position, home.target),
      focus: ([x, y, z], distance = 70) => {
        const dir = new Vector3(...home.position).sub(new Vector3(...home.target)).setLength(distance);
        to([x + dir.x, y + dir.y, z + dir.z], [x, y, z]);
      },
    };
  }, [apiRef, camera, home, minDistance, maxDistance]);

  useFrame(() => {
    if (!goal.current || !controls.current) return;
    camera.position.lerp(goal.current.position, 0.12);
    controls.current.target.lerp(goal.current.target, 0.12);
    controls.current.update();
    if (camera.position.distanceTo(goal.current.position) < 0.05) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2.2}
      onStart={() => (goal.current = null)}
    />
  );
};

const Btn = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="flex h-9 w-9 items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-[#1e3a5f]"
  >
    {children}
  </button>
);

/** Nút điều khiển nổi góc phải dưới bản đồ. */
const MapControls = ({ apiRef }) => {
  const call = (fn, ...args) => apiRef.current?.[fn]?.(...args);
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md divide-y divide-slate-100">
      <Btn title="Phóng to" onClick={() => call("zoom", 0.7)}><Plus className="h-4 w-4" /></Btn>
      <Btn title="Thu nhỏ" onClick={() => call("zoom", 1.4)}><Minus className="h-4 w-4" /></Btn>
      <Btn title="Xoay trái 45°" onClick={() => call("rotate", -45)}><RotateCcw className="h-4 w-4" /></Btn>
      <Btn title="Xoay phải 45°" onClick={() => call("rotate", 45)}><RotateCw className="h-4 w-4" /></Btn>
      <Btn title="Đặt lại góc nhìn" onClick={() => call("reset")}><Scan className="h-4 w-4" /></Btn>
    </div>
  );
};

export default MapControls;
