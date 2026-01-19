import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const NeuralNetwork = ({ particleCount = 100 }) => {
    const pointsRef = useRef();

    // Reduced Motion Preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Generate particles
    const particles = useMemo(() => {
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        // Slate-50 particles
        const colorChoices = [
            new THREE.Color(0xf8fafc) // Slate-50
        ];

        for (let i = 0; i < particleCount; i++) {
            // Spread particles across a wide area
            positions[i * 3] = (Math.random() - 0.5) * 15;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

            const color = colorChoices[Math.floor(Math.random() * colorChoices.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        return { positions, colors };
    }, [particleCount]);

    // Frame Rate Governor
    const targetFPS = 60;
    let lastFrame = 0;

    useFrame((state) => {
        if (prefersReducedMotion) return;

        const now = state.clock.elapsedTime;
        if (now - lastFrame < 1 / targetFPS) return;
        lastFrame = now;

        if (pointsRef.current) {
            // Slow breathing animation on Y-axis
            const t = state.clock.getElapsedTime();
            pointsRef.current.rotation.y = t * 0.05; // Slow rotation
            pointsRef.current.position.y = Math.sin(t * 0.5) * 0.2; // Breathing

            // Subtle mouse parallax (no raycasting)
            const mouseX = (state.mouse.x * 0.5);
            const mouseY = (state.mouse.y * 0.5);

            pointsRef.current.position.x += (mouseX - pointsRef.current.position.x) * 0.02;
            pointsRef.current.position.y += (-mouseY - pointsRef.current.position.y) * 0.02;
        }
    });

    // Cleanup memory
    useEffect(() => {
        return () => {
            if (pointsRef.current) {
                // Traverse the group to dispose of all meshes and materials
                pointsRef.current.traverse((object) => {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                });
            }
        };
    }, []);

    // Generate lines (connections)
    const linesGeometry = useMemo(() => {
        const positions = particles.positions;
        const linePositions = [];
        const lineColors = [];

        // Naive O(n^2) check but okay for < 300 particles. 
        // For 300 particles: 300 * 300 = 90,000 checks (negligible).
        // Limit connections per node to avoid visual clutter.

        const connectDistance = 3.5; // Threshold

        for (let i = 0; i < particleCount; i++) {
            let connections = 0;
            const x1 = positions[i * 3];
            const y1 = positions[i * 3 + 1];
            const z1 = positions[i * 3 + 2];

            for (let j = i + 1; j < particleCount; j++) {
                const x2 = positions[j * 3];
                const y2 = positions[j * 3 + 1];
                const z2 = positions[j * 3 + 2];

                const dist = Math.sqrt(
                    Math.pow(x2 - x1, 2) +
                    Math.pow(y2 - y1, 2) +
                    Math.pow(z2 - z1, 2)
                );

                if (dist < connectDistance) {
                    linePositions.push(x1, y1, z1);
                    linePositions.push(x2, y2, z2);

                    // Gradient line color based on particle colors
                    lineColors.push(particles.colors[i * 3], particles.colors[i * 3 + 1], particles.colors[i * 3 + 2]);
                    lineColors.push(particles.colors[j * 3], particles.colors[j * 3 + 1], particles.colors[j * 3 + 2]);

                    connections++;
                    if (connections >= 3) break; // Optimization: max 3 connections per node
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        return geometry;
    }, [particles, particleCount]);

    return (
        <group ref={pointsRef}>
            <Points positions={particles.positions} colors={particles.colors} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent={true}
                    vertexColors
                    size={0.15}
                    color={0x94a3b8} // Slate-400 for reduced contrast
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.4} // Softer opacity
                    blending={THREE.NormalBlending}
                />
            </Points>
            <lineSegments geometry={linesGeometry}>
                <lineBasicMaterial
                    vertexColors
                    transparent
                    opacity={0.15} // Low opacity as requested
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </lineSegments>
        </group>
    );
};

// Main Component
const NeuralBackground = () => {
    // Detect hardware/screen capabilities for adaptive performance
    const [particleCount, setParticleCount] = useState(50);
    const [dpr, setDpr] = useState([1, 1]);

    useEffect(() => {
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        const screenWidth = window.innerWidth;

        if (hardwareConcurrency >= 8 && screenWidth > 1024) {
            setParticleCount(250); // High performance
            setDpr([1, 1.5]);
        } else if (hardwareConcurrency >= 4 && screenWidth > 768) {
            setParticleCount(120); // Medium performance
            setDpr([1, 1.2]);
        } else {
            setParticleCount(50); // Low/Mobile
            setDpr([1, 1]);
        }
    }, []);

    return (
        <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none bg-gradient-to-b from-gray-900 via-[#0a0f1c] to-black">
            <Canvas
                camera={{ position: [0, 0, 5], fov: 60 }}
                dpr={dpr}
                gl={{
                    antialias: false,
                    powerPreference: "high-performance",
                    alpha: true
                }}
            >
                <fog attach="fog" args={['#000', 3, 12]} />
                <NeuralNetwork particleCount={particleCount} />
            </Canvas>
        </div>
    );
};

export default NeuralBackground;
