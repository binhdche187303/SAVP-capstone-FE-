/**
 * FleetScene.jsx — Slide 1: Vehicle Access Control / ANPR
 *
 * ════════════════════════════════════════════════════════════════════════
 *  SWAP TO GLB MODEL — làm theo 3 bước sau:
 *
 *  1. Đặt file vào:  public/models/fleet.glb
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
 *       const { scene, animations } = useGLTF('/models/fleet.glb');
 *       const { actions } = useAnimations(animations, group);
 *       useEffect(() => {
 *         const first = Object.keys(actions)[0];
 *         if (first) actions[first].play();
 *       }, [actions]);
 *       return <primitive ref={group} object={scene} scale={1.5} position={[0, 0, 0]} />;
 *     };
 *     useGLTF.preload('/models/fleet.glb');
 *
 *     Sau đó thay <FleetProcedural ... /> bằng <Model />.
 * ════════════════════════════════════════════════════════════════════════
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { MathUtils, Color } from 'three';

const useLerpColor = (targetHex, speed = 0.06) => {
    const colorRef = useRef(new Color(targetHex));
    const targetRef = useRef(new Color(targetHex));
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
const FleetProcedural = ({ accentHex, meshHex, emissiveHex }) => {
    const orbitGroupRef = useRef();
    const innerRingRef  = useRef();
    const matRef        = useRef();
    const meshColorRef  = useLerpColor(meshHex);
    const emissiveColorRef = useLerpColor(emissiveHex);

    const orbitDots = useMemo(() =>
        Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return { pos: [Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8], bright: i % 2 === 0 };
        }), []);

    useFrame((state) => {
        if (orbitGroupRef.current)
            orbitGroupRef.current.rotation.y = state.clock.elapsedTime * 0.55;
        if (innerRingRef.current)
            innerRingRef.current.rotation.z = -state.clock.elapsedTime * 0.8;
        if (matRef.current) {
            matRef.current.color.copy(meshColorRef.current);
            matRef.current.emissive.copy(emissiveColorRef.current);
        }
    });

    return (
        <group>
            {/* Central hub */}
            <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.4}>
                <Sphere args={[0.85, 64, 64]}>
                    <MeshDistortMaterial
                        ref={matRef}
                        color={meshHex}
                        emissive={emissiveHex}
                        emissiveIntensity={0.55}
                        distort={0.22}
                        speed={2.0}
                        metalness={0.5}
                        roughness={0.05}
                    />
                </Sphere>
            </Float>

            {/* Orbit ring + travelling nodes */}
            <group ref={orbitGroupRef} rotation={[Math.PI * 0.2, 0, 0]}>
                <mesh>
                    <torusGeometry args={[1.8, 0.032, 20, 120]} />
                    <meshBasicMaterial color={accentHex} transparent opacity={0.7} />
                </mesh>
                {orbitDots.map((d, i) => (
                    <mesh key={i} position={d.pos}>
                        <sphereGeometry args={[d.bright ? 0.09 : 0.055, 10, 10]} />
                        <meshBasicMaterial color={d.bright ? '#ffffff' : accentHex} />
                    </mesh>
                ))}
            </group>

            {/* Inner decorative ring */}
            <mesh ref={innerRingRef} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.2, 0.014, 12, 80]} />
                <meshBasicMaterial color={accentHex} transparent opacity={0.25} />
            </mesh>

            {/* Outer glow ring */}
            <mesh rotation={[Math.PI * 0.4, Math.PI * 0.3, 0]}>
                <torusGeometry args={[2.4, 0.01, 12, 80]} />
                <meshBasicMaterial color={accentHex} transparent opacity={0.12} />
            </mesh>
        </group>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const FleetScene = (props) => <FleetProcedural {...props} />;

export default FleetScene;
