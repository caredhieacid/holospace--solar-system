import React, { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Trail, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { PlanetData, MoonData } from '../types';

const planets: PlanetData[] = [
    { 
        name: "水星", 
        color: "#A5A5A5", 
        size: 0.4, 
        distance: 4, 
        speed: 4.7, 
        description: "太阳系中最小的行星，也是离太阳最近的行星。",
        scienceFacts: "水星表面温差极大，白天摄氏430度，晚上零下180度。它是太阳系中公转最快的行星，只需88天就能绕太阳一圈。",
        moons: []
    },
    { 
        name: "金星", 
        color: "#E3BB76", 
        size: 0.9, 
        distance: 7, 
        speed: 3.5, 
        description: "太阳系中最热的行星，拥有厚厚的大气层。",
        scienceFacts: "金星自转方向与其他行星相反（逆向自转）。其浓厚的大气层主要由二氧化碳组成，产生强烈的温室效应，使其成为太阳系最热的行星。",
        moons: []
    },
    { 
        name: "地球", 
        color: "#22A6B3", 
        size: 1, 
        distance: 10, 
        speed: 3, 
        description: "我们的家园，目前已知唯一孕育生命的星球。",
        scienceFacts: "地球表面约71%被水覆盖。大气层富含氮气和氧气，不仅能维持生命，还能保护表面免受流星和辐射的伤害。",
        moons: [
            { name: "月球", size: 0.27, distance: 2, speed: 2, color: "#CCCCCC" }
        ]
    },
    { 
        name: "火星", 
        color: "#DD4C39", 
        size: 0.5, 
        distance: 15, 
        speed: 2.4, 
        description: "红色的星球，表面布满尘埃和寒冷的沙漠。",
        scienceFacts: "拥有太阳系最高的火山——奥林帕斯山，高度约为珠穆朗玛峰的三倍。其红色的外观来自表面土壤中大量的氧化铁（铁锈）。",
        moons: [
             { name: "火卫一", size: 0.12, distance: 1.2, speed: 3.5, color: "#755e56" },
             { name: "火卫二", size: 0.08, distance: 1.8, speed: 2.5, color: "#9e918d" }
        ]
    },
    { 
        name: "木星", 
        color: "#D9A066", 
        size: 3, 
        distance: 25, 
        speed: 1.3, 
        description: "太阳系最大的行星，巨大的气态巨行星。",
        scienceFacts: "著名的“大红斑”是一个持续了几个世纪的巨大反气旋风暴。木星的质量是太阳系其他所有行星总和的2.5倍。",
        moons: [
            { name: "木卫一", size: 0.2, distance: 4, speed: 3, color: "#FFFF99" },
            { name: "木卫二", size: 0.18, distance: 5, speed: 2.5, color: "#FFFFFF" },
            { name: "木卫三", size: 0.35, distance: 6.5, speed: 2, color: "#A0A0A0" },
            { name: "木卫四", size: 0.3, distance: 8, speed: 1.5, color: "#666666" }
        ]
    },
    { 
        name: "土星", 
        color: "#F4D03F", 
        size: 2.5, 
        distance: 35, 
        speed: 0.9, 
        description: "以其壮丽的行星环系统而闻名。",
        scienceFacts: "土星环主要由冰块和岩石碎片组成。土星的密度非常低，是太阳系唯一密度小于水的行星，如果有一个足够大的浴缸，它能漂浮在水面上。",
        moons: [
            { name: "土卫六", size: 0.4, distance: 5, speed: 1.8, color: "#E3BB76" },
            { name: "土卫二", size: 0.1, distance: 3.5, speed: 2.8, color: "#FFFFFF" }
        ]
    },
];

interface MoonProps {
    data: MoonData;
}

const Moon: React.FC<MoonProps> = ({ data }) => {
    const orbitRef = useRef<THREE.Group>(null);
    
    useFrame(({ clock }) => {
        if (orbitRef.current) {
            // Moons orbit faster than planets usually
            orbitRef.current.rotation.y = clock.getElapsedTime() * data.speed;
        }
    });

    return (
        <group ref={orbitRef}>
            <mesh position={[data.distance, 0, 0]}>
                <sphereGeometry args={[data.size, 16, 16]} />
                <meshStandardMaterial color={data.color} />
            </mesh>
        </group>
    );
};

// New component to visualize the orbit path
const OrbitPath: React.FC<{ radius: number; color: string }> = ({ radius, color }) => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius - 0.03, radius + 0.03, 128]} />
            <meshBasicMaterial color={color} opacity={0.15} transparent side={THREE.DoubleSide} />
        </mesh>
    );
};

