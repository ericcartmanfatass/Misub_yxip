import { describe, expect, it } from 'vitest';

import { __test__ } from '../../functions/services/ipsub-service.js';

const { buildNodeName, expandNodes, summarizeNodes } = __test__;

describe('IpSub naming rules', () => {
    it('当前后缀都为空时保留原节点名称', () => {
        expect(buildNodeName('原节点名称', '', '')).toBe('原节点名称');
    });

    it('仅有前缀时使用“前缀|原节点名称”', () => {
        expect(buildNodeName('原节点名称', 'CF-HK', '')).toBe('CF-HK|原节点名称');
    });

    it('仅有后缀时使用“原节点名称|后缀”', () => {
        expect(buildNodeName('原节点名称', '', 'HK-01')).toBe('原节点名称|HK-01');
    });

    it('当前后缀同时存在时使用“前缀|后缀”且不保留原节点名称', () => {
        expect(buildNodeName('原节点名称', 'CF-HK', 'HK-01')).toBe('CF-HK|HK-01');
    });

    it('扩展节点与预览结果应复用新的命名规则', () => {
        const baseNodes = [
            {
                type: 'vless',
                name: '原节点名称',
                server: 'origin.example.com',
                originalServer: 'origin.example.com',
                port: 443,
                network: 'ws',
                tls: true,
                sni: 'origin.example.com',
                hostHeader: 'origin.example.com',
            },
        ];

        const endpoints = [
            { host: '104.16.1.2', port: 443, label: 'HK-01' },
        ];

        const { nodes, warnings } = expandNodes(baseNodes, endpoints, {
            namePrefix: 'CF-HK',
            keepOriginalHost: true,
        });

        expect(warnings).toEqual([]);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].name).toBe('CF-HK|HK-01');

        const preview = summarizeNodes(nodes, 20);
        expect(preview).toHaveLength(1);
        expect(preview[0].name).toBe('CF-HK|HK-01');
    });
});
