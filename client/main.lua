local opened = false
local balance = 0
local history = {}
local bankTargetReady = false
local atmTargetReady = false
local targetZones = {}
local accountPin = tostring((Config and Config.DefaultPin) or '0000')

local function normalizePin(pin)
    pin = tostring(pin or ''):gsub('%D', ''):sub(1, 4)
    return pin
end

accountPin = normalizePin(accountPin)
if #accountPin ~= 4 then accountPin = '0000' end

local function bankPayload(extra)
    local payload = {
        balance = balance,
        cash = 0,
        bank = balance,
        name = GetPlayerName(PlayerId()),
        account = 'MAFIN-0001',
        cardNumber = 'MAFIN-0001',
        cardHolder = GetPlayerName(PlayerId()),
        cardExpiry = '12/30',
        logs = history,
        history = history,
        recentLogs = history
    }

    if extra then
        for key, value in pairs(extra) do
            payload[key] = value
        end
    end

    return payload
end

local function notify(message, ntype)
    if lib and lib.notify then
        lib.notify({ title = 'Mafin Banking', description = message, type = ntype or 'info' })
    else
        print(('[mafin_banking] %s'):format(message))
    end
end

local function openBank(atm)
    opened = true
    TriggerServerEvent('mafin_banking:requestData')
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = atm and 'open_atm' or 'open',
        translations = Config.Translations or {},
        data = bankPayload(),
        playerData = bankPayload()
    })
    SendNUIMessage({ action = 'update_data', data = bankPayload(), playerData = bankPayload() })
end

local function closeBank()
    opened = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

RegisterCommand('bank', function() openBank(false) end, false)
RegisterCommand('atm', function() openBank(true) end, false)
RegisterCommand('mafin_banking', function() openBank(false) end, false)

RegisterNetEvent('mafin_banking:open', function() openBank(false) end)
RegisterNetEvent('mafin_banking:openAtm', function() openBank(true) end)
RegisterNetEvent('mafin_banking:data', function(data)
    data = data or {}
    balance = tonumber(data.balance or data.bank) or balance
    history = data.history or data.logs or history
    local payload = bankPayload(data)
    SendNUIMessage({ action = 'update_data', data = payload, playerData = payload })
    SendNUIMessage({ action = 'update_history', data = history, logs = history })
end)

RegisterNUICallback('close', function(_, cb) closeBank(); cb({ success = true }) end)
RegisterNUICallback('fetchData', function(_, cb)
    local payload = bankPayload()
    SendNUIMessage({ action = 'update_data', data = payload, playerData = payload })
    cb({ success = true, data = payload, playerData = payload, balance = balance, logs = history })
end)
RegisterNUICallback('fetchHistory', function(_, cb)
    SendNUIMessage({ action = 'update_history', data = history, logs = history })
    cb(history)
end)

local function moneyCallback(kind)
    return function(data, cb)
        local amount = tonumber(data and data.amount) or 0
        if amount <= 0 then
            cb({ success = false })
            return
        end
        TriggerServerEvent((kind == 'deposit' or kind == 'atmDeposit') and 'mafin_banking:deposit' or 'mafin_banking:withdraw', amount)
        cb({ success = true })
    end
end

RegisterNUICallback('deposit', moneyCallback('deposit'))
RegisterNUICallback('withdraw', moneyCallback('withdraw'))
RegisterNUICallback('atmDeposit', moneyCallback('atmDeposit'))
RegisterNUICallback('atmWithdraw', moneyCallback('atmWithdraw'))
RegisterNUICallback('transfer', function(data, cb)
    local amount = tonumber(data and data.amount) or 0
    if amount <= 0 then
        cb({ success = false })
        return
    end

    TriggerServerEvent('mafin_banking:transfer', data and (data.target or data.targetId or data.playerId), amount, data and data.description)
    cb({ success = true })
end)
RegisterNUICallback('changePin', function(data, cb)
    local oldPin = normalizePin(data and (data.oldPin or data.currentPin))
    local newPin = normalizePin(data and (data.newPin or data.pin))

    if oldPin ~= accountPin then
        notify((Config.Translations and Config.Translations.notify_pin_wrong_old) or 'The current PIN entered is incorrect.', 'error')
        cb({ success = false, valid = false, message = 'wrong_old_pin' })
        return
    end

    if #newPin ~= 4 then
        notify((Config.Translations and Config.Translations.notify_pin_invalid) or 'PIN must be exactly 4 digits.', 'error')
        cb({ success = false, valid = false, message = 'invalid_pin' })
        return
    end

    accountPin = newPin
    TriggerServerEvent('mafin_banking:changePin', newPin)
    notify((Config.Translations and Config.Translations.notify_pin_changed) or 'Your PIN has been successfully changed.', 'success')
    cb({ success = true, valid = true })
end)

RegisterNUICallback('verifyPin', function(data, cb)
    local pin = normalizePin(data and data.pin)
    local valid = pin == accountPin

    if not valid then
        notify((Config.Translations and Config.Translations.notify_pin_atm_wrong) or 'The entered PIN is incorrect.', 'error')
    end

    cb({ success = valid, valid = valid })
end)

