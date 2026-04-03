<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useThemeStore } from '../../stores/theme.js';
import BaseIcon from '../ui/BaseIcon.vue';
import { CUSTOM_THEME_ICONS } from '../../constants/custom-nav-icons.js';

const store = useThemeStore();
const { theme, resolvedTheme } = storeToRefs(store);
const { setTheme } = store;

const isOpen = ref(false);
const containerRef = ref(null);

const options = [
  {
    value: 'light',
    label: '浅色模式',
    description: '始终使用浅色主题',
  },
  {
    value: 'dark',
    label: '深色模式',
    description: '始终使用深色主题',
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '自动跟随系统外观',
  },
];

const themeIcons = CUSTOM_THEME_ICONS;

const currentThemeSummary = computed(() => {
  if (theme.value === 'system') {
    return `跟随系统（当前${resolvedTheme.value === 'dark' ? '深色' : '浅色'}）`;
  }

  return theme.value === 'dark' ? '深色模式' : '浅色模式';
});

const currentThemeIcon = computed(() => themeIcons[theme.value] || themeIcons.system);

function toggleMenu() {
  isOpen.value = !isOpen.value;
}

function closeMenu() {
  isOpen.value = false;
}

function handleSelectTheme(nextTheme) {
  setTheme(nextTheme);
  closeMenu();
}

function handleClickOutside(event) {
  if (containerRef.value && !containerRef.value.contains(event.target)) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
<div ref="containerRef" class="relative shrink-0">
  <button
    @click.stop="toggleMenu"
    class="nav-action-btn nav-action-btn-neutral misub-radius-md inline-flex items-center justify-center"
    :class="isOpen ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white' : ''"
    :aria-label="`主题切换：${currentThemeSummary}`"
    :aria-expanded="isOpen"
    aria-haspopup="menu"
    title="主题切换"
    type="button"
  >
    <span class="flex items-center justify-center">
      <BaseIcon :path="currentThemeIcon" className="h-5 w-5" />
    </span>
  </button>

  <Transition name="theme-menu-fade">
    <div
      v-if="isOpen"
      class="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/95 dark:bg-gray-900/95 shadow-xl backdrop-blur-xl z-[70]"
      role="menu"
      @click.stop
    >
      <div class="px-4 py-3 border-b border-gray-100 dark:border-white/10">
        <p class="text-sm font-semibold text-gray-900 dark:text-white">主题模式</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">当前：{{ currentThemeSummary }}</p>
      </div>

      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="menuitemradio"
        :aria-checked="theme === option.value"
        class="w-full px-4 py-3 text-left transition-colors flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-white/5"
        :class="theme === option.value ? 'bg-primary-50/70 dark:bg-primary-500/10' : ''"
        @click="handleSelectTheme(option.value)"
      >
        <span class="mt-0.5 flex h-5 w-5 items-center justify-center">
          <BaseIcon :path="themeIcons[option.value]" className="h-4 w-4" />
        </span>

        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-gray-900 dark:text-white">{{ option.label }}</span>
          <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {{ option.value === 'system'
              ? `自动跟随系统外观，当前生效为${resolvedTheme === 'dark' ? '深色' : '浅色'}`
              : option.description }}
          </span>
        </span>

        <span class="mt-0.5 h-5 w-5 flex items-center justify-center text-primary-600 dark:text-primary-400">
          <svg v-if="theme === option.value" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </span>
      </button>
    </div>
  </Transition>
</div>
</template>

<style scoped>
.theme-menu-fade-enter-active,
.theme-menu-fade-leave-active {
  transition: all 0.18s ease;
}

.theme-menu-fade-enter-from,
.theme-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
