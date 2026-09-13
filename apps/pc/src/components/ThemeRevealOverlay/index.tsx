import { useEffect, useState } from 'react';
import { useThemeStore, type ThemeRevealState } from '@/store/theme';
import styles from './index.less';

interface RevealLayerProps {
  reveal: ThemeRevealState;
  onEnd: () => void;
}

// 初始为不可见(半径0%)，两帧后扩散到150%，clip-path 过渡形成从点击点扩散的揭示效果
const RevealLayer: React.FC<RevealLayerProps> = ({ reveal, onEnd }) => {
  const [radius, setRadius] = useState('0%');

  useEffect(() => {
    setRadius('0%');
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRadius('150%')),
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={styles.reveal}
      style={{
        background: reveal.color,
        clipPath: `circle(${radius} at ${reveal.x}px ${reveal.y}px)`,
      }}
      onTransitionEnd={() => {
        if (radius === '150%') onEnd();
      }}
    />
  );
};

const ThemeRevealOverlay: React.FC = () => {
  const reveal = useThemeStore((s) => s.reveal);
  const endReveal = useThemeStore((s) => s.endReveal);

  if (!reveal.active) return null;

  return <RevealLayer key={reveal.key} reveal={reveal} onEnd={endReveal} />;
};

export default ThemeRevealOverlay;