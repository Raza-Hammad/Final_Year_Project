import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { ReactNode } from 'react';

interface LatticeCanvasProps {
  children: ReactNode;
  className?: string;
  /** Camera position; default suited to intro framing. */
  cameraPosition?: [number, number, number];
  /** Disable pointer events when overlay UI needs them. */
  pointerEvents?: boolean;
  /** `cinematic` = Intro (scene brings its own lights); `map` = leaner preset. */
  quality?: 'map' | 'cinematic';
}

/**
 * R3F host used by the Intro only (the post-login Lattice is a 2D canvas now).
 * DPR is capped at 1.5 — the visible quality difference over 2.0 is negligible
 * but it is a ~44% fill-rate saving on hi-DPI screens.
 */
export const LatticeCanvas: React.FC<LatticeCanvasProps> = ({
  children,
  className = '',
  cameraPosition = [0, 1.2, 5.5],
  pointerEvents = true,
  quality = 'map',
}) => {
  const cinematic = quality === 'cinematic';

  return (
    <div
      className={`relative h-full w-full ${className}`}
      style={{ pointerEvents: pointerEvents ? 'auto' : 'none' }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        camera={{ position: cameraPosition, fov: cinematic ? 38 : 42, near: 0.1, far: 40 }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = cinematic ? 1.28 : 1.0;
          if ('outputColorSpace' in gl) {
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }
        }}
      >
        <Suspense fallback={null}>
          {!cinematic && (
            <>
              <ambientLight intensity={0.72} />
              <directionalLight position={[4, 6, 3]} intensity={0.85} />
            </>
          )}
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
};

export default LatticeCanvas;
