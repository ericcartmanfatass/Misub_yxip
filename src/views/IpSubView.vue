<script setup>
import { ref, reactive, computed, defineAsyncComponent } from 'vue';
import { useToastStore } from '../stores/toast.js';

const QRCodeModal = defineAsyncComponent(() => import('../components/modals/QRCodeModal.vue'));

const { showToast } = useToastStore();

// 表单数据
const form = reactive({
  nodeLinks: '',
  preferredIps: '',
  namePrefix: '',
  keepOriginalHost: true,
});

// 状态
const isGenerating = ref(false);
const result = ref(null);

// 二维码弹窗
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');

// 演示数据
const DEMO_NODES = `vmess://eyJ2IjoiMiIsInBzIjoi5ryU56S6114514+iKgueCuSIsImFkZCI6ImV4YW1wbGUuY29tIiwicG9ydCI6IjQ0MyIsImlkIjoiMTIzNDU2NzgtYWJjZC1lZmdoLWlqa2wtMTIzNDU2Nzg5MCIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwibmV0Ijoid3MiLCJ0eXBlIjoiIiwiaG9zdCI6ImV4YW1wbGUuY29tIiwicGF0aCI6Ii92bWVzcyIsInRscyI6InRscyIsInNuaSI6ImV4YW1wbGUuY29tIn0=`;
const DEMO_IPS = `104.16.1.2#HK-01
104.17.2.3:2053#HK-02
cf.114514.com:443#US-Edge
172.67.1.1#JP-01
104.18.5.6:8443#SG-01`;

function fillDemo() {
  form.nodeLinks = DEMO_NODES;
  form.preferredIps = DEMO_IPS;
  form.namePrefix = 'CF';
  form.keepOriginalHost = true;
  showToast('已填入演示数据', 'success');
}

// 统计信息
const counts = computed(() => result.value?.counts || { inputNodes: 0, preferredEndpoints: 0, outputNodes: 0 });

// 提交生成
async function handleGenerate() {
  if (!form.nodeLinks.trim() || !form.preferredIps.trim()) {
    showToast('请填写节点链接和优选 IP', 'error');
    return;
  }

  isGenerating.value = true;
  try {
    const response = await fetch('/api/ipsub/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nodeLinks: form.nodeLinks,
        preferredIps: form.preferredIps,
        namePrefix: form.namePrefix,
        keepOriginalHost: form.keepOriginalHost,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || '生成失败');
    }

    result.value = data;
    showToast(`成功生成 ${data.counts.outputNodes} 个节点`, 'success');

    if (data.warnings?.length) {
      data.warnings.forEach((w) => showToast(w, 'warning'));
    }
  } catch (err) {
    showToast(err.message || '请求失败', 'error');
  } finally {
    isGenerating.value = false;
  }
}

// 复制链接
async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('已复制到剪贴板', 'success');
  } catch {
    showToast('复制失败，请手动复制', 'error');
  }
}

// 显示二维码
function showQR(url, title) {
  qrCodeUrl.value = url;
  qrCodeTitle.value = title;
  showQRCodeModal.value = true;
}

