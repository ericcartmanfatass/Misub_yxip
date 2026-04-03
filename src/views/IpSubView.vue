<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import draggable from 'vuedraggable';
import Modal from '../components/forms/Modal.vue';
import MoreActionsMenu from '../components/shared/MoreActionsMenu.vue';
import PanelPagination from '../components/shared/PanelPagination.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import IpSubGroupCard from '../components/ipsub/IpSubGroupCard.vue';
import IpSubGroupModal from '../components/modals/IpSubGroupModal.vue';
import IpSubOnlineModal from '../components/modals/IpSubOnlineModal.vue';
import { useDataStore } from '../stores/useDataStore.js';
import { useToastStore } from '../stores/toast.js';
import { fetchSettings, generateIpSubGroup } from '../lib/api.js';
import { generateId } from '../utils/id.js';
import { collectManualNodeGroups } from '../composables/manual-nodes/groups.js';

const dataStore = useDataStore();
const { showToast } = useToastStore();
const { subscriptions, ipSubGroups } = storeToRefs(dataStore);

const QRCodeModal = defineAsyncComponent(() => import('../components/modals/QRCodeModal.vue'));
const NodePreviewModal = defineAsyncComponent(() => import('../components/modals/NodePreview/NodePreviewModal.vue'));

const SUPPORTED_NODE_REGEX = /^(vmess|vless|trojan):\/\//i;
const ITEMS_PER_PAGE = 6;

const currentPage = ref(1);
const isSorting = ref(false);
const isBatchMode = ref(false);
const reorderSnapshot = ref([]);
const selectedIds = ref([]);

const showGroupModal = ref(false);
const editingGroup = ref(null);
const isSavingGroup = ref(false);
const showOnlineModal = ref(false);

const showBatchDeleteModal = ref(false);

const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');

const showNodePreviewModal = ref(false);
const previewSubscriptionUrl = ref('');
const previewSubscriptionName = ref('');

const defaultExpireEnabled = ref(true);
const defaultExpireDays = ref(7);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeExpireDays(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 7;
}

const supportedManualNodes = computed(() => {
  return (subscriptions.value || [])
    .filter((item) => typeof item?.url === 'string' && SUPPORTED_NODE_REGEX.test(item.url.trim()))
    .map((item) => ({ ...item, group: item.group || '' }));
});

const manualNodeGroups = computed(() => collectManualNodeGroups(supportedManualNodes.value));

const totalPages = computed(() => Math.max(1, Math.ceil(ipSubGroups.value.length / ITEMS_PER_PAGE)));

const paginatedGroups = computed(() => {
  const start = (currentPage.value - 1) * ITEMS_PER_PAGE;
  return ipSubGroups.value.slice(start, start + ITEMS_PER_PAGE);
});

const selectedCount = computed(() => selectedIds.value.length);
const hasSelected = computed(() => selectedIds.value.length > 0);

const draggableGroups = computed({
  get: () => [...ipSubGroups.value],
  set: (value) => {
    dataStore.overwriteIpSubGroups(value);
  },
});

watch(() => ipSubGroups.value.length, (length) => {
  if (length === 0) {
    isSorting.value = false;
    isBatchMode.value = false;
    selectedIds.value = [];
  }

  if (currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value;
  }
});

async function loadIpSubSettings() {
  try {
    const result = await fetchSettings();
    if (!result.success) {
      throw new Error(result.error || '加载优选 IP 设置失败');
    }

    const ipsub = result.data?.ipsub || {};
    defaultExpireEnabled.value = ipsub.expireEnabled !== false;
    defaultExpireDays.value = normalizeExpireDays(ipsub.expireDays);
  } catch (error) {
    showToast(error.message || '加载优选 IP 设置失败', 'error');
  }
}

function buildNodeLinksFromPayload(payload) {
  if (payload.sourceType === 'text') {
    return String(payload.nodeLinks || '').trim();
  }

  const selected = supportedManualNodes.value.filter((node) => payload.manualNodeIds.includes(node.id));
  const links = selected.map((node) => node.url).join('\n').trim();
  if (links) return links;
  return String(payload.nodeLinks || '').trim();
}

