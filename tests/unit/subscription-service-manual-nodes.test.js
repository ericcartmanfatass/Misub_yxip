import { describe, it, expect } from 'vitest';
import { generateCombinedNodeList } from '../../functions/services/subscription-service.js';
import { __test__ as mainHandlerTest } from '../../functions/modules/subscription/main-handler.js';
import { resolveRequestContext } from '../../functions/modules/subscription/request-context.js';

const {
    buildRequestScopedPath,
    applyManagedProfilePrefixOverride,
} = mainHandlerTest;

describe('subscription-service 手动节点健壮性', () => {
    it('应在包含异常节点时跳过坏节点并继续生成订阅', async () => {
        const misubs = [
            {
                id: 'bad-1',
                name: '坏节点',
                // 故意传非字符串，模拟历史脏数据
                url: null,
                enabled: true
            },
            {
                id: 'bad-2',
                name: '坏节点2',
                // 非法编码，历史导入可能出现
                url: 'vless://uuid@example.com:443?security=tls#%E0%A4%A',
                enabled: true
            },
            {
                id: 'ok-1',
                name: '正常节点',
                url: 'trojan://pass@example.com:443#ok',
                enabled: true
            }
        ];

        const result = await generateCombinedNodeList(
            {},
            { enableAccessLog: false },
            'ClashMeta',
            misubs,
            '',
            {
                enableManualNodes: true,
                manualNodePrefix: '手动节点',
                enableSubscriptions: true
            },
            false
        );

        expect(typeof result).toBe('string');
        expect(result).toContain('trojan://pass@example.com:443#');
        expect(result).toContain(encodeURIComponent('手动节点 - 正常节点'));
    });

    it('后台我的订阅场景关闭前缀后应保留手动节点原始名称', async () => {
        const misubs = [
            {
                id: 'manual-1',
                name: '正常节点',
                group: 'HK 组',
                url: 'trojan://pass@example.com:443#raw-name',
                enabled: true,
            },
        ];

        const managedPrefixSettings = applyManagedProfilePrefixOverride({
            enableManualNodes: true,
            manualNodePrefix: '手动节点',
            enableSubscriptions: true,
            prependGroupName: true,
        }, true);

        const result = await generateCombinedNodeList(
            {},
            { enableAccessLog: false },
            'ClashMeta',
            misubs,
            '',
            managedPrefixSettings,
            false
        );

        expect(result).toContain(encodeURIComponent('正常节点'));
        expect(result).not.toContain(encodeURIComponent('手动节点 - 正常节点'));
        expect(result).not.toContain(encodeURIComponent('HK 组 - 正常节点'));
    });
});

describe('后台订阅链接路径与前缀覆盖', () => {
    it('应识别 /sub 和 /s 作为后台管理路由前缀，并区分公开分享路径', () => {
        const config = { profileToken: 'profiles', mytoken: 'mytoken' };

        expect(resolveRequestContext(new URL('https://example.com/sub/profiles/demo'), config, []).routePrefix).toBe('/sub');
        expect(resolveRequestContext(new URL('https://example.com/s/profiles/demo'), config, []).routePrefix).toBe('/s');
        expect(resolveRequestContext(new URL('https://example.com/profiles/demo'), config, []).routePrefix).toBe('');
        expect(resolveRequestContext(new URL('https://example.com/sub/demo'), { profileToken: 'sub', mytoken: 'mytoken' }, []).routePrefix).toBe('');
    });

    it('应根据请求来源构造对应的回调路径', () => {
        expect(buildRequestScopedPath('/sub', 'profiles', 'demo')).toBe('/sub/profiles/demo');
        expect(buildRequestScopedPath('', 'profiles', 'demo')).toBe('/profiles/demo');
        expect(buildRequestScopedPath('/sub', 'mytoken')).toBe('/sub/mytoken');
    });

    it('仅在后台我的订阅场景下覆盖前缀配置', () => {
        const publicSettings = applyManagedProfilePrefixOverride({
            enableManualNodes: true,
            enableSubscriptions: true,
            manualNodePrefix: '手动节点',
            prependGroupName: true,
        }, false);

        const managedSettings = applyManagedProfilePrefixOverride({
            enableManualNodes: true,
            enableSubscriptions: true,
            manualNodePrefix: '手动节点',
            prependGroupName: true,
        }, true);

        expect(publicSettings.enableManualNodes).toBe(true);
        expect(publicSettings.enableSubscriptions).toBe(true);
        expect(publicSettings.prependGroupName).toBe(true);

        expect(managedSettings.enableManualNodes).toBe(false);
        expect(managedSettings.enableSubscriptions).toBe(false);
        expect(managedSettings.prependGroupName).toBe(false);
        expect(managedSettings.manualNodePrefix).toBe('手动节点');
    });
});