// 订阅卡片配置
const subCards = computed(() => {
  if (!result.value?.urls) return [];
  const urls = result.value.urls;
  return [
    { key: 'auto', label: '自动识别', desc: '根据客户端 UA 自动选择格式', icon: '🌐', url: urls.auto },
    { key: 'raw', label: 'V2rayN / Shadowrocket', desc: '适用于 V2rayN / v2rayNG / 小火箭', icon: '📡', url: urls.raw },
    { key: 'clash', label: 'Clash / Mihomo', desc: '适用于 Clash Verge / Mihomo / Stash', icon: '⚡', url: urls.clash },
    { key: 'surge', label: 'Surge', desc: '适用于 Surge Profile 导入', icon: '🏄', url: urls.surge },
  ];
});
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题栏 -->
    <div
      class="mb-4 bg-white/80 dark:bg-gray-900/60 border border-gray-100/80 dark:border-white/10 misub-radius-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
    >
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">优选 IP 工具</h1>
        <p class="mt-1 text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <span class="inline-flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-primary-500/80"></span>
            导入节点 → 批量替换优选 IP → 输出多格式订阅链接
          </span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
        <button
          @click="fillDemo"
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white/80 text-gray-700 hover:bg-white dark:bg-gray-900/60 dark:text-gray-300 dark:hover:bg-gray-900 misub-radius-lg transition-colors border border-gray-200/80 dark:border-white/10 shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          填入演示数据
        </button>
        <button
          @click="handleGenerate"
          :disabled="isGenerating"
          class="px-4 py-2 text-sm font-medium text-white misub-radius-lg transition-all shadow-sm shadow-primary-500/20 flex items-center gap-1.5"
          :class="isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 active:scale-95'"
        >
          <svg v-if="isGenerating" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {{ isGenerating ? '生成中...' : '生成订阅' }}
        </button>
      </div>
    </div>

    <!-- 主体内容：左侧表单 + 右侧说明 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 左侧表单 -->
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-white/90 dark:bg-gray-900/80 p-5 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            节点配置
          </h3>

          <div class="space-y-5">
            <!-- 节点链接 -->
            <div>
              <label for="ipsub-nodeLinks" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                1. 粘贴节点链接
              </label>
              <textarea
                id="ipsub-nodeLinks"
                v-model="form.nodeLinks"
                rows="6"
                placeholder="支持 vmess://、vless://、trojan://，一行一个，也支持直接粘贴 Base64 订阅内容。"
                class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:focus:border-primary-400 transition-colors resize-y"
              ></textarea>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                重点兼容自建 VMess / VLESS / Trojan 的 WS + TLS 常见写法。
              </p>
            </div>

            <!-- 优选 IP -->
            <div>
              <label for="ipsub-preferredIps" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                2. 粘贴优选 IP / 优选域名
              </label>
              <textarea
                id="ipsub-preferredIps"
                v-model="form.preferredIps"
                rows="5"
                placeholder="示例：&#10;104.16.1.2#HK-01&#10;104.17.2.3:2053#HK-02&#10;cf.example.com:443#US-Edge"
                class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:focus:border-primary-400 transition-colors resize-y"
              ></textarea>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                支持 <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">IP</code>、<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">IP:端口</code>、<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">域名</code>、<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">域名:端口</code>，<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">#</code> 后面可写备注。
              </p>
            </div>

            <!-- 选项行 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="ipsub-namePrefix" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  3. 备注前缀（可选）
                </label>
                <input
                  id="ipsub-namePrefix"
                  v-model="form.namePrefix"
                  type="text"
                  placeholder="例如：Cloudflare"
                  class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 dark:focus:border-primary-400 transition-colors"
                />
              </div>
              <div class="flex items-center">
                <label class="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    v-model="form.keepOriginalHost"
                    class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                    保留原节点 Host / SNI（推荐）
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧说明 -->
      <div class="lg:col-span-1 h-full">
        <div class="bg-white/90 dark:bg-gray-900/80 p-5 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10 h-full">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            使用说明
          </h3>
          <div class="space-y-3">
            <div class="p-3 bg-white/80 dark:bg-gray-900/70 misub-radius-lg border border-gray-200/60 dark:border-white/10">
              <h4 class="font-medium text-gray-900 dark:text-gray-200 mb-1 text-sm">适合场景</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">3X-UI / Xray / VPS 自建节点 + 你自己找好的本地测速最快的 Cloudflare 优选 IP或优选域名；测速工具可参考：XIU2/CloudflareSpeedTest</p>
            </div>
            <div class="p-3 bg-white/80 dark:bg-gray-900/70 misub-radius-lg border border-gray-200/60 dark:border-white/10">
              <h4 class="font-medium text-gray-900 dark:text-gray-200 mb-1 text-sm">工作原理</h4>
              <p class="text-xs text-gray-500 dark:text-gray-400">将你的自建节点的服务器地址批量替换为优选 IP，保留原始 Host/SNI 以确保 CDN 回源正常。</p>
            </div>
            <div class="p-3 bg-white/80 dark:bg-gray-900/70 misub-radius-lg border border-gray-200/60 dark:border-white/10">
              <h4 class="font-medium text-gray-900 dark:text-gray-200 mb-1 text-sm">客户端使用</h4>
              <ul class="text-xs text-gray-500 dark:text-gray-400 space-y-1.5 mt-1">
                <li class="flex items-start gap-1.5">
                  <span class="text-primary-500 mt-0.5">•</span>
                  <span><b class="text-gray-700 dark:text-gray-300">V2rayN / 小火箭：</b>用「自动识别」或「V2rayN」链接</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="text-primary-500 mt-0.5">•</span>
                  <span><b class="text-gray-700 dark:text-gray-300">Clash / Mihomo：</b>用「Clash」链接</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="text-primary-500 mt-0.5">•</span>
                  <span><b class="text-gray-700 dark:text-gray-300">Surge：</b>用「Surge」链接</span>
                </li>
              </ul>
            </div>
            <div class="p-3 bg-amber-50/80 dark:bg-amber-900/20 misub-radius-lg border border-amber-200/60 dark:border-amber-700/30">
              <p class="text-xs text-amber-700 dark:text-amber-400">
                <b>注意：</b>生成的订阅链接有效期为 7 天，过期后需要重新生成。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 结果区域 -->
    <div v-if="result" class="space-y-6">
      <!-- 统计卡片 -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white/90 dark:bg-gray-900/80 p-4 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10 text-center">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">原始节点</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ counts.inputNodes }}</p>
        </div>
        <div class="bg-white/90 dark:bg-gray-900/80 p-4 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10 text-center">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">优选地址</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ counts.preferredEndpoints }}</p>
        </div>
        <div class="bg-white/90 dark:bg-gray-900/80 p-4 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10 text-center">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">生成节点</p>
          <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ counts.outputNodes }}</p>
        </div>
      </div>

      <!-- 订阅链接卡片 -->
      <div class="bg-white/90 dark:bg-gray-900/80 p-5 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          订阅链接
          <span v-if="result.deduplicated" class="ml-2 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 misub-radius-pill">
            已复用
          </span>
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="card in subCards"
            :key="card.key"
            class="p-4 bg-white/80 dark:bg-gray-900/70 misub-radius-lg border border-gray-200/60 dark:border-white/10 space-y-3"
          >
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ card.icon }}</span>
              <div>
                <h4 class="font-medium text-gray-900 dark:text-gray-200 text-sm">{{ card.label }}</h4>
                <p class="text-xs text-gray-400 dark:text-gray-500">{{ card.desc }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input
                :value="card.url"
                readonly
                class="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800/80 border border-gray-200/60 dark:border-white/10 misub-radius-md text-gray-600 dark:text-gray-400 truncate"
                @click="$event.target.select()"
              />
              <button
                @click="copyUrl(card.url)"
                class="px-2.5 py-1.5 text-xs font-medium bg-gray-100/80 text-gray-700 hover:bg-gray-200/80 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700/70 misub-radius-md transition-colors whitespace-nowrap"
              >
                复制
              </button>
              <button
                @click="showQR(card.url, card.label)"
                class="px-2.5 py-1.5 text-xs font-medium bg-gray-100/80 text-gray-700 hover:bg-gray-200/80 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700/70 misub-radius-md transition-colors whitespace-nowrap"
              >
                二维码
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 预览表格 -->
      <div v-if="result.preview?.length" class="bg-white/90 dark:bg-gray-900/80 p-5 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          预览前 {{ result.preview.length }} 个生成节点
        </h3>
        <div class="overflow-x-auto -mx-5 px-5">
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="border-b border-gray-200 dark:border-white/10">
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">名称</th>
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">类型</th>
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">服务器</th>
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">端口</th>
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">Host</th>
                <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">SNI</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-white/5">
              <tr
                v-for="(node, idx) in result.preview"
                :key="idx"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <td class="px-3 py-2 text-gray-900 dark:text-gray-200 max-w-[200px] truncate" :title="node.name">{{ node.name }}</td>
                <td class="px-3 py-2">
                  <span
                    class="inline-flex items-center px-2 py-0.5 text-xs font-medium misub-radius-pill"
                    :class="{
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': node.type === 'vmess',
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': node.type === 'vless',
                      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400': node.type === 'trojan',
                    }"
                  >
                    {{ node.type }}
                  </span>
                </td>
                <td class="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs max-w-[160px] truncate" :title="node.server">{{ node.server }}</td>
                <td class="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{{ node.port }}</td>
                <td class="px-3 py-2 text-gray-500 dark:text-gray-500 text-xs hidden md:table-cell max-w-[120px] truncate" :title="node.host">{{ node.host || '-' }}</td>
                <td class="px-3 py-2 text-gray-500 dark:text-gray-500 text-xs hidden md:table-cell max-w-[120px] truncate" :title="node.sni">{{ node.sni || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="bg-white/90 dark:bg-gray-900/80 p-8 misub-radius-lg shadow-sm border border-gray-100/80 dark:border-white/10 text-center"
    >
      <div class="flex flex-col items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
        <p class="text-sm text-gray-400 dark:text-gray-500">还没有生成订阅。请先填写节点链接和优选 IP，然后点击「生成订阅」。</p>
      </div>
    </div>

    <!-- 二维码弹窗 -->
    <QRCodeModal v-model:show="showQRCodeModal" :url="qrCodeUrl" :title="qrCodeTitle" />
  </div>
</template>
