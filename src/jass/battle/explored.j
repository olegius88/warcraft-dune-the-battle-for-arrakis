// ---- the explored map a territory keeps (Game.exe 1.09: each house's explored cells are saved after
// every battle on the territory, won or lost, 0x47fd50 -> 0x495ea0, and given back to the house at the
// next battle there, 0x490bf0 -> 0x47fbf0). Here the player's: a bit per tile (not under the black
// mask, IsMaskedToPlayer), C.EXPLORED.bits tiles per stored integer, one row per thread (op limit);
// back as fogged, explored ground (SetFogStateRect, a rect per run of explored tiles). The AI's is not
// kept: the port's AI sees into the shroud by time (TicksUntilAISeesIntoShroud), not by its fog.
// Feature test: test/emperor-mission.test.ts "explored map".
function EmpExploreKey takes integer row, integer chunk returns string
    return {{KE}} + I2S(EmpTerritory) + "_" + I2S(row) + "_" + I2S(chunk)
endfunction

function EmpExploreCols takes nothing returns integer
    return R2I((EmpMapMaxX - EmpMapMinX) / {{real WC3_UNITS_PER_TILE}})
endfunction

function EmpExploreRows takes nothing returns integer
    return R2I((EmpMapMaxY - EmpMapMinY) / {{real WC3_UNITS_PER_TILE}})
endfunction

// one row (EmpExploreRow) into the cache
function EmpExploreSaveRow takes nothing returns nothing
    local integer cols = EmpExploreCols()
    local integer c = 0
    local integer bits = 0
    local integer bit = 1
    local real y = EmpMapMinY + (EmpExploreRow + 0.5) * {{real WC3_UNITS_PER_TILE}}
    loop
        exitwhen c >= cols
        if not IsMaskedToPlayer(EmpMapMinX + (c + 0.5) * {{real WC3_UNITS_PER_TILE}}, y, Player(0)) then
            set bits = bits + bit
        endif
        set c = c + 1
        set bit = bit * 2
        if ModuloInteger(c, {{C.EXPLORED.bits}}) == 0 or c >= cols then
            call StoreInteger(EmpCache, {{CAT}}, EmpExploreKey(EmpExploreRow, (c - 1) / {{C.EXPLORED.bits}}), bits)
            set bits = 0
            set bit = 1
        endif
    endloop
endfunction

function EmpExploreSave takes nothing returns nothing
    local integer rows = EmpExploreRows()
    if not EmpInCampaign or EmpCache == null then
        return
    endif
    set EmpExploreRow = 0
    loop
        exitwhen EmpExploreRow >= rows
        call ExecuteFunc("EmpExploreSaveRow")
        set EmpExploreRow = EmpExploreRow + 1
    endloop
    call StoreInteger(EmpCache, {{CAT}}, EmpExploreKey(-1, 0), rows)
endfunction

// one row (EmpExploreRow) back: each run of explored tiles becomes fogged ground
function EmpExploreRestoreRow takes nothing returns nothing
    local integer cols = EmpExploreCols()
    local integer c = 0
    local integer start = -1
    local integer bits = 0
    local boolean on
    local real y0 = EmpMapMinY + EmpExploreRow * {{real WC3_UNITS_PER_TILE}}
    local rect r
    loop
        exitwhen c > cols
        if c < cols and ModuloInteger(c, {{C.EXPLORED.bits}}) == 0 then
            set bits = GetStoredInteger(EmpCache, {{CAT}}, EmpExploreKey(EmpExploreRow, c / {{C.EXPLORED.bits}}))
        endif
        set on = c < cols and ModuloInteger(bits, 2) == 1
        set bits = bits / 2
        if on and start < 0 then
            set start = c
        elseif not on and start >= 0 then
            set r = Rect(EmpMapMinX + start * {{real WC3_UNITS_PER_TILE}}, y0, EmpMapMinX + c * {{real WC3_UNITS_PER_TILE}}, y0 + {{real WC3_UNITS_PER_TILE}})
            call SetFogStateRect(Player(0), FOG_OF_WAR_FOGGED, r, true)
            call RemoveRect(r)
            set start = -1
        endif
        set c = c + 1
    endloop
    set r = null
endfunction

function EmpExploreRestore takes nothing returns nothing
    local integer rows
    if not EmpInCampaign or EmpCache == null or not HaveStoredInteger(EmpCache, {{CAT}}, EmpExploreKey(-1, 0)) then
        return
    endif
    set rows = GetStoredInteger(EmpCache, {{CAT}}, EmpExploreKey(-1, 0))
    set EmpExploreRow = 0
    loop
        exitwhen EmpExploreRow >= rows
        call ExecuteFunc("EmpExploreRestoreRow")
        set EmpExploreRow = EmpExploreRow + 1
    endloop
endfunction