function buildGroupRecord(payload, result, existingGroup = null) {
  const now = new Date().toISOString();
  const nodeLinks = buildNodeLinksFromPayload(payload);

  return {
    id: existingGroup?.id || generateId('ipsub'),
    name: String(payload.name || '').trim(),
    sourceType: payload.sourceType,
    manualNodeIds: payload.sourceType === 'manual' ? [...(payload.manualNodeIds || [])] : [],
    manualNodeGroup: payload.sourceType === 'manual' ? String(payload.manualNodeGroup || '').trim() : '',
    nodeLinks,
    preferredIps: String(payload.preferredIps || '').trim(),
    namePrefix: String(payload.namePrefix || '').trim(),
    keepOriginalHost: payload.keepOriginalHost !== false,
    expireEnabled: payload.expireEnabled !== false,
    expireDays: normalizeExpireDays(payload.expireDays),
    shortId: result.shortId || existingGroup?.shortId || '',
    urls: result.urls || existingGroup?.urls || {},
    counts: result.counts || existingGroup?.counts || { inputNodes: 0, preferredEndpoints: 0, outputNodes: 0 },
    preview: result.preview || existingGroup?.preview || [],
    warnings: result.warnings || [],
    expiry: result.expiry || {
      enabled: payload.expireEnabled !== false,
      days: normalizeExpireDays(payload.expireDays),
      expiresAt: result.expiresAt || null,
    },
    storageType: result.storageType || existingGroup?.storageType || '',
    deduplicated: Boolean(result.deduplicated),
    createdAt: existingGroup?.createdAt || now,
    updatedAt: now,
    lastGeneratedAt: now,
  };
}

function commitGroupsMutation(mutator) {
  mutator();
  dataStore.markDirty();
}

function hasOrderChanged(previousGroups, nextGroups) {
  if (!Array.isArray(previousGroups) || !Array.isArray(nextGroups)) return true;
  if (previousGroups.length !== nextGroups.length) return true;

  return previousGroups.some((group, index) => group?.id !== nextGroups[index]?.id);
}

function resetBatchMode() {
  isBatchMode.value = false;
  selectedIds.value = [];
}

function openAddModal() {
  editingGroup.value = null;
  showGroupModal.value = true;
}

function openEditModal(group) {
  editingGroup.value = deepClone(group);
  showGroupModal.value = true;
}

async function handleSaveGroup(payload) {
  const nodeLinks = buildNodeLinksFromPayload(payload);
  if (!nodeLinks) {
    showToast(payload.sourceType === 'manual' ? '请选择至少一个可用的手动节点' : '请填写节点配置内容', 'error');
    return;
  }

  isSavingGroup.value = true;
  const existingGroup = payload.id ? ipSubGroups.value.find((item) => item.id === payload.id) : null;

  try {
    const result = await generateIpSubGroup({
      nodeLinks,
      preferredIps: payload.preferredIps,
      namePrefix: payload.namePrefix,
      keepOriginalHost: payload.keepOriginalHost,
      expireEnabled: payload.expireEnabled,
      expireDays: normalizeExpireDays(payload.expireDays),
    });

    if (result?.success === false || result?.ok === false) {
      throw new Error(result.error || result.message || '生成优选 IP 订阅失败');
    }

    const nextGroup = buildGroupRecord(payload, result, existingGroup);

    commitGroupsMutation(() => {
      if (existingGroup) {
        dataStore.updateIpSubGroup(existingGroup.id, nextGroup);
      } else {
        dataStore.addIpSubGroup(nextGroup);
        currentPage.value = 1;
      }
    });

    showGroupModal.value = false;
    editingGroup.value = null;

    showToast(existingGroup ? '优选 IP 订阅组已更新，记得保存更改' : '优选 IP 订阅组已创建，记得保存更改', 'success');
    if (result.deduplicated) {
      showToast('检测到相同输入内容，已自动复用现有短链', 'info');
    }
    (result.warnings || []).slice(0, 3).forEach((warning) => showToast(warning, 'warning'));
  } catch (error) {
    showToast(error.message || '保存优选 IP 订阅组失败', 'error');
  } finally {
    isSavingGroup.value = false;
  }
}

