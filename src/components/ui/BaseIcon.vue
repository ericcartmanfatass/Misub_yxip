<script setup>
import { computed } from 'vue';

const props = defineProps({
  path: {
    type: [String, Object],
    required: true
  },
  viewBox: {
    type: String,
    default: '0 0 24 24'
  },
  className: {
    type: String,
    default: ''
  }
});

const iconConfig = computed(() => {
  if (typeof props.path === 'string') {
    return {
      d: props.path,
      viewBox: props.viewBox,
      mode: 'stroke',
      fillRule: null,
      clipRule: null
    };
  }

  const icon = props.path ?? {};
  const mode = icon.type ?? (Object.prototype.hasOwnProperty.call(icon, 'fill')
    ? (icon.fill === 'none' ? 'stroke' : 'filled')
    : 'filled');

  return {
    d: icon.d || icon.path || '',
    viewBox: icon.viewBox || props.viewBox,
    mode,
    fillRule: icon.fillRule || null,
    clipRule: icon.clipRule || null
  };
});

const isFilled = computed(() => iconConfig.value.mode === 'filled');
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="iconConfig.viewBox"
    :fill="isFilled ? 'currentColor' : 'none'"
    :stroke="isFilled ? 'none' : 'currentColor'"
    :class="className"
  >
    <path
      :fill-rule="iconConfig.fillRule"
      :clip-rule="iconConfig.clipRule"
      :stroke-linecap="isFilled ? null : 'round'"
      :stroke-linejoin="isFilled ? null : 'round'"
      :stroke-width="isFilled ? null : 2"
      :d="iconConfig.d"
    />
  </svg>
</template>
