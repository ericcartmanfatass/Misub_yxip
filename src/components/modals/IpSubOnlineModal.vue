<script setup>
import Modal from '../forms/Modal.vue';

defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:show']);
</script>

<template>
  <Modal :show="show" size="xl" @update:show="emit('update:show', $event)">
    <template #title>
      <div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">在线优选IP</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">占位界面已预留，后续将在这里接入在线获取与测速能力。</p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="p-4 misub-radius-lg border border-dashed border-primary-300/70 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/5">
          <p class="text-sm text-primary-700 dark:text-primary-300 leading-6">
            当前版本先提供弹层结构，不执行真实抓取、测速与写入操作。后续可在此处接入优选 IP 源、筛选策略以及批量导入流程。
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">优选源地址</label>
            <input type="text" disabled value="后续接入" class="w-full px-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-white/10 misub-radius-lg text-gray-400 cursor-not-allowed" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">测速策略</label>
            <input type="text" disabled value="后续接入" class="w-full px-3 py-2.5 text-sm bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-white/10 misub-radius-lg text-gray-400 cursor-not-allowed" />
          </div>
        </div>

        <div class="p-4 bg-white/70 dark:bg-gray-900/50 border border-gray-200/70 dark:border-white/10 misub-radius-lg">
          <p class="text-xs text-gray-500 dark:text-gray-400 leading-6">
            已按你的要求保留“在线优选IP”入口与二级界面，后续仅需在本弹层内继续追加真实 API 请求、结果列表与一键写入逻辑即可。
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <button
        class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm misub-radius-lg transition-colors"
        @click="emit('update:show', false)"
      >
        我知道了
      </button>
    </template>
  </Modal>
</template>
