import { reactive } from 'vue';
import { kv_get, kv_set } from '@workspace/services';

const KEY = 'ui_dev_assistant_visible';

interface DevAssistantState {
  /** 是否在应用内显示开发助手入口，默认隐藏 */
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const devAssistantState = reactive<DevAssistantState>({
  visible: false,
  setVisible: (visible: boolean) => {
    devAssistantState.visible = visible;
    kv_set(KEY, visible ? '1' : '0').catch(() => {});
  },
});

kv_get(KEY)
  .then((value) => {
    if (value === '1') devAssistantState.visible = true;
  })
  .catch(() => {});

/** 兼容组合式调用方式 */
export const useDevAssistantStore = () => devAssistantState;
