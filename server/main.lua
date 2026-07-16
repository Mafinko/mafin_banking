local accounts = {}
local nextTransactionId = 1
local dbTable = tostring((Config and Config.DatabaseTable) or 'mafin_banking_accounts'):gsub('[^%w_]', '')
local getCash

local function autoCreateDatabase()
    if not Config or not Config.AutoDatabase then return end

    CreateThread(function()
        Wait(500)

        if not MySQL then
            print('[mafin_banking] AutoDatabase is true, but MySQL/oxmysql is not available.')
            return
        end

        local sql = ([[
            CREATE TABLE IF NOT EXISTS `%s` (
                `identifier` varchar(64) NOT NULL,
                `account` varchar(32) NOT NULL,
                `owner` varchar(128) DEFAULT NULL,
                `balance` int NOT NULL DEFAULT 0,
                `pin` varchar(16) DEFAULT NULL,
                `history` longtext DEFAULT NULL,
                PRIMARY KEY (`identifier`)
            )
        ]]):format(dbTable)

        if MySQL.query and MySQL.query.await then
            MySQL.query.await(sql, {})
        elseif MySQL.Async and MySQL.Async.execute then
            MySQL.Async.execute(sql, {}, function() end)
        end

        print(('[mafin_banking] AutoDatabase checked table `%s`.'):format(dbTable))
    end)
end

autoCreateDatabase()

local function getIdentifier(src)
    local identifiers = GetPlayerIdentifiers(src)
    return identifiers and identifiers[1] or ('source:%s'):format(src)
end

local function getAccount(src)
    local identifier = getIdentifier(src)

    if not accounts[identifier] then
        accounts[identifier] = {
            identifier = identifier,
            owner = GetPlayerName(src) or ('Player %s'):format(src),
            account = ('MAFIN-%04d'):format(src),
            balance = 0,
            pin = nil,
            history = {}
        }
    end

    return accounts[identifier]
end

