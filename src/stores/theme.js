
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref('system');
  const systemTheme = ref('light');

  let mediaQueryList = null;
  let mediaQueryHandler = null;

  const resolvedTheme = computed(() => (
    theme.value === 'system' ? systemTheme.value : theme.value
  ));

  function isValidTheme(value) {
    return ['light', 'dark', 'system'].includes(value);
  }

  function syncSystemTheme() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      systemTheme.value = 'light';
      return;
    }

    systemTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function cleanupSystemThemeListener() {
    if (!mediaQueryList || !mediaQueryHandler) return;

    if (typeof mediaQueryList.removeEventListener === 'function') {
      mediaQueryList.removeEventListener('change', mediaQueryHandler);
    } else if (typeof mediaQueryList.removeListener === 'function') {
      mediaQueryList.removeListener(mediaQueryHandler);
    }

    mediaQueryList = null;
    mediaQueryHandler = null;
  }

  function setupSystemThemeListener() {
    cleanupSystemThemeListener();

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryHandler = (event) => {
      systemTheme.value = event.matches ? 'dark' : 'light';
      if (theme.value === 'system') {
        updateThemeClass();
      }
    };

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', mediaQueryHandler);
    } else if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(mediaQueryHandler);
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (isValidTheme(savedTheme)) {
      theme.value = savedTheme;
    } else {
      theme.value = 'system';
    }

    syncSystemTheme();
    setupSystemThemeListener();
    updateThemeClass();
  }

  function toggleTheme() {
    if (theme.value === 'light') {
      setTheme('dark');
      return;
    }

    if (theme.value === 'dark') {
      setTheme('system');
      return;
    }

    setTheme('light');
  }

  function setTheme(nextTheme) {
    if (!isValidTheme(nextTheme)) return;

    theme.value = nextTheme;
    localStorage.setItem('theme', theme.value);
    updateThemeClass();
  }

  function updateThemeClass() {
    const activeTheme = resolvedTheme.value;

    if (activeTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    document.documentElement.dataset.themeMode = theme.value;
    document.documentElement.dataset.themeResolved = activeTheme;
    
    // 动态更新状态栏主题颜色
    updateStatusBarTheme();
  }
  
  function updateStatusBarTheme() {
    const activeTheme = resolvedTheme.value;

    // 更新主题颜色的 meta 标签
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      if (activeTheme === 'dark') {
        themeColorMeta.setAttribute('content', '#0f172a'); // 深色模式背景色
      } else {
        themeColorMeta.setAttribute('content', '#f8fafc'); // 浅色模式背景色
      }
    }
    
    // 更新 iOS 状态栏样式 - 统一使用黑色半透明配合Header渐变背景
    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBarMeta) {
      // 使用black-translucent让状态栏完全透明，由Header的渐变背景提供视觉效果
      statusBarMeta.setAttribute('content', 'black-translucent');
    }
  }

  return { theme, resolvedTheme, initTheme, setTheme, toggleTheme, syncSystemTheme };
});
