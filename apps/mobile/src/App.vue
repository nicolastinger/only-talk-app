<script setup lang="ts">
import { ref } from 'vue';
import { Button, Cell, CellGroup } from 'vant';

const count = ref(0);

const increment = () => {
  count.value++;
};
</script>

<template>
  <div class="app">
    <div class="header">
      <h1>Mobile App</h1>
      <p>Vue 3 + Vant + Vapor + Less + TypeScript</p>
    </div>
    
    <div class="content">
      <CellGroup>
        <Cell title="Count" :value="count" />
      </CellGroup>
      
      <div class="button-group">
        <Button type="primary" @click="increment">
          Increment
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.app {
  min-height: 100vh;
  background-color: #f7f8fa;
  
  .header {
    padding: 40px 20px;
    text-align: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    
    h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    
    p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
    }
  }
  
  .content {
    padding: 20px;
    
    .button-group {
      margin-top: 20px;
      text-align: center;
    }
  }
}
</style>