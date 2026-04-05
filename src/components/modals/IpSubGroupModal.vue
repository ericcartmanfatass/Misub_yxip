<script setup>
import { computed, reactive, ref, watch } from 'vue';
import Modal from '../forms/Modal.vue';
import GroupSelector from '../ui/GroupSelector.vue';
import { useToastStore } from '../../stores/toast.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  editingGroup: {
    type: Object,
    default: null,
  },
  manualNodes: {
    type: Array,
    default: () => [],
  },
  manualNodeGroups: {
    type: Array,
    default: () => [],
  },
  defaultExpireEnabled: {
    type: Boolean,
    default: true,
  },
  defaultExpireDays: {
    type: Number,
    default: 7,
  },
  isSaving: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:show', 'save']);
const { showToast } = useToastStore();

const manualNodeSearch = ref('');

function normalizeExpireDays(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 7;
}

function buildDefaultForm() {
  return {
    id: '',
    name: '',
    sourceType: 'manual',
    manualNodeGroup: '',
    manualNodeIds: [],
    nodeLinks: '',
    preferredIps: '',
    namePrefix: '',
    keepOriginalHost: true,
    expireEnabled: props.defaultExpireEnabled,
    expireDays: normalizeExpireDays(props.defaultExpireDays),
  };
}

const form = reactive(buildDefaultForm());

function fillForm(group) {
  Object.assign(form, buildDefaultForm(), group
    ? {
      id: group.id || '',
      name: group.name || '',
      sourceType: group.sourceType || 'manual',
      manualNodeGroup: group.manualNodeGroup || '',
      manualNodeIds: Array.isArray(group.manualNodeIds) ? [...group.manualNodeIds] : [],
      nodeLinks: group.nodeLinks || '',
      preferredIps: group.preferredIps || '',
      namePrefix: group.namePrefix || '',
      keepOriginalHost: group.keepOriginalHost !== false,
      expireEnabled: group.expireEnabled !== false,
      expireDays: normalizeExpireDays(group.expireDays),
    }
    : {});
  manualNodeSearch.value = '';
}

watch(() => props.show, (value) => {
  if (value) {
    fillForm(props.editingGroup);
  }
});

const availableGroups = computed(() => props.manualNodeGroups || []);

const filteredManualNodes = computed(() => {
  let nodes = props.manualNodes || [];

  if (form.manualNodeGroup) {
    nodes = nodes.filter((node) => node.group === form.manualNodeGroup);
  }

  const query = manualNodeSearch.value.trim().toLowerCase();
  if (!query) return nodes;

  return nodes.filter((node) => {
    const name = String(node.name || '').toLowerCase();
    const url = String(node.url || '').toLowerCase();
    const group = String(node.group || '').toLowerCase();
    return name.includes(query) || url.includes(query) || group.includes(query);
  });
});

const selectedNodeCount = computed(() => form.manualNodeIds.length);

function toggleManualNode(nodeId) {
  if (form.manualNodeIds.includes(nodeId)) {
    form.manualNodeIds = form.manualNodeIds.filter((id) => id !== nodeId);
    return;
  }
  form.manualNodeIds = [...form.manualNodeIds, nodeId];
}

function selectFilteredNodes() {
  form.manualNodeIds = Array.from(new Set(filteredManualNodes.value.map((node) => node.id)));
}

function clearSelectedNodes() {
  form.manualNodeIds = [];
}

function handleSubmit() {
  if (!form.name.trim()) {
    showToast('请填写优选IP订阅组名称', 'error');
    return;
  }

  if (form.sourceType === 'manual' && form.manualNodeIds.length === 0 && !form.nodeLinks.trim()) {
    showToast('请至少选择 1 个手动节点', 'error');
    return;
  }

  if (form.sourceType === 'text' && !form.nodeLinks.trim()) {
    showToast('请填写节点配置信息', 'error');
    return;
  }

  if (!form.preferredIps.trim()) {
    showToast('请填写优选IP或优选域名', 'error');
    return;
  }

  emit('save', {
    ...JSON.parse(JSON.stringify(form)),
    expireDays: normalizeExpireDays(form.expireDays),
  });
}
</script>