local function addHistory(account, kind, amount, description, target)
    local item = {
        id = nextTransactionId,
        type = kind,
        amount = tonumber(amount) or 0,
        description = description or kind,
        target = target,
        date = os.date('%Y-%m-%d %H:%M:%S')
    }

    nextTransactionId = nextTransactionId + 1
    account.history[#account.history + 1] = item
    return item
end

local function snapshot(src)
    local account = getAccount(src)

    return {
        success = true,
        name = account.owner,
        account = account.account,
        balance = account.balance,
        bank = account.balance,
        cash = getCash and (getCash(src) or 0) or 0,
        logs = account.history,
        history = account.history
    }
end

local function notify(src, message, ntype)
    TriggerClientEvent('mafin_notify:Alert', src, 'Mafin Banking', message, 4000, ntype or 'info', true)
end

local function cashItem()
    return tostring((Config and Config.CashItem) or 'money')
end

local function oxInventoryCashEnabled()
    return not Config or Config.UseOxInventoryCash ~= false
end

local function oxInventoryStarted()
    return GetResourceState and GetResourceState('ox_inventory') == 'started'
end

function getCash(src)
    if not oxInventoryCashEnabled() or not oxInventoryStarted() then return nil end
    return exports.ox_inventory:GetItemCount(src, cashItem()) or 0
end

local function removeCash(src, amount)
    if not oxInventoryCashEnabled() then return true end

    if not oxInventoryStarted() then
        notify(src, 'ox_inventory is not started. Deposit cancelled.', 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return false
    end

    local cash = getCash(src) or 0
    if cash < amount then
        notify(src, 'You do not have enough cash.', 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return false
    end

    local success, response = exports.ox_inventory:RemoveItem(src, cashItem(), amount)
    if not success then
        notify(src, ('Could not remove cash from inventory: %s'):format(response or 'unknown_error'), 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return false
    end

    return true
end

local function addCash(src, amount)
    if not oxInventoryCashEnabled() then return true end

    if not oxInventoryStarted() then
        notify(src, 'ox_inventory is not started. Withdrawal cancelled.', 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return false
    end

    local success, response = exports.ox_inventory:AddItem(src, cashItem(), amount)
    if not success then
        notify(src, ('Could not add cash to inventory: %s'):format(response or 'unknown_error'), 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return false
    end

    return true
end

RegisterNetEvent('mafin_banking:requestData', function()
    TriggerClientEvent('mafin_banking:data', source, snapshot(source))
end)

RegisterNetEvent('mafin_banking:deposit', function(amount)
    local src = source
    amount = math.floor(tonumber(amount) or 0)

    if amount <= 0 then
        notify(src, 'Invalid deposit amount.', 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return
    end

    if not removeCash(src, amount) then return end

    local account = getAccount(src)
    account.balance = account.balance + amount
    addHistory(account, 'deposit', amount, 'Cash deposit')
    TriggerClientEvent('mafin_banking:data', src, snapshot(src))
    notify(src, ('Deposited $%s.'):format(amount), 'success')
end)

RegisterNetEvent('mafin_banking:withdraw', function(amount)
    local src = source
    amount = math.floor(tonumber(amount) or 0)
    local account = getAccount(src)

    if amount <= 0 or account.balance < amount then
        notify(src, 'Not enough money in the account.', 'error')
        TriggerClientEvent('mafin_banking:data', src, snapshot(src))
        return
    end

    if not addCash(src, amount) then return end

    account.balance = account.balance - amount
    addHistory(account, 'withdraw', amount, 'Cash withdrawal')
    TriggerClientEvent('mafin_banking:data', src, snapshot(src))
    notify(src, ('Withdrew $%s.'):format(amount), 'success')
end)

RegisterNetEvent('mafin_banking:transfer', function(target, amount, reason)
    local src = source
    target = tonumber(target)
    amount = math.floor(tonumber(amount) or 0)

    if not target or target <= 0 or not GetPlayerName(target) then
        notify(src, 'Target player is not online.', 'error')
        return
    end

    if target == src then
        notify(src, 'You cannot transfer money to yourself.', 'error')
        return
    end

    local sender = getAccount(src)
    local receiver = getAccount(target)

    if amount <= 0 or sender.balance < amount then
        notify(src, 'Not enough money for this transfer.', 'error')
        return
    end

    sender.balance = sender.balance - amount
    receiver.balance = receiver.balance + amount
    addHistory(sender, 'transfer_out', amount, reason or 'Bank transfer', receiver.owner)
    addHistory(receiver, 'transfer_in', amount, reason or 'Bank transfer', sender.owner)

    TriggerClientEvent('mafin_banking:data', src, snapshot(src))
    TriggerClientEvent('mafin_banking:data', target, snapshot(target))
    notify(src, ('Transferred $%s to %s.'):format(amount, receiver.owner), 'success')
    notify(target, ('Received $%s from %s.'):format(amount, sender.owner), 'success')
end)

RegisterNetEvent('mafin_banking:changePin', function(pin)
    local account = getAccount(source)
    pin = tostring(pin or ''):gsub('%D', ''):sub(1, 4)
    if #pin ~= 4 then return end
    account.pin = pin
    notify(source, 'PIN updated.', 'success')
end)

exports('GetBalance', function(src)
    return getAccount(src).balance
end)

exports('AddMoney', function(src, amount, reason)
    local account = getAccount(src)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return false end

    account.balance = account.balance + amount
    addHistory(account, 'credit', amount, reason or 'Server credit')
    TriggerClientEvent('mafin_banking:data', src, snapshot(src))
    return true
end)

exports('RemoveMoney', function(src, amount, reason)
    local account = getAccount(src)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 or account.balance < amount then return false end

    account.balance = account.balance - amount
    addHistory(account, 'debit', amount, reason or 'Server debit')
    TriggerClientEvent('mafin_banking:data', src, snapshot(src))
    return true
end)

print('[mafin_banking] Server loaded with readable account, transfer, history, and export logic.')
