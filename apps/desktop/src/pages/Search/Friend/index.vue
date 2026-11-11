<script setup lang="ts">
import DraggableHeader from '@/components/DraggableHeader/index.vue';
import SearchFriend from '@/components/SearchFriend/index.vue';
import CloseButton from '@/components/TopBar/Buttons/CloseButton.vue';
import styles from './index.module.less';
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.header">
      <div :class="styles.draggable">
        <DraggableHeader />
      </div>
      <div :class="styles.closeBtn">
        <CloseButton />
      </div>
    </div>
    <div :class="styles.content">
      <SearchFriend />
    </div>
  </div>
</template>
