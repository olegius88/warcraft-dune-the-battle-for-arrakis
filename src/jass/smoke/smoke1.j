function Smoke1Actions takes nothing returns nothing
    local gamecache gc
    call CreateNUnitsAtLoc( 3, 'hfoo', Player(0), Location(-1024.0, -1024.0), 270.0 )
    call PanCameraToTimed( -1024.0, -1024.0, 0.0 )
    call DisplayTimedTextToForce( GetPlayersAll(), 30.0, "SMOKE 1: map loaded, storing 42 in game cache, victory in 8s" )
    set gc = InitGameCacheBJ( "DuneSmoke.w3v" )
    call StoreIntegerBJ( 42, "value", "smoke", gc )
    call SaveGameCacheBJ( gc )
    call SmokeLog( "smoke1.pld", "smoke1 ok" )
    call TriggerSleepAction( 8.0 )
    // CustomVictoryBJ -> ChangeLevel from our maps crashes 3.0 and 1.31 outside a campaign (any target
    // map). Inside the .w3n it works: 1.31.1, 2026-10-07, unattended (tools/campaign-session.ps1):
    // HK start mission -> hub -> territory battle -> hub, campaign imports readable in every map.
    call SetNextLevelBJ( {{str nextLevel}} )
    call CustomVictoryBJ( Player(0), false, false )
endfunction