function toggleSelectionMode() {
  if (!ipSubGroups.value.length) return;

  if (!isBatchMode.value && isSorting.value) {
    isSorting.value = false;
  }

  if (isBatchMode.value) {
    resetBatchMode();
    return;
  }

  isBatchMode.value = true;
  selectedIds.value = [];
}

function toggleSelectGroup(groupId) {
  if (!isBatchMode.value) return;

  if (selectedIds.value.includes(groupId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== groupId);
    return;
  }

  selectedIds.value = [...selectedIds.value, groupId];
}

function toggleSelectAll() {
  if (selectedIds.value.length === ipSubGroups.value.length) {
    selectedIds.value = [];
    return;
  }
  selectedIds.value = ipSubGroups.value.map((group) => group.id);
}

function requestDeleteGroup(group) {
  commitGroupsMutation(() => {
    dataStore.removeIpSubGroup(group.id);
  });
  showToast(`已删除优选 IP 订阅组：${group.name}，记得保存更改`, 'success');
}

function confirmBatchDelete() {
  if (!selectedIds.value.length) return;

  const idsToRemove = new Set(selectedIds.value);
  commitGroupsMutation(() => {
    dataStore.overwriteIpSubGroups(ipSubGroups.value.filter((group) => !idsToRemove.has(group.id)));
  });
  showToast(`已批量删除 ${idsToRemove.size} 个优选 IP 订阅组，记得保存更改`, 'success');
  resetBatchMode();
  showBatchDeleteModal.value = false;
}

function handleToggleSort() {
  if (!ipSubGroups.value.length) return;

  if (!isSorting.value && isBatchMode.value) {
    resetBatchMode();
  }

  isSorting.value = !isSorting.value;
  if (isSorting.value) {
    showToast('已进入手动排序模式，拖拽完成后会标记为未保存', 'info');
  }
}

function handleSortStart() {
  reorderSnapshot.value = deepClone(ipSubGroups.value);
}

function handleSortEnd() {
  if (!hasOrderChanged(reorderSnapshot.value, ipSubGroups.value)) {
    return;
  }

  dataStore.markDirty();
  showToast('优选 IP 订阅组排序已更新，记得保存更改', 'success');
}

function handleChangePage(page) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
}

function openPreview(group) {
  previewSubscriptionUrl.value = group.urls?.raw || group.urls?.auto || '';
  previewSubscriptionName.value = group.name || '优选IP订阅组';
  showNodePreviewModal.value = true;
}

function openQRCode(group) {
  qrCodeUrl.value = group.urls?.auto || '';
  qrCodeTitle.value = group.name || '优选IP订阅二维码';
  showQRCodeModal.value = true;
}

onMounted(() => {
  loadIpSubSettings();
});
</script>

