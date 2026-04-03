<script setup>
import { computed } from 'vue';
import { useToastStore } from '../../stores/toast.js';

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
  selectionMode: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
});

const { showToast } = useToastStore();
const emit = defineEmits(['preview', 'qrcode', 'edit', 'delete', 'toggle-select']);

const shortLink = computed(() => props.group.urls?.auto || '');

const sourceLabel = computed(() => {
  if (props.group.sourceType === 'manual') {
    const total = Array.isArray(props.group.manualNodeIds) ? props.group.manualNodeIds.length : props.group.counts?.inputNodes || 0;
    return `手动节点 · ${total} 个`;
  }
  return '手动输入';
});

const expireLabel = computed(() => {
  if (props.group.expiry?.enabled === false) return '长期有效';
  if (props.group.expiry?.expiresAt) {
    return `到期 ${new Date(props.group.expiry.expiresAt).toLocaleDateString()}`;
  }
  return '沿用默认过期';
});

const generatedAtLabel = computed(() => {
  const value = props.group.lastGeneratedAt || props.group.updatedAt || props.group.createdAt;
  if (!value) return '刚刚生成';
  return new Date(value).toLocaleString();
});

function handleCardClick() {
  if (props.selectionMode) {
    emit('toggle-select');
  }
}

async function handleCopyShortLink() {
  if (!shortLink.value) {
    showToast('当前没有可复制的短链接', 'warning');
    return;
  }

  try {
    await navigator.clipboard.writeText(shortLink.value);
    showToast('短链接已复制到剪贴板', 'success');
  } catch (error) {
    const input = document.createElement('input');
    input.value = shortLink.value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('短链接已复制到剪贴板', 'success');
  }
}
</script>

<template>
  <div
    class="group relative glass-panel p-5 card-hover flex flex-col h-full min-h-[220px] overflow-hidden transition-all"
    :class="selected ? 'ring-2 ring-primary-500/40' : ''"
    @click="handleCardClick"
  >
    <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl group-hover:bg-primary-500/20 transition-all duration-500"></div>

    <div class="relative z-10 flex flex-col h-full">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase bg-primary-500/10 text-primary-600 dark:text-primary-300 border border-primary-500/20">
              IPSUB
            </span>
            <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-transparent">
              {{ expireLabel }}
            </span>
          </div>

          <h3 class="font-display font-semibold text-lg text-gray-900 dark:text-white truncate leading-tight" :title="group.name || '未命名优选IP订阅组'">
            {{ group.name || '未命名优选IP订阅组' }}
          </h3>

          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ sourceLabel }}
          </p>
        </div>

        <div v-if="selectionMode" class="shrink-0 pt-1">
          <button
            type="button"
            class="w-6 h-6 rounded-md border transition-colors flex items-center justify-center"
            :class="selected
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'border-gray-300 dark:border-gray-600 text-transparent bg-white/70 dark:bg-white/5'"
            @click.stop="emit('toggle-select')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>

        <div v-else class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
          <button @click.stop="emit('preview')" class="p-2.5 rounded-full hover:bg-primary-50 dark:hover:bg-white/10 text-gray-400 hover:text-primary-500 transition-colors flex items-center justify-center" title="预览节点信息" aria-label="预览节点信息">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
          <button @click.stop="emit('qrcode')" class="p-2.5 rounded-full hover:bg-primary-50 dark:hover:bg-white/10 text-gray-400 hover:text-primary-500 transition-colors flex items-center justify-center" title="显示订阅二维码" aria-label="显示订阅二维码">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" /></svg>
          </button>
          <button @click.stop="emit('edit')" class="p-2.5 rounded-full hover:bg-primary-50 dark:hover:bg-white/10 text-gray-400 hover:text-primary-500 transition-colors flex items-center justify-center" title="编辑" aria-label="编辑优选IP订阅组">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" /></svg>
          </button>
          <button @click.stop="emit('delete')" class="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center" title="删除" aria-label="删除优选IP订阅组">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      <button type="button" class="relative mb-4 w-full text-left" title="点击复制短链接" @click.stop="handleCopyShortLink">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg class="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
        </div>
        <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span class="text-[11px] font-medium text-primary-600 dark:text-primary-300">点击复制</span>
        </div>
        <input type="text" :value="shortLink" readonly class="w-full cursor-copy text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-black/20 misub-radius-md pl-9 pr-20 py-2 border border-transparent focus:border-primary-500/30 focus:bg-white dark:focus:bg-black/40 focus:outline-none transition-all font-mono truncate pointer-events-none" />
      </button>

      <div class="grid grid-cols-3 gap-2 mt-auto">
        <div class="bg-white/60 dark:bg-white/5 misub-radius-md px-3 py-2 text-center">
          <p class="text-[11px] text-gray-500 dark:text-gray-400">原始节点</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ group.counts?.inputNodes || 0 }}</p>
        </div>
        <div class="bg-white/60 dark:bg-white/5 misub-radius-md px-3 py-2 text-center">
          <p class="text-[11px] text-gray-500 dark:text-gray-400">优选地址</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ group.counts?.preferredEndpoints || 0 }}</p>
        </div>
        <div class="bg-white/60 dark:bg-white/5 misub-radius-md px-3 py-2 text-center">
          <p class="text-[11px] text-gray-500 dark:text-gray-400">输出节点</p>
          <p class="mt-1 text-sm font-semibold text-primary-600 dark:text-primary-400">{{ group.counts?.outputNodes || 0 }}</p>
        </div>
      </div>

      <div class="flex items-center justify-end mt-4 pt-3 border-t border-gray-100 dark:border-white/5 gap-3">
        <span class="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{{ generatedAtLabel }}</span>
      </div>
    </div>
  </div>
</template>