interface PlanetProps {
    data: PlanetData;
    isSelected: boolean;
    onClick: (p: PlanetData) => void;
    onRegisterMesh: (mesh: THREE.Mesh | null) => void;
    hoveredPlanetRef: React.MutableRefObject<string | null>;
}

const Planet: React.FC<PlanetProps> = ({ data, isSelected, onClick, onRegisterMesh, hoveredPlanetRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const orbitRef = useRef<THREE.Group>(null);
    // Cast material to any to access specific properties without strict type checks in loop
    const matRef = useRef<THREE.MeshStandardMaterial>(null);
    
    // Register mesh for raycasting
    useEffect(() => {
        if (meshRef.current) {
            onRegisterMesh(meshRef.current);
            meshRef.current.userData = { planet: data };
        }
        return () => onRegisterMesh(null);
    }, [data, onRegisterMesh]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const isHovered = hoveredPlanetRef.current === data.name;

        if (orbitRef.current) {
            orbitRef.current.rotation.y = t * (data.speed * 0.1);
        }
        if (meshRef.current) {
             meshRef.current.rotation.y += 0.005;

             // Selection/Hover Animation: Scale up smoothly
             // Prioritize selection scale, then hover scale
             const targetScale = isSelected ? 1.5 : (isHovered ? 1.3 : 1.0);
             const currentScale = meshRef.current.scale.x;
             const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
             meshRef.current.scale.set(nextScale, nextScale, nextScale);
        }
        
        // Subtle pulsing effect for the planet material
        if (matRef.current) {
            // Oscillate emissive intensity slightly
            const baseIntensity = isSelected ? 0.8 : (isHovered ? 0.5 : 0.2);
            const pulseSpeed = isSelected ? 5 : (isHovered ? 8 : 2); 
            matRef.current.emissiveIntensity = THREE.MathUtils.lerp(matRef.current.emissiveIntensity, baseIntensity + Math.sin(t * pulseSpeed) * 0.15, 0.1);
        }
    });

    return (
        <group ref={orbitRef}>
            <group position={[data.distance, 0, 0]}>
                <Trail 
                    width={1.5} 
                    length={8} 
                    color={data.color} 
                    attenuation={(t) => t * t}
                >
                     <mesh ref={meshRef} onClick={(e) => { e.stopPropagation(); onClick(data); }}>
                        <sphereGeometry args={[data.size, 32, 32]} />
                        <meshStandardMaterial 
                            ref={matRef}
                            color={data.color} 
                            emissive={data.color}
                            emissiveIntensity={0.2}
                            roughness={0.5}
                        />
                    </mesh>
                </Trail>
                
                {/* Render Moons if they exist */}
                {data.moons && data.moons.map((moon, index) => (
                    <Moon key={index} data={moon} />
                ))}

                <Billboard position={[0, data.size + 1, 0]}>
                    <Text 
                        fontSize={0.5} 
                        color="white" 
                        anchorX="center" 
                        anchorY="bottom"
                    >
                        {data.name}
                    </Text>
                </Billboard>
            </group>
        </group>
    );
};

// Pulsing Sun Component
const Sun: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame(({ clock }) => {
        if (meshRef.current) {
            // Slow breathing animation
            const scale = 2.5 + Math.sin(clock.getElapsedTime()) * 0.05;
            meshRef.current.scale.set(scale, scale, scale);
        }
    });

    return (
        <mesh ref={meshRef} onClick={onClick}>
            <sphereGeometry args={[1, 32, 32]} /> {/* Base geometry radius 1, scaled up */}
            <meshBasicMaterial color="#FFD700" />
            <pointLight intensity={1.5} distance={100} decay={2} color="#ffaa00" />
        </mesh>
    );
};

interface SceneProps {
    selectedPlanet: PlanetData | null;
    onSelectPlanet: (p: PlanetData | null) => void;
    // Updated prop to receive detailed gesture data
    handPosRef: React.MutableRefObject<{ 
        x: number, 
        y: number, 
        gestureType: 'none' | 'select' | 'rotate', 
        rotationAngle: number,
        pinchProgress: number
    }>;
    resetTrigger?: number;
    rotationSensitivity?: number;
}

