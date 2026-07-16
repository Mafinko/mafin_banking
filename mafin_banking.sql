CREATE TABLE IF NOT EXISTS `mafin_banking_transactions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `identifier` VARCHAR(60) NOT NULL,
    `type` VARCHAR(30) NOT NULL COMMENT 'deposit, withdraw, transfer_in, transfer_out',
    `amount` BIGINT NOT NULL DEFAULT 0,
    `description` VARCHAR(255) DEFAULT NULL,
    `target_identifier` VARCHAR(60) DEFAULT NULL COMMENT 'Pro převody – identifikátor příjemce/odesílatele',
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_identifier` (`identifier`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mafin_banking_accounts` (
    `identifier` VARCHAR(60) NOT NULL,
    `pin` VARCHAR(4) NOT NULL DEFAULT '0000',
    PRIMARY KEY (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
