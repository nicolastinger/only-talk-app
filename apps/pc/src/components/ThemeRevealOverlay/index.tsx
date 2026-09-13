import { useEffect, useState } from 'react';
import { useThemeStore, type ThemeRevealState } from '@/store/theme';
import styles from './index.less';

interface RevealLayerProps {
  reveal: ThemeRevealState;
  onEnd: () => void;
}

// 初始全覆盖(半径150%)，两帧后收缩为0，clip-path 过渡形成从点击点扩散的揭示效果
const RevealLayer: React.FC<RevealLayerProps> = ({ reveal, onEnd }) => {
  const [radius, setRadius] = useState('150%');

  useEffect(() => {
    setRadius('150%');
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRadius('0%')),
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
        if (radius === '0%') onEnd();
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