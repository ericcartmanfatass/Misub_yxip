
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);


-- 优选IP订阅记录（cloudflaresub 功能整合）
CREATE TABLE IF NOT EXISTS ipsub_records (
    id TEXT PRIMARY KEY,              -- 10位随机短ID，用于订阅URL
    dedup_hash TEXT,                  -- 输入内容SHA-256哈希，用于去重
    data TEXT NOT NULL,               -- JSON: { version, nodes, options, meta }
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME               -- 过期时间（可为空，空表示永不过期）
);

CREATE INDEX IF NOT EXISTS idx_ipsub_dedup_hash ON ipsub_records(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_ipsub_expires_at ON ipsub_records(expires_at);
