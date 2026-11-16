/**
 * IntroStage — the only module that pulls three.js into the Intro path.
 * Intro lazy-loads this file as a single chunk after its static shell has
 * already painted, so first paint never waits on ~900 KB of WebGL code.
 */
import React from 'react';
import { LatticeCanvas } from './LatticeCanvas';
import { IntroScene, type IntroBeat, type IntroPointer } from './IntroScene';

interface IntroStageProps {
  step: IntroBeat;
  pointerRef: React.MutableRefObject<IntroPointer>;
  onReady: () => void;
}

export const IntroStage: React.FC<IntroStageProps> = ({ step, pointerRef, onReady }) => (
  <LatticeCanvas cameraPosition={[0.55, 1.55, 6.4]} pointerEvents={false} quality="cinematic">
    <IntroScene step={step} pointerRef={pointerRef} onReady={onReady} />
  </LatticeCanvas>
);

export default IntroStage;
