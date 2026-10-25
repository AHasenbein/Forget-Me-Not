import { createContext, useContext } from 'react';

/** Settings > Text size (1 = normal). Kept in its own file so components and the shell share one context. */
export const TextScaleContext = createContext(1);
export const useTextScale = () => useContext(TextScaleContext);

/**
 * `patient` = the large, one-action patient UI (CLAUDE.md "Patient UI rules"); the default everywhere.
 * `standard` = an ordinary app UI for caregivers: normal type and controls, and Text size does not apply.
 */
export type Density = 'patient' | 'standard';
export const DensityContext = createContext<Density>('patient');
export const useDensity = () => useContext(DensityContext);

/**
 * True for the last tile of a caregiver dashboard column: its Card grows to fill the leftover height, so the bottoms
 * of side-by-side columns line up. A Card resets it for its own children (nested cards never grow).
 */
export const FillContext = createContext(false);