local function showHelp(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, true, 1)
end

local function wantsOxTarget(interaction)
    return tostring(interaction or ''):lower() == 'ox_target'
end

local function oxTargetStarted()
    return GetResourceState and GetResourceState('ox_target') == 'started'
end

local function waitForOxTarget()
    for _ = 1, 50 do
        if oxTargetStarted() then return true end
        Wait(100)
    end

    return oxTargetStarted()
end

local function setupBankTargets()
    if not wantsOxTarget(Config and Config.BankInteraction) then return end
    if bankTargetReady then return end

    if not waitForOxTarget() then
        print('[mafin_banking] Config.BankInteraction is ox_target, but ox_target is not started. Using E-key fallback.')
        return
    end

    if not Config.Banks then return end

    for index, bank in ipairs(Config.Banks) do
        if bank.coords then
            local label = (Config.Translations and Config.Translations.interact_bank_target) or 'Access Bank'
            local radius = tonumber(bank.radius) or 1.5
            local zoneName = ('mafin_banking_bank_%s'):format(index)

            local ok, zoneId = pcall(function()
                return exports.ox_target:addSphereZone({
                    name = zoneName,
                    coords = bank.coords,
                    radius = radius,
                    debug = false,
                    options = {
                        {
                            name = zoneName .. '_open',
                            icon = 'fa-solid fa-building-columns',
                            label = label,
                            distance = radius + 0.8,
                            onSelect = function()
                                openBank(false)
                            end
                        }
                    }
                })
            end)

            if ok then
                targetZones[#targetZones + 1] = zoneId or zoneName
                bankTargetReady = true
            else
                print(('[mafin_banking] Failed to add ox_target bank zone %s: %s'):format(index, zoneId))
            end
        end
    end

    if bankTargetReady then
        print(('[mafin_banking] Added %s ox_target bank zones.'):format(#targetZones))
    end
end

local function setupAtmTargets()
    if not wantsOxTarget(Config and Config.AtmInteraction) then return end
    if atmTargetReady then return end

    if not waitForOxTarget() then
        print('[mafin_banking] Config.AtmInteraction is ox_target, but ox_target is not started. Use /atm fallback.')
        return
    end

    local models = {}
    for _, model in ipairs((Config and Config.AtmModels) or {}) do
        models[#models + 1] = GetHashKey(model)
    end

    if #models == 0 then return end

    local ok, err = pcall(function()
        exports.ox_target:addModel(models, {
            {
                name = 'mafin_banking_atm_open',
                icon = 'fa-solid fa-credit-card',
                label = (Config.Translations and Config.Translations.interact_atm_target) or 'Use ATM',
                distance = 2.0,
                onSelect = function()
                    openBank(true)
                end
            }
        })
    end)

    if ok then
        atmTargetReady = true
        print('[mafin_banking] Added ox_target ATM models.')
    else
        print(('[mafin_banking] Failed to add ox_target ATM models: %s'):format(err))
    end
end

CreateThread(function()
    setupBankTargets()
    setupAtmTargets()
end)

AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= 'ox_target' then return end

    CreateThread(function()
        Wait(500)
        setupBankTargets()
        setupAtmTargets()
    end)
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() or not oxTargetStarted() then return end

    for _, zoneId in ipairs(targetZones) do
        pcall(function()
            exports.ox_target:removeZone(zoneId)
        end)
    end
end)

CreateThread(function()
    if Config.Blip and Config.Banks then
        for _, bank in ipairs(Config.Banks) do
            if bank.blip and bank.coords then
                local blip = AddBlipForCoord(bank.coords.x, bank.coords.y, bank.coords.z)
                SetBlipSprite(blip, Config.Blip.Sprite or 108)
                SetBlipColour(blip, Config.Blip.Color or 2)
                SetBlipScale(blip, Config.Blip.Scale or 0.8)
                SetBlipAsShortRange(blip, true)
                BeginTextCommandSetBlipName('STRING')
                AddTextComponentString(Config.Blip.Name or bank.label or 'Bank')
                EndTextCommandSetBlipName(blip)
            end
        end
    end
end)

CreateThread(function()
    while true do
        local sleep = 1000
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)

        if Config.Banks and not (wantsOxTarget(Config.BankInteraction) and bankTargetReady) then
            for _, bank in ipairs(Config.Banks) do
                if bank.coords then
                    local distance = #(coords - bank.coords)
                    local radius = tonumber(bank.radius) or 1.5

                    if distance < 15.0 then
                        sleep = 0
                        if Config.DrawMarker then
                            DrawMarker(2, bank.coords.x, bank.coords.y, bank.coords.z + 0.15, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.28, 0.28, 0.28, 155, 92, 255, 180, false, true, 2, false, nil, nil, false)
                        end

                        if distance <= radius + 0.4 and not opened then
                            local text = (Config.Translations and Config.Translations.interact_bank_textui) or '[E] Access Bank'
                            showHelp(text:format(bank.label or 'Bank'))

                            if IsControlJustReleased(0, 38) then
                                openBank(false)
                            end
                        end
                    end
                end
            end
        end

        Wait(sleep)
    end
end)
