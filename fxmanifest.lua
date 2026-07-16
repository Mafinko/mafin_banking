fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Mafin'
description 'Mafin Banking - personal and society banking UI for ESX servers.'
version '1.0.1'

shared_scripts {
    'config.lua'
}

client_scripts {
    'client/main.lua'
}

server_scripts {
    'server/main.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js'
}
