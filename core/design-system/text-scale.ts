import { createContext, useContext } from 'react';

/** Settings > Text size (1 = normal). Kept in its own file so components and the shell share one context. */
export const TextScaleContext = createContext(1);
export const useTextScale = () => useContext(TextScaleContext);
