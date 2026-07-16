Config = {}

-- Auto-create compatibility database tables on resource start.
-- false = use memory-only fallback, true = create/use the table below when oxmysql is available.
Config.AutoDatabase = false
Config.DatabaseTable = 'mafin_banking_accounts'

-- Default PIN used by the compatibility banking system before a player changes it.
Config.DefaultPin = '0000'

-- Cash item used by ox_inventory for bank deposits and withdrawals.
Config.UseOxInventoryCash = true
Config.CashItem = 'money'

-- Notify system: 'ox_lib' | 'okokNotify' | 'mafin_notify'
Config.Notify = 'ox_lib'

-- Interaction for entering the bank: 'ox_target' | 'ox_lib'
Config.BankInteraction = 'ox_target'

-- Interaction for ATM: 'ox_target' | 'ox_lib'
Config.AtmInteraction = 'ox_target'

-- ATM props used when Config.AtmInteraction = 'ox_target'
Config.AtmModels = {
    'prop_atm_01',
    'prop_atm_02',
    'prop_atm_03',
    'prop_fleeca_atm'
}

-- Show blue marker at banks (only for ox_lib interaction at banks)
Config.DrawMarker = false

-- Blip settings
Config.Blip = {
    Sprite = 108,  -- 108 = Bank
    Color = 2,     -- 2 = Green
    Scale = 0.8,   -- Blip size
    Display = 4,   -- Display on map and minimap
    Name = 'Fleeca Bank' -- Global name on map
}

Config.Banks = {
    { 
        label = 'Fleeca Bank - Legion Square',  
        coords = vector3(149.0175, -1041.1067, 29.5834), 
        radius = 1.5,
        blip = true
    },
    {
        label = 'Fleeca Bank - Pacific Standard', 
        coords = vector3(-1212.9359, -331.7616, 38.2412), 
        radius = 1.5,
        blip = true
    },
    {
        label = 'Fleeca Bank - Del perro',  
        coords = vector3(-2961.9768, 482.0567, 16.1385), 
        radius = 1.5,
        blip = true
    },
    {
        label = 'Fleeca Bank - Burton',    
        coords = vector3(-112.2239, 6470.1567, 32.4400), 
        radius = 1.5,
        blip = true
    },
    { 
        label = 'Fleeca Bank - Rockford Hills',                
        coords = vector3(313.3615, -279.4781, 55.4531), 
        radius = 1.5,
        blip = true
    },
    { 
        label = 'Fleeca Bank - Blaine County Savings',                
        coords = vector3(-351.7995, -50.3405, 49.0133), 
        radius = 1.5,
        blip = true
    },
}

Config.Translations = {
    -- Sidebar brand
    sidebar_brand = '<span style="color:var(--blue)">Mafin</span> Banking',

    -- Sidebar menu
    menu_home = 'Dashboard',
    menu_history = 'History',
    menu_transfer = 'Transfer',
    menu_settings = 'Settings',
    menu_close = 'Close',

    -- Dashboard / Home page
    home_balance_label = 'BALANCE',
    home_card_label = 'Debit Card',
    home_card_number_label = 'Card Number',
    home_card_expires = 'Valid Thru',
    home_card_holder = 'Card Holder',
    home_chart_title = 'Balance History',
    home_recent_tx = 'Recent Transactions',

    -- Action buttons
    btn_deposit = 'Deposit',
    btn_withdraw = 'Withdraw',
    btn_transfer = 'Transfer',
    btn_history = 'History',

    -- Deposit modal
    deposit_title = 'Deposit Money',
    deposit_desc = 'Enter the amount you wish to deposit to your account',
    deposit_input = 'Amount...',
    deposit_btn = 'Deposit',

    -- Withdraw modal
    withdraw_title = 'Withdraw Money',
    withdraw_desc = 'Enter the amount you wish to withdraw from your account',
    withdraw_input = 'Amount...',
    withdraw_btn = 'Withdraw',

    -- Transfer modal
    transfer_title = 'Transfer Money',
    transfer_desc = 'Enter the player ID and the amount to transfer',
    transfer_target_id = 'Player ID...',
    transfer_input = 'Amount...',
    transfer_btn = 'Transfer',

    -- History page
    history_title = 'TRANSACTION HISTORY',
    history_filter_all = 'All',
    history_filter_dep = 'Deposits',
    history_filter_wit = 'Withdrawals',
    history_filter_tra = 'Transfers',
    history_no_data = 'No transactions found.',

    -- Transaction types (log badges)
    log_deposit = 'Deposit',
    log_withdraw = 'Withdraw',
    log_transfer_out = 'Outgoing Transfer',
    log_transfer_in = 'Incoming Transfer',
    log_deposit_badge = 'DEPOSIT',
    log_withdraw_badge = 'WITHDRAW',
    log_transfer_badge = 'TRANSFER',

    -- General
    no_data = 'No data',
    modal_cancel = 'Cancel',
    modal_confirm = 'Confirm',

    -- Days
    days_mon = 'Mon',
    days_tue = 'Tue',
    days_wed = 'Wed',
    days_thu = 'Thu',
    days_fri = 'Fri',
    days_sat = 'Sat',
    days_sun = 'Sun',

    -- Notify messages
    notify_deposit_success = 'Deposit successful.',
    notify_deposit_fail = 'Insufficient funds or invalid amount.',
    notify_withdraw_success = 'Withdrawal successful.',
    notify_withdraw_fail = 'Insufficient account balance or invalid amount.',
    notify_transfer_success = 'Transfer successful.',
    notify_transfer_fail = 'Transfer failed. Check player ID and your balance.',
    notify_invalid_amount = 'Please enter a valid amount.',
    notify_pin_wrong_old = 'The current PIN entered is incorrect.',
    notify_pin_invalid = 'PIN must be exactly 4 digits.',
    notify_pin_changed = 'Your PIN has been successfully changed.',
    notify_pin_atm_wrong = 'The entered PIN is incorrect.',
    notify_title = 'Banking',

    -- Settings Page
    settings_title = 'ACCOUNT SETTINGS',
    settings_desc = 'You can change your account PIN here. The default PIN is 0000.',
    settings_old_pin = 'Current PIN',
    settings_new_pin = 'New PIN',
    settings_btn_change = 'Change PIN',

    -- ATM UI
    atm_pin_title = 'Enter PIN',
    atm_cancel_leave = 'Cancel & Leave',
    atm_verifying = 'Verifying...',
    atm_title = 'Account Overview',
    atm_balance_label = 'YOUR BALANCE',
    atm_account_number = 'Account Number:',
    atm_withdraw = 'Withdraw',
    atm_deposit = 'Deposit',
    atm_quick_withdraw = 'Quick Withdrawal',
    atm_recent_tx = 'Recent Transactions',

    -- Interactions
    interact_atm_target = 'Use ATM',
    interact_atm_textui = '[E] Use ATM',
    interact_bank_target = 'Access Bank',
    interact_bank_textui = '[E] Access %s',
}
