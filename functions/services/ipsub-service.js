/**
 * 优选IP订阅服务（从 cloudflaresub/src/core.js 移植）
 * 
 * 功能：解析节点链接 + 优选IP → 扩展节点 → 按全局存储设置保存 → 输出多格式订阅
 * 存储：跟随 MiSub 全局 storageType，支持 KV / D1
 */

import { createJsonResponse, createErrorResponse } from '../modules/utils.js';
import { DEFAULT_SETTINGS, KV_KEY_SETTINGS } from '../modules/config.js';
import { STORAGE_TYPES, StorageFactory } from '../storage-adapter.js';

// ================================================================
// Part A: 核心逻辑函数（从 cloudflaresub/src/core.js 搬运的纯函数）
// ================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEFAULT_TEST_URL = 'http://cp.cloudflare.com/generate_204';
const IPSUB_RECORD_VERSION = 2;
const IPSUB_RECORD_PREFIX = 'ipsub_record:';
const IPSUB_DEDUP_PREFIX = 'ipsub_dedup:';
const IPSUB_DEFAULT_SETTINGS = DEFAULT_SETTINGS.ipsub || {
    expireEnabled: true,
    expireDays: 7,
};

// ---- 文本工具 ----

function normalizeText(value = '') {
    return String(value).replace(/\r\n?/g, '\n').trim();
}

