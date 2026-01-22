import { Window } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';

export default function DraggableHeader() {
  const dragElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dragElement = dragElementRef.current;

    if (dragElement) {
      const handleDrag = async () => {
        await Window.getCurrent().startDragging();
      };

      dragElement.addEventListener('mousedown', handleDrag);
      return () => dragElement.removeEventListener('mousedown', handleDrag);
    }
  }, []);

  return (
    <div
      ref={dragElementRef}
      style={{
        width: '100%',
        height: '100%',
      }}
    ></div>
  );
}
