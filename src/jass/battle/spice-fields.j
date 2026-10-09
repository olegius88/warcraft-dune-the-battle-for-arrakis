// ---- spice mounds (Rules.txt [SpiceMound], the map's SpiceMound tag): a mound bursts after Size + up
// to Cost ticks, or when it is destroyed, into a spice field of SpiceValue per cell it turned to spice
// (Game.exe 1.09: the bloom puts spice on the sand cells within BlastRadius, mound 0x542717..0x542acc,
// and a harvested cell gives SpiceValue whatever its amount, 0x56c2c4), and grows again on the
// same spot after MinRange..MaxRange ticks. One timer per spot; EmpMoundTab[timer]: 0 the mound,
// 1/2 x / y, 3 what is next (0 burst, 1 grow); EmpMoundTab[mound]: 0 its timer.
// The bloom is one field (a WC3 mine) at the mound, as a map's contiguous spice patch is one field
// (battle.ts spiceClusters); its BlastRadius patch is painted with the spice ground (EmpMoundPatch).
// the bloom's patch ([SpiceMound] BlastRadius "Radius of spice bloom patch (in tiles)"): the sand
// and dust cells within it take the spice ground, one cell at a time (Emperor has spice only on sand);
// returns how many cells it turned to spice
function EmpMoundPatch takes real x, real y returns integer
    local integer dx
    local integer dy = -{{mound.radiusTiles}}
    local real cx
    local real cy
    local integer n = 0
    loop
        exitwhen dy > {{mound.radiusTiles}}
        set dx = -{{mound.radiusTiles}}
        loop
            exitwhen dx > {{mound.radiusTiles}}
            if dx * dx + dy * dy <= {{mound.radiusTiles}} * {{mound.radiusTiles}} then
                set cx = x + dx * {{real WC3_UNITS_PER_TILE}}
                set cy = y + dy * {{real WC3_UNITS_PER_TILE}}
                if GetTerrainType(cx, cy) == '{{tiles.sand}}' or GetTerrainType(cx, cy) == '{{tiles.dust}}' then
                    call SetTerrainType(cx, cy, '{{tiles.spice}}', -1, 1, 0)
                    set n = n + 1
                endif
            endif
            set dx = dx + 1
        endloop
        set dy = dy + 1
    endloop
    return n
endfunction

function EmpMoundTimer takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer h = GetHandleId(tm)
    local unit u = LoadUnitHandle(EmpMoundTab, h, 0)
    local real x = LoadReal(EmpMoundTab, h, 1)
    local real y = LoadReal(EmpMoundTab, h, 2)
    local unit f
    local integer n
    if LoadInteger(EmpMoundTab, h, 3) == 0 then
        if u != null then
            call RemoveSavedHandle(EmpMoundTab, GetHandleId(u), 0)
            if GetUnitTypeId(u) != 0 then
                call RemoveUnit(u)
            endif
        endif
        call RemoveSavedHandle(EmpMoundTab, h, 0)
        call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.spiceBloom.id}}', {{ART_ABILITY.spiceBloom.type}}, 0), x, y))
        set n = EmpMoundPatch(x, y)
        if n > 0 then
            set f = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '{{spiceField}}', x, y, {{FACING}})
            call SetResourceAmount(f, n * {{spiceValue}})
        endif
        call SaveInteger(EmpMoundTab, h, 3, 1)
        call TimerStart(tm, GetRandomReal({{real regrowMin}}, {{real regrowMax}}), false, function EmpMoundTimer)
    else
        set u = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '{{spiceMound}}', x, y, {{FACING}})
        call SaveUnitHandle(EmpMoundTab, h, 0, u)
        call SaveTimerHandle(EmpMoundTab, GetHandleId(u), 0, tm)
        call SaveInteger(EmpMoundTab, h, 3, 0)
        call TimerStart(tm, GetRandomReal({{real burstMin}}, {{real burstMax}}), false, function EmpMoundTimer)
    endif
    set tm = null
    set u = null
    set f = null
