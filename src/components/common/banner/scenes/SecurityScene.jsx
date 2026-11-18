/**
 * SecurityScene.jsx — Slide 2: Smart Meeting Room / Security
 *
 * ════════════════════════════════════════════════════════════════════════
 *  SWAP TO GLB MODEL — làm theo 3 bước sau:
 *
 *  1. Đặt file vào:  public/models/security.glb
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
 *       const { scene, animations } = useGLTF('/models/security.glb');
 *       const { actions } = useAnimations(animations, group);
 *       useEffect(() => {
 *         const first = Object.keys(actions)[0];
 *         if (first) actions[first].play();
 *       }, [actions]);
 *       return <primitive ref={group} object={scene} scale={1.5} position={[0, 0, 0]} />;
 *     };
 *     useGLTF.preload('/models/security.glb');
 *
 *     Sau đó thay <SecurityProcedural ... /> bằng <Model />.
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
const SecurityProcedural = ({ accentHex, meshHex, emissiveHex }) => {
    const pulseRefs  = useRef([null, null, null]);
    const shieldMats = useRef([]);
    const matRef     = useRef();
    const meshColorRef     = useLerpColor(meshHex);
    const emissiveColorRef = useLerpColor(emissiveHex);

    const nodePositions = useMemo(() => [
        [1.55, 0.75, 0.2],
        [-1.55, 0.75, -0.2],
        [0.2, -1.6, 0.6],
        [1.1, -0.6, 1.2],
        [-1.0, -0.5, -1.1],
    ], []);

    useFrame((state) => {
        const t = state.clock.elapsedTime;

        pulseRefs.current.forEach((ring, i) => {
            if (!ring) return;
            const phase = ((t * 0.7 + i * 0.72) % 2.0);
            const s = 1 + phase * 1.6;
            ring.scale.set(s, s, s);
            ring.material.opacity = Math.max(0, 0.45 - phase * 0.23);
        });

        shieldMats.current.forEach((mat, i) => {
            if (!mat) return;
            mat.opacity = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.3);
        });

        if (matRef.current) {
            matRef.current.color.copy(meshColorRef.current);
            matRef.current.emissive.copy(emissiveColorRef.current);
        }
    });

    return (
        <group>
            {/* Core sphere */}
            <Float speed={1.3} rotationIntensity={0.28} floatIntensity={0.45}>
                <Sphere args={[1.05, 72, 72]}>
                    <MeshDistortMaterial
                        ref={matRef}
                        color={meshHex}
                        emissive={emissiveHex}
                        emissiveIntensity={0.5}
                        distort={0.28}
                        speed={2.5}
                        metalness={0.35}
                        roughness={0.08}
                    />
                </Sphere>
            </Float>

            {/* Radar pulse rings */}
            {[0, 1, 2].map(i => (
                <mesh
                    key={i}
                    ref={el => { pulseRefs.current[i] = el; }}
                    rotation={[Math.PI / 2, 0, 0]}
                >
                    <ringGeometry args={[1.1, 1.18, 72]} />
                    <meshBasicMaterial color={accentHex} transparent opacity={0.35} depthWrite={false} />
                </mesh>
            ))}

            {/* Shield nodes */}
            {nodePositions.map((pos, i) => (
                <mesh key={i} position={pos}>
                    <sphereGeometry args={[0.09, 10, 10]} />
                    <meshBasicMaterial
                        ref={el => { if (el) shieldMats.current[i] = el; }}
                        color={accentHex}
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            ))}

            {/* Decorative outer ring */}
            <mesh rotation={[Math.PI * 0.28, Math.PI * 0.15, 0]}>
                <torusGeometry args={[2.1, 0.016, 12, 80]} />
                <meshBasicMaterial color={accentHex} transparent opacity={0.18} />
            </mesh>
        </group>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const SecurityScene = (props) => <SecurityProcedural {...props} />;

export default SecurityScene;