function splitCsvLike(text = '') {
    return normalizeText(text)
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

// ---- Base64 工具 ----

function encodeBase64Utf8(text) {
    return bytesToBase64(textEncoder.encode(text));
}

function decodeBase64Utf8(base64Text) {
    return textDecoder.decode(base64ToBytes(normalizeBase64(base64Text)));
}

function normalizeBase64(input) {
    const value = String(input || '').trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
    return value + padding;
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        const chunk = bytes.subarray(index, index + 0x8000);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function base64ToBytes(base64Text) {
    const binary = atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

// ---- 通用辅助 ----

function normalizePort(value, fallback) {
    const number = Number.parseInt(String(value || ''), 10);
    if (Number.isInteger(number) && number >= 1 && number <= 65535) return number;
    if (fallback !== undefined) return fallback;
    throw new Error(`端口无效：${value}`);
}

function normalizeInteger(value, fallback = 0) {
    const number = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(number) ? number : fallback;
}

function normalizePath(value) {
    const text = String(value || '').trim();
    if (!text) return '/';
    return text.startsWith('/') ? text : `/${text}`;
}

function splitListValue(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function formatHostForUrl(host) {
    if (String(host).includes(':') && !String(host).startsWith('[')) return `[${host}]`;
    return host;
}

function setQueryParam(params, key, value) {
    const normalized = String(value || '').trim();
    if (normalized) params.set(key, normalized);
    else params.delete(key);
}

function isTlsEnabled(value) {
    const text = String(value || '').trim().toLowerCase();
    return text === 'tls' || text === 'xtls' || text === 'reality';
}

function toBoolean(value) {
    const text = String(value || '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes';
}

function decodeHashName(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch { return raw; }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function yamlQuote(value) {
    const text = String(value ?? '');
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitizeSurgeName(name) {
    return String(name || 'proxy').replace(/[\r\n]/g, ' ').replace(/,/g, '，').replace(/=/g, '＝').trim();
}

function escapeSurgeHeader(value) {
    return String(value || '').replace(/"/g, '\\"');
}

// ---- 节点解析 ----

function maybeExpandRawSubscription(inputText) {
    const text = normalizeText(inputText);
    if (!text || text.includes('://')) return text;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(text)) return text;
    try {
        const decoded = decodeBase64Utf8(text);
        if (decoded.includes('://')) return decoded;
    } catch { /* ignore */ }
    return text;
}

function parseSingleNode(uri) {
    const lower = uri.toLowerCase();
    if (lower.startsWith('vmess://')) return parseVmessUri(uri);
    if (lower.startsWith('vless://')) return parseVlessUri(uri);
    if (lower.startsWith('trojan://')) return parseTrojanUri(uri);
    throw new Error('只支持 vmess://、vless://、trojan://');
}

function parseVmessUri(uri) {
    const encoded = uri.slice('vmess://'.length).trim();
    const jsonText = decodeBase64Utf8(encoded);
    const data = JSON.parse(jsonText);
    const server = String(data.add || '').trim();
    const port = normalizePort(data.port, 443);
    const uuid = String(data.id || '').trim();
    if (!server || !uuid) throw new Error('VMess 链接缺少 add 或 id');

    return {
        type: 'vmess', name: String(data.ps || 'vmess').trim() || 'vmess',
        server, originalServer: server, port, uuid,
        alterId: normalizeInteger(data.aid, 0),
        cipher: String(data.scy || data.cipher || 'auto').trim() || 'auto',
        network: String(data.net || 'ws').trim() || 'ws',
        path: normalizePath(data.path || '/'),
        hostHeader: String(data.host || '').trim(),
        sni: String(data.sni || '').trim(),
        tls: isTlsEnabled(data.tls),
        security: String(data.tls || '').trim(),
        alpn: splitListValue(data.alpn),
        fp: String(data.fp || '').trim(),
        headerType: String(data.type || '').trim(),
        allowInsecure: toBoolean(data.allowInsecure),
        params: {},
    };
}

function parseVlessUri(uri) {
    const url = new URL(uri);
    const params = Object.fromEntries(url.searchParams.entries());
    const server = url.hostname;
    const port = normalizePort(url.port || params.port, 443);
    const uuid = decodeURIComponent(url.username || '').trim();
    if (!server || !uuid) throw new Error('VLESS 链接缺少主机或 UUID');

    const network = String(params.type || 'tcp').trim() || 'tcp';
    const security = String(params.security || '').trim();
    return {
        type: 'vless', name: decodeHashName(url.hash) || 'vless',
        server, originalServer: server, port, uuid, network,
        path: normalizePath(params.path || ''),
        hostHeader: String(params.host || '').trim(),
        sni: String(params.sni || params.peer || '').trim(),
        tls: security === 'tls' || security === 'reality',
        security,
        alpn: splitListValue(params.alpn),
        fp: String(params.fp || '').trim(),
        allowInsecure: toBoolean(params.allowInsecure || params.insecure),
        flow: String(params.flow || '').trim(),
        serviceName: String(params.serviceName || '').trim(),
        authority: String(params.authority || '').trim(),
        encryption: String(params.encryption || 'none').trim() || 'none',
        params,
    };
}

function parseTrojanUri(uri) {
    const url = new URL(uri);
    const params = Object.fromEntries(url.searchParams.entries());
    const server = url.hostname;
    const port = normalizePort(url.port || params.port, 443);
    const password = decodeURIComponent(url.username || '').trim();
    if (!server || !password) throw new Error('Trojan 链接缺少主机或密码');

    const security = String(params.security || 'tls').trim() || 'tls';
    return {
        type: 'trojan', name: decodeHashName(url.hash) || 'trojan',
        server, originalServer: server, port, password,
        network: String(params.type || 'tcp').trim() || 'tcp',
        path: normalizePath(params.path || ''),
        hostHeader: String(params.host || '').trim(),
        sni: String(params.sni || params.peer || '').trim(),
        tls: security === 'tls',
        security,
        alpn: splitListValue(params.alpn),
        fp: String(params.fp || '').trim(),
        allowInsecure: toBoolean(params.allowInsecure || params.insecure),
        serviceName: String(params.serviceName || '').trim(),
        authority: String(params.authority || '').trim(),
        params,
    };
}

// ---- 公开：解析节点链接 ----

function parseNodeLinks(inputText) {
    const text = maybeExpandRawSubscription(inputText);
    const lines = normalizeText(text).split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error('请至少粘贴 1 个 vmess:// / vless:// / trojan:// 节点链接。');

    const nodes = [];
    const warnings = [];
    lines.forEach((line, index) => {
        try { nodes.push(parseSingleNode(line)); }
        catch (error) { warnings.push(`第 ${index + 1} 行解析失败：${error.message}`); }
    });

    if (!nodes.length) throw new Error(warnings[0] || '没有解析出任何可用节点。');
    return { nodes, warnings, normalizedInput: text };
}

// ---- 优选端点解析 ----

function parseEndpoint(rawLine) {
    const raw = String(rawLine || '').trim();
    if (!raw) throw new Error('优选地址为空');

    const hashIndex = raw.indexOf('#');
    const hostPart = hashIndex >= 0 ? raw.slice(0, hashIndex).trim() : raw;
    const label = hashIndex >= 0 ? raw.slice(hashIndex + 1).trim() : '';
    const { host, port } = splitHostAndPort(hostPart);
    if (!host) throw new Error(`无效地址：${raw}`);
    return { host, port, label };
}

function splitHostAndPort(input) {
    const value = String(input || '').trim();
    if (!value) return { host: '', port: undefined };

    if (value.startsWith('[')) {
        const match = value.match(/^\[([^\]]+)](?::(\d+))?$/);
        if (!match) throw new Error(`IPv6 地址格式错误：${value}`);
        return { host: match[1], port: match[2] ? normalizePort(match[2]) : undefined };
    }

    const colonCount = (value.match(/:/g) || []).length;
    if (colonCount > 1) return { host: value, port: undefined };

    const parts = value.split(':');
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        return { host: parts[0], port: normalizePort(parts[1]) };
    }
    return { host: value, port: undefined };
}

function parsePreferredEndpoints(inputText) {
    const items = splitCsvLike(inputText);
    if (!items.length) throw new Error('请至少填写 1 个优选 IP 或优选域名。');

    const endpoints = [];
    const warnings = [];
    const seen = new Set();

    items.forEach((raw, index) => {
        try {
            const endpoint = parseEndpoint(raw);
            const dedupeKey = `${endpoint.host}:${endpoint.port || ''}`;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            endpoints.push(endpoint);
        } catch (error) {
            warnings.push(`第 ${index + 1} 个优选地址解析失败：${error.message}`);
        }
    });

    if (!endpoints.length) throw new Error(warnings[0] || '没有解析出任何可用优选地址。');
    return { endpoints, warnings };
}

// ---- 节点扩展 ----

function getEffectiveTlsHost(node) {
    return String(node.sni || node.hostHeader || node.originalServer || '').trim();
}

function buildNodeName(baseName, suffix) {
    const cleanBase = String(baseName || '').trim() || 'node';
    const cleanSuffix = String(suffix || '').trim();
    return cleanSuffix ? `${cleanBase} | ${cleanSuffix}` : cleanBase;
}

function expandNodes(baseNodes, endpoints, options = {}) {
    const keepOriginalHost = options.keepOriginalHost !== false;
    const namePrefix = String(options.namePrefix || '').trim();
    const warnings = [];
    const expanded = [];

    baseNodes.forEach((baseNode) => {
        const originalTlsHost = getEffectiveTlsHost(baseNode);
        if (keepOriginalHost && !originalTlsHost) {
            warnings.push(`节点「${baseNode.name}」缺少 Host/SNI/原始域名，替换成优选 IP 后可能无法握手。`);
        }

        endpoints.forEach((endpoint, index) => {
            const port = endpoint.port || baseNode.port;
            const label = endpoint.label || `${endpoint.host}:${port}`;
            const suffix = namePrefix ? `${namePrefix}-${index + 1}` : label;
            const clone = deepClone(baseNode);
            clone.server = endpoint.host;
            clone.port = port;
            clone.name = buildNodeName(baseNode.name, suffix);
            clone.endpointLabel = endpoint.label || '';
            clone.endpointSource = `${endpoint.host}:${port}`;

            if (keepOriginalHost) {
                clone.sni = baseNode.sni || baseNode.hostHeader || baseNode.originalServer || '';
                clone.hostHeader = baseNode.hostHeader || baseNode.sni || baseNode.originalServer || '';
            } else {
                if (!baseNode.sni || baseNode.sni === baseNode.originalServer) clone.sni = endpoint.host;
                if (!baseNode.hostHeader || baseNode.hostHeader === baseNode.originalServer) clone.hostHeader = endpoint.host;
            }

            expanded.push(clone);
        });
    });

    return { nodes: expanded, warnings };
}

// ---- 节点预览摘要 ----

function summarizeNodes(nodes, limit = 20) {
    return nodes.slice(0, limit).map((node) => ({
        name: node.name, type: node.type, server: node.server, port: node.port,
        host: node.hostHeader || '', sni: node.sni || '',
        network: node.network || 'tcp', tls: Boolean(node.tls),
    }));
}

// ---- 节点 URI 渲染 ----

function renderNodeUri(node) {
    switch (node.type) {
        case 'vmess': return renderVmessUri(node);
        case 'vless': return renderVlessUri(node);
        case 'trojan': return renderTrojanUri(node);
        default: throw new Error(`未知节点类型：${node.type}`);
    }
}

function renderVmessUri(node) {
    const payload = {
        v: '2', ps: node.name, add: node.server, port: String(node.port),
        id: node.uuid, aid: String(node.alterId ?? 0),
        scy: node.cipher || 'auto', net: node.network || 'ws',
        type: node.headerType || '', host: node.hostHeader || '',
        path: node.path || '/', tls: node.tls ? (node.security || 'tls') : '',
        sni: node.sni || '', fp: node.fp || '',
        alpn: Array.isArray(node.alpn) && node.alpn.length ? node.alpn.join(',') : '',
    };
    return `vmess://${encodeBase64Utf8(JSON.stringify(payload))}`;
}

function renderVlessUri(node) {
    const params = new URLSearchParams(node.params || {});
    params.set('type', node.network || 'ws');
    params.set('encryption', node.encryption || 'none');
    if (node.security) params.set('security', node.security);
    else if (node.tls) params.set('security', 'tls');
    else params.delete('security');
    setQueryParam(params, 'path', node.path || '');
    setQueryParam(params, 'host', node.hostHeader || '');
    setQueryParam(params, 'sni', node.sni || '');
    setQueryParam(params, 'alpn', node.alpn?.length ? node.alpn.join(',') : '');
    setQueryParam(params, 'fp', node.fp || '');
    setQueryParam(params, 'flow', node.flow || '');
    setQueryParam(params, 'serviceName', node.serviceName || '');
    setQueryParam(params, 'authority', node.authority || '');
    const hash = node.name ? `#${encodeURIComponent(node.name)}` : '';
    return `vless://${encodeURIComponent(node.uuid)}@${formatHostForUrl(node.server)}:${node.port}?${params.toString()}${hash}`;
}

function renderTrojanUri(node) {
    const params = new URLSearchParams(node.params || {});
    params.set('type', node.network || 'ws');
    if (node.security) params.set('security', node.security);
    else params.set('security', 'tls');
    setQueryParam(params, 'path', node.path || '');
    setQueryParam(params, 'host', node.hostHeader || '');
    setQueryParam(params, 'sni', node.sni || '');
    setQueryParam(params, 'alpn', node.alpn?.length ? node.alpn.join(',') : '');
    setQueryParam(params, 'fp', node.fp || '');
    setQueryParam(params, 'serviceName', node.serviceName || '');
    setQueryParam(params, 'authority', node.authority || '');
    const hash = node.name ? `#${encodeURIComponent(node.name)}` : '';
    return `trojan://${encodeURIComponent(node.password)}@${formatHostForUrl(node.server)}:${node.port}?${params.toString()}${hash}`;
}

// ---- 订阅格式渲染 ----

function renderRawSubscription(nodes) {
    const lines = nodes.map((node) => renderNodeUri(node)).join('\n');
    return encodeBase64Utf8(lines);
}

function isClashSupportedNode(node) {
    return ['vmess', 'vless', 'trojan'].includes(node.type);
}

function renderClashProxy(node) {
    const lines = [`  - name: ${yamlQuote(node.name)}`, `    type: ${node.type}`];
    lines.push(`    server: ${yamlQuote(node.server)}`);
    lines.push(`    port: ${node.port}`);
    lines.push('    udp: true');

    if (node.type === 'vmess') {
        lines.push(`    uuid: ${yamlQuote(node.uuid)}`);
        lines.push(`    alterId: ${node.alterId ?? 0}`);
        lines.push(`    cipher: ${yamlQuote(node.cipher || 'auto')}`);
    }
    if (node.type === 'vless') {
        lines.push(`    uuid: ${yamlQuote(node.uuid)}`);
        if (node.flow) lines.push(`    flow: ${yamlQuote(node.flow)}`);
    }
    if (node.type === 'trojan') {
        lines.push(`    password: ${yamlQuote(node.password)}`);
    }

    if (node.tls) {
        lines.push('    tls: true');
        const servername = getEffectiveTlsHost(node);
        if (servername) lines.push(`    servername: ${yamlQuote(servername)}`);
        if (node.alpn?.length) lines.push(`    alpn: [${node.alpn.map(yamlQuote).join(', ')}]`);
        if (node.fp) lines.push(`    client-fingerprint: ${yamlQuote(node.fp)}`);
        lines.push(`    skip-cert-verify: ${node.allowInsecure ? 'true' : 'false'}`);
    }

    lines.push(`    network: ${node.network || 'tcp'}`);

    if (node.network === 'ws') {
        lines.push('    ws-opts:');
        lines.push(`      path: ${yamlQuote(node.path || '/')}`);
        if (node.hostHeader) {
            lines.push('      headers:');
            lines.push(`        Host: ${yamlQuote(node.hostHeader)}`);
        }
    }
    if (node.network === 'grpc') {
        lines.push('    grpc-opts:');
        lines.push(`      grpc-service-name: ${yamlQuote(node.serviceName || '')}`);
    }
    if (node.network === 'http' || node.network === 'h2') {
        lines.push('    http-opts:');
        lines.push(`      path: [${yamlQuote(node.path || '/')}]`);
        if (node.hostHeader) {
            lines.push('      headers:');
            lines.push(`        Host: [${yamlQuote(node.hostHeader)}]`);
        }
    }
    return lines;
}

function renderClashSubscription(nodes) {
    const supportedNodes = nodes.filter(isClashSupportedNode);
    if (!supportedNodes.length) {
        throw new Error('没有可导出为 Clash 的节点。当前版本主要支持 VMess/VLESS/Trojan。');
    }

    const proxyNames = supportedNodes.map((node) => node.name);
    const lines = [
        '# Generated by MiSub IP Sub Tool',
        'mixed-port: 7890', 'allow-lan: false', 'mode: rule',
        'log-level: info', 'ipv6: false', 'proxies:',
    ];

    supportedNodes.forEach((node) => { lines.push(...renderClashProxy(node)); });

    lines.push('proxy-groups:');
    lines.push('  - name: "🚀 节点选择"');
    lines.push('    type: select');
    lines.push(`    proxies: ["♻️ 自动选择", ${proxyNames.map(yamlQuote).join(', ')}]`);
    lines.push('  - name: "♻️ 自动选择"');
    lines.push('    type: url-test');
    lines.push(`    url: ${yamlQuote(DEFAULT_TEST_URL)}`);
    lines.push('    interval: 300');
    lines.push('    tolerance: 50');
    lines.push(`    proxies: [${proxyNames.map(yamlQuote).join(', ')}]`);
    lines.push('rules:');
    lines.push('  - MATCH,🚀 节点选择');
    return lines.join('\n') + '\n';
}

function renderSurgeProxy(node) {
    const name = sanitizeSurgeName(node.name);
    if (node.type === 'vmess') {
        const params = [
            `username=${node.uuid}`, `vmess-aead=true`,
            `tls=${node.tls ? 'true' : 'false'}`,
            `skip-cert-verify=${node.allowInsecure ? 'true' : 'false'}`,
        ];
        const sni = getEffectiveTlsHost(node);
        if (sni) params.push(`sni=${sni}`);
        if (node.network === 'ws') {
            params.push('ws=true');
            params.push(`ws-path=${node.path || '/'}`);
            if (node.hostHeader) params.push(`ws-headers=Host:"${escapeSurgeHeader(node.hostHeader)}"`);
        }
        return `${name} = vmess, ${formatHostForUrl(node.server)}, ${node.port}, ${params.join(', ')}`;
    }

    const trojanParams = [];
    trojanParams.push(`password=${node.password}`);
    trojanParams.push(`skip-cert-verify=${node.allowInsecure ? 'true' : 'false'}`);
    const sni = getEffectiveTlsHost(node);
    if (sni) trojanParams.push(`sni=${sni}`);
    if (node.network === 'ws') {
        trojanParams.push('ws=true');
        trojanParams.push(`ws-path=${node.path || '/'}`);
        if (node.hostHeader) trojanParams.push(`ws-headers=Host:"${escapeSurgeHeader(node.hostHeader)}"`);
    }
    return `${name} = trojan, ${formatHostForUrl(node.server)}, ${node.port}, ${trojanParams.join(', ')}`;
}

function renderSurgeSubscription(nodes, requestUrl) {
    const supportedNodes = nodes.filter((node) => node.type === 'vmess' || node.type === 'trojan');
    if (!supportedNodes.length) {
        throw new Error('当前 Surge 导出仅支持 VMess / Trojan 节点。');
    }

    const proxyNames = supportedNodes.map((node) => sanitizeSurgeName(node.name));
    const lines = [
        `#!MANAGED-CONFIG ${requestUrl} interval=86400 strict=false`,
        '', '[General]', 'loglevel = notify',
        `internet-test-url = ${DEFAULT_TEST_URL}`,
        `proxy-test-url = ${DEFAULT_TEST_URL}`,
        'ipv6 = false', '', '[Proxy]',
    ];

    supportedNodes.forEach((node) => { lines.push(renderSurgeProxy(node)); });

    lines.push('');
    lines.push('[Proxy Group]');
    lines.push(`🚀 节点选择 = select, ♻️ 自动选择, ${proxyNames.join(', ')}`);
    lines.push(`♻️ 自动选择 = url-test, ${proxyNames.join(', ')}, url=${DEFAULT_TEST_URL}, interval=600, tolerance=50`);
    lines.push('');
    lines.push('[Rule]');
    lines.push('FINAL, 🚀 节点选择');
    lines.push('');
    return lines.join('\n');
}

// ---- 统一订阅输出 ----

function renderSubscription(target, nodes, requestUrl) {
    switch (target) {
        case 'raw': case 'base64': case 'v2rayn': case 'shadowrocket':
            return { body: renderRawSubscription(nodes), contentType: 'text/plain; charset=utf-8' };
        case 'clash':
            return { body: renderClashSubscription(nodes), contentType: 'text/yaml; charset=utf-8' };
        case 'surge':
            return { body: renderSurgeSubscription(nodes, requestUrl), contentType: 'text/plain; charset=utf-8' };
        case 'json':
            return { body: JSON.stringify(nodes, null, 2), contentType: 'application/json; charset=utf-8' };
        default:
            throw new Error(`不支持的订阅输出格式：${target}`);
    }
}

function detectTarget(userAgent = '', explicitTarget = '') {
    const target = String(explicitTarget || '').trim().toLowerCase();
    if (target && target !== 'auto') return target;

    const ua = String(userAgent || '').toLowerCase();
    if (/clash|mihomo|stash|nekobox|meta/.test(ua)) return 'clash';
    if (/surge/.test(ua)) return 'surge';
    return 'raw';
}


// ================================================================
// Part B: 优选 IP 存储抽象（KV / D1）+ API 处理函数
// ================================================================

function normalizeIpSubSettings(settings = {}) {
    const config = settings?.ipsub && typeof settings.ipsub === 'object'
        ? settings.ipsub
        : {};

    const expireEnabled = config.expireEnabled !== false;
    const parsedExpireDays = Number.parseInt(String(config.expireDays ?? IPSUB_DEFAULT_SETTINGS.expireDays), 10);
    const expireDays = Number.isInteger(parsedExpireDays) && parsedExpireDays > 0
        ? parsedExpireDays
        : IPSUB_DEFAULT_SETTINGS.expireDays;

    return {
        expireEnabled,
        expireDays,
    };
}

function buildExpiryPolicy(settings = {}) {
    const normalized = normalizeIpSubSettings(settings);
    const ttlSeconds = normalized.expireEnabled ? normalized.expireDays * 24 * 60 * 60 : null;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;

    return {
        ...normalized,
        ttlSeconds,
        expiresAt,
        d1Offset: normalized.expireEnabled ? `+${normalized.expireDays} days` : null,
    };
}

function sqliteDateTimeToIsoUtc(input) {
    const text = String(input || '').trim();
    if (!text) return null;

    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
        const [, year, month, day, hours, minutes, seconds] = match;
        return new Date(Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hours),
            Number(minutes),
            Number(seconds),
        )).toISOString();
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function normalizeStoredRecord(rawValue, fallbackMeta = {}) {
    if (!rawValue) return null;

    let parsed = rawValue;
    if (typeof rawValue === 'string') {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            return null;
        }
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
        return null;
    }

    const meta = {
        ...fallbackMeta,
        ...(parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {}),
    };

    return {
        version: parsed.version || 1,
        nodes: parsed.nodes,
        options: parsed.options || {},
        meta,
    };
}

function buildStoredRecord({ nodes, options, dedupHash, expiryPolicy, storageType, previousRecord = null }) {
    const createdAt = previousRecord?.meta?.createdAt || new Date().toISOString();

    return {
        version: IPSUB_RECORD_VERSION,
        nodes,
        options,
        meta: {
            dedupHash,
            createdAt,
            updatedAt: new Date().toISOString(),
            expiresAt: expiryPolicy.expiresAt,
            expireEnabled: expiryPolicy.expireEnabled,
            expireDays: expiryPolicy.expireDays,
            storageType,
        },
    };
}

function isRecordExpired(record) {
    const expiresAt = record?.meta?.expiresAt;
    if (!expiresAt) return false;
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) return false;
    return expiresAtMs <= Date.now();
}

function getIpSubRecordKey(id) {
    return `${IPSUB_RECORD_PREFIX}${id}`;
}

function getIpSubDedupKey(dedupHash) {
    return `${IPSUB_DEDUP_PREFIX}${dedupHash}`;
}

function kvGetOptions(ttlSeconds) {
    return ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
}

async function kvPutJson(kv, key, value, ttlSeconds = null) {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    const options = kvGetOptions(ttlSeconds);
    if (options) {
        await kv.put(key, payload, options);
        return;
    }
    await kv.put(key, payload);
}

async function kvGetJson(kv, key) {
    const raw = await kv.get(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function resolveIpSubStorageType(env) {
    const configuredType = await StorageFactory.getStorageType(env);
    const hasKv = !!StorageFactory.resolveKV(env);
    const hasD1 = !!env.MISUB_DB;

    if (configuredType === STORAGE_TYPES.D1) {
        if (hasD1) return STORAGE_TYPES.D1;
        if (hasKv) return STORAGE_TYPES.KV;
    } else {
        if (hasKv) return STORAGE_TYPES.KV;
        if (hasD1) return STORAGE_TYPES.D1;
    }

    return null;
}

function getReadableStorageTypes(env, primaryType) {
    const types = [];
    const hasKv = !!StorageFactory.resolveKV(env);
    const hasD1 = !!env.MISUB_DB;

    if (primaryType === STORAGE_TYPES.KV && hasKv) types.push(STORAGE_TYPES.KV);
    if (primaryType === STORAGE_TYPES.D1 && hasD1) types.push(STORAGE_TYPES.D1);

    if (hasKv && !types.includes(STORAGE_TYPES.KV)) types.push(STORAGE_TYPES.KV);
    if (hasD1 && !types.includes(STORAGE_TYPES.D1)) types.push(STORAGE_TYPES.D1);

    return types;
}

async function getIpSubSettings(env, storageType) {
    const storageAdapter = StorageFactory.createAdapter(env, storageType);
    const settings = await storageAdapter.get(KV_KEY_SETTINGS) || {};
    return {
        ...DEFAULT_SETTINGS,
        ...settings,
    };
}

/**
 * 生成 10 位随机短ID
 */
function createShortId(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/**
 * 生成唯一短ID（检查当前可读存储中是否冲突）
 */
async function createUniqueShortId(isExisting, maxTries = 8) {
    for (let i = 0; i < maxTries; i++) {
        const id = createShortId(10);
        const existing = await isExisting(id);
        if (!existing) return id;
    }
    throw new Error('无法生成唯一短链接，请稍后再试');
}

/**
 * SHA-256 哈希（用于去重）
 */
async function sha256Hex(input) {
    const data = textEncoder.encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 构建去重哈希
 */
async function buildDedupHash(body) {
    const normalized = {
        nodeLinks: normalizeText(body.nodeLinks || ''),
        preferredIps: normalizeText(body.preferredIps || ''),
        namePrefix: String(body.namePrefix || '').trim(),
        keepOriginalHost: body.keepOriginalHost !== false,
    };
    return sha256Hex(JSON.stringify(normalized));
}

/**
 * 确保 ipsub_records 表存在（自动建表）
 */
async function ensureTable(db) {
    try {
        await db.prepare(
            `CREATE TABLE IF NOT EXISTS ipsub_records (
                id TEXT PRIMARY KEY,
                dedup_hash TEXT,
                data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            )`
        ).run();
        // 索引可能已存在，忽略错误
        try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_ipsub_dedup_hash ON ipsub_records(dedup_hash)').run(); } catch { }
        try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_ipsub_expires_at ON ipsub_records(expires_at)').run(); } catch { }
    } catch (error) {
        // 表可能已存在，忽略
        console.debug('[IpSub] ensureTable:', error.message);
    }
}

async function d1HasId(db, id) {
    const existing = await db.prepare(
        'SELECT id FROM ipsub_records WHERE id = ?'
    ).bind(id).first();
    return !!existing;
}

async function findD1RecordByDedupHash(db, dedupHash) {
    await ensureTable(db);
    const row = await db.prepare(
        'SELECT id, data, expires_at FROM ipsub_records WHERE dedup_hash = ? AND (expires_at IS NULL OR expires_at > datetime("now")) LIMIT 1'
    ).bind(dedupHash).first();

    if (!row) return null;

    const record = normalizeStoredRecord(row.data, {
        dedupHash,
        expiresAt: sqliteDateTimeToIsoUtc(row.expires_at),
    });

    if (!record) return null;
    return { id: row.id, record };
}

async function findD1RecordById(db, id) {
    await ensureTable(db);
    const row = await db.prepare(
        'SELECT data, dedup_hash, expires_at FROM ipsub_records WHERE id = ? AND (expires_at IS NULL OR expires_at > datetime("now"))'
    ).bind(id).first();

    if (!row) return null;

    const record = normalizeStoredRecord(row.data, {
        dedupHash: row.dedup_hash || null,
        expiresAt: sqliteDateTimeToIsoUtc(row.expires_at),
    });

    if (!record) return null;
    return { id, record };
}

async function saveD1Record(db, { id, dedupHash, storedRecord, expiryPolicy, existing }) {
    await ensureTable(db);
    const payload = JSON.stringify(storedRecord);

    if (existing) {
        if (expiryPolicy.expireEnabled) {
            await db.prepare(
                'UPDATE ipsub_records SET dedup_hash = ?, data = ?, expires_at = datetime("now", ?) WHERE id = ?'
            ).bind(dedupHash, payload, expiryPolicy.d1Offset, id).run();
            return;
        }

        await db.prepare(
            'UPDATE ipsub_records SET dedup_hash = ?, data = ?, expires_at = NULL WHERE id = ?'
        ).bind(dedupHash, payload, id).run();
        return;
    }

    if (expiryPolicy.expireEnabled) {
        await db.prepare(
            'INSERT INTO ipsub_records (id, dedup_hash, data, expires_at) VALUES (?, ?, ?, datetime("now", ?))'
        ).bind(id, dedupHash, payload, expiryPolicy.d1Offset).run();
        return;
    }

    await db.prepare(
        'INSERT INTO ipsub_records (id, dedup_hash, data, expires_at) VALUES (?, ?, ?, NULL)'
    ).bind(id, dedupHash, payload).run();
}

async function cleanupKvExpiredRecord(kv, id, record) {
    await kv.delete(getIpSubRecordKey(id));
    if (record?.meta?.dedupHash) {
        await kv.delete(getIpSubDedupKey(record.meta.dedupHash));
    }
}

async function hasKvRecordId(kv, id) {
    const existing = await kv.get(getIpSubRecordKey(id));
    return existing !== null;
}

async function hasRecordIdAnywhere(env, id) {
    const checks = [];

    if (env.MISUB_DB) {
        checks.push(d1HasId(env.MISUB_DB, id));
    }

    const kv = StorageFactory.resolveKV(env);
    if (kv) {
        checks.push(hasKvRecordId(kv, id));
    }

    if (!checks.length) return false;

    const results = await Promise.allSettled(checks);
    return results.some((result) => result.status === 'fulfilled' && result.value === true);
}

async function findKvRecordById(kv, id) {
    const rawRecord = await kvGetJson(kv, getIpSubRecordKey(id));
    if (!rawRecord) return null;

    const record = normalizeStoredRecord(rawRecord);
    if (!record) return null;

    if (isRecordExpired(record)) {
        await cleanupKvExpiredRecord(kv, id, record);
        return null;
    }

    return { id, record };
}

async function findKvRecordByDedupHash(kv, dedupHash) {
    const dedupEntry = await kvGetJson(kv, getIpSubDedupKey(dedupHash));
    const id = typeof dedupEntry === 'string' ? dedupEntry : dedupEntry?.id;

    if (!id) return null;

    const record = await findKvRecordById(kv, id);
    if (!record) {
        await kv.delete(getIpSubDedupKey(dedupHash));
        return null;
    }

    return record;
}

async function saveKvRecord(kv, { id, dedupHash, storedRecord, expiryPolicy }) {
    await kvPutJson(kv, getIpSubRecordKey(id), storedRecord, expiryPolicy.ttlSeconds);
    await kvPutJson(kv, getIpSubDedupKey(dedupHash), {
        id,
        expiresAt: storedRecord.meta?.expiresAt || null,
    }, expiryPolicy.ttlSeconds);
}

async function findExistingRecordByDedupHash(env, storageType, dedupHash) {
    if (storageType === STORAGE_TYPES.D1) {
        if (!env.MISUB_DB) return null;
        return findD1RecordByDedupHash(env.MISUB_DB, dedupHash);
    }

    const kv = StorageFactory.resolveKV(env);
    if (!kv) return null;
    return findKvRecordByDedupHash(kv, dedupHash);
}

async function findRecordById(env, storageType, id) {
    if (storageType === STORAGE_TYPES.D1) {
        if (!env.MISUB_DB) return null;
        return findD1RecordById(env.MISUB_DB, id);
    }

    const kv = StorageFactory.resolveKV(env);
    if (!kv) return null;
    return findKvRecordById(kv, id);
}

async function createStorageShortId(env, storageType) {
    if (storageType === STORAGE_TYPES.D1 && !env.MISUB_DB) {
        throw new Error('D1 数据库未配置，无法生成优选 IP 订阅记录');
    }

    if (storageType === STORAGE_TYPES.KV && !StorageFactory.resolveKV(env)) {
        throw new Error('KV 未绑定，无法生成优选 IP 订阅记录');
    }

    return createUniqueShortId((id) => hasRecordIdAnywhere(env, id));
}

async function saveRecord(env, storageType, payload) {
    if (storageType === STORAGE_TYPES.D1) {
        if (!env.MISUB_DB) {
            throw new Error('D1 数据库未配置');
        }
        await saveD1Record(env.MISUB_DB, payload);
        return;
    }

    const kv = StorageFactory.resolveKV(env);
    if (!kv) {
        throw new Error('KV 未绑定');
    }
    await saveKvRecord(kv, payload);
}

// ================================================================
// 导出的 API 处理函数
// ================================================================

/**
 * 处理 POST /api/ipsub/generate
 * 解析节点 + 优选IP → 扩展 → 按全局 storageType 存储 → 返回订阅链接
 */
export async function handleIpSubGenerate(request, env) {
    if (request.method !== 'POST') {
        return createErrorResponse('Method Not Allowed', 405);
    }

    const storageType = await resolveIpSubStorageType(env);
    if (!storageType) {
        return createJsonResponse({
            ok: false,
            error: '未配置可用存储，请先绑定 MISUB_KV 或 MISUB_DB'
        }, 500);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return createJsonResponse({ ok: false, error: '请求体不是合法 JSON' }, 400);
    }

    try {
        const settings = await getIpSubSettings(env, storageType);
        const expiryPolicy = buildExpiryPolicy(settings);

        // 1. 解析节点
        const { nodes: baseNodes, warnings: nodeWarnings } = parseNodeLinks(body.nodeLinks || '');

        // 2. 解析优选端点
        const { endpoints, warnings: epWarnings } = parsePreferredEndpoints(body.preferredIps || '');

        // 3. 扩展节点
        const options = {
            namePrefix: body.namePrefix || '',
            keepOriginalHost: body.keepOriginalHost !== false,
        };
        const { nodes, warnings: expandWarnings } = expandNodes(baseNodes, endpoints, options);

        // 4. 去重检查：相同输入返回同一短链接
        const dedupHash = await buildDedupHash(body);
        const existing = await findExistingRecordByDedupHash(env, storageType, dedupHash);

        let id;
        let previousRecord = existing?.record || null;
        if (existing) {
            id = existing.id;
        } else {
            id = await createStorageShortId(env, storageType);
        }

        const storedRecord = buildStoredRecord({
            nodes,
            options,
            dedupHash,
            expiryPolicy,
            storageType,
            previousRecord,
        });

        await saveRecord(env, storageType, {
            id,
            dedupHash,
            storedRecord,
            expiryPolicy,
            existing: !!existing,
        });

        // 5. 生成订阅链接
        const origin = new URL(request.url).origin;
        const buildUrl = (target) =>
            `${origin}/ipsub/${id}${target ? `?target=${target}` : ''}`;

        return createJsonResponse({
            ok: true,
            shortId: id,
            deduplicated: !!existing,
            urls: {
                auto: buildUrl(''),
                raw: buildUrl('raw'),
                clash: buildUrl('clash'),
                surge: buildUrl('surge'),
            },
            counts: {
                inputNodes: baseNodes.length,
                preferredEndpoints: endpoints.length,
                outputNodes: nodes.length,
            },
            storageType,
            expiresAt: expiryPolicy.expiresAt,
            expiry: {
                enabled: expiryPolicy.expireEnabled,
                days: expiryPolicy.expireDays,
                expiresAt: expiryPolicy.expiresAt,
            },
            preview: summarizeNodes(nodes, 20),
            warnings: [
                ...nodeWarnings,
                ...epWarnings,
                ...expandWarnings,
            ],
        });
    } catch (error) {
        return createJsonResponse({
            ok: false,
            error: error.message || '生成失败',
        }, 400);
    }
}

/**
 * 处理 GET /ipsub/:id — 返回订阅内容
 * 注意：此接口不需要登录认证（客户端需要能直接拉取订阅）
 */
export async function handleIpSubFetch(url, env) {
    // 提取 ID：/ipsub/aBcDeFgHiJ
    const id = url.pathname.replace(/^\/ipsub\//, '').split('/')[0];
    if (!id) {
        return new Response('缺少订阅 ID', { status: 400 });
    }

    const storageType = await resolveIpSubStorageType(env);
    const readableStorageTypes = getReadableStorageTypes(env, storageType);
    if (readableStorageTypes.length === 0) {
        return new Response('订阅服务暂不可用', { status: 500 });
    }

    let record = null;
    for (const currentType of readableStorageTypes) {
        try {
            record = await findRecordById(env, currentType, id);
            if (record) break;
        } catch (error) {
            console.warn(`[IpSub] Failed to read record ${id} from ${currentType}:`, error.message);
        }
    }

    if (!record) {
        return new Response('订阅不存在或已过期', { status: 404 });
    }

    const { nodes } = record.record;

    // 从请求头或参数识别目标格式
    const userAgent = '';  // handleIpSubFetch 接收的是 URL 对象，没有 request headers
    const target = detectTarget(
        userAgent,
        url.searchParams?.get('target') || ''
    );

    try {
        const { body, contentType } = renderSubscription(target, nodes, url.toString());
        return new Response(body, {
            status: 200,
            headers: {
                'content-type': contentType,
                'access-control-allow-origin': '*',
            },
        });
    } catch (error) {
        return new Response(error.message, { status: 400 });
    }
}