<template>
  <div class="max-w-(--breakpoint-xl) mx-auto">
    <div class="mb-4 bg-white/80 dark:bg-gray-900/60 border border-gray-100/80 dark:border-white/10 misub-radius-lg p-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-3 shrink-0">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">优选IP订阅</h2>
          <span class="px-2.5 py-0.5 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700/50 rounded-full">{{ ipSubGroups.length }}</span>
        </div>

        <div class="flex items-center gap-2 sm:w-auto justify-end sm:justify-start flex-wrap">
          <button @click="showOnlineModal = true" class="text-sm font-medium px-3 py-2 misub-radius-md border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-colors shadow-xs shrink-0">
            在线优选IP
          </button>
          <button @click="openAddModal" class="text-sm font-medium px-4 py-2 misub-radius-md bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-sm shadow-primary-500/20 shrink-0">
            新增
          </button>
          <MoreActionsMenu :teleport-to-body="true" menu-width-class="w-40">
            <template #menu="{ close }">
              <button @click="toggleSelectionMode(); close()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                {{ isBatchMode ? '退出批量删除' : '批量删除' }}
              </button>
              <button @click="handleToggleSort(); close()" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                {{ isSorting ? '完成排序' : '手动排序' }}
              </button>
            </template>
          </MoreActionsMenu>
        </div>
      </div>
    </div>

    <div v-if="isBatchMode && ipSubGroups.length > 0" class="mb-4 bg-white/80 dark:bg-gray-900/60 border border-gray-100/80 dark:border-white/10 misub-radius-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div class="text-sm text-gray-700 dark:text-gray-300">
        已选择 <span class="font-semibold text-primary-600 dark:text-primary-300">{{ selectedCount }}</span> / {{ ipSubGroups.length }} 个优选IP订阅组
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button @click="toggleSelectAll" class="px-3 py-2 text-sm font-medium misub-radius-md border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-colors">
          {{ selectedCount === ipSubGroups.length ? '取消全选' : '全选' }}
        </button>
        <button @click="showBatchDeleteModal = true" :disabled="!hasSelected" class="px-3 py-2 text-sm font-medium misub-radius-md bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white transition-colors">
          删除所选
        </button>
        <button @click="resetBatchMode" class="px-3 py-2 text-sm font-medium misub-radius-md border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-colors">
          取消
        </button>
      </div>
    </div>

    <div v-if="ipSubGroups.length > 0">
      <draggable
        v-if="isSorting"
        v-model="draggableGroups"
        item-key="id"
        tag="div"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
        animation="300"
        @start="handleSortStart"
        @end="handleSortEnd"
      >
        <template #item="{ element: group }">
          <div class="cursor-move">
            <IpSubGroupCard
              :group="group"
              :selection-mode="isBatchMode"
              :selected="selectedIds.includes(group.id)"
              @preview="openPreview(group)"
              @qrcode="openQRCode(group)"
              @edit="openEditModal(group)"
              @delete="requestDeleteGroup(group)"
              @toggle-select="toggleSelectGroup(group.id)"
            />
          </div>
        </template>
      </draggable>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="(group, index) in paginatedGroups" :key="group.id" class="list-item-animation" :style="{ '--delay-index': index }">
          <IpSubGroupCard
            :group="group"
            :selection-mode="isBatchMode"
            :selected="selectedIds.includes(group.id)"
            @preview="openPreview(group)"
            @qrcode="openQRCode(group)"
            @edit="openEditModal(group)"
            @delete="requestDeleteGroup(group)"
            @toggle-select="toggleSelectGroup(group.id)"
          />
        </div>
      </div>

      <PanelPagination
        v-if="totalPages > 1 && !isSorting"
        variant="panel"
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="ipSubGroups.length"
        :show-total-items="true"
        @change-page="handleChangePage"
      />
    </div>

    <div v-else class="py-6 border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/50 misub-radius-lg">
      <EmptyState
        title="没有优选IP订阅"
        description="点击右上角“新增”，创建你的第一个优选IP订阅组。"
        icon="folder"
        :total-count="0"
      />
    </div>

    <IpSubGroupModal
      :show="showGroupModal"
      :editing-group="editingGroup"
      :manual-nodes="supportedManualNodes"
      :manual-node-groups="manualNodeGroups"
      :default-expire-enabled="defaultExpireEnabled"
      :default-expire-days="defaultExpireDays"
      :is-saving="isSavingGroup"
      @update:show="showGroupModal = $event"
      @save="handleSaveGroup"
    />

    <IpSubOnlineModal :show="showOnlineModal" @update:show="showOnlineModal = $event" />

    <Modal :show="showBatchDeleteModal" @update:show="showBatchDeleteModal = $event" @confirm="confirmBatchDelete">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">确认批量移除</h3>
      </template>
      <template #body>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          将从当前未保存列表中移除已选中的 <span class="font-semibold text-gray-800 dark:text-gray-100">{{ selectedCount }}</span> 个优选IP订阅组，点击全局保存后才会正式生效。
        </p>
      </template>
    </Modal>

    <NodePreviewModal
      :show="showNodePreviewModal"
      :subscription-id="null"
      :subscription-name="previewSubscriptionName"
      :subscription-url="previewSubscriptionUrl"
      :profile-id="null"
      :profile-name="''"
      @update:show="showNodePreviewModal = $event"
    />

    <QRCodeModal v-model:show="showQRCodeModal" :url="qrCodeUrl" :title="qrCodeTitle" />
  </div>
</template>

<style scoped>
.cursor-move {
  cursor: move;
}
</style>
