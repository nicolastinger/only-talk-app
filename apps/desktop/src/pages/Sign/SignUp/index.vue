<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue';
import { Window } from '@tauri-apps/api/window';
import { useRouter } from 'vue-router';
import LanguageSwitcher from '@/components/LanguageSwitch/index.vue';
import { useI18n } from '@/i18n';
import FastSignUp from './components/FastSignUp.vue';
import styles from './index.module.less';

const { t } = useI18n();
const router = useRouter();

const closeWindow = async () => {
  const currentWindow = Window.getCurrent();
  await currentWindow.close();
};

const goToSignIn = async () => {
  router.push('/signIn');
};
</script>

<template>
  <div :class="styles.container">
    <div :class="styles.titleBar">
      <div :class="styles.logo">
        <span :class="styles.appName">Only Talk</span>
      </div>
      <div :class="styles.windowControls">
        <LanguageSwitcher />
        <div :class="styles.closeBtn" @click="closeWindow">
          <CloseOutlined />
        </div>
      </div>
    </div>

    <div :class="styles.content">
      <div :class="styles.avatarSection">
        <div :class="styles.welcomeText">{{ t('signUp.title') }}</div>
      </div>

      <div :class="styles.formSection">
        <FastSignUp />
      </div>

      <div :class="styles.footerLinks">
        <span :class="styles.link">{{ t('signUp.hasAccount') }}</span>
        <span :class="styles.divider">|</span>
        <a :class="styles.link" @click.prevent="goToSignIn">
          {{ t('back') }}
        </a>
      </div>
    </div>
  </div>
</template>
