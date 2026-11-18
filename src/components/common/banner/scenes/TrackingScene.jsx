/**
 * TrackingScene.jsx — Slide 0: Camera AI / Real-time Security Monitoring
 *
 * ════════════════════════════════════════════════════════════════════════
 *  SWAP TO GLB MODEL — làm theo 3 bước sau:
 *
 *  1. Đặt file vào:  public/models/tracking.glb
 *
 *  2. Xóa toàn bộ phần "PROCEDURAL GEOMETRY" bên dưới.
 *
 *  3. Thay bằng đoạn code sau:
 *
 *     import { useGLTF, useAnimations } from '@react-three/drei';
 *     import { useEffect, useRef } from 'react';
 *
 *     const Model = () => {
 *       const group = useRef();
 *       const { scene, animations } = useGLTF('/models/tracking.glb');
 *       const { actions } = useAnimations(animations, group);
 *       useEffect(() => {
 *         // Chạy animation đầu tiên nếu có
 *         const first = Object.keys(actions)[0];
 *         if (first) actions[first].play();
 *       }, [actions]);
 *       return <primitive ref={group} object={scene} scale={1.5} position={[0, 0, 0]} />;
 *     };
 *     // Preload để tránh giật khi switch slide
 *     useGLTF.preload('/models/tracking.glb');
 *
 *     Sau đó thay <TrackingProcedural ... /> bằng <Model />.
 * ════════════════════════════════════════════════════════════════════════
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { MathUtils, Color } from 'three';

// ── Color lerp hook (dùng chung giữa các scene) ───────────────────────────────
const useLerpColor = (targetHex, speed = 0.06) => {
    const colorRef = useRef(new Color(targetHex));
    const targetRef = useRef(new Color(targetHex));
    // Cập nhật target khi prop thay đổi (slide change)
    if (targetRef.current.getHexString() !== new Color(targetHex).getHexString()) {
        targetRef.current.set(targetHex);
    }
    useFrame(() => {
        colorRef.current.r = MathUtils.lerp(colorRef.current.r, targetRef.current.r, speed);
        colorRef.current.g = MathUtils.lerp(colorRef.current.g, targetRef.current.g, speed);
        colorRef.current.b = MathUtils.lerp(colorRef.current.b, targetRef.current.b, speed);
    });
    return colorRef;
};

// ── PROCEDURAL GEOMETRY ───────────────────────────────────────────────────────
// Xóa phần này và thay bằng GLB model khi sẵn sàng (xem hướng dẫn ở trên).
const TrackingProcedural = ({ accentHex, meshHex, emissiveHex }) => {
    const ring1 = useRef();
    const ring2 = useRef();
    const matRef = useRef();
    const meshColorRef = useLerpColor(meshHex);
    const emissiveColorRef = useLerpColor(emissiveHex);

    useFrame((state) => {
        if (ring1.current) ring1.current.rotation.z = state.clock.elapsedTime * 0.35;
        if (ring2.current) ring2.current.rotation.z = -state.clock.elapsedTime * 0.22;
        if (matRef.current) {
            matRef.current.color.copy(meshColorRef.current);
            matRef.current.emissive.copy(emissiveColorRef.current);
        }
    });

    const dots = useMemo(() =>
        Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2;
            const r = 1.88;
            return [Math.cos(a) * r, Math.sin(a) * r * 0.4, Math.sin(a) * r * 0.9];
        }), []);

    return (
        <group>
            <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.55}>
                <Sphere args={[1.22, 80, 80]}>
                    <MeshDistortMaterial
                        ref={matRef}
                        color={meshHex}
                        emissive={emissiveHex}
                        emissiveIntensity={0.45}
                        distort={0.44}
                        speed={3.2}
                        metalness={0.15}
                        roughness={0.08}
                    />
                </Sphere>
            </Float>

            {/* Orbital ring A */}
            <group ref={ring1} rotation={[Math.PI * 0.34, 0, 0]}>
                <mesh>
                    <torusGeometry args={[1.88, 0.022, 16, 100]} />
                    <meshBasicMaterial color={accentHex} transparent opacity={0.6} />
                </mesh>
                {dots.map((pos, i) => (
                    <mesh key={i} position={pos}>
                        <sphereGeometry args={[i % 2 === 0 ? 0.06 : 0.04, 8, 8]} />
                        <meshBasicMaterial color={i % 3 === 0 ? '#ffffff' : accentHex} />
                    </mesh>
                ))}
            </group>

            {/* Orbital ring B */}
            <group ref={ring2} rotation={[Math.PI * 0.55, Math.PI * 0.22, 0]}>
                <mesh>
                    <torusGeometry args={[2.35, 0.012, 16, 100]} />
                    <meshBasicMaterial color={accentHex} transparent opacity={0.2} />
                </mesh>
            </group>
        </group>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const TrackingScene = (props) => <TrackingProcedural {...props} />;

export default TrackingScene;
