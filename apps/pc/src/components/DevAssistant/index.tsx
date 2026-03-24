import { history } from '@umijs/max';
import { Input, Switch, Tooltip } from 'antd';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './index.less';

const DevAssistant: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<NodeJS.Timeout | null>(null);
  const lastClickTime = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(`.${styles.switchWrapper}`) || 
        (e.target as HTMLElement).closest(`.${styles.inputWrapper}`)) {
      return;
    }
    setIsDragging(true);
    setHasDragged(false);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      if (Math.abs(newX - position.x) > 3 || Math.abs(newY - position.y) > 3) {
        setHasDragged(true);
      }
      
      setPosition({
        x: newX,
        y: newY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, position]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && url.trim()) {
      let targetUrl = url.trim();
      if (!targetUrl.startsWith('/')) {
        targetUrl = '/' + targetUrl;
      }
      history.push(targetUrl);
      setExpanded(false);
    }
  };

  const handleToggle = (checked: boolean) => {
    setVisible(checked);
    if (!checked) {
      setExpanded(false);
    }
  };

  const handleExpand = () => {
    setExpanded(!expanded);
  };

  const handleMiniClick = () => {
    if (hasDragged) {
      return;
    }
    
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      setVisible(true);
    } else {
      lastClickTime.current = now;
    }
  };

  const handleMiniDoubleClick = () => {
    setVisible(true);
  };

  if (!visible) {
    return (
      <div 
        className={styles.miniToggle}
        style={{
          left: position.x,
          top: position.y,
        }}
        onMouseDown={handleMouseDown}
      >
        <Tooltip title="双击打开开发助手" placement="left">
          <div 
            className={styles.miniBtn}
            onClick={handleMiniClick}
            onDoubleClick={handleMiniDoubleClick}
          >
            D
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.header}>
        <span className={styles.title}>Dev Assistant</span>
        <div className={styles.switchWrapper}>
          <Switch
            size="small"
            checked={visible}
            onChange={handleToggle}
          />
        </div>
      </div>
      
      <div className={styles.body}>
        <div className={styles.expandBtn} onClick={handleExpand}>
          {expanded ? '收起' : '跳转URL'}
        </div>
        
        {expanded && (
          <div className={styles.inputWrapper}>
            <Input
              placeholder="输入路由路径，如 /home/chats"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              size="small"
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DevAssistant;
