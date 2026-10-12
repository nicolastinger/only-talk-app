import { useEffect, useMemo, useState } from 'react';
import {
  applyCssVars,
  applyFontVars,
  getEffectiveMode,
  useThemeStore,
  type EffectiveMode,
  type ThemeMode,
} from '@/store/theme';

export function useEffectiveMode(mode: ThemeMode): EffectiveMode {
  const [effective, setEffective] = useState<EffectiveMode>(() =>
    getEffectiveMode(mode),
  );

  useEffect(() => {
    setEffective(getEffectiveMode(mode));
    if (mode !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setEffective(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  return effective;
}

export function useTheme() {
  const { mode, fontSize, setMode, setFontSize } = useThemeStore();
  const effectiveMode = useEffectiveMode(mode);

  useEffect(() => {
    applyCssVars(mode);
  }, [effectiveMode]);

  useEffect(() => {
    applyFontVars(fontSize);
  }, [fontSize]);

  return useMemo(
    () => ({ mode, fontSize, effectiveMode, setMode, setFontSize }),
    [mode, fontSize, effectiveMode, setMode, setFontSize],
  );
}
