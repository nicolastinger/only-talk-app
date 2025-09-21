# useWindowDrag Hook 使用说明

## 简介

`useWindowDrag` 是一个自定义 React Hook，用于为元素添加拖拽窗口的功能。通过该 Hook，您可以轻松地让任意元素成为窗口的拖拽手柄。

## 安装和导入

该 Hook 已经在项目中实现，可以直接从 hooks 目录导入：

```typescript
import { useWindowDrag } from '@/hooks';
```

## 使用方法

### 1. 基本用法

将整个元素作为拖拽区域：

```tsx
import { useWindowDrag } from '@/hooks';

const MyComponent = () => {
  const dragRef = useWindowDrag();

  return (
    <div ref={dragRef}>
      拖拽我来移动窗口
      <div>窗口内容</div>
    </div>
  );
};
```

### 2. 指定拖拽手柄

只允许特定元素作为拖拽手柄：

```tsx
import { useWindowDrag } from '@/hooks';

const MyComponent = () => {
  const dragRef = useWindowDrag({ handleSelector: '.drag-handle' });

  return (
    <div ref={dragRef}>
      <div className="drag-handle">拖拽这里移动窗口</div>
      <div>窗口内容</div>
    </div>
  );
};
```

### 3. 条件启用/禁用

根据条件启用或禁用拖拽功能：

```tsx
import { useWindowDrag } from '@/hooks';
import { useState } from 'react';

const MyComponent = () => {
  const [isDragEnabled, setIsDragEnabled] = useState(true);
  const dragRef = useWindowDrag({ enabled: isDragEnabled });

  return (
    <div ref={dragRef}>
      <button onClick={() => setIsDragEnabled(!isDragEnabled)}>
        {isDragEnabled ? '禁用拖拽' : '启用拖拽'}
      </button>
      <div>窗口内容</div>
    </div>
  );
};
```

## API

### Hook 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用拖拽功能 |
| `handleSelector` | `string` | `undefined` | 拖拽手柄选择器，如果指定则只在该元素上触发拖拽 |

### 返回值

返回一个 React ref，需要绑定到希望具有拖拽功能的元素上。

## 注意事项

1. 该 Hook 适用于 Tauri 应用中的窗口拖拽
2. 支持 WebviewWindow 和普通 Window
3. 如果指定了 `handleSelector`，只有匹配的子元素可以触发拖拽
4. 拖拽过程中会自动处理窗口位置计算
5. 组件卸载时会自动清理事件监听器

## 示例

请参考 `src/pages/Media/VideoCall/index.tsx` 和 `src/components/DraggableHeader/index.tsx` 文件中的实际使用示例。