<template>
  <Modal :show="show" size="6xl" @update:show="emit('update:show', $event)">
    <template #title>
      <div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          {{ editingGroup ? '编辑优选IP订阅组' : '新增优选IP订阅组' }}
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          支持从手动节点页直接选择节点，或粘贴节点配置手动生成优选 IP 订阅。
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">优选IP订阅组名称</label>
            <input v-model="form.name" type="text" placeholder="例如：Cloudflare 优选订阅"
              class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">备注前缀（可选）</label>
            <input v-model="form.namePrefix" type="text" placeholder="例如：CF-HK"
              class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500" />
          </div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">节点来源</label>
            <div
              class="mt-2 inline-flex p-1 bg-gray-100 dark:bg-white/5 misub-radius-lg border border-gray-200 dark:border-white/10 gap-1">
              <button type="button" class="px-3 py-2 text-sm font-medium misub-radius-md transition-colors"
                :class="form.sourceType === 'manual' ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-300 shadow-sm' : 'text-gray-600 dark:text-gray-300'"
                @click="form.sourceType = 'manual'">
                从手动节点页面选择
              </button>
              <button type="button" class="px-3 py-2 text-sm font-medium misub-radius-md transition-colors"
                :class="form.sourceType === 'text' ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-300 shadow-sm' : 'text-gray-600 dark:text-gray-300'"
                @click="form.sourceType = 'text'">
                手动输入节点配置
              </button>
            </div>
          </div>

          <div v-if="form.sourceType === 'manual'"
            class="p-4 bg-white/70 dark:bg-gray-900/40 border border-gray-200/70 dark:border-white/10 misub-radius-lg space-y-4">
            <div class="flex flex-col xl:flex-row xl:items-center gap-3">
              <div class="flex-1">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">手动节点分组筛选</label>
                <GroupSelector v-model="form.manualNodeGroup" :groups="availableGroups" placeholder="筛选某个节点分组（可选）" />
              </div>
              <div class="flex items-end gap-2">
                <button type="button"
                  class="px-3 py-2 text-sm font-medium misub-radius-md border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors"
                  @click="selectFilteredNodes">
                  全选筛选结果
                </button>
                <button type="button"
                  class="px-3 py-2 text-sm font-medium misub-radius-md border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors"
                  @click="clearSelectedNodes">
                  清空选择
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 flex-wrap">
              <p class="text-xs text-gray-500 dark:text-gray-400">当前仅支持 <b>VMess / VLESS / Trojan</b> 节点作为优选 IP 生成输入。
              </p>
              <span
                class="text-xs font-medium px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-300">
                已选择 {{ selectedNodeCount }} 个节点
              </span>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">搜索节点</label>
              <input v-model="manualNodeSearch" type="text" placeholder="按名称、分组或链接搜索"
                class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500" />
            </div>

            <div
              class="max-h-80 overflow-y-auto border border-gray-200/80 dark:border-white/10 misub-radius-lg divide-y divide-gray-100 dark:divide-white/5">
              <label v-for="node in filteredManualNodes" :key="node.id"
                class="flex items-start gap-3 p-3 cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-500/5 transition-colors">
                <input :checked="form.manualNodeIds.includes(node.id)" type="checkbox"
                  class="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                  @change="toggleManualNode(node.id)" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ node.name || '未命名节点'
                    }}</span>
                    <span
                      class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400">
                      {{ node.group || '默认分组' }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{{ node.url }}</p>
                </div>
              </label>

              <div v-if="filteredManualNodes.length === 0"
                class="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                暂无可用的手动节点，请先在手动节点页面录入 VMess / VLESS / Trojan 节点。
              </div>
            </div>
          </div>

          <div v-else class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">节点配置信息</label>
            <textarea v-model="form.nodeLinks" rows="8"
              placeholder="支持 vmess://、vless://、trojan://，可逐行粘贴，也可直接粘贴 Base64 订阅内容。"
              class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 resize-y"></textarea>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">优选 IP / 域名（输入框中“#”后为节点命名后缀）</label>
          <textarea v-model="form.preferredIps" rows="6"
            placeholder="示例：&#10;104.16.1.2#HK-01&#10;104.17.2.3:2053#HK-02&#10;cf.114514.com:443#US-Edge"
            class="w-full px-3 py-2.5 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 resize-y"></textarea>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            class="p-4 bg-white/70 dark:bg-gray-900/40 border border-gray-200/70 dark:border-white/10 misub-radius-lg h-full flex flex-col justify-center gap-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input v-model="form.keepOriginalHost" type="checkbox"
                class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700" />
              <span class="text-sm text-gray-700 dark:text-gray-300">保留原节点 Host / SNI</span>
            </label>
            <p class="text-xs text-gray-500 dark:text-gray-400 leading-6">
              建议默认开启，生成优选 IP 节点后继续保留原始回源域名，避免 TLS 握手与回源异常。
            </p>
          </div>

          <div
            class="p-4 bg-white/70 dark:bg-gray-900/40 border border-gray-200/70 dark:border-white/10 misub-radius-lg space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input v-model="form.expireEnabled" type="checkbox"
                class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700" />
              <span class="text-sm text-gray-700 dark:text-gray-300">启用过期时间</span>
            </label>

            <div class="flex items-center gap-2">
              <input v-model="form.expireDays" type="number" min="1" inputmode="numeric" :disabled="!form.expireEnabled"
                class="w-24 px-3 py-2 text-sm bg-white dark:bg-gray-800/80 border border-gray-200/80 dark:border-white/10 misub-radius-lg text-gray-900 dark:text-gray-100 disabled:opacity-60" />
              <span class="text-sm text-gray-500 dark:text-gray-400">天后过期</span>
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400 leading-6">
              未勾选时生成的优选 IP 订阅链接长期有效；勾选后按当前订阅组设置生成独立过期时间。
            </p>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-3">
        <button
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold text-sm misub-radius-lg transition-colors"
          @click="emit('update:show', false)">
          取消
        </button>
        <button
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm misub-radius-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          :disabled="isSaving" @click="handleSubmit">
          {{ isSaving ? '生成并保存中...' : editingGroup ? '保存修改' : '生成并保存' }}
        </button>
      </div>
    </template>
  </Modal>
</template>
