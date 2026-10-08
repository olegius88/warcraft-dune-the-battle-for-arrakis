// Diagnostics (build-contest.ts --deathlog): the first {{limit}} deaths of the player's units go to
// CustomMapData\{{file}} - tick, unit, killer's player, position. Kept in the mission's game cache
// (no globals block here: extraFunctions sit among the functions).
function EmpDeathLogEvent takes nothing returns nothing
    local unit u = GetTriggerUnit()
    local unit k = GetKillingUnit()
    local integer n = GetStoredInteger(EmpCache, "deathlog", "n") + 1
    local integer i = 1
    local string s = I2S(EmpTick) + " " + GetUnitName(u) + " structure=" + I2S(EF_B2I(IsUnitType(u, UNIT_TYPE_STRUCTURE)))
    if k != null then
        set s = s + " killer=" + GetUnitName(k) + " p" + I2S(GetPlayerId(GetOwningPlayer(k)))
    endif
    set s = s + " at " + I2S(R2I(GetUnitX(u))) + "," + I2S(R2I(GetUnitY(u)))
    set u = null
    set k = null
    if n > {{limit}} then
        return
    endif
    call StoreInteger(EmpCache, "deathlog", "n", n)
    call StoreString(EmpCache, "deathlog", I2S(n), s)
    call PreloadGenClear()
    call PreloadGenStart()
    loop
        exitwhen i > n
        call Preload(GetStoredString(EmpCache, "deathlog", I2S(i)))
        set i = i + 1
    endloop
    call PreloadGenEnd({{str file}})
endfunction

function EmpDeathLog takes nothing returns nothing
    local trigger t = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(t, Player(0), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerAddAction(t, function EmpDeathLogEvent)
    set t = null
endfunction
