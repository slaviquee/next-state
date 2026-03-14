import { useCallback, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { AgentModel } from "@next-state/shared";
import { useNextStateStore } from "../store/useNextStateStore";
import { darkenColor } from "./StyleApplicator";

const SKIN_TONES = ["#f5d0b0", "#e8b88a", "#d4a574", "#a0724a", "#6b4226", "#3b2010"];

// Invisible click target geometry — a cylinder covering the agent's body
const clickTargetGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.7, 8);
clickTargetGeo.translate(0, 0.85, 0);

function skinToneFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SKIN_TONES[Math.abs(h) % SKIN_TONES.length];
}

const bwScale: Record<string, number> = { small: 0.85, large: 1.2 };
const hsScale: Record<string, number> = { short: 0.9, tall: 1.1 };

// Shared geometries (created once)
const headGeo = new THREE.SphereGeometry(0.12, 12, 8);
const torsoGeo = new THREE.BoxGeometry(0.28, 0.4, 0.18);
const hipsGeo = new THREE.BoxGeometry(0.26, 0.15, 0.18);
const legGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.42, 6);
const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.35, 6);
const hairGeo = new THREE.SphereGeometry(0.13, 10, 8);

// Shift leg/arm geometry so pivot is at the top
legGeo.translate(0, -0.21, 0);
armGeo.translate(0, -0.175, 0);

// Prop geometries
const laptopBaseGeo = new THREE.BoxGeometry(0.3, 0.015, 0.22);
const laptopScreenGeo = new THREE.BoxGeometry(0.3, 0.2, 0.008);
const phoneGeo = new THREE.BoxGeometry(0.04, 0.08, 0.008);
const cupGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.1, 8);

export function AgentCrowd() {
  const agents = useNextStateStore((s) => s.agents);
  const arr = Array.from(agents.values());
  if (arr.length === 0) return null;

  return (
    <group>
      {arr.map((a, i) => (
        <AgentFigure key={a.id} agent={a} index={i} />
      ))}
    </group>
  );
}

function AgentFigure({ agent, index }: { agent: AgentModel; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);

  const selectedAgentId = useNextStateStore((s) => s.selectedAgentId);
  const selectAgent = useNextStateStore((s) => s.selectAgent);
  const isSelected = selectedAgentId === agent.id;

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      selectAgent(agent.id);
    },
    [agent.id, selectAgent],
  );

  const skin = skinToneFromId(agent.id);
  const topColor = agent.visual.clothingColors.top ?? "#8888ff";
  const bottomColor = agent.visual.clothingColors.bottom ?? "#555588";
  const hairColor = agent.visual.hairColor ?? "#2C1B0E";
  const hairLength = agent.visual.hairLength ?? "short";

  const bw = bwScale[agent.visual.bodyType] ?? 1.0;
  const hs = hsScale[agent.visual.heightBucket] ?? 1.0;
  const hasLaptop = agent.visual.props?.includes("laptop") ?? false;

  useFrame(() => {
    if (!groupRef.current) return;
    const anim = agent.runtime.animationState;
    const t = Date.now() * 0.006 + index;

    // Position and heading
    groupRef.current.position.set(
      agent.runtime.position.x,
      0,
      agent.runtime.position.z,
    );
    groupRef.current.rotation.y = agent.runtime.heading;

    const isSitting = anim === "sit";

    // Torso pivot (the body above the hips)
    if (torsoRef.current) {
      if (isSitting) {
        torsoRef.current.position.y = 0.48;
        torsoRef.current.rotation.z = 0;
      } else {
        torsoRef.current.position.y = 0.82;
        // Breathing sway
        const sway = anim === "talk"
          ? Math.sin(t * 0.8) * 0.04
          : Math.sin(t * 0.15) * 0.015;
        torsoRef.current.rotation.z = sway;
      }
    }

    // Legs
    if (leftLegRef.current && rightLegRef.current) {
      if (isSitting) {
        // Sitting: legs pivot forward 90° from hip
        leftLegRef.current.position.set(-0.07, 0.48, 0);
        rightLegRef.current.position.set(0.07, 0.48, 0);
        leftLegRef.current.rotation.x = Math.PI / 2;
        rightLegRef.current.rotation.x = Math.PI / 2;
      } else {
        leftLegRef.current.position.set(-0.07, 0.82, 0);
        rightLegRef.current.position.set(0.07, 0.82, 0);
        if (anim === "walk") {
          const swing = Math.sin(t) * 0.4;
          leftLegRef.current.rotation.x = swing;
          rightLegRef.current.rotation.x = -swing;
        } else {
          leftLegRef.current.rotation.x = 0;
          rightLegRef.current.rotation.x = 0;
        }
      }
    }

    // Arms
    if (leftArmRef.current && rightArmRef.current) {
      const armY = isSitting ? 0.48 + 0.38 : 0.82 + 0.38;
      leftArmRef.current.position.set(-0.18 * bw, armY, 0);
      rightArmRef.current.position.set(0.18 * bw, armY, 0);

      if (isSitting && hasLaptop) {
        // Typing posture: arms forward, slight finger-wiggle
        const typing = Math.sin(t * 2.5) * 0.02;
        leftArmRef.current.rotation.x = -1.2 + typing;
        rightArmRef.current.rotation.x = -1.2 - typing;
      } else if (anim === "walk") {
        const swing = Math.sin(t) * 0.3;
        leftArmRef.current.rotation.x = swing;
        rightArmRef.current.rotation.x = -swing;
      } else if (anim === "talk") {
        leftArmRef.current.rotation.x = Math.sin(t * 0.7) * 0.1;
        rightArmRef.current.rotation.x = -0.4 + Math.sin(t * 1.2) * 0.3;
      } else if (anim === "fidget") {
        leftArmRef.current.rotation.x = Math.sin(t * 0.7) * 0.15;
        rightArmRef.current.rotation.x = 0;
      } else {
        // Idle: slight natural arm rest angle
        leftArmRef.current.rotation.x = 0.05;
        rightArmRef.current.rotation.x = 0.05;
      }
    }

    // Head glance
    if (headRef.current) {
      if (anim === "glance") {
        headRef.current.rotation.y = Math.sin(Date.now() * 0.002) * 0.4;
      } else {
        headRef.current.rotation.y = 0;
      }
    }
  });

  const hairScaleY = hairLength === "long" ? 1.4 : hairLength === "medium" ? 1.15 : 1.0;
  const hairScaleZ = hairLength === "long" ? 1.3 : 1.0;
  const hairOffsetY = hairLength === "long" ? 0.02 : 0;

  return (
    <group ref={groupRef} scale={[1, hs, 1]}>
      {/* Invisible click target — covers the full body */}
      <mesh
        geometry={clickTargetGeo}
        onClick={handleClick}
        onPointerOver={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.35, 0.45, 24]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}

      {/* Legs pivot from hip joint — geometry shifted so top is at origin */}
      <group ref={leftLegRef} position={[-0.07, 0.82, 0]}>
        <mesh geometry={legGeo}>
          <meshStandardMaterial color={darkenColor(bottomColor, 0.8)} />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.07, 0.82, 0]}>
        <mesh geometry={legGeo}>
          <meshStandardMaterial color={darkenColor(bottomColor, 0.8)} />
        </mesh>
      </group>

      {/* Upper body group: hips + torso + head, positioned at hip joint */}
      <group ref={torsoRef} position-y={0.82}>
        {/* Hips */}
        <mesh geometry={hipsGeo} position={[0, 0.02, 0]} scale={[bw, 1, 1]}>
          <meshStandardMaterial color={bottomColor} />
        </mesh>
        {/* Torso */}
        <mesh geometry={torsoGeo} position={[0, 0.3, 0]} scale={[bw, 1, 1]} castShadow>
          <meshStandardMaterial color={topColor} />
        </mesh>
        {/* Head */}
        <mesh ref={headRef} geometry={headGeo} position={[0, 0.58, 0]}>
          <meshStandardMaterial color={skin} />
        </mesh>
        {/* Hair */}
        <mesh
          geometry={hairGeo}
          position={[0, 0.6 + hairOffsetY, -0.01]}
          scale={[1, hairScaleY, hairScaleZ]}
        >
          <meshStandardMaterial color={hairColor} />
        </mesh>
      </group>

      {/* Arms pivot from shoulder — geometry shifted so top is at origin */}
      <group ref={leftArmRef} position={[-0.18, 1.2, 0]}>
        <mesh geometry={armGeo}>
          <meshStandardMaterial color={darkenColor(topColor, 0.8)} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.18, 1.2, 0]}>
        <mesh geometry={armGeo}>
          <meshStandardMaterial color={darkenColor(topColor, 0.8)} />
        </mesh>
      </group>

      {/* Props */}
      <AgentProps agent={agent} isSitting={agent.runtime.animationState === "sit"} />
    </group>
  );
}