endfunction

// a mound on (x, y): it grows at once
function EmpMoundAdd takes real x, real y returns nothing
    local timer tm = CreateTimer()
    call SaveReal(EmpMoundTab, GetHandleId(tm), 1, x)
    call SaveReal(EmpMoundTab, GetHandleId(tm), 2, y)
    call SaveInteger(EmpMoundTab, GetHandleId(tm), 3, 1)
    call TimerStart(tm, 0.0, false, function EmpMoundTimer)
    set tm = null
endfunction

// a mound destroyed by fire bursts at once
function EmpMoundDeath takes nothing returns nothing
    local unit u = GetTriggerUnit()
    if EmpType(u) == '{{spiceMound}}' and HaveSavedHandle(EmpMoundTab, GetHandleId(u), 0) then
        call TimerStart(LoadTimerHandle(EmpMoundTab, GetHandleId(u), 0), 0.0, false, function EmpMoundTimer)
    endif
    set u = null
endfunction

// ---- the spice a territory keeps: Game.exe 1.09 saves each cell's spice after every battle with the
// player, won or lost (0x480170 -> 0x495f10, per territory), and puts it back at the next battle there
// (0x491d80 -> 0x535c10 -> 0x47edc6). Here each field (blooms too) with what is left in it; a kept
// territory's fields replace the map's own. Feature test: test/emperor-mission.test.ts "spice".
function EmpSpiceKey takes string f, integer k returns string
    return {{KS}} + I2S(EmpTerritory) + "_" + f + I2S(k)
endfunction

function EmpSpiceSave takes nothing returns nothing
    local group g
    local unit u
    local integer n = 0
    if not EmpInCampaign or EmpCache == null then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsOfPlayer(g, Player(PLAYER_NEUTRAL_PASSIVE), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and EmpType(u) == '{{spiceField}}' and GetResourceAmount(u) > 0 then
            call StoreReal(EmpCache, {{CAT}}, EmpSpiceKey("x", n), GetUnitX(u))
            call StoreReal(EmpCache, {{CAT}}, EmpSpiceKey("y", n), GetUnitY(u))
            call StoreInteger(EmpCache, {{CAT}}, EmpSpiceKey("a", n), GetResourceAmount(u))
            set n = n + 1
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    call StoreInteger(EmpCache, {{CAT}}, EmpSpiceKey("n", 0), n)
endfunction

// the kept fields, if the territory has kept any (true)
function EmpSpiceRestore takes nothing returns boolean
    local integer n
    local integer k = 0
    local unit m
    if not EmpInCampaign or EmpCache == null or not HaveStoredInteger(EmpCache, {{CAT}}, EmpSpiceKey("n", 0)) then
        return false
    endif
    set n = GetStoredInteger(EmpCache, {{CAT}}, EmpSpiceKey("n", 0))
    loop
        exitwhen k >= n
        set m = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), '{{spiceField}}', GetStoredReal(EmpCache, {{CAT}}, EmpSpiceKey("x", k)), GetStoredReal(EmpCache, {{CAT}}, EmpSpiceKey("y", k)), {{FACING}})
        call SetResourceAmount(m, GetStoredInteger(EmpCache, {{CAT}}, EmpSpiceKey("a", k)))
        set k = k + 1
    endloop
    set m = null
    return true
endfunction

// ---- spice fields: one gold-mine-like field per spice cluster of the map ----
function EmpSpiceFields takes nothing returns nothing
    local unit m
    local trigger tr = CreateTrigger()
    if not EmpSpiceRestore() then
{{fieldLines}}
    endif
    set EmpMoundTab = InitHashtable()
    call TriggerRegisterPlayerUnitEvent(tr, Player(PLAYER_NEUTRAL_PASSIVE), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerAddAction(tr, function EmpMoundDeath)
{{moundLines}}
    set m = null
    set tr = null
endfunction
