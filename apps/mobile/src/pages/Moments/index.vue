<script setup lang="ts">
// TODO: 朋友圈功能待实现
</script>

<template>
  <div class="moments-page">
    <div class="header"><h1 class="title">朋友圈</h1></div>
    <div class="todo-placeholder">
      <div class="icon-wrapper">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
      </div>
      <h2>功能开发中</h2>
      <p>朋友圈功能正在紧锣密鼓地开发中，敬请期待！</p>
      <div class="progress-bar"><div class="progress-fill"></div></div>
      <span class="progress-text">TODO</span>
    </div>
  </div>
</template>

<style scoped lang="less">
.moments-page {
  min-height: 100vh;
  background: var(--page-bg);
}

.header {
  padding: 16px 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky; top: 0; z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.title { font-size: 28px; font-weight: 700; color: var(--text-primary); margin: 0; }

.todo-placeholder {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 80px 40px; text-align: center;
}

.icon-wrapper {
  width: 80px; height: 80px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--blue-100), var(--blue-50));
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
  box-shadow: var(--shadow-glow-sm);
  svg { width: 40px; height: 40px; color: var(--brand-blue); }
}

h2 { font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px; }
p { font-size: 14px; color: var(--text-tertiary); margin: 0 0 24px; line-height: 1.6; }

.progress-bar {
  width: 120px; height: 4px;
  background: var(--blue-100);
  border-radius: 2px; overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  width: 30%; height: 100%;
  background: var(--gradient-primary);
  border-radius: 2px;
  animation: progressPulse 2s ease-in-out infinite;
}

@keyframes progressPulse {
  0%, 100% { width: 20%; }
  50% { width: 40%; }
}

.progress-text { font-size: 11px; color: var(--text-placeholder); letter-spacing: 2px; }
</style>