function AgentProps({ agent, isSitting }: { agent: AgentModel; isSitting: boolean }) {
  const props = agent.visual.props;
  if (!props || props.length === 0) return null;

  const hasLaptop = props.includes("laptop");
  const hasPhone = props.includes("phone");
  const hasCup = props.includes("cup") || props.includes("coffee");

  return (
    <>
      {hasLaptop && (
        isSitting ? (
          // Laptop on lap: thigh surface ≈ y=0.54, midway hip-to-knee ≈ z=-0.18
          <group position={[0, 0.54, -0.18]}>
            {/* Base — flat on thighs */}
            <mesh geometry={laptopBaseGeo}>
              <meshStandardMaterial color="#333" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Screen — hinged from far edge (-Z), tilted toward agent */}
            <mesh
              geometry={laptopScreenGeo}
              position={[0, 0.1, -0.1]}
              rotation={[-0.35, 0, 0]}
            >
              <meshStandardMaterial color="#222" metalness={0.5} roughness={0.4} />
            </mesh>
            {/* Screen glow */}
            <mesh
              position={[0, 0.1, -0.096]}
              rotation={[-0.35, 0, 0]}
            >
              <planeGeometry args={[0.27, 0.17]} />
              <meshBasicMaterial color="#a8c4e0" />
            </mesh>
          </group>
        ) : (
          // Carrying laptop under arm when standing/walking
          <mesh
            geometry={laptopBaseGeo}
            position={[0.22, 0.9, 0.08]}
            rotation={[1.5, 0, 0.15]}
          >
            <meshStandardMaterial color="#333" metalness={0.6} roughness={0.3} />
          </mesh>
        )
      )}

      {hasPhone && !hasLaptop && (
        // Phone held in hand — in front of body
        <mesh
          geometry={phoneGeo}
          position={[0.1, isSitting ? 0.72 : 1.05, isSitting ? -0.22 : -0.15]}
          rotation={[-0.3, 0, 0]}
        >
          <meshStandardMaterial color="#1a1a1a" metalness={0.7} roughness={0.2} />
        </mesh>
      )}

      {hasCup && (
        // Cup beside body
        <mesh
          geometry={cupGeo}
          position={[0.22, isSitting ? 0.52 : 0.95, isSitting ? -0.25 : -0.12]}
        >
          <meshStandardMaterial color="#f5f5f0" roughness={0.6} />
        </mesh>
      )}
    </>
  );
}