const SolarSystemContent: React.FC<SceneProps> = ({ selectedPlanet, onSelectPlanet, handPosRef, resetTrigger, rotationSensitivity = 0.05 }) => {
    const ControlsRef = useRef<any>(null);
    const meshRefs = useRef<THREE.Mesh[]>([]);
    
    // State machine for gesture interactions
    const wasSelectingRef = useRef(false);
    
    // Shared ref to notify Planet components of hover state without re-rendering parent
    const hoveredPlanetRef = useRef<string | null>(null);

    // Helper vector for raycasting
    const raycastPointer = useRef(new THREE.Vector2());

    useEffect(() => {
        if (ControlsRef.current && resetTrigger) {
            ControlsRef.current.reset();
        }
    }, [resetTrigger]);

    useFrame((state) => {
        const { x, y, gestureType, rotationAngle } = handPosRef.current;
        const wasSelecting = wasSelectingRef.current;

        // 1. Raycasting for Hand Cursor
        const ndcX = (x * 2) - 1;
        const ndcY = -(y * 2) + 1;

        raycastPointer.current.set(ndcX, ndcY);
        state.raycaster.setFromCamera(raycastPointer.current, state.camera);
        
        // Intersect against registered planet meshes
        const validMeshes = meshRefs.current.filter(m => m !== null);
        const intersects = state.raycaster.intersectObjects(validMeshes);
        const hoveredMesh = intersects.length > 0 ? intersects[0].object : null;

        // Update hover state
        if (hoveredMesh) {
            hoveredPlanetRef.current = hoveredMesh.userData.planet.name;
        } else {
            hoveredPlanetRef.current = null;
        }

        // 2. Gesture Interaction Logic
        
        // A. Selection (Middle Pinch)
        if (gestureType === 'select' && !wasSelecting) {
            if (hoveredMesh) {
                // Click Planet
                const planetData = hoveredMesh.userData.planet;
                onSelectPlanet(planetData);
            } else {
                // Click Empty Space (Deselect)
                onSelectPlanet(null);
            }
        }

        // B. Rotation (Index Up + Hand Roll)
        if (gestureType === 'rotate' && ControlsRef.current) {
            // rotationAngle: 0 = Up, >0 = Right, <0 = Left.
            // Deadzone to prevent drift
            const deadzone = 0.2; // Radians
            
            if (Math.abs(rotationAngle) > deadzone) {
                 // Rotate camera based on tilt
                 // Factor controls speed based on prop
                 const speed = (rotationAngle - (Math.sign(rotationAngle) * deadzone)) * rotationSensitivity;
                 ControlsRef.current.setAzimuthalAngle(ControlsRef.current.getAzimuthalAngle() - speed);
                 ControlsRef.current.update();
            }
        }

        wasSelectingRef.current = (gestureType === 'select');
    });

    return (
        <>
            <color attach="background" args={['#000000']} />
            <ambientLight intensity={0.2} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            
            {/* Sun */}
            <Sun onClick={() => onSelectPlanet(null)} />

            {/* Planets and Orbit Paths */}
            {planets.map((p, i) => (
                <React.Fragment key={p.name}>
                    {/* Visual Orbit Path */}
                    <OrbitPath radius={p.distance} color={p.color} />
                    
                    {/* Planet Object */}
                    <Planet 
                        data={p} 
                        isSelected={selectedPlanet?.name === p.name} 
                        onClick={onSelectPlanet}
                        onRegisterMesh={(mesh) => { meshRefs.current[i] = mesh!; }}
                        hoveredPlanetRef={hoveredPlanetRef}
                    />
                </React.Fragment>
            ))}
            
            <OrbitControls ref={ControlsRef} enablePan={false} maxPolarAngle={Math.PI / 1.5} />
            
            {/* Holographic Grid Floor */}
            <gridHelper args={[100, 50, 0x111111, 0x111111]} position={[0, -5, 0]} />
        </>
    );
};

const SolarSystemScene: React.FC<SceneProps> = (props) => {
    return (
        <Canvas camera={{ position: [0, 20, 30], fov: 45 }}>
            <Suspense fallback={null}>
                <SolarSystemContent {...props} />
            </Suspense>
        </Canvas>
    );
};

export default SolarSystemScene